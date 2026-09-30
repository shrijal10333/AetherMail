import { EmailProvider, CreateMailboxResult } from './EmailProvider.ts';
import { EmailMessage, ProviderHealth } from '../types.ts';
import crypto from 'crypto';

export class InboxesProvider implements EmailProvider {
  readonly providerName = 'Inboxes & AirMail Global Relay';
  private baseUrl = 'https://inboxes.com/api/v2';
  private cachedDomains: string[] = [];
  private lastDomainFetch = 0;
  private defaultFallbackDomains = [
    'getairmail.com',
    'getnada.com',
    'inboxbear.com',
    'dropjar.com',
    'fivermail.com',
    'guysmail.com',
    'givmail.com',
    'temptami.com',
    'robot-mail.com',
    'tafmail.com',
    'clowmail.com',
    'vomoto.com',
    'blondmail.com',
    'chapsmail.com',
    'tupmail.com',
    'getmule.com',
    'gimpmail.com',
    'cmail.club',
  ];

  async getDomains(): Promise<string[]> {
    const now = Date.now();
    if (this.cachedDomains.length > 0 && now - this.lastDomainFetch < 300000) {
      return this.cachedDomains;
    }

    try {
      const res = await fetch(`${this.baseUrl}/domain`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data: any = await res.json();
        const list = (data.domains || []).map((d: any) => d.qdn).filter(Boolean);
        if (list.length > 0) {
          this.cachedDomains = list;
          this.lastDomainFetch = now;
          return list;
        }
      }
    } catch (err: any) {
      console.warn('[InboxesProvider] getDomains error:', err.message);
    }

    return this.cachedDomains.length > 0 ? this.cachedDomains : this.defaultFallbackDomains;
  }

  async createMailbox(prefix?: string, requestedDomain?: string): Promise<CreateMailboxResult> {
    const domains = await this.getDomains();
    const domain = requestedDomain && domains.includes(requestedDomain)
      ? requestedDomain
      : domains[0] || 'getairmail.com';

    let cleanUsername = prefix
      ? prefix.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)
      : '';

    if (!cleanUsername) {
      cleanUsername = `usr${crypto.randomBytes(4).toString('hex')}${Math.floor(100 + Math.random() * 900)}`;
    }

    const address = `${cleanUsername}@${domain}`;
    const mailboxId = `mbx_inb_${crypto.randomBytes(8).toString('hex')}`;

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
      const res = await fetch(`${this.baseUrl}/inbox/${encodeURIComponent(address)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) return [];
      const data: any = await res.json();
      const list = data.msgs || [];

      return list.map((m: any) => {
        const receivedAt = m.dt ? new Date(m.dt).getTime() : Date.now();
        return {
          id: String(m.uid || m.id),
          mailboxId,
          from: m.fe || m.f || 'unknown@sender.com',
          fromName: m.f || (m.fe ? m.fe.split('@')[0] : 'Sender'),
          to: address,
          subject: m.s || '(No Subject)',
          snippet: m.s || '',
          bodyText: m.s || '',
          bodyHtml: `<p>${(m.s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
          receivedAt,
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
      });
    } catch (err: any) {
      console.warn('[InboxesProvider] getMessages error:', err.message);
      return [];
    }
  }

  async getMessage(mailboxId: string, messageId: string, address: string): Promise<EmailMessage | null> {
    try {
      const res = await fetch(`${this.baseUrl}/message/${encodeURIComponent(messageId)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) return null;
      const data: any = await res.json();
      if (!data) return null;

      const receivedAt = data.dt ? new Date(data.dt).getTime() : Date.now();
      const htmlBody = data.html || (data.text ? `<pre style="white-space: pre-wrap; font-family: inherit;">${data.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>` : '<p>(No message content)</p>');
      const textBody = data.text || (data.html ? data.html.replace(/<[^>]*>/g, '') : '');

      const attachments = (data.attachments || []).map((att: any) => ({
        id: String(att.id || att.filename),
        filename: att.filename || 'attachment',
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || 0,
      }));

      return {
        id: String(data.uid || messageId),
        mailboxId,
        from: data.fe || data.f || 'unknown@sender.com',
        fromName: data.f || (data.fe ? data.fe.split('@')[0] : 'Sender'),
        to: address,
        subject: data.s || '(No Subject)',
        snippet: textBody.slice(0, 160),
        bodyText: textBody,
        bodyHtml: htmlBody,
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
      console.warn('[InboxesProvider] getMessage error:', err.message);
      return null;
    }
  }

  async deleteMailbox(_mailboxId: string, _address: string): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/domain`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        signal: AbortSignal.timeout(6000),
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return {
        ok: true,
        latencyMs,
        lastChecked: Date.now(),
        providerName: this.providerName,
        activeDomain: this.defaultFallbackDomains[0],
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: 999,
        lastChecked: Date.now(),
        providerName: this.providerName,
        error: err.message,
      };
    }
  }
}
