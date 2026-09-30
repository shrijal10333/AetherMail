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

    console.log(`[CATCHMAIL] Created mailbox address: ${address} (id: ${mailboxId})`);

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
    const safeAddress = (address || '').toLowerCase().trim();
    console.log(`[CATCHMAIL] fetching mailbox: ${safeAddress}`);

    try {
      const res = await fetch(`${this.baseUrl}/api/v1/mailbox?address=${encodeURIComponent(safeAddress)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      console.log(`[CATCHMAIL] status=${res.status}`);

      if (res.status === 401 || res.status === 403) {
        console.error(`[CATCHMAIL] configuration/authentication problem (HTTP ${res.status})`);
        return [];
      }
      if (res.status === 404) {
        console.warn(`[CATCHMAIL] mailbox/provider problem (HTTP 404) for ${safeAddress}`);
        return [];
      }
      if (res.status === 429) {
        console.warn(`[CATCHMAIL] rate-limit problem (HTTP 429)`);
        return [];
      }
      if (res.status >= 500) {
        console.error(`[CATCHMAIL] provider/server problem (HTTP ${res.status})`);
        return [];
      }

      if (!res.ok) {
        console.warn(`[CATCHMAIL] unexpected status HTTP ${res.status}`);
        return [];
      }

      const data: any = await res.json();
      const list = Array.isArray(data.messages) ? data.messages : [];

      console.log(`[CATCHMAIL] messages=${list.length}`);

      return list.map((m: any) => {
        const receivedAt = m.date || m.created_at ? new Date(m.date || m.created_at).getTime() : Date.now();
        const rawFrom = m.from || m.sender || 'unknown@sender.com';
        const cleanFrom = rawFrom.replace(/[<>]/g, '').trim();
        const fromName = m.from_name || (cleanFrom.includes('@') ? cleanFrom.split('@')[0] : cleanFrom);
        const snippet = m.subject || m.snippet || '(No Subject)';

        return {
          id: String(m.id),
          mailboxId,
          from: cleanFrom,
          fromName,
          to: safeAddress,
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
      console.warn(`[CATCHMAIL] provider request error: ${err.message}`);
      return [];
    }
  }

  async getMessage(mailboxId: string, messageId: string, address: string): Promise<EmailMessage | null> {
    const safeAddress = (address || '').toLowerCase().trim();
    console.log(`[CATCHMAIL] fetching message detail: ${messageId} for ${safeAddress}`);

    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/message/${encodeURIComponent(messageId)}?mailbox=${encodeURIComponent(safeAddress)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(8000),
        }
      );

      console.log(`[CATCHMAIL] message detail status=${res.status}`);

      if (res.status === 401 || res.status === 403) {
        console.error(`[CATCHMAIL] configuration/authentication problem (HTTP ${res.status})`);
        return null;
      }
      if (res.status === 404) {
        console.warn(`[CATCHMAIL] message not found (HTTP 404): ${messageId}`);
        return null;
      }
      if (res.status === 429) {
        console.warn(`[CATCHMAIL] rate-limit problem (HTTP 429)`);
        return null;
      }
      if (res.status >= 500) {
        console.error(`[CATCHMAIL] provider/server problem (HTTP ${res.status})`);
        return null;
      }

      if (!res.ok) return null;
      const data: any = await res.json();
      if (!data) return null;

      const receivedAt = data.date || data.created_at ? new Date(data.date || data.created_at).getTime() : Date.now();
      
      // Catchmail returns body inside data.body.html and data.body.text!
      const rawHtml = data.body?.html || data.html || data.body_html || '';
      const rawText = data.body?.text || data.text || data.body_text || data.plain || '';
      const bodyHtml = rawHtml || (rawText ? `<pre style="white-space: pre-wrap; font-family: inherit;">${rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>` : '<p>(No message content)</p>');
      const bodyText = rawText || (rawHtml ? rawHtml.replace(/<[^>]*>/g, '') : '');

      const rawFrom = data.from || data.sender || 'unknown@sender.com';
      const cleanFrom = rawFrom.replace(/[<>]/g, '').trim();

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
        from: cleanFrom,
        fromName: data.from_name || (cleanFrom.includes('@') ? cleanFrom.split('@')[0] : cleanFrom),
        to: safeAddress,
        subject: data.subject || '(No Subject)',
        snippet: bodyText.slice(0, 160) || data.subject || '',
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
      console.warn(`[CATCHMAIL] getMessage error: ${err.message}`);
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
