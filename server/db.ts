import type { Mailbox, EmailMessage, User, AdminMetrics, AdminAuditLog, SystemSettings, SuspiciousActivitySummary } from './types.ts';
import type { Response } from 'express';
import crypto from 'crypto';

interface SessionData {
  sessionId: string;
  activeMailboxId: string | null;
  userId: string | null;
  createdAt: number;
  lastActiveAt: number;
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

class Database {
  public mailboxes = new Map<string, Mailbox>(); // mailboxId -> Mailbox
  public mailboxesByNormalizedAddress = new Map<string, string>(); // normalizedAddress -> mailboxId (UNIQUE constraint)
  public messagesByMailbox = new Map<string, Map<string, EmailMessage>>(); // mailboxId -> (messageId -> EmailMessage)
  public sessions = new Map<string, SessionData>(); // sessionId -> SessionData
  public users = new Map<string, User>(); // userId -> User
  public usersByEmail = new Map<string, string>(); // normalizedEmail -> userId
  public apiKeys = new Map<string, { userId: string; label: string; createdAt: number; usageCount: number }>();
  public sseClients = new Map<string, Set<Response>>(); // mailboxId -> Set<Response>
  public auditLogs: AdminAuditLog[] = [];

  // System Settings
  public systemSettings: SystemSettings = {
    defaultTtlHours: 168, // 7 days
    maxMessageLimit: 50,
    rateLimitMaxRequests: 60,
    rateLimitWindowSeconds: 60,
    domainWhitelist: [],
    domainBlacklist: [],
    blockedSenderPatterns: ['*@spammer.top', '*@malware.biz', '*@phish-alert.net'],
  };
  public blockedSenderPatterns = new Set<string>(['*@spammer.top', '*@malware.biz', '*@phish-alert.net']);

  // Known messages cache to avoid duplicate SSE broadcasts
  public knownMessageIds = new Set<string>();

  // Metrics tracking
  public totalVisitors = 1;
  public totalEmailsReceived = 0;
  public requestLog: number[] = [];
  public messageTimestamps: number[] = [];
  public blockedIps = new Set<string>();
  public rateLimits = new Map<string, { count: number; resetAt: number }>();

  constructor() {
    this.seedInitialAccounts();
  }

  hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password + '_salt_aethermail').digest('hex');
  }

  // --- SEED INITIAL ACCOUNTS ---
  private seedInitialAccounts() {
    // 1. Initial Administrator Account (from environment variables or secure defaults)
    const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'admin@aethermail.cx').toLowerCase().trim();
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'AetherAdmin2026!Secure';

    if (!this.usersByEmail.has(adminEmail)) {
      const adminId = `usr_admin_${crypto.randomBytes(6).toString('hex')}`;
      const adminUser: User = {
        id: adminId,
        email: adminEmail,
        name: 'Administrator',
        passwordHash: this.hashPassword(adminPassword),
        role: 'admin',
        createdAt: Date.now(),
        apiKey: `aeth_adm_${crypto.randomBytes(12).toString('hex')}`,
      };
      this.users.set(adminId, adminUser);
      this.usersByEmail.set(adminEmail, adminId);
      this.apiKeys.set(adminUser.apiKey!, {
        userId: adminId,
        label: 'Admin Master Key',
        createdAt: Date.now(),
        usageCount: 0,
      });
      console.log(`[Database] Initial admin account initialized: ${adminEmail}`);
    }

    // 2. Demo Normal User for testing account switching & non-admin restrictions
    const demoEmail = 'alex@example.com';
    if (!this.usersByEmail.has(demoEmail)) {
      const demoUserId = 'usr_alex_mercer';
      const demoUser: User = {
        id: demoUserId,
        email: demoEmail,
        name: 'Alex Mercer',
        passwordHash: this.hashPassword('password123'),
        role: 'user',
        createdAt: Date.now() - 86400000 * 5,
        apiKey: 'aeth_usr_8f3910c841bb45a7',
      };
      this.users.set(demoUserId, demoUser);
      this.usersByEmail.set(demoEmail, demoUserId);
      this.apiKeys.set(demoUser.apiKey!, {
        userId: demoUserId,
        label: 'Default API Key',
        createdAt: Date.now() - 86400000 * 2,
        usageCount: 0,
      });
    }
  }

  // --- SESSIONS ---
  getOrCreateSession(sessionId?: string): SessionData {
    if (sessionId && this.sessions.has(sessionId)) {
      const sess = this.sessions.get(sessionId)!;
      sess.lastActiveAt = Date.now();
      return sess;
    }

    const newId = sessionId || `sess_${crypto.randomBytes(16).toString('hex')}`;
    const sess: SessionData = {
      sessionId: newId,
      activeMailboxId: null,
      userId: null,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    this.sessions.set(newId, sess);
    this.totalVisitors++;
    return sess;
  }

  // --- MAILBOXES & ATOMIC OWNERSHIP ---
  normalizeAddress(address: string): string {
    return address.toLowerCase().trim();
  }

  isAddressClaimed(address: string, excludeMailboxId?: string): boolean {
    const normalized = this.normalizeAddress(address);
    const existingId = this.mailboxesByNormalizedAddress.get(normalized);
    if (!existingId) return false;
    if (excludeMailboxId && existingId === excludeMailboxId) return false;

    const mb = this.mailboxes.get(existingId);
    if (!mb) return false;
    // If not deleted and not expired past quarantine (7 days)
    if (mb.status === 'DELETED') return false;
    return true;
  }

  saveMailbox(mb: Mailbox) {
    const normalized = this.normalizeAddress(mb.address);
    mb.normalizedAddress = normalized;
    this.mailboxes.set(mb.id, mb);
    this.mailboxesByNormalizedAddress.set(normalized, mb.id);
  }

  getMailbox(id: string): Mailbox | undefined {
    return this.mailboxes.get(id);
  }

  getMailboxByAddress(address: string): Mailbox | undefined {
    const normalized = this.normalizeAddress(address);
    const id = this.mailboxesByNormalizedAddress.get(normalized);
    return id ? this.mailboxes.get(id) : undefined;
  }

  getActiveMailboxForSession(sessionId: string): Mailbox | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // If user is logged in, their user account's activeMailboxId takes priority
    if (session.userId) {
      const user = this.users.get(session.userId);
      if (user && user.activeMailboxId) {
        const mb = this.mailboxes.get(user.activeMailboxId);
        if (mb && mb.status !== 'DELETED' && mb.expiresAt > Date.now()) {
          session.activeMailboxId = mb.id;
          return mb;
        }
      }
    }

    // Check session active mailbox
    if (session.activeMailboxId) {
      const mb = this.mailboxes.get(session.activeMailboxId);
      if (mb && mb.status !== 'DELETED' && mb.expiresAt > Date.now()) {
        return mb;
      }
    }

    return null;
  }

  getUserMailboxes(userId: string): Mailbox[] {
    const list: Mailbox[] = [];
    for (const mb of this.mailboxes.values()) {
      if (mb.ownerUserId === userId && mb.status !== 'DELETED') {
        list.push(mb);
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  archiveMailbox(id: string) {
    const mb = this.mailboxes.get(id);
    if (mb) {
      mb.isArchived = true;
    }
  }

  // --- ADMIN MAILBOX MANAGEMENT ---
  expireMailbox(id: string): boolean {
    const mb = this.mailboxes.get(id);
    if (!mb) return false;
    mb.expiresAt = Date.now() - 1000;
    mb.status = 'EXPIRED';
    return true;
  }

  deleteMailbox(id: string): boolean {
    const mb = this.mailboxes.get(id);
    if (!mb) return false;
    mb.status = 'DELETED';
    // Remove from normalized address lookup so it doesn't block re-use if desired
    if (mb.normalizedAddress) {
      this.mailboxesByNormalizedAddress.delete(mb.normalizedAddress);
    }
    // Flush messages
    this.messagesByMailbox.delete(id);
    mb.messageCount = 0;
    return true;
  }

  flushMailboxMessages(id: string): boolean {
    const mb = this.mailboxes.get(id);
    if (!mb) return false;
    const msgMap = this.messagesByMailbox.get(id);
    if (msgMap) {
      msgMap.clear();
    }
    mb.messageCount = 0;
    return true;
  }

  getSuspiciousActivitySummary(): SuspiciousActivitySummary {
    const recentUnauthorized = this.auditLogs
      .filter(l => l.result === 'failure' || l.action.includes('UNAUTHORIZED'))
      .slice(0, 20);

    const now = Date.now();
    const rateLimited: { key: string; count: number; resetInSec: number }[] = [];
    for (const [key, val] of this.rateLimits.entries()) {
      if (val.resetAt > now) {
        rateLimited.push({
          key,
          count: val.count,
          resetInSec: Math.max(0, Math.round((val.resetAt - now) / 1000)),
        });
      }
    }

    return {
      blockedIpsCount: this.blockedIps.size,
      blockedPatternsCount: this.blockedSenderPatterns.size,
      recentUnauthorizedAttempts: recentUnauthorized,
      rateLimitedEntities: rateLimited.slice(0, 20),
    };
  }

  // --- MESSAGE PERSISTENCE & READ STATE ---
  storeMessage(mailboxId: string, message: EmailMessage): EmailMessage {
    if (!this.messagesByMailbox.has(mailboxId)) {
      this.messagesByMailbox.set(mailboxId, new Map());
    }
    const mailboxMap = this.messagesByMailbox.get(mailboxId)!;

    // If message already stored, preserve read state!
    if (mailboxMap.has(message.id)) {
      const existing = mailboxMap.get(message.id)!;
      return existing;
    }

    mailboxMap.set(message.id, message);
    return message;
  }

  markMessageRead(mailboxId: string, messageId: string): EmailMessage | null {
    const mailboxMap = this.messagesByMailbox.get(mailboxId);
    if (!mailboxMap) return null;
    const msg = mailboxMap.get(messageId);
    if (!msg) return null;

    msg.readAt = Date.now();
    msg.isRead = true;
    return msg;
  }

  getMailboxStoredMessages(mailboxId: string): EmailMessage[] {
    const mailboxMap = this.messagesByMailbox.get(mailboxId);
    if (!mailboxMap) return [];
    return Array.from(mailboxMap.values()).sort((a, b) => b.receivedAt - a.receivedAt);
  }

  // --- SSE REALTIME ---
  addSseClient(mailboxId: string, res: Response) {
    if (!this.sseClients.has(mailboxId)) {
      this.sseClients.set(mailboxId, new Set());
    }
    this.sseClients.get(mailboxId)!.add(res);
  }

  removeSseClient(mailboxId: string, res: Response) {
    const clients = this.sseClients.get(mailboxId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.sseClients.delete(mailboxId);
      }
    }
  }

  broadcastNewMessage(mailboxId: string, message: EmailMessage) {
    if (this.knownMessageIds.has(message.id)) {
      return; // Already notified
    }
    this.knownMessageIds.add(message.id);
    this.totalEmailsReceived++;
    this.messageTimestamps.push(Date.now());

    // Persist in local mailbox messages store
    this.storeMessage(mailboxId, message);

    const mb = this.mailboxes.get(mailboxId);
    if (mb) {
      mb.messageCount++;
    }

    const clients = this.sseClients.get(mailboxId);
    if (clients && clients.size > 0) {
      const payload = `event: new_message\ndata: ${JSON.stringify(message)}\n\n`;
      clients.forEach(client => {
        try {
          client.write(payload);
        } catch {
          // Client disconnected
        }
      });
    }
  }

  // --- ADMIN AUDIT LOGGING ---
  logAdminAction(
    adminUserId: string,
    adminEmail: string,
    action: string,
    target?: string,
    ip?: string,
    result: 'success' | 'failure' = 'success',
    details?: Record<string, any>
  ) {
    const log: AdminAuditLog = {
      id: `log_${crypto.randomBytes(8).toString('hex')}`,
      adminUserId,
      adminEmail,
      action,
      target,
      timestamp: Date.now(),
      ip,
      result,
      details,
    };
    this.auditLogs.unshift(log);
    // Keep last 500 audit logs
    if (this.auditLogs.length > 500) {
      this.auditLogs.pop();
    }
  }

  // --- RATE LIMITING ---
  checkRateLimit(identifier: string, maxRequests = 60, windowSeconds = 60): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const entry = this.rateLimits.get(identifier);

    if (!entry || now > entry.resetAt) {
      this.rateLimits.set(identifier, {
        count: 1,
        resetAt: now + windowSeconds * 1000,
      });
      return { allowed: true, remaining: maxRequests - 1 };
    }

    if (entry.count >= maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    entry.count++;
    return { allowed: true, remaining: maxRequests - entry.count };
  }

  // --- METRICS ---
  logRequest() {
    const now = Date.now();
    this.requestLog.push(now);
    const cutoff = now - 300000;
    this.requestLog = this.requestLog.filter(t => t > cutoff);
  }

  getAdminMetrics(): AdminMetrics {
    const now = Date.now();
    const oneMinAgo = now - 60000;
    const reqsLastMin = this.requestLog.filter(t => t > oneMinAgo).length;

    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const messagesToday = this.messageTimestamps.filter(t => t >= startOfToday).length;

    let activeCount = 0;
    let claimedCount = 0;
    let unclaimedCount = 0;
    let expiringSoonCount = 0;

    for (const mb of this.mailboxes.values()) {
      if (mb.status === 'CLAIMED' && mb.expiresAt > now) {
        activeCount++;
        claimedCount++;
        if (mb.expiresAt - now < 24 * 3600 * 1000) {
          expiringSoonCount++;
        }
      } else if (mb.status === 'UNCLAIMED') {
        unclaimedCount++;
      }
    }

    return {
      totalVisitors: this.totalVisitors,
      totalUsers: this.users.size,
      activeMailboxesCount: activeCount,
      claimedAddressesCount: claimedCount,
      unclaimedAddressesCount: unclaimedCount,
      totalEmailsReceived: this.totalEmailsReceived,
      messagesToday,
      expiringSoonCount,
      requestsPerMinute: reqsLastMin,
      providerHealthSummary: {},
      errorRate: 0.0,
    };
  }
}

export const db = new Database();
