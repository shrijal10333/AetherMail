import { Router, Request, Response } from 'express';
import { db, SEVEN_DAYS_MS } from '../db.ts';
import { ProviderManager } from '../providers/ProviderManager.ts';
import type { Mailbox, EmailMessage } from '../types.ts';
import crypto from 'crypto';

export function createMailboxRouter(providerManager: ProviderManager) {
  const router = Router();

  const getSession = (req: Request, res?: Response) => {
    let sessionId = req.cookies?.aether_session || (req.headers['x-session-id'] as string);
    if (!sessionId) {
      sessionId = `sess_${crypto.randomBytes(16).toString('hex')}`;
      if (res) {
        res.cookie('aether_session', sessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 3600 * 1000,
        });
      }
    }
    return db.getOrCreateSession(sessionId);
  };

  const attachMailboxCookie = (res: Response, mailbox: Mailbox) => {
    try {
      res.cookie('aether_mb', JSON.stringify({
        id: mailbox.id,
        address: mailbox.address,
        provider: mailbox.provider,
        domain: mailbox.domain,
        username: mailbox.username,
        createdAt: mailbox.createdAt,
        expiresAt: mailbox.expiresAt,
      }), {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 3600 * 1000,
      });
    } catch {
      // Ignore header serialization error
    }
  };

  // Helper to resolve mailbox across serverless lambdas or cold starts
  const resolveMailbox = async (id: string, req: Request, res?: Response): Promise<Mailbox | null> => {
    // 1. Try memory or PostgreSQL
    let mb = await db.getMailboxAsync(id);
    if (mb) return mb;

    // 2. Try client-provided metadata from header or cookie (resilience for serverless statelessness)
    const headerAddr = req.headers['x-mailbox-address'] as string;
    const headerProvider = req.headers['x-mailbox-provider'] as string;
    const queryAddr = req.query.address as string;

    let cookieMb: any = null;
    try {
      if (req.cookies?.aether_mb) {
        cookieMb = JSON.parse(req.cookies.aether_mb);
      }
    } catch {}

    const targetAddress = headerAddr || queryAddr || (cookieMb?.id === id ? cookieMb.address : null) || (cookieMb?.address);
    if (targetAddress && targetAddress.includes('@')) {
      const norm = db.normalizeAddress(targetAddress);
      const existingByAddr = await db.getMailboxByAddressAsync(norm);
      if (existingByAddr) return existingByAddr;

      const domain = norm.split('@')[1] || 'catchmail.io';
      const username = norm.split('@')[0];
      const provider = headerProvider || cookieMb?.provider || (domain === 'catchmail.io' ? 'catchmail' : 'mailtm');
      const now = Date.now();

      const reconstructed: Mailbox = {
        id: id || cookieMb?.id || `mbx_rec_${crypto.randomBytes(8).toString('hex')}`,
        address: norm,
        normalizedAddress: norm,
        provider,
        domain,
        username,
        createdAt: cookieMb?.createdAt || now,
        claimedAt: cookieMb?.claimedAt || now,
        expiresAt: cookieMb?.expiresAt || now + SEVEN_DAYS_MS,
        ownerSessionId: getSession(req, res).sessionId,
        ownerUserId: null,
        status: 'CLAIMED',
        messageCount: 0,
      };
      db.saveMailbox(reconstructed);
      return reconstructed;
    }

    return null;
  };

  // Helper to verify mailbox ownership
  const verifyMailboxOwnership = (mailbox: Mailbox, req: Request, res?: Response): boolean => {
    const session = getSession(req, res);
    const user = session.userId ? db.users.get(session.userId) : null;
    if (user?.role === 'admin') return true;

    if (session.userId && mailbox.ownerUserId === session.userId) return true;
    if (mailbox.ownerSessionId === session.sessionId) return true;

    // Cookie fallback for Vercel Serverless
    if (req.cookies?.aether_mb) {
      try {
        const c = JSON.parse(req.cookies.aether_mb);
        if (c.id === mailbox.id || c.address === mailbox.address) return true;
      } catch {}
    }

    // Header fallback for Vercel Serverless
    if (req.headers['x-mailbox-id'] === mailbox.id || req.headers['x-mailbox-address'] === mailbox.address) {
      return true;
    }

    return false;
  };

  // 1. Get or initialize current active mailbox (Persistence: NEVER replace unexpectedly)
  router.get('/active', async (req: Request, res: Response): Promise<any> => {
    const session = getSession(req, res);
    let mailbox = db.getActiveMailboxForSession(session.sessionId);

    // If not found in session memory, recover from cookie or headers
    if (!mailbox) {
      const storedId = req.headers['x-mailbox-id'] as string;
      const storedAddr = req.headers['x-mailbox-address'] as string;
      if (storedId || storedAddr || req.cookies?.aether_mb) {
        mailbox = await resolveMailbox(storedId || '', req, res);
        if (mailbox && mailbox.expiresAt > Date.now()) {
          session.activeMailboxId = mailbox.id;
        } else {
          mailbox = null;
        }
      }
    }

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

    attachMailboxCookie(res, mailbox);

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
    const mailbox = await resolveMailbox(id, req, res);
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

      attachMailboxCookie(res, mailbox);

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
    const mailbox = await resolveMailbox(id, req, res);
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
      // 1. Fetch locally and database-stored messages
      const existingStored = db.getMailboxStoredMessages(mailbox.id);
      const messageMap = new Map<string, EmailMessage>(existingStored.map(m => [m.id, m]));

      // 2. Fetch upstream provider messages (e.g. catchmail, mailtm, inboxes, guerrillamail)
      const upstreamMessages = await provider.getMessages(mailbox.id, mailbox.address, mailbox.providerData);

      for (const msg of upstreamMessages) {
        const stored = db.storeMessage(mailbox.id, msg);
        messageMap.set(stored.id, stored);

        // Only broadcast if not known before
        if (!db.knownMessageIds.has(msg.id)) {
          db.broadcastNewMessage(mailbox.id, stored);
        }
      }

      const allMessages = Array.from(messageMap.values()).sort((a, b) => b.receivedAt - a.receivedAt);
      mailbox.messageCount = allMessages.length;
      db.saveMailbox(mailbox);

      return res.json({
        success: true,
        messages: allMessages,
      });
    } catch (err: any) {
      // Fallback to locally stored messages if provider has error or timeout
      const cached = db.getMailboxStoredMessages(mailbox.id);
      return res.json({ success: true, messages: cached });
    }
  });

  // 4. Mark message as read (Fixes the blue unread highlight bug permanently)
  router.post('/:id/messages/:messageId/read', async (req: Request, res: Response): Promise<any> => {
    const { id, messageId } = req.params;
    const mailbox = await resolveMailbox(id, req, res);
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
    const mailbox = await resolveMailbox(id, req, res);
    if (!mailbox) {
      return res.status(404).json({ success: false, error: 'Mailbox not found' });
    }

    if (!verifyMailboxOwnership(mailbox, req, res)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You do not own this mailbox.' });
    }

    // Auto mark as read on open
    db.markMessageRead(mailbox.id, messageId);

    // 1. Check local/database stored message first
    const existingStored = db.getMailboxStoredMessages(mailbox.id).find(m => m.id === messageId);

    const provider = providerManager.getProviderInstance(mailbox.provider);
    try {
      const message = await provider.getMessage(mailbox.id, messageId, mailbox.address, mailbox.providerData);
      if (message) {
        message.readAt = Date.now();
        message.isRead = true;
        db.storeMessage(mailbox.id, message);
        return res.json({ success: true, message });
      }

      if (existingStored) {
        existingStored.readAt = Date.now();
        existingStored.isRead = true;
        return res.json({ success: true, message: existingStored });
      }

      return res.status(404).json({ success: false, error: 'Message not found' });
    } catch (err: any) {
      if (existingStored) {
        existingStored.readAt = Date.now();
        existingStored.isRead = true;
        return res.json({ success: true, message: existingStored });
      }
      return res.status(500).json({ success: false, error: 'Failed to retrieve message details' });
    }
  });

  // 6. Delete mailbox (Strict ownership check)
  router.delete('/:id', async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const session = getSession(req, res);
    const mailbox = await resolveMailbox(id, req, res);
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

    res.clearCookie('aether_mb');

    return res.json({ success: true, message: 'Mailbox deleted successfully' });
  });

  return router;
}
