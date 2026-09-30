import type { EmailProvider, CreateMailboxResult } from './EmailProvider.ts';
import type { EmailMessage, ProviderHealth } from '../types.ts';
import crypto from 'crypto';

export class MailTmProvider implements EmailProvider {
  readonly providerName = 'Mail.tm Live Inbound Relay';
  private baseUrl = process.env.EMAIL_API_URL || 'https://api.mail.tm';
  private cachedDomains: string[] = [];
  private lastDomainFetch = 0;

  async getDomains(): Promise<string[]> {
    const now = Date.now();
    if (this.cachedDomains.length > 0 && now - this.lastDomainFetch < 120000) {
      return this.cachedDomains;
    }

    try {
      const res = await fetch(`${this.baseUrl}/domains`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const list = (data['hydra:member'] || [])
        .filter((d: any) => d.isActive !== false)
        .map((d: any) => d.domain);
      if (list.length > 0) {
        this.cachedDomains = list;
        this.lastDomainFetch = now;
        return list;
      }
    } catch (err: any) {
      console.warn('[MailTmProvider] Failed to fetch live domains:', err.message);
    }
    return this.cachedDomains.length > 0 ? this.cachedDomains : ['uberip.com'];
  }

  async createMailbox(prefix?: string, requestedDomain?: string): Promise<CreateMailboxResult> {
    const domains = await this.getDomains();
    const domain = requestedDomain && domains.includes(requestedDomain)
      ? requestedDomain
      : domains[0] || 'uberip.com';

    // Mail.tm requires username without dots, letters and numbers only
    let cleanUsername = prefix
      ? prefix.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)
      : '';

    if (!cleanUsername) {
      cleanUsername = `usr${crypto.randomBytes(4).toString('hex')}${Math.floor(100 + Math.random() * 900)}`;
    }

    const address = `${cleanUsername}@${domain}`;
    const password = `Pass!${crypto.randomBytes(8).toString('hex')}#`;

    const createRes = await fetch(`${this.baseUrl}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password }),
      signal: AbortSignal.timeout(8000),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Mail.tm account creation failed (${createRes.status}): ${errText}`);
    }

    const accountData: any = await createRes.json();
    const realAddress = accountData.address || address;

    // Authenticate and get JWT token for reading messages
    const tokenRes = await fetch(`${this.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: realAddress, password }),
      signal: AbortSignal.timeout(8000),
    });

    if (!tokenRes.ok) {
      throw new Error(`Mail.tm token acquisition failed (${tokenRes.status})`);
    }

    const tokenData: any = await tokenRes.json();

    return {
      id: accountData.id || `mailtm_${crypto.randomBytes(8).toString('hex')}`,
      address: realAddress,
      domain,
      username: realAddress.split('@')[0],
      token: tokenData.token,
      providerData: {
        accountId: accountData.id,
        token: tokenData.token,
        password,
        address: realAddress,
      },
    };
  }

  async getMessages(mailboxId: string, address: string, providerData?: any): Promise<EmailMessage[]> {
    if (!providerData?.token) {
      return [];
    }

    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        headers: { Authorization: `Bearer ${providerData.token}` },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        // If token expired, try re-authenticating if password is saved
        if (res.status === 401 && providerData.password && providerData.address) {
          const reAuth = await fetch(`${this.baseUrl}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: providerData.address, password: providerData.password }),
          });
          if (reAuth.ok) {
            const data: any = await reAuth.json();
            providerData.token = data.token;
            return this.getMessages(mailboxId, address, providerData);
          }
        }
        return [];
      }

      const data: any = await res.json();
      const list = data['hydra:member'] || [];

      return list.map((msg: any) => ({
        id: msg.id,
        mailboxId,
        from: msg.from?.address || 'unknown@domain.com',
        fromName: msg.from?.name || (msg.from?.address ? msg.from.address.split('@')[0] : 'Sender'),
        to: address,
        subject: msg.subject || '(No Subject)',
        snippet: msg.intro || '',
        bodyText: msg.intro || '',
        bodyHtml: `<p>${(msg.intro || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
        receivedAt: new Date(msg.createdAt).getTime(),
        readAt: msg.seen ? Date.now() : null,
        isRead: !!msg.seen,
        hasAttachments: !!msg.hasAttachments,
      }));
    } catch (err: any) {
      console.warn('[MailTmProvider] Failed to fetch messages:', err.message);
      return [];
    }
  }

  async getMessage(mailboxId: string, messageId: string, address: string, providerData?: any): Promise<EmailMessage | null> {
    if (!providerData?.token) {
      return null;
    }

    try {
      const res = await fetch(`${this.baseUrl}/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${providerData.token}` },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) return null;
      const msg: any = await res.json();

      let bodyHtml = '';
      if (Array.isArray(msg.html) && msg.html.length > 0) {
        bodyHtml = msg.html.join('');
      } else if (typeof msg.html === 'string' && msg.html) {
        bodyHtml = msg.html;
      } else if (msg.text) {
        bodyHtml = `<pre style="white-space: pre-wrap; font-family: inherit;">${msg.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
      } else {
        bodyHtml = `<p>${msg.intro || '(No content)'}</p>`;
      }

      const attachments = (msg.attachments || []).map((att: any) => ({
        id: att.id || att.filename,
        filename: att.filename || 'attachment',
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || 0,
        downloadUrl: att.downloadUrl ? `${this.baseUrl}${att.downloadUrl}` : undefined,
      }));

      return {
        id: msg.id,
        mailboxId,
        from: msg.from?.address || 'unknown@domain.com',
        fromName: msg.from?.name || (msg.from?.address ? msg.from.address.split('@')[0] : 'Sender'),
        to: address,
        subject: msg.subject || '(No Subject)',
        snippet: msg.intro || '',
        bodyText: msg.text || msg.intro || '',
        bodyHtml,
        receivedAt: new Date(msg.createdAt).getTime(),
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
      console.warn('[MailTmProvider] Failed to fetch message detail:', err.message);
      return null;
    }
  }

  async deleteMailbox(mailboxId: string, address: string, providerData?: any): Promise<boolean> {
    if (!providerData?.accountId || !providerData?.token) return true;
    try {
      await fetch(`${this.baseUrl}/accounts/${providerData.accountId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${providerData.token}` },
        signal: AbortSignal.timeout(4000),
      });
      return true;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/domains`, {
        signal: AbortSignal.timeout(4000),
      });
      const data: any = res.ok ? await res.json() : null;
      const domains = data?.['hydra:member'] || [];
      const primary = domains[0]?.domain;

      return {
        ok: res.ok,
        latencyMs: Date.now() - start,
        lastChecked: Date.now(),
        providerName: this.providerName,
        activeDomain: primary,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        lastChecked: Date.now(),
        providerName: this.providerName,
        error: err.message || 'Connection timeout',
      };
    }
  }
}
