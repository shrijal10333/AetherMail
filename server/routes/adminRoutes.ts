import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db.ts';
import { ProviderManager } from '../providers/ProviderManager.ts';
import crypto from 'crypto';

export function createAdminRouter(providerManager: ProviderManager) {
  const router = Router();

  // Helper to extract session
  const getSession = (req: Request) => {
    const sessionId = req.cookies?.aether_session || (req.headers['x-session-id'] as string);
    return sessionId ? db.sessions.get(sessionId) : null;
  };

  // STRICT SERVER-SIDE AUTHORIZATION MIDDLEWARE: role === 'admin'
  const requireAdminRole = (req: Request, res: Response, next: NextFunction): any => {
    const session = getSession(req);
    if (!session || !session.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please sign in.',
      });
    }

    const user = db.users.get(session.userId);
    if (!user || user.role !== 'admin') {
      // Log unauthorized attempt to audit log
      db.logAdminAction(
        session.userId,
        user?.email || 'unknown',
        'UNAUTHORIZED_ADMIN_ACCESS_ATTEMPT',
        req.originalUrl,
        req.ip,
        'failure'
      );

      return res.status(403).json({
        success: false,
        error: 'Forbidden: Administrator privileges required.',
      });
    }

    // Attach admin user to request object
    (req as any).adminUser = user;
    next();
  };

  // Apply requireAdminRole to all endpoints in this router
  router.use(requireAdminRole);

  // 1. Overall admin metrics & telemetry
  router.get('/metrics', async (req: Request, res: Response) => {
    const adminUser = (req as any).adminUser;
    const metrics = db.getAdminMetrics();
    const providers = providerManager.getProvidersSummary();

    db.logAdminAction(adminUser.id, adminUser.email, 'VIEW_METRICS', undefined, req.ip, 'success');

    res.json({
      success: true,
      metrics,
      providers,
      blockedIps: Array.from(db.blockedIps),
    });
  });

  // 2. Mailboxes list & search
  router.get('/mailboxes', (req: Request, res: Response) => {
    const adminUser = (req as any).adminUser;
    const query = (req.query.q as string || '').toLowerCase().trim();

    let list = Array.from(db.mailboxes.values());

    if (query) {
      list = list.filter(m =>
        m.address.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query) ||
        (m.ownerUserId && m.ownerUserId.toLowerCase().includes(query))
      );
    }

    const responseList = list.map(m => {
      const ownerUser = m.ownerUserId ? db.users.get(m.ownerUserId) : null;
      return {
        id: m.id,
        address: m.address,
        provider: m.provider,
        domain: m.domain,
        createdAt: m.createdAt,
        claimedAt: m.claimedAt,
        expiresAt: m.expiresAt,
        isExpired: m.expiresAt <= Date.now(),
        status: m.status,
        messageCount: m.messageCount,
        ownerType: ownerUser ? 'Registered User' : 'Guest Session',
        ownerEmail: ownerUser?.email,
      };
    });

    db.logAdminAction(adminUser.id, adminUser.email, 'VIEW_MAILBOXES', query || 'all', req.ip, 'success');

    res.json({ success: true, mailboxes: responseList });
  });

  // 2b. Mailbox detail
  router.get('/mailboxes/:id', (req: Request, res: Response): any => {
    const adminUser = (req as any).adminUser;
    const { id } = req.params;
    const mb = db.getMailbox(id);
    if (!mb) {
      return res.status(404).json({ success: false, error: 'Mailbox not found' });
    }

    const messages = db.getMailboxStoredMessages(id);
    const ownerUser = mb.ownerUserId ? db.users.get(mb.ownerUserId) : null;
    const session = mb.ownerSessionId ? db.sessions.get(mb.ownerSessionId) : null;

    db.logAdminAction(adminUser.id, adminUser.email, 'INSPECT_MAILBOX_DETAIL', mb.address, req.ip, 'success');

    return res.json({
      success: true,
      mailbox: {
        ...mb,
        ownerUser: ownerUser ? { id: ownerUser.id, email: ownerUser.email, name: ownerUser.name, role: ownerUser.role } : null,
        sessionInfo: session ? { createdAt: session.createdAt, lastActiveAt: session.lastActiveAt } : null,
      },
      messages,
    });
  });

  // 2c. Manual expire mailbox
  router.post('/mailboxes/:id/expire', (req: Request, res: Response): any => {
    const adminUser = (req as any).adminUser;
    const { id } = req.params;
    const mb = db.getMailbox(id);
    if (!mb) {
      return res.status(404).json({ success: false, error: 'Mailbox not found' });
    }

    const success = db.expireMailbox(id);
    db.logAdminAction(adminUser.id, adminUser.email, 'MANUAL_EXPIRE_MAILBOX', mb.address, req.ip, 'success');
    return res.json({ success, message: 'Mailbox manually expired' });
  });

  // 2d. Delete mailbox
  router.delete('/mailboxes/:id', (req: Request, res: Response): any => {
    const adminUser = (req as any).adminUser;
    const { id } = req.params;
    const mb = db.getMailbox(id);
    if (!mb) {
      return res.status(404).json({ success: false, error: 'Mailbox not found' });
    }

    const success = db.deleteMailbox(id);
    db.logAdminAction(adminUser.id, adminUser.email, 'DELETE_MAILBOX', mb.address, req.ip, 'success');
    return res.json({ success, message: 'Mailbox deleted successfully' });
  });

  // 2e. Flush messages from mailbox
  router.post('/mailboxes/:id/flush', (req: Request, res: Response): any => {
    const adminUser = (req as any).adminUser;
    const { id } = req.params;
    const mb = db.getMailbox(id);
    if (!mb) {
      return res.status(404).json({ success: false, error: 'Mailbox not found' });
    }

    const success = db.flushMailboxMessages(id);
    db.logAdminAction(adminUser.id, adminUser.email, 'FLUSH_MESSAGES', mb.address, req.ip, 'success');
    return res.json({ success, message: 'Mailbox messages flushed' });
  });


  // 3. Message management: inspect messages across mailboxes
  router.get('/messages', (req: Request, res: Response) => {
    const adminUser = (req as any).adminUser;
    const query = (req.query.q as string || '').toLowerCase().trim();

    const allMessages: any[] = [];
    for (const [mailboxId, msgMap] of db.messagesByMailbox.entries()) {
      const mb = db.getMailbox(mailboxId);
      for (const msg of msgMap.values()) {
        if (
          !query ||
          msg.from.toLowerCase().includes(query) ||
          msg.to.toLowerCase().includes(query) ||
          msg.subject.toLowerCase().includes(query)
        ) {
          allMessages.push({
            id: msg.id,
            mailboxId,
            mailboxAddress: mb?.address || msg.to,
            from: msg.from,
            fromName: msg.fromName,
            to: msg.to,
            subject: msg.subject,
            snippet: msg.snippet,
            receivedAt: msg.receivedAt,
            readAt: msg.readAt,
            isRead: msg.isRead,
            hasAttachments: msg.hasAttachments,
          });
        }
      }
    }

    db.logAdminAction(adminUser.id, adminUser.email, 'VIEW_MESSAGES', query || 'all', req.ip, 'success');

    res.json({
      success: true,
      messages: allMessages.sort((a, b) => b.receivedAt - a.receivedAt).slice(0, 100),
    });
  });

  // 4. Provider toggle / status
  router.post('/providers/:id/toggle', (req: Request, res: Response): any => {
    const adminUser = (req as any).adminUser;
    const { id } = req.params;
    const { enabled } = req.body;
    const updated = providerManager.setProviderStatus(id, !!enabled);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    db.logAdminAction(
      adminUser.id,
      adminUser.email,
      'TOGGLE_PROVIDER',
      id,
      req.ip,
      'success',
      { enabled }
    );

    return res.json({ success: true, providers: providerManager.getProvidersSummary() });
  });

  // 5. Force provider health check
  router.post('/providers/health-check', async (req: Request, res: Response) => {
    const adminUser = (req as any).adminUser;
    const health = await providerManager.runHealthChecks();

    db.logAdminAction(adminUser.id, adminUser.email, 'PING_PROVIDERS', undefined, req.ip, 'success');

    res.json({ success: true, health, providers: providerManager.getProvidersSummary() });
  });

  // 5b. Test individual provider connection & latency
  router.post('/providers/:id/test', async (req: Request, res: Response): Promise<any> => {
    const adminUser = (req as any).adminUser;
    const { id } = req.params;
    try {
      const health = await providerManager.testSingleProvider(id);
      db.logAdminAction(adminUser.id, adminUser.email, 'TEST_PROVIDER', id, req.ip, 'success', { health });
      return res.json({ success: true, health, providers: providerManager.getProvidersSummary() });
    } catch (err: any) {
      db.logAdminAction(adminUser.id, adminUser.email, 'TEST_PROVIDER', id, req.ip, 'failure', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5c. Provider domain mapping
  router.get('/providers/domains', async (req: Request, res: Response) => {
    const mappings = await providerManager.getDomainMappings();
    res.json({ success: true, mappings });
  });

  // 6. Abuse control: block or unblock IP
  router.post('/abuse/block-ip', (req: Request, res: Response): any => {
    const adminUser = (req as any).adminUser;
    const { ip, block } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP is required' });

    if (block) {
      db.blockedIps.add(ip);
    } else {
      db.blockedIps.delete(ip);
    }

    db.logAdminAction(
      adminUser.id,
      adminUser.email,
      block ? 'BLOCK_IP' : 'UNBLOCK_IP',
      ip,
      req.ip,
      'success'
    );

    return res.json({ success: true, blockedIps: Array.from(db.blockedIps) });
  });

  // 6b. Block or unblock sender pattern / domain
  router.post('/abuse/block-sender', (req: Request, res: Response): any => {
    const adminUser = (req as any).adminUser;
    const { pattern, block } = req.body;
    if (!pattern) return res.status(400).json({ error: 'Pattern is required' });

    const normPattern = pattern.toLowerCase().trim();
    if (block) {
      db.blockedSenderPatterns.add(normPattern);
    } else {
      db.blockedSenderPatterns.delete(normPattern);
    }
    db.systemSettings.blockedSenderPatterns = Array.from(db.blockedSenderPatterns);

    db.logAdminAction(
      adminUser.id,
      adminUser.email,
      block ? 'BLOCK_SENDER_PATTERN' : 'UNBLOCK_SENDER_PATTERN',
      normPattern,
      req.ip,
      'success'
    );

    return res.json({ success: true, blockedPatterns: Array.from(db.blockedSenderPatterns) });
  });

  // 6c. Suspicious traffic monitor
  router.get('/abuse/suspicious', (_req: Request, res: Response) => {
    const summary = db.getSuspiciousActivitySummary();
    res.json({ success: true, summary, blockedIps: Array.from(db.blockedIps), blockedPatterns: Array.from(db.blockedSenderPatterns) });
  });

  // 7. System Settings
  router.get('/settings', (_req: Request, res: Response) => {
    res.json({ success: true, settings: db.systemSettings });
  });

  router.post('/settings', (req: Request, res: Response): any => {
    const adminUser = (req as any).adminUser;
    const updates = req.body || {};

    if (typeof updates.defaultTtlHours === 'number' && updates.defaultTtlHours > 0) {
      db.systemSettings.defaultTtlHours = updates.defaultTtlHours;
    }
    if (typeof updates.maxMessageLimit === 'number' && updates.maxMessageLimit > 0) {
      db.systemSettings.maxMessageLimit = updates.maxMessageLimit;
    }
    if (typeof updates.rateLimitMaxRequests === 'number' && updates.rateLimitMaxRequests > 0) {
      db.systemSettings.rateLimitMaxRequests = updates.rateLimitMaxRequests;
    }
    if (typeof updates.rateLimitWindowSeconds === 'number' && updates.rateLimitWindowSeconds > 0) {
      db.systemSettings.rateLimitWindowSeconds = updates.rateLimitWindowSeconds;
    }
    if (Array.isArray(updates.domainWhitelist)) {
      db.systemSettings.domainWhitelist = updates.domainWhitelist;
    }
    if (Array.isArray(updates.domainBlacklist)) {
      db.systemSettings.domainBlacklist = updates.domainBlacklist;
    }
    if (Array.isArray(updates.blockedSenderPatterns)) {
      db.systemSettings.blockedSenderPatterns = updates.blockedSenderPatterns;
      db.blockedSenderPatterns = new Set(updates.blockedSenderPatterns);
    }

    db.logAdminAction(adminUser.id, adminUser.email, 'UPDATE_SYSTEM_SETTINGS', undefined, req.ip, 'success', updates);

    return res.json({ success: true, settings: db.systemSettings });
  });

  // 8. Admin audit logs
  router.get('/audit-logs', (req: Request, res: Response) => {
    res.json({ success: true, logs: db.auditLogs.slice(0, 100) });
  });

  // 9. Registered users list
  router.get('/users', (_req: Request, res: Response) => {
    const list = Array.from(db.users.values()).map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      hasApiKey: !!u.apiKey,
    }));
    res.json({ success: true, users: list });
  });


  return router;
}
