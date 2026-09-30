import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import type { User } from '../types.ts';
import crypto from 'crypto';

export function createAuthRouter() {
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

  // 1. Get current session and user info
  router.get('/me', (req: Request, res: Response): any => {
    const session = getSession(req, res);
    const user = session.userId ? db.users.get(session.userId) : null;

    return res.json({
      success: true,
      sessionId: session.sessionId,
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            apiKey: user.apiKey,
            createdAt: user.createdAt,
          }
        : null,
      activeMailboxId: session.activeMailboxId,
    });
  });

  // 2. Sign up (Normal signups always get role: 'user')
  router.post('/signup', (req: Request, res: Response): any => {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const normEmail = email.toLowerCase().trim();
    if (db.usersByEmail.has(normEmail)) {
      return res.status(409).json({ success: false, error: 'Account already exists with this email' });
    }

    const session = getSession(req, res);
    const userId = `usr_${crypto.randomBytes(10).toString('hex')}`;
    const newUser: User = {
      id: userId,
      email: normEmail,
      name: name || normEmail.split('@')[0],
      passwordHash: db.hashPassword(password),
      role: 'user',
      createdAt: Date.now(),
      apiKey: `aeth_usr_${crypto.randomBytes(12).toString('hex')}`,
      activeMailboxId: session.activeMailboxId || undefined,
    };

    db.users.set(userId, newUser);
    db.usersByEmail.set(normEmail, userId);
    session.userId = userId;

    if (session.activeMailboxId) {
      const mb = db.getMailbox(session.activeMailboxId);
      if (mb) {
        mb.ownerUserId = userId;
      }
    }

    return res.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        apiKey: newUser.apiKey,
      },
    });
  });

  // 3. Login (Preserves and binds guest mailbox!)
  router.post('/login', (req: Request, res: Response): any => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const normEmail = email.toLowerCase().trim();
    const userId = db.usersByEmail.get(normEmail);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const user = db.users.get(userId);
    if (!user || user.passwordHash !== db.hashPassword(password)) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const session = getSession(req, res);
    session.userId = user.id;

    // Mailbox recovery:
    // If the session had a newly created guest mailbox, bind it to this user
    if (session.activeMailboxId) {
      const mb = db.getMailbox(session.activeMailboxId);
      if (mb && mb.status !== 'DELETED') {
        mb.ownerUserId = user.id;
        user.activeMailboxId = mb.id;
      }
    } else if (user.activeMailboxId) {
      // Restore user's previous active mailbox!
      session.activeMailboxId = user.activeMailboxId;
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        apiKey: user.apiKey,
      },
      activeMailboxId: session.activeMailboxId,
    });
  });

  // 4. Change password (for both normal users and initial admin)
  router.post('/change-password', (req: Request, res: Response): any => {
    const session = getSession(req, res);
    if (!session || !session.userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long' });
    }

    const user = db.users.get(session.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.passwordHash !== db.hashPassword(currentPassword)) {
      return res.status(401).json({ success: false, error: 'Incorrect current password' });
    }

    user.passwordHash = db.hashPassword(newPassword);

    if (user.role === 'admin') {
      db.logAdminAction(user.id, user.email, 'CHANGE_PASSWORD', undefined, req.ip, 'success');
    }

    return res.json({ success: true, message: 'Password changed successfully' });
  });

  // 5. Logout (CRITICAL: Do NOT delete mailbox on logout!)
  router.post('/logout', (req: Request, res: Response): any => {
    const session = getSession(req, res);
    session.userId = null;
    return res.json({ success: true, message: 'Logged out successfully' });
  });

  // 6. Get user's mailboxes ("My Mailboxes")
  router.get('/my-mailboxes', (req: Request, res: Response): any => {
    const session = getSession(req, res);
    if (!session.userId) {
      if (session.activeMailboxId) {
        const mb = db.getMailbox(session.activeMailboxId);
        return res.json({ success: true, mailboxes: mb && mb.status !== 'DELETED' ? [mb] : [] });
      }
      return res.json({ success: true, mailboxes: [] });
    }

    const list = db.getUserMailboxes(session.userId);
    return res.json({ success: true, mailboxes: list });
  });

  // 7. Regenerate API key
  router.post('/apikey/regenerate', (req: Request, res: Response): any => {
    const session = getSession(req, res);
    if (!session.userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const user = db.users.get(session.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const prefix = user.role === 'admin' ? 'aeth_adm_' : 'aeth_usr_';
    const newKey = `${prefix}${crypto.randomBytes(12).toString('hex')}`;
    user.apiKey = newKey;
    db.apiKeys.set(newKey, {
      userId: user.id,
      label: 'Main Production API Key',
      createdAt: Date.now(),
      usageCount: 0,
    });

    return res.json({ success: true, apiKey: newKey });
  });

  return router;
}
