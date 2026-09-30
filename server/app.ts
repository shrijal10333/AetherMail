import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { db } from './db.ts';
import { ProviderManager } from './providers/ProviderManager.ts';
import { createMailboxRouter } from './routes/mailboxRoutes.ts';
import { createAuthRouter } from './routes/authRoutes.ts';
import { createRealtimeRouter } from './routes/realtimeRoutes.ts';
import { createApiV1Router } from './routes/apiRoutes.ts';
import { createAdminRouter } from './routes/adminRoutes.ts';
import { createWebhookRouter } from './routes/webhookRoutes.ts';
import { createCronRouter } from './routes/cronRoutes.ts';

dotenv.config();

export function createExpressApp() {
  const app = express();
  const providerManager = new ProviderManager();

  // Initialize DB (PostgreSQL if DATABASE_URL provided, else in-memory fallback)
  db.init().catch(err => {
    console.error('[App] Database init error:', err);
  });

  // Trust proxy for secure cookies behind reverse proxies (Vercel, Cloudflare, etc.)
  app.set('trust proxy', 1);

  // Security headers & Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    db.logRequest();
    next();
  });

  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Determine production base URL for canonical sitemaps and robots
  const getBaseUrl = (req: Request): string => {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
    if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    const host = req.get('host') || 'localhost:3000';
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    return `${proto}://${host}`;
  };

  // Dynamic robots.txt
  app.get('/robots.txt', (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.type('text/plain');
    const lines = [
      'User-agent: *',
      'Allow: /',
      'Allow: /temp-mail',
      'Allow: /temporary-email',
      'Allow: /disposable-email',
      'Allow: /temporary-email-address',
      'Allow: /10-minute-mail',
      'Allow: /how-it-works',
      'Allow: /faq',
      'Allow: /blog',
      'Allow: /privacy',
      'Allow: /terms',
      'Disallow: /admin',
      'Disallow: /api/',
      '',
      `Sitemap: ${baseUrl}/sitemap.xml`,
      '',
    ];
    res.send(lines.join('\n'));
  });

  // Dynamic sitemap.xml
  app.get('/sitemap.xml', (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    const today = new Date().toISOString().split('T')[0];

    const pages = [
      { url: '/', priority: '1.0', changefreq: 'daily' },
      { url: '/temp-mail', priority: '0.9', changefreq: 'weekly' },
      { url: '/temporary-email', priority: '0.9', changefreq: 'weekly' },
      { url: '/disposable-email', priority: '0.9', changefreq: 'weekly' },
      { url: '/temporary-email-address', priority: '0.8', changefreq: 'weekly' },
      { url: '/10-minute-mail', priority: '0.8', changefreq: 'weekly' },
      { url: '/how-it-works', priority: '0.7', changefreq: 'monthly' },
      { url: '/faq', priority: '0.7', changefreq: 'monthly' },
      { url: '/api', priority: '0.8', changefreq: 'weekly' },
      { url: '/blog', priority: '0.8', changefreq: 'weekly' },
      { url: '/blog/what-is-a-temporary-email', priority: '0.7', changefreq: 'monthly' },
      { url: '/blog/how-disposable-email-works', priority: '0.7', changefreq: 'monthly' },
      { url: '/blog/temporary-email-vs-permanent-email', priority: '0.7', changefreq: 'monthly' },
      { url: '/blog/when-should-you-use-a-temporary-email', priority: '0.7', changefreq: 'monthly' },
      { url: '/blog/protect-main-inbox-from-spam', priority: '0.7', changefreq: 'monthly' },
      { url: '/blog/disposable-email-privacy-guide', priority: '0.7', changefreq: 'monthly' },
      { url: '/privacy', priority: '0.5', changefreq: 'monthly' },
      { url: '/terms', priority: '0.5', changefreq: 'monthly' },
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    p => `  <url>
    <loc>${baseUrl}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

    res.type('application/xml');
    res.send(xml);
  });

  // Mount API routers
  app.use('/api/mailbox', createMailboxRouter(providerManager));
  app.use('/api/auth', createAuthRouter());
  app.use('/api/realtime', createRealtimeRouter());
  app.use('/api/v1', createApiV1Router(providerManager));
  app.use('/api/admin', createAdminRouter(providerManager));
  app.use('/api/email', createWebhookRouter());
  app.use('/api/webhook', createWebhookRouter());
  app.use('/api/cron', createCronRouter(providerManager));

  // Health check endpoint
  app.get('/api/health', async (_req: Request, res: Response) => {
    const health = await providerManager.runHealthChecks();
    res.json({
      status: 'ok',
      service: 'AetherMail Inbound Core',
      uptime: process.uptime(),
      timestamp: Date.now(),
      providers: health,
    });
  });

  // Strict server-side authorization check for manual /admin route access
  app.get('/admin', (req: Request, res: Response, next: NextFunction): any => {
    const sessionId = req.cookies?.aether_session || (req.headers['x-session-id'] as string);
    const session = sessionId ? db.sessions.get(sessionId) : null;
    const user = session?.userId ? db.users.get(session.userId) : null;

    if (!user || user.role !== 'admin') {
      db.logAdminAction(
        user?.id || 'anonymous',
        user?.email || 'unauthenticated',
        'UNAUTHORIZED_ADMIN_ROUTE_ATTEMPT',
        '/admin',
        req.ip,
        'failure'
      );

      if (req.accepts('html')) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="utf-8">
              <title>403 Forbidden - Administrator Privileges Required</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { background: #090A0F; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
                .card { background: #121520; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; max-width: 440px; width: 100%; padding: 32px; text-align: center; }
                .badge { display: inline-block; font-size: 11px; font-weight: 600; color: #f87171; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); padding: 2px 8px; border-radius: 9999px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em; }
                h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px 0; color: #ffffff; }
                p { font-size: 13px; color: #a1a1aa; line-height: 1.5; margin: 0 0 24px 0; }
                a { display: inline-block; background: #ffffff; color: #09090b; font-size: 13px; font-weight: 500; padding: 8px 16px; border-radius: 6px; text-decoration: none; transition: background 0.15s; }
                a:hover { background: #e4e4e7; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="badge">403 Forbidden</div>
                <h1>Administrator Access Restricted</h1>
                <p>Normal users and guests do not have permission to view or manage the AetherMail administration console.</p>
                <a href="/">Return to Mailbox</a>
              </div>
            </body>
          </html>
        `);
      }
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Administrator privileges required.',
      });
    }

    next();
  });

  // Production-safe error handler (no leaked secrets or stack traces)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[AetherMail Error Handler]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Email service temporarily unavailable. Please try again.',
    });
  });

  return app;
}

export const app = createExpressApp();
