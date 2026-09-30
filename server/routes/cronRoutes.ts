import { Router, Request, Response } from 'express';
import { db } from '../db.ts';

export function createCronRouter() {
  const router = Router();

  // GET or POST /api/cron/cleanup
  const handleCleanup = (req: Request, res: Response): any => {
    // Verify Vercel Cron Secret if configured
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token !== cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
        return res.status(401).json({ success: false, error: 'Unauthorized cron invocation' });
      }
    }

    console.log('[Cron] Running scheduled mailbox expiration and retention cleanup...');
    const result = db.cleanExpiredMailboxes();

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
