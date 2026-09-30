import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import type { ProviderManager } from '../providers/ProviderManager.ts';

export function createCronRouter(providerManager?: ProviderManager) {
  const router = Router();

  // GET or POST /api/cron/cleanup
  const handleCleanup = async (req: Request, res: Response): Promise<any> => {
    // Verify Vercel Cron Secret if configured
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token !== cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
        return res.status(401).json({ success: false, error: 'Unauthorized cron invocation' });
      }
    }

    console.log('[Cron] Running scheduled mailbox expiration and provider-aware retention cleanup...');
    const result = db.cleanExpiredMailboxes();

    // Provider-aware remote cleanup for purged mailboxes if providerManager is available
    if (providerManager) {
      const purgedMailboxes = Array.from(db.mailboxes.values()).filter(mb => mb.status === 'DELETED');
      for (const mb of purgedMailboxes) {
        try {
          await providerManager.cleanupMailbox(mb);
        } catch {
          // Failure on one provider never stops cleanup for others
        }
      }
    }

    return res.status(200).json({
      success: true,
      timestamp: Date.now(),
      expiredMarked: result.expiredCount,
      purgedQuarantine: result.purgedCount,
      message: 'Scheduled cleanup executed successfully.',
    });
  };

  router.get('/cleanup', handleCleanup);
  router.post('/cleanup', handleCleanup);

  return router;
}
