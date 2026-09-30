import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import type { EmailMessage, EmailAttachment } from '../types.ts';
import crypto from 'crypto';

export function createWebhookRouter() {
  const router = Router();

  // POST /api/email/webhook (and /api/webhook/email)
  router.post('/webhook', async (req: Request, res: Response): Promise<any> => {
    // 1. Authenticate / Verify Provider Webhook
    const configuredSecret = process.env.WEBHOOK_SECRET;
    if (configuredSecret) {
      const authHeader = req.headers['x-webhook-secret'] ||
        req.headers['x-api-key'] ||
        (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null) ||
        req.query.secret;

      if (!authHeader || authHeader !== configuredSecret) {
        db.logAdminAction('system', 'webhook', 'WEBHOOK_UNAUTHORIZED', req.originalUrl, req.ip, 'failure');
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid or missing webhook authentication credentials',
        });
      }
    }

    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, error: 'Bad Request: Invalid JSON body' });
    }

    // 2. Parse Incoming Message (Support CloudMailin, SendGrid Inbound Parse, Mailgun, Postmark, AWS SES, or standard JSON)
    let recipient = '';
    let sender = '';
    let fromName = '';
    let subject = '';
    let bodyText = '';
    let bodyHtml = '';
    let attachments: EmailAttachment[] = [];
    let headers: Record<string, string> = {};

    // Standard JSON / Generic Webhook format
    if (payload.to || payload.recipient) {
      recipient = payload.to || payload.recipient;
      sender = payload.from || payload.sender || 'unknown@sender.com';
      fromName = payload.fromName || payload.name || '';
      subject = payload.subject || '(No Subject)';
      bodyText = payload.text || payload.bodyText || payload.plain || '';
      bodyHtml = payload.html || payload.bodyHtml || '';
      if (Array.isArray(payload.attachments)) {
        attachments = payload.attachments.map((att: any, idx: number) => ({
          id: att.id || `att_${idx}_${crypto.randomBytes(4).toString('hex')}`,
          filename: att.filename || att.name || `attachment-${idx + 1}`,
          contentType: att.contentType || att.type || 'application/octet-stream',
          size: Number(att.size) || 0,
          downloadUrl: att.downloadUrl || att.url,
          contentBase64: att.contentBase64 || att.content,
        }));
      }
      if (payload.headers && typeof payload.headers === 'object') {
        headers = payload.headers;
      }
    }
    // CloudMailin format: { envelope: { to, from }, headers: { Subject }, plain, html }
    else if (payload.envelope && payload.envelope.to) {
      recipient = Array.isArray(payload.envelope.to) ? payload.envelope.to[0] : payload.envelope.to;
      sender = payload.envelope.from || 'unknown@sender.com';
      subject = payload.headers?.Subject || payload.headers?.subject || '(No Subject)';
      bodyText = payload.plain || '';
      bodyHtml = payload.html || '';
    }
    // Mailgun format: { 'recipient': ..., 'sender': ..., 'subject': ..., 'body-plain': ..., 'body-html': ... }
    else if (payload['body-plain'] || payload['body-html']) {
      recipient = payload.recipient || payload.To || '';
      sender = payload.sender || payload.From || 'unknown@sender.com';
      subject = payload.subject || payload.Subject || '(No Subject)';
      bodyText = payload['body-plain'] || '';
      bodyHtml = payload['body-html'] || '';
    } else {
      return res.status(422).json({
        success: false,
        error: 'Unprocessable Entity: Unable to parse recipient, sender, or content from webhook payload',
      });
    }

    // Extract bare email address from potential RFC 2822 formatting: "John Doe <johndoe@domain.com>"
    const emailMatch = recipient.match(/<([^>]+)>/) || recipient.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const rawTo = emailMatch ? emailMatch[1] : recipient;

    // 3. Normalize Recipient Address
    const normalizedTo = db.normalizeAddress(rawTo);
    if (!normalizedTo || !normalizedTo.includes('@')) {
      return res.status(400).json({ success: false, error: 'Invalid recipient email address format' });
    }

    // 4. Find Correct Mailbox
    const mailbox = db.getMailboxByAddress(normalizedTo);
    if (!mailbox) {
      return res.status(404).json({
        success: false,
        error: `Recipient mailbox not found for address: ${normalizedTo}`,
      });
    }

    // 5. Verify Mailbox Is Active (Not expired or deleted)
    const now = Date.now();
    if (mailbox.status === 'DELETED') {
      return res.status(410).json({ success: false, error: 'Mailbox has been deleted' });
    }

    if (mailbox.expiresAt <= now) {
      mailbox.status = 'EXPIRED';
      db.saveMailbox(mailbox);
      return res.status(410).json({
        success: false,
        error: 'Mailbox has expired and can no longer receive new incoming emails.',
      });
    }

    // 6. Generate Message Record & Associate With Exactly One Mailbox
    const messageId = payload.id || `msg_wbk_${crypto.randomBytes(8).toString('hex')}`;
    const snippet = (bodyText || bodyHtml.replace(/<[^>]*>/g, ' ')).slice(0, 160).trim();

    const emailMessage: EmailMessage = {
      id: messageId,
      mailboxId: mailbox.id,
      from: sender,
      fromName: fromName || sender.split('@')[0],
      to: mailbox.address,
      subject: subject || '(No Subject)',
      snippet: snippet || '(Empty message preview)',
      bodyText: bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]*>/g, ' ') : ''),
      bodyHtml: bodyHtml || `<pre style="font-family:inherit">${bodyText}</pre>`,
      receivedAt: now,
      readAt: null,
      isRead: false,
      hasAttachments: attachments.length > 0,
      attachments,
      security: {
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'pass',
        tls: true,
      },
      headers,
    };

    // 7. Store Message in Database
    db.storeMessage(mailbox.id, emailMessage);

    // 8. Trigger Inbox Update Mechanism (SSE + Polling count update)
    db.broadcastNewMessage(mailbox.id, emailMessage);

    // 9. Return Proper HTTP Response
    return res.status(200).json({
      success: true,
      messageId: emailMessage.id,
      mailboxId: mailbox.id,
      recipient: mailbox.address,
      receivedAt: emailMessage.receivedAt,
    });
  });

  return router;
}
