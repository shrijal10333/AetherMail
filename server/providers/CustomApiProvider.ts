import { EmailProvider, CreateMailboxResult } from './EmailProvider.ts';
import { EmailMessage, ProviderHealth } from '../types.ts';
import crypto from 'crypto';

export class CustomApiProvider implements EmailProvider {
  readonly providerName = 'Custom Email Gateway API';
  private apiUrl: string;
  private apiKey: string;
  private domain: string;

  constructor() {
    this.apiUrl = process.env.EMAIL_API_URL || '';
    this.apiKey = process.env.EMAIL_API_KEY || '';
    this.domain = process.env.EMAIL_DOMAIN || '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiUrl && (this.apiKey || this.domain));
  }

  async getDomains(): Promise<string[]> {
    if (this.domain) return [this.domain];
    if (!this.apiUrl) return [];
    try {
      const res = await fetch(`${this.apiUrl}/domains`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      });
      if (res.ok) {
        const data: any = await res.json();
        return Array.isArray(data) ? data : data.domains || [];
      }
    } catch {
      // Ignored
    }
    return [];
  }

  async createMailbox(prefix?: string, requestedDomain?: string): Promise<CreateMailboxResult> {
    if (!this.isConfigured()) {
      throw new Error('Email service configuration required: set EMAIL_API_URL and EMAIL_API_KEY in environment.');
    }

    const domain = requestedDomain || this.domain || (await this.getDomains())[0];
    const username = prefix
      ? prefix.toLowerCase().replace(/[^a-z0-9]/g, '')
      : `usr_${crypto.randomBytes(4).toString('hex')}`;
    const address = `${username}@${domain}`;

    const res = await fetch(`${this.apiUrl}/mailbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ address, prefix: username, domain }),
    });

    if (!res.ok) {
      throw new Error(`Custom API failed to create mailbox: ${res.status}`);
    }

    const data: any = await res.json();
    return {
      id: data.id || `custom_${crypto.randomBytes(6).toString('hex')}`,
      address: data.address || address,
      domain: data.domain || domain,
      username: data.username || username,
      token: data.token,
      providerData: data,
    };
  }

  async getMessages(mailboxId: string, address: string, providerData?: any): Promise<EmailMessage[]> {
    if (!this.isConfigured()) return [];
    try {
      const res = await fetch(`${this.apiUrl}/mailbox/${mailboxId}/messages`, {
        headers: {
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          ...(providerData?.token ? { 'X-Mailbox-Token': providerData.token } : {}),
        },
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      return Array.isArray(data) ? data : data.messages || [];
    } catch {
      return [];
    }
  }

  async getMessage(mailboxId: string, messageId: string, address: string, providerData?: any): Promise<EmailMessage | null> {
    if (!this.isConfigured()) return null;
    try {
      const res = await fetch(`${this.apiUrl}/mailbox/${mailboxId}/messages/${messageId}`, {
        headers: {
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data.message || data;
    } catch {
      return null;
    }
  }

  async deleteMailbox(mailboxId: string, address: string, providerData?: any): Promise<boolean> {
    if (!this.isConfigured()) return true;
    try {
      await fetch(`${this.apiUrl}/mailbox/${mailboxId}`, {
        method: 'DELETE',
        headers: {
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    if (!this.isConfigured()) {
      return {
        ok: false,
        latencyMs: 0,
        lastChecked: Date.now(),
        providerName: this.providerName,
        error: 'Email service configuration required (EMAIL_API_URL / EMAIL_API_KEY)',
      };
    }

    try {
      const res = await fetch(`${this.apiUrl}/health`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
        signal: AbortSignal.timeout(3000),
      });
      return {
        ok: res.ok,
        latencyMs: Date.now() - start,
        lastChecked: Date.now(),
        providerName: this.providerName,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        lastChecked: Date.now(),
        providerName: this.providerName,
        error: err.message,
      };
    }
  }
}
