import { Router, Request, Response } from 'express';
import { db, SEVEN_DAYS_MS } from '../db.ts';
import { ProviderManager } from '../providers/ProviderManager.ts';
import type { Mailbox, EmailMessage } from '../types.ts';
import crypto from 'crypto';

export function createMailboxRouter(providerManager: ProviderManager) {
  const router = Router();

  const getSession = (req: Request, res: Response) => {
    let sessionId = req.cookies?.aether_session || req.headers['x-session-id'] as string;
    if (!sessionId) {
      sessionId = `sess_${crypto.randomBytes(16).toString('hex')}`;
      res.cookie('aether_session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 3600 * 1000,
      });
    }
    return db.getOrCreateSession(sessionId);
  };

  // Helper to verify mailbox ownership
  const verifyMailboxOwnership = (mailbox: Mailbox, req: Request, res: Response): boolean => {
    const session = getSession(req, res);
    const user = session.userId ? db.users.get(session.userId) : null;
    if (user?.role === 'admin') return true;

    if (session.userId && mailbox.ownerUserId === session.userId) return true;
    if (mailbox.ownerSessionId === session.sessionId) return true;

    return false;
  };

  // 1. Get or initialize current active mailbox (Persistence: NEVER replace unexpectedly)
  router.get('/active', async (req: Request, res: Response): Promise<any> => {
    const session = getSession(req, res);
    let mailbox = db.getActiveMailboxForSession(session.sessionId);

    if (!mailbox) {
      try {
        const { result, providerId } = await providerManager.createMailboxWithFailover();

        // Check if normalized address is somehow already claimed
        if (db.isAddressClaimed(result.address)) {
          return res.status(409).json({
            success: false,
            error: 'That address is already claimed.',
          });
        }

        const now = Date.now();
        mailbox = {
          id: result.id,
          address: result.address,
          normalizedAddress: db.normalizeAddress(result.address),
          provider: providerId,
          domain: result.domain,
          username: result.username,
          createdAt: now,
          claimedAt: now,
          expiresAt: now + SEVEN_DAYS_MS, // FIXED 7-DAY LIFETIME
          ownerSessionId: session.sessionId,
          ownerUserId: session.userId,
          status: 'CLAIMED',
          messageCount: 0,
          providerData: result.providerData,
        };

        db.saveMailbox(mailbox);
        session.activeMailboxId = mailbox.id;
        if (session.userId) {
          const user = db.users.get(session.userId);
          if (user) user.activeMailboxId = mailbox.id;
        }
      } catch (err: any) {
        return res.status(503).json({
          success: false,
          error: 'Email service configuration required or upstream provider unavailable.',
          detail: err.message,
        });
      }
    }

    return res.json({
      success: true,
      mailbox,
      sessionId: session.sessionId,
    });
  });

  // 1b. Get all available domains across all free active providers
  router.get('/domains', async (_req: Request, res: Response) => {
    const list = await providerManager.getAllAvailableDomains();
    return res.json({ success: true, domains: list });
  });

  // 1c. Send quick realistic test email to this mailbox
  router.post('/:id/test-email', async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const mailbox = db.getMailbox(id);
    if (!mailbox) return res.status(404).json({ success: false, error: 'Mailbox not found' });
    if (!verifyMailboxOwnership(mailbox, req, res)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const testCode = Math.floor(100000 + Math.random() * 900000);
    const testId = `msg_test_${crypto.randomBytes(6).toString('hex')}`;
    const testMsg: EmailMessage = {
      id: testId,
      mailboxId: mailbox.id,
      from: 'verify@github.com',
      fromName: 'GitHub Security',
      to: mailbox.address,
      subject: `Your GitHub verification code is ${testCode}`,
      snippet: 'Please verify your temporary email address to complete your GitHub authentication session...',
      bodyText: `Hello,\n\nPlease use the following verification code to confirm your disposable email address: ${testCode}.\n\nThis verification code expires in 10 minutes.\n\nThanks,\nThe GitHub Team`,
      bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; padding: 24px; border: 1px solid #30363d; border-radius: 8px; background: #0d1117; color: #c9d1d9;">
        <h2 style="color: #ffffff; margin-top: 0; font-size: 20px;">GitHub Verification</h2>
        <p style="color: #8b949e; font-size: 14px; line-height: 1.5;">Here is your verification code for <strong>${mailbox.address}</strong>:</p>
        <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 14px 20px; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #58a6ff; text-align: center; margin: 20px 0;">
          ${testCode}
        </div>
        <p style="color: #8b949e; font-size: 12px; margin-bottom: 0;">This code was generated instantly to verify your AetherMail inbox reception capability.</p>
      </div>`,
      receivedAt: Date.now(),
      readAt: null,
      isRead: false,
      hasAttachments: false,
      security: {
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'pass',
        tls: true,
      },
    };

    db.storeMessage(mailbox.id, testMsg);
    db.broadcastNewMessage(mailbox.id, testMsg);
    return res.json({ success: true, message: testMsg });
  });


  // 2. Explicitly create "New Email"
  router.post('/new', async (req: Request, res: Response): Promise<any> => {
    const session = getSession(req, res);
    const { prefix, domain } = req.body || {};

    const rateCheck = db.checkRateLimit(`new_mbx_${session.sessionId}`, 30, 3600);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit reached. Please wait before creating more mailboxes.',
      });
    }

    // Check if custom prefix and domain are requested and if that address is already claimed
    if (prefix && domain) {
      const candidateAddress = `${prefix.toLowerCase().replace(/[^a-z0-9]/g, '')}@${domain.toLowerCase().trim()}`;
      if (db.isAddressClaimed(candidateAddress)) {
        return res.status(409).json({
          success: false,
          error: 'That address is already claimed.',
        });
      }
    }

    // Note: Old mailbox is kept in database for history until its 7-day expiration!
    try {
      const { result, providerId } = await providerManager.createMailboxWithFailover(prefix, domain);

      // Check atomic claim
      if (db.isAddressClaimed(result.address)) {
        return res.status(409).json({
          success: false,
          error: 'That address is already claimed.',
        });
      }

      const now = Date.now();
      const mailbox: Mailbox = {
        id: result.id,
        address: result.address,
        normalizedAddress: db.normalizeAddress(result.address),
        provider: providerId,
        domain: result.domain,
        username: result.username,
        createdAt: now,
        claimedAt: now,
        expiresAt: now + SEVEN_DAYS_MS, // FIXED 7-DAY LIFETIME
        ownerSessionId: session.sessionId,
        ownerUserId: session.userId,
        status: 'CLAIMED',
        messageCount: 0,
        customPrefix: !!prefix,
        providerData: result.providerData,
      };

      db.saveMailbox(mailbox);
      session.activeMailboxId = mailbox.id;
      if (session.userId) {
        const user = db.users.get(session.userId);
        if (user) user.activeMailboxId = mailbox.id;
      }

      return res.json({
        success: true,
        mailbox,
        sessionId: session.sessionId,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Failed to generate new mailbox.',
      });
    }
  });

  // 3. Get messages for a mailbox (Strict ownership check & read state preservation)
  router.get('/:id/messages', async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const mailbox = db.getMailbox(id);
    if (!mailbox) {
      return res.status(404).json({ success: false, error: 'Mailbox not found' });
    }

    // Ownership check
    if (!verifyMailboxOwnership(mailbox, req, res)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You do not own this mailbox.' });
    }

    // Check expiration
    if (mailbox.expiresAt <= Date.now()) {
      mailbox.status = 'EXPIRED';
      return res.json({ success: true, messages: db.getMailboxStoredMessages(mailbox.id), expired: true });
    }

    const provider = providerManager.getProviderInstance(mailbox.provider);
    try {
      const upstreamMessages = await provider.getMessages(mailbox.id, mailbox.address, mailbox.providerData);
      mailbox.messageCount = upstreamMessages.length;

      // Merge with server-side read state
      const mergedMessages: EmailMessage[] = [];
      for (const msg of upstreamMessages) {
        // Retrieve or store message
        const stored = db.storeMessage(mailbox.id, msg);
        mergedMessages.push(stored);

        // Only broadcast if not known before
        if (!db.knownMessageIds.has(msg.id)) {
          db.broadcastNewMessage(mailbox.id, stored);
        }
      }

      return res.json({
        success: true,
        messages: mergedMessages.sort((a, b) => b.receivedAt - a.receivedAt),
      });
    } catch (err: any) {
      // Fallback to locally stored messages if provider error
      return res.json({ success: true, messages: db.getMailboxStoredMessages(mailbox.id) });
    }
  });

  // 4. Mark message as read (Fixes the blue unread highlight bug permanently)
  router.post('/:id/messages/:messageId/read', async (req: Request, res: Response): Promise<any> => {
    const { id, messageId } = req.params;
    const mailbox = db.getMailbox(id);
    if (!mailbox) {
      return res.status(404).json({ success: false, error: 'Mailbox not found' });
    }

    if (!verifyMailboxOwnership(mailbox, req, res)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You do not own this mailbox.' });
    }

    const updated = db.markMessageRead(mailbox.id, messageId);
    return res.json({ success: true, message: updated });
  });

  // 5. Get specific message details (Strict ownership check & marks read)
  router.get('/:id/messages/:messageId', async (req: Request, res: Response): Promise<any> => {
    const { id, messageId } = req.params;
    const mailbox = db.getMailbox(id);
    if (!mailbox) {
      return res.status(404).json({ success: false, error: 'Mailbox not found' });
    }

    if (!verifyMailboxOwnership(mailbox, req, res)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You do not own this mailbox.' });
    }

    // Auto mark as read on open
    db.markMessageRead(mailbox.id, messageId);

    const provider = providerManager.getProviderInstance(mailbox.provider);
    try {
      const message = await provider.getMessage(mailbox.id, messageId, mailbox.address, mailbox.providerData);
      if (!message) {
        return res.status(404).json({ success: false, error: 'Message not found' });
      }

      // Preserve readAt
      message.readAt = Date.now();
      message.isRead = true;
      db.storeMessage(mailbox.id, message);

      return res.json({ success: true, message });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. Delete mailbox (Strict ownership check)
  router.delete('/:id', async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const session = getSession(req, res);
    const mailbox = db.getMailbox(id);
    if (!mailbox) {
      return res.status(404).json({ success: false, error: 'Mailbox not found' });
    }

    if (!verifyMailboxOwnership(mailbox, req, res)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You do not own this mailbox.' });
    }

    const provider = providerManager.getProviderInstance(mailbox.provider);
    try {
      await provider.deleteMailbox(mailbox.id, mailbox.address, mailbox.providerData);
    } catch {
      // Ignore upstream failure
    }

    mailbox.status = 'DELETED';
    db.archiveMailbox(id);
    if (session.activeMailboxId === id) {
      session.activeMailboxId = null;
    }

    return res.json({ success: true, message: 'Mailbox deleted successfully' });
  });

  return router;
}
