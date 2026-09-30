import { Router, Request, Response } from 'express';
import { db } from '../db.ts';

export function createRealtimeRouter() {
  const router = Router();

  router.get('/:mailboxId', (req: Request, res: Response): any => {
    const { mailboxId } = req.params;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering
    res.flushHeaders?.();

    // Initial greeting event
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', mailboxId, timestamp: Date.now() })}\n\n`);

    // Register with db
    db.addSseClient(mailboxId, res);

    // Keep-alive ping interval
    const pingInterval = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {
        clearInterval(pingInterval);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(pingInterval);
      db.removeSseClient(mailboxId, res);
      res.end();
    });
  });

  return router;
}
