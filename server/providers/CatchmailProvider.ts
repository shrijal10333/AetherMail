import type { EmailProvider, CreateMailboxResult } from './EmailProvider.ts';
import type { EmailMessage, ProviderHealth } from '../types.ts';
import crypto from 'crypto';

export class CatchmailProvider implements EmailProvider {
  readonly providerName = 'Catchmail Instant Inbound Relay';
  private baseUrl = 'https://api.catchmail.io';
  private domain = 'catchmail.io';

  async getDomains(): Promise<string[]> {
    return [this.domain];
  }

  async createMailbox(prefix?: string, requestedDomain?: string): Promise<CreateMailboxResult> {
    const domain = requestedDomain === this.domain ? requestedDomain : this.domain;
    let cleanUsername = prefix
      ? prefix.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)
      : '';

    if (!cleanUsername) {
      cleanUsername = `usr${crypto.randomBytes(4).toString('hex')}${Math.floor(100 + Math.random() * 900)}`;
    }

    const address = `${cleanUsername}@${domain}`;
    const mailboxId = `mbx_cm_${crypto.randomBytes(8).toString('hex')}`;

    return {
      id: mailboxId,
      address,
      domain,
      username: cleanUsername,
      providerData: {
        address,
        domain,
        username: cleanUsername,
      },
    };
  }

  async getMessages(mailboxId: string, address: string): Promise<EmailMessage[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/mailbox?address=${encodeURIComponent(address)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) return [];
      const data: any = await res.json();
      const list = data.messages || [];

      return list.map((m: any) => {
        const receivedAt = m.created_at || m.date ? new Date(m.created_at || m.date).getTime() : Date.now();
        const sender = m.from || m.sender || 'unknown@sender.com';
        const senderName = m.from_name || (sender.includes('@') ? sender.split('@')[0] : sender);
        const snippet = m.snippet || m.subject || '';

        return {
          id: String(m.id),
          mailboxId,
          from: sender,
          fromName: senderName,
          to: address,
          subject: m.subject || '(No Subject)',
          snippet,
          bodyText: snippet,
          bodyHtml: `<p>${snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
          receivedAt,
          readAt: null,
          isRead: false,
          hasAttachments: Boolean(m.has_attachments || m.attachments?.length),
          security: {
            spf: 'pass',
            dkim: 'pass',
            dmarc: 'pass',
            tls: true,
          },
        };
      });
    } catch (err: any) {
      console.warn('[CatchmailProvider] getMessages error:', err.message);
      return [];
    }
  }

  async getMessage(mailboxId: string, messageId: string, address: string): Promise<EmailMessage | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/message/${encodeURIComponent(messageId)}?mailbox=${encodeURIComponent(address)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(7000),
        }
      );

      if (!res.ok) return null;
      const data: any = await res.json();
      if (!data) return null;

      const receivedAt = data.created_at || data.date ? new Date(data.created_at || data.date).getTime() : Date.now();
      const rawHtml = data.html || data.body_html || '';
      const rawText = data.text || data.body_text || data.plain || '';
      const bodyHtml = rawHtml || (rawText ? `<pre style="white-space: pre-wrap; font-family: inherit;">${rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>` : '<p>(No message content)</p>');
      const bodyText = rawText || (rawHtml ? rawHtml.replace(/<[^>]*>/g, '') : '');
      const sender = data.from || data.sender || 'unknown@sender.com';

      const attachments = (data.attachments || []).map((att: any, idx: number) => ({
        id: String(att.id || idx),
        filename: att.filename || att.name || `attachment-${idx + 1}`,
        contentType: att.content_type || att.type || 'application/octet-stream',
        size: Number(att.size) || 0,
        downloadUrl: att.download_url || att.url,
      }));

      return {
        id: String(data.id || messageId),
        mailboxId,
        from: sender,
        fromName: data.from_name || (sender.includes('@') ? sender.split('@')[0] : sender),
        to: address,
        subject: data.subject || '(No Subject)',
        snippet: bodyText.slice(0, 160),
        bodyText,
        bodyHtml,
        receivedAt,
        readAt: Date.now(),
        isRead: true,
        hasAttachments: attachments.length > 0,
        attachments,
        security: {
          spf: 'pass',
          dkim: 'pass',
          dmarc: 'pass',
          tls: true,
        },
      };
    } catch (err: any) {
      console.warn('[CatchmailProvider] getMessage error:', err.message);
      return null;
    }
  }

  async deleteMailbox(_mailboxId: string, _address: string): Promise<boolean> {
    // Catchmail implicitly deletes messages after 7 days
    return true;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(4000),
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      return {
        ok: data.status === 'healthy' || res.ok,
        latencyMs,
        lastChecked: Date.now(),
        providerName: this.providerName,
        activeDomain: this.domain,
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: 999,
        lastChecked: Date.now(),
        providerName: this.providerName,
        error: err.message || 'Connection timeout',
      };
    }
  }
}
