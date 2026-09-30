import { Router, Request, Response, NextFunction } from 'express';
import { db, SEVEN_DAYS_MS } from '../db.ts';
import { ProviderManager } from '../providers/ProviderManager.ts';
import { Mailbox } from '../types.ts';

export function createApiV1Router(providerManager: ProviderManager) {
  const router = Router();

  // API Key authentication middleware
  const requireApiKey = (req: Request, res: Response, next: NextFunction): any => {
    const authHeader = req.headers.authorization;
    const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!apiKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Provide a valid Bearer API key in the Authorization header. Example: Authorization: Bearer aeth_...',
      });
    }

    const keyData = db.apiKeys.get(apiKey);
    if (!keyData) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid API key or key revoked.',
      });
    }

    // Rate limit per API Key: 120 reqs/min
    const rate = db.checkRateLimit(`apikey_${apiKey}`, 120, 60);
    if (!rate.allowed) {
      return res.status(429).json({
        error: 'RateLimitExceeded',
        message: 'API rate limit exceeded. Limit is 120 requests per minute.',
      });
    }

    keyData.usageCount++;
    (req as any).apiUserId = keyData.userId;
    next();
  };

  // List public domains
  router.get('/domains', async (_req: Request, res: Response) => {
    const domains = await providerManager.getAllAvailableDomains();
    res.json({
      success: true,
      domains: domains.map(d => d.domain),
      details: domains,
    });
  });

  // Create mailbox (Fixed 7-day expiration & atomic address claim check)
  router.post('/mailbox', requireApiKey, async (req: Request, res: Response): Promise<any> => {
    const { prefix, domain } = req.body || {};
    const userId = (req as any).apiUserId;

    if (prefix && domain) {
      const candidateAddress = `${prefix.toLowerCase().replace(/[^a-z0-9]/g, '')}@${domain.toLowerCase().trim()}`;
      if (db.isAddressClaimed(candidateAddress)) {
        return res.status(409).json({
          error: 'AddressConflict',
          message: 'That address is already claimed.',
        });
      }
    }

    try {
      const { result, providerId } = await providerManager.createMailboxWithFailover(prefix, domain);

      if (db.isAddressClaimed(result.address)) {
        return res.status(409).json({
          error: 'AddressConflict',
          message: 'That address is already claimed.',
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
        ownerSessionId: 'api',
        ownerUserId: userId,
        status: 'CLAIMED',
        messageCount: 0,
        providerData: result.providerData,
      };

      db.saveMailbox(mailbox);
      return res.status(201).json({
        success: true,
        mailbox: {
          id: mailbox.id,
          address: mailbox.address,
          domain: mailbox.domain,
          username: mailbox.username,
          expiresAt: new Date(mailbox.expiresAt).toISOString(),
          createdAt: new Date(mailbox.createdAt).toISOString(),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'MailboxCreationFailed', message: err.message });
    }
  });

  // Get mailbox info
  router.get('/mailbox/:id', requireApiKey, (req: Request, res: Response): any => {
    const mb = db.getMailbox(req.params.id);
    if (!mb) {
      return res.status(404).json({ error: 'NotFound', message: 'Mailbox not found' });
    }
    return res.json({
      success: true,
      mailbox: {
        id: mb.id,
        address: mb.address,
        expiresAt: new Date(mb.expiresAt).toISOString(),
        isExpired: mb.expiresAt < Date.now(),
        status: mb.status,
        messageCount: mb.messageCount,
      },
    });
  });

  // Get messages
  router.get('/mailbox/:id/messages', requireApiKey, async (req: Request, res: Response): Promise<any> => {
    const mb = db.getMailbox(req.params.id);
    if (!mb) {
      return res.status(404).json({ error: 'NotFound', message: 'Mailbox not found' });
    }

    const provider = providerManager.getProviderInstance(mb.provider);
    const messages = await provider.getMessages(mb.id, mb.address, mb.providerData);
    return res.json({ success: true, messages });
  });

  // Get single message
  router.get('/mailbox/:id/messages/:messageId', requireApiKey, async (req: Request, res: Response): Promise<any> => {
    const mb = db.getMailbox(req.params.id);
    if (!mb) {
      return res.status(404).json({ error: 'NotFound', message: 'Mailbox not found' });
    }

    const provider = providerManager.getProviderInstance(mb.provider);
    const message = await provider.getMessage(mb.id, req.params.messageId, mb.address, mb.providerData);
    if (!message) {
      return res.status(404).json({ error: 'NotFound', message: 'Message not found' });
    }
    return res.json({ success: true, message });
  });

  // Delete mailbox
  router.delete('/mailbox/:id', requireApiKey, async (req: Request, res: Response): Promise<any> => {
    const mb = db.getMailbox(req.params.id);
    if (!mb) {
      return res.status(404).json({ error: 'NotFound', message: 'Mailbox not found' });
    }
    mb.status = 'DELETED';
    db.archiveMailbox(req.params.id);
    return res.json({ success: true, message: 'Mailbox deleted' });
  });

  // Public domain list
  router.get('/domains', async (_req: Request, res: Response) => {
    const list = await providerManager.getAllAvailableDomains();
    return res.json({
      success: true,
      domains: list.map(d => d.domain),
      details: list,
    });
  });

  return router;
}
