import type { Mailbox, EmailMessage, User, AdminMetrics, AdminAuditLog, SystemSettings, SuspiciousActivitySummary } from './types.ts';
import type { Response } from 'express';
import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;

export interface SessionData {
  sessionId: string;
  activeMailboxId: string | null;
  userId: string | null;
  createdAt: number;
  lastActiveAt: number;
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export class Database {
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

  // PostgreSQL pool for production persistence
  private pool: pg.Pool | null = null;
  private isInitialized = false;

  constructor() {
    this.seedInitialAccounts();
  }

  // --- INITIALIZE DATABASE (POSTGRESQL OR IN-MEMORY FALLBACK) ---
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      try {
        console.log('[Database] Connecting to production PostgreSQL database...');
        const isSslRequired = !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
        this.pool = new Pool({
          connectionString: databaseUrl,
          ssl: isSslRequired ? { rejectUnauthorized: false } : undefined,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });

        // Run migrations & verify connection
        await this.runMigrations();
        await this.loadStateFromPostgres();
        console.log('[Database] PostgreSQL connected and schemas migrated successfully.');
      } catch (err: any) {
        console.error('[Database] Failed to connect to PostgreSQL, falling back to memory store:', err.message);
        this.pool = null;
      }
    } else {
      console.log('[Database] Notice: DATABASE_URL not set. Running with fallback memory store. Configure DATABASE_URL in Vercel for persistence.');
    }
  }

  // --- SCHEMA MIGRATIONS & INDEXES ---
  private async runMigrations(): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(128) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(32) NOT NULL DEFAULT 'user',
          created_at BIGINT NOT NULL,
          api_key VARCHAR(128) UNIQUE,
          active_mailbox_id VARCHAR(128)
        );
      `);

      // Sessions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          session_id VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(128),
          active_mailbox_id VARCHAR(128),
          created_at BIGINT NOT NULL,
          last_active_at BIGINT NOT NULL
        );
      `);

      // Mailboxes table
      await client.query(`
        CREATE TABLE IF NOT EXISTS mailboxes (
          id VARCHAR(128) PRIMARY KEY,
          address VARCHAR(255) NOT NULL,
          normalized_address VARCHAR(255) NOT NULL,
          provider VARCHAR(64) NOT NULL,
          domain VARCHAR(255) NOT NULL,
          username VARCHAR(255) NOT NULL,
          created_at BIGINT NOT NULL,
          claimed_at BIGINT NOT NULL,
          expires_at BIGINT NOT NULL,
          owner_session_id VARCHAR(128),
          owner_user_id VARCHAR(128),
          status VARCHAR(32) NOT NULL DEFAULT 'CLAIMED',
          message_count INT NOT NULL DEFAULT 0,
          is_archived BOOLEAN DEFAULT FALSE,
          custom_prefix BOOLEAN DEFAULT FALSE,
          provider_data JSONB
        );
      `);

      // Messages table
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id VARCHAR(128) PRIMARY KEY,
          mailbox_id VARCHAR(128) NOT NULL,
          from_address VARCHAR(255) NOT NULL,
          from_name VARCHAR(255),
          to_address VARCHAR(255) NOT NULL,
          subject TEXT NOT NULL,
          snippet TEXT,
          body_text TEXT,
          body_html TEXT,
          received_at BIGINT NOT NULL,
          read_at BIGINT,
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
          attachments JSONB,
          security JSONB,
          headers JSONB
        );
      `);

      // API keys table
      await client.query(`
        CREATE TABLE IF NOT EXISTS api_keys (
          api_key VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(128) NOT NULL,
          label VARCHAR(255) NOT NULL,
          created_at BIGINT NOT NULL,
          usage_count INT NOT NULL DEFAULT 0
        );
      `);

      // Audit logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(128) PRIMARY KEY,
          admin_user_id VARCHAR(128) NOT NULL,
          admin_email VARCHAR(255) NOT NULL,
          action VARCHAR(128) NOT NULL,
          target VARCHAR(255),
          timestamp BIGINT NOT NULL,
          ip VARCHAR(128),
          result VARCHAR(32) NOT NULL,
          details JSONB
        );
      `);

      // Indexes as required by Vercel production deployment spec
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mailboxes_active_norm_addr ON mailboxes (normalized_address) WHERE status = 'CLAIMED';
        CREATE INDEX IF NOT EXISTS idx_mailboxes_owner_user_id ON mailboxes (owner_user_id);
        CREATE INDEX IF NOT EXISTS idx_mailboxes_owner_session_id ON mailboxes (owner_session_id);
        CREATE INDEX IF NOT EXISTS idx_mailboxes_normalized_addr ON mailboxes (normalized_address);
        CREATE INDEX IF NOT EXISTS idx_mailboxes_expires_at ON mailboxes (expires_at);
        CREATE INDEX IF NOT EXISTS idx_mailboxes_status ON mailboxes (status);
        CREATE INDEX IF NOT EXISTS idx_mailboxes_created_at ON mailboxes (created_at);

        CREATE INDEX IF NOT EXISTS idx_messages_mailbox_id ON messages (mailbox_id);
        CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages (received_at);
        CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages (read_at);
        CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages (is_read);
      `);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // --- LOAD EXISTING POSTGRES DATA INTO HYBRID CACHE ---
  private async loadStateFromPostgres(): Promise<void> {
    if (!this.pool) return;
    try {
      // 1. Users
      const usersRes = await this.pool.query('SELECT * FROM users');
      for (const row of usersRes.rows) {
        const user: User = {
          id: row.id,
          email: row.email,
          name: row.name,
          passwordHash: row.password_hash,
          role: row.role,
          createdAt: Number(row.created_at),
          apiKey: row.api_key,
          activeMailboxId: row.active_mailbox_id,
        };
        this.users.set(user.id, user);
        this.usersByEmail.set(user.email.toLowerCase().trim(), user.id);
      }

      // 2. Mailboxes
      const mbRes = await this.pool.query('SELECT * FROM mailboxes WHERE status != $1', ['DELETED']);
      for (const row of mbRes.rows) {
        const mb: Mailbox = {
          id: row.id,
          address: row.address,
          normalizedAddress: row.normalized_address,
          provider: row.provider,
          domain: row.domain,
          username: row.username,
          createdAt: Number(row.created_at),
          claimedAt: Number(row.claimed_at),
          expiresAt: Number(row.expires_at),
          ownerSessionId: row.owner_session_id,
          ownerUserId: row.owner_user_id,
          status: row.status,
          messageCount: Number(row.message_count),
          isArchived: row.is_archived,
          customPrefix: row.custom_prefix,
          providerData: row.provider_data,
        };
        this.mailboxes.set(mb.id, mb);
        if (mb.status === 'CLAIMED') {
          this.mailboxesByNormalizedAddress.set(mb.normalizedAddress, mb.id);
        }
      }

      // 3. Sessions
      const sessRes = await this.pool.query('SELECT * FROM sessions');
      for (const row of sessRes.rows) {
        this.sessions.set(row.session_id, {
          sessionId: row.session_id,
          userId: row.user_id,
          activeMailboxId: row.active_mailbox_id,
          createdAt: Number(row.created_at),
          lastActiveAt: Number(row.last_active_at),
        });
      }

      // Seed initial admin if needed
      await this.ensureAdminAccountInPostgres();
    } catch (err: any) {
      console.error('[Database] Failed to hydrate cache from PostgreSQL:', err.message);
    }
  }

  // Ensure Admin in PostgreSQL
  private async ensureAdminAccountInPostgres(): Promise<void> {
    const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'admin@aethermail.cx').toLowerCase().trim();
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'AetherAdmin2026!Secure';

    if (!this.usersByEmail.has(adminEmail)) {
      const adminId = `usr_admin_${crypto.randomBytes(6).toString('hex')}`;
      const apiKey = `aeth_adm_${crypto.randomBytes(12).toString('hex')}`;
      const passwordHash = this.hashPassword(adminPassword);
      const now = Date.now();

      const adminUser: User = {
        id: adminId,
        email: adminEmail,
        name: 'Administrator',
        passwordHash,
        role: 'admin',
        createdAt: now,
        apiKey,
      };

      this.users.set(adminId, adminUser);
      this.usersByEmail.set(adminEmail, adminId);
      this.apiKeys.set(apiKey, {
        userId: adminId,
        label: 'Admin Master Key',
        createdAt: now,
        usageCount: 0,
      });

      if (this.pool) {
        try {
          await this.pool.query(
            `INSERT INTO users (id, email, name, password_hash, role, created_at, api_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (email) DO NOTHING`,
            [adminId, adminEmail, 'Administrator', passwordHash, 'admin', now, apiKey]
          );
        } catch (err: any) {
          console.error('[Database] Error seeding admin to PostgreSQL:', err.message);
        }
      }
    }
  }

  hashPassword(password: string): string {
    const secret = process.env.AUTH_SECRET || '_salt_aethermail';
    return crypto.createHash('sha256').update(password + secret).digest('hex');
  }

  // --- SEED INITIAL ACCOUNTS IN-MEMORY ---
  private seedInitialAccounts() {
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
    }

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
      this.persistSession(sess);
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
    this.persistSession(sess);
    return sess;
  }

  private persistSession(sess: SessionData): void {
    if (!this.pool) return;
    this.pool.query(
      `INSERT INTO sessions (session_id, user_id, active_mailbox_id, created_at, last_active_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         active_mailbox_id = EXCLUDED.active_mailbox_id,
         last_active_at = EXCLUDED.last_active_at`,
      [sess.sessionId, sess.userId, sess.activeMailboxId, sess.createdAt, sess.lastActiveAt]
    ).catch(err => console.error('[Database] Failed to persist session:', err.message));
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
    if (mb.status === 'DELETED') return false;
    // Check if expired and past retention
    if (mb.expiresAt <= Date.now()) {
      mb.status = 'EXPIRED';
      return false;
    }
    return true;
  }

  saveMailbox(mb: Mailbox) {
    const normalized = this.normalizeAddress(mb.address);
    mb.normalizedAddress = normalized;
    this.mailboxes.set(mb.id, mb);
    if (mb.status === 'CLAIMED') {
      this.mailboxesByNormalizedAddress.set(normalized, mb.id);
    } else {
      this.mailboxesByNormalizedAddress.delete(normalized);
    }

    if (this.pool) {
      this.pool.query(
        `INSERT INTO mailboxes (
          id, address, normalized_address, provider, domain, username,
          created_at, claimed_at, expires_at, owner_session_id, owner_user_id,
          status, message_count, is_archived, custom_prefix, provider_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          owner_session_id = EXCLUDED.owner_session_id,
          owner_user_id = EXCLUDED.owner_user_id,
          status = EXCLUDED.status,
          message_count = EXCLUDED.message_count,
          is_archived = EXCLUDED.is_archived,
          provider_data = EXCLUDED.provider_data`,
        [
          mb.id, mb.address, mb.normalizedAddress, mb.provider, mb.domain, mb.username,
          mb.createdAt, mb.claimedAt, mb.expiresAt, mb.ownerSessionId, mb.ownerUserId,
          mb.status, mb.messageCount, mb.isArchived || false, mb.customPrefix || false,
          JSON.stringify(mb.providerData || {}),
        ]
      ).catch(err => console.error('[Database] Failed to persist mailbox:', err.message));
    }
  }

  getMailbox(id: string): Mailbox | undefined {
    const mb = this.mailboxes.get(id);
    if (mb && mb.expiresAt <= Date.now() && mb.status === 'CLAIMED') {
      mb.status = 'EXPIRED';
      this.saveMailbox(mb);
    }
    return mb;
  }

  async getMailboxAsync(id: string): Promise<Mailbox | undefined> {
    const memoryMb = this.mailboxes.get(id);
    if (memoryMb) {
      if (memoryMb.expiresAt <= Date.now() && memoryMb.status === 'CLAIMED') {
        memoryMb.status = 'EXPIRED';
        this.saveMailbox(memoryMb);
      }
      return memoryMb;
    }

    if (this.pool) {
      try {
        const res = await this.pool.query('SELECT * FROM mailboxes WHERE id = $1 LIMIT 1', [id]);
        if (res.rows.length > 0) {
          const row = res.rows[0];
          const mb: Mailbox = {
            id: row.id,
            address: row.address,
            normalizedAddress: row.normalized_address,
            provider: row.provider,
            domain: row.domain,
            username: row.username,
            createdAt: Number(row.created_at),
            claimedAt: Number(row.claimed_at),
            expiresAt: Number(row.expires_at),
            ownerSessionId: row.owner_session_id,
            ownerUserId: row.owner_user_id,
            status: row.status,
            messageCount: Number(row.message_count),
            isArchived: row.is_archived,
            customPrefix: row.custom_prefix,
            providerData: row.provider_data,
          };
          this.mailboxes.set(mb.id, mb);
          if (mb.status === 'CLAIMED') {
            this.mailboxesByNormalizedAddress.set(mb.normalizedAddress, mb.id);
          }
          if (mb.expiresAt <= Date.now() && mb.status === 'CLAIMED') {
            mb.status = 'EXPIRED';
            this.saveMailbox(mb);
          }
          return mb;
        }
      } catch (err: any) {
        console.error('[Database] getMailboxAsync query error:', err.message);
      }
    }

    return undefined;
  }

  async getMailboxByAddressAsync(address: string): Promise<Mailbox | undefined> {
    const normalized = this.normalizeAddress(address);
    const memoryMb = this.getMailboxByAddress(address);
    if (memoryMb) return memoryMb;

    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM mailboxes WHERE normalized_address = $1 AND status != $2 LIMIT 1',
          [normalized, 'DELETED']
        );
        if (res.rows.length > 0) {
          return this.getMailboxAsync(res.rows[0].id);
        }
      } catch (err: any) {
        console.error('[Database] getMailboxByAddressAsync error:', err.message);
      }
    }

    return undefined;
  }

  getMailboxByAddress(address: string): Mailbox | undefined {
    const normalized = this.normalizeAddress(address);
    const id = this.mailboxesByNormalizedAddress.get(normalized);
    if (!id) {
      // Linear scan fallback
      for (const mb of this.mailboxes.values()) {
        if (mb.normalizedAddress === normalized && mb.status !== 'DELETED') {
          return mb;
        }
      }
      return undefined;
    }
    return this.getMailbox(id);
  }

  getActiveMailboxForSession(sessionId: string): Mailbox | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // If user is logged in, their user account's activeMailboxId takes priority
    if (session.userId) {
      const user = this.users.get(session.userId);
      if (user && user.activeMailboxId) {
        const mb = this.getMailbox(user.activeMailboxId);
        if (mb && mb.status !== 'DELETED' && mb.expiresAt > Date.now()) {
          session.activeMailboxId = mb.id;
          return mb;
        }
      }
    }

    // Check session active mailbox
    if (session.activeMailboxId) {
      const mb = this.getMailbox(session.activeMailboxId);
      if (mb && mb.status !== 'DELETED' && mb.expiresAt > Date.now()) {
        return mb;
      }
    }

    return null;
  }

  getUserMailboxes(userId: string): Mailbox[] {
    const list: Mailbox[] = [];
    const now = Date.now();
    for (const mb of this.mailboxes.values()) {
      if (mb.ownerUserId === userId && mb.status !== 'DELETED') {
        if (mb.expiresAt <= now && mb.status === 'CLAIMED') {
          mb.status = 'EXPIRED';
        }
        list.push(mb);
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  archiveMailbox(id: string) {
    const mb = this.getMailbox(id);
    if (mb) {
      mb.isArchived = true;
      this.saveMailbox(mb);
    }
  }

  // --- ADMIN MAILBOX MANAGEMENT & EXPIRATION ---
  expireMailbox(id: string): boolean {
    const mb = this.mailboxes.get(id);
    if (!mb) return false;
    mb.expiresAt = Date.now() - 1000;
    mb.status = 'EXPIRED';
    this.saveMailbox(mb);
    return true;
  }

  deleteMailbox(id: string): boolean {
    const mb = this.mailboxes.get(id);
    if (!mb) return false;
    mb.status = 'DELETED';
    if (mb.normalizedAddress) {
      this.mailboxesByNormalizedAddress.delete(mb.normalizedAddress);
    }
    this.messagesByMailbox.delete(id);
    mb.messageCount = 0;
    this.saveMailbox(mb);

    if (this.pool) {
      this.pool.query('DELETE FROM messages WHERE mailbox_id = $1', [id]).catch(() => {});
      this.pool.query('UPDATE mailboxes SET status = $1, message_count = 0 WHERE id = $2', ['DELETED', id]).catch(() => {});
    }
    return true;
  }

  flushMailboxMessages(id: string): boolean {
    const mb = this.getMailbox(id);
    if (!mb) return false;
    const msgMap = this.messagesByMailbox.get(id);
    if (msgMap) {
      msgMap.clear();
    }
    mb.messageCount = 0;
    this.saveMailbox(mb);

    if (this.pool) {
      this.pool.query('DELETE FROM messages WHERE mailbox_id = $1', [id]).catch(() => {});
    }
    return true;
  }

  // Clean expired mailboxes (used by Vercel scheduled cron)
  cleanExpiredMailboxes(): { expiredCount: number; purgedCount: number } {
    const now = Date.now();
    let expiredCount = 0;
    let purgedCount = 0;
    const purgeCutoff = now - 14 * 24 * 60 * 60 * 1000; // 14 days quarantine retention

    for (const [id, mb] of this.mailboxes.entries()) {
      if (mb.status === 'CLAIMED' && mb.expiresAt <= now) {
        mb.status = 'EXPIRED';
        this.saveMailbox(mb);
        expiredCount++;
      } else if (mb.status === 'EXPIRED' && mb.expiresAt < purgeCutoff) {
        this.deleteMailbox(id);
        purgedCount++;
      }
    }

    if (this.pool) {
      this.pool.query('UPDATE mailboxes SET status = $1 WHERE expires_at <= $2 AND status = $3', ['EXPIRED', now, 'CLAIMED']).catch(() => {});
      this.pool.query('DELETE FROM messages WHERE mailbox_id IN (SELECT id FROM mailboxes WHERE expires_at < $1)', [purgeCutoff]).catch(() => {});
      this.pool.query('UPDATE mailboxes SET status = $1 WHERE expires_at < $2', ['DELETED', purgeCutoff]).catch(() => {});
    }

    return { expiredCount, purgedCount };
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

    // Preserve read state if already stored
    if (mailboxMap.has(message.id)) {
      return mailboxMap.get(message.id)!;
    }

    mailboxMap.set(message.id, message);

    if (this.pool) {
      this.pool.query(
        `INSERT INTO messages (
          id, mailbox_id, from_address, from_name, to_address,
          subject, snippet, body_text, body_html, received_at,
          read_at, is_read, has_attachments, attachments, security, headers
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO NOTHING`,
        [
          message.id, mailboxId, message.from, message.fromName || null, message.to,
          message.subject, message.snippet, message.bodyText, message.bodyHtml, message.receivedAt,
          message.readAt, message.isRead, message.hasAttachments,
          JSON.stringify(message.attachments || []),
          JSON.stringify(message.security || {}),
          JSON.stringify(message.headers || {}),
        ]
      ).catch(err => console.error('[Database] Failed to persist message:', err.message));
    }

    return message;
  }

  markMessageRead(mailboxId: string, messageId: string): EmailMessage | null {
    const mailboxMap = this.messagesByMailbox.get(mailboxId);
    if (!mailboxMap) return null;
    const msg = mailboxMap.get(messageId);
    if (!msg) return null;

    msg.readAt = Date.now();
    msg.isRead = true;

    if (this.pool) {
      this.pool.query('UPDATE messages SET is_read = TRUE, read_at = $1 WHERE id = $2', [msg.readAt, messageId])
        .catch(err => console.error('[Database] Failed to mark message read in postgres:', err.message));
    }

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
      return;
    }
    this.knownMessageIds.add(message.id);
    this.totalEmailsReceived++;
    this.messageTimestamps.push(Date.now());

    this.storeMessage(mailboxId, message);

    const mb = this.mailboxes.get(mailboxId);
    if (mb) {
      mb.messageCount++;
      this.saveMailbox(mb);
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
    if (this.auditLogs.length > 500) {
      this.auditLogs.pop();
    }

    if (this.pool) {
      this.pool.query(
        `INSERT INTO audit_logs (id, admin_user_id, admin_email, action, target, timestamp, ip, result, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [log.id, log.adminUserId, log.adminEmail, log.action, log.target || null, log.timestamp, log.ip || null, log.result, JSON.stringify(log.details || {})]
      ).catch(err => console.error('[Database] Failed to persist audit log:', err.message));
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
