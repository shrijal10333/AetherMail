import type { EmailProvider, CreateMailboxResult } from './EmailProvider.ts';
import type { EmailMessage, ProviderHealth } from '../types.ts';
import crypto from 'crypto';

export class NativeVirtualProvider implements EmailProvider {
  readonly providerName = 'Aether Core Virtual Relay';
  private domains = ['aethermail.cx', 'cloudtemp.io', 'nexusbox.net', 'ghostrelay.io'];
  private storage = new Map<string, { address: string; messages: EmailMessage[]; createdAt: number }>();

  async getDomains(): Promise<string[]> {
    return [...this.domains];
  }

  async createMailbox(prefix?: string, requestedDomain?: string): Promise<CreateMailboxResult> {
    const domain = requestedDomain || this.domains[0];
    const username = prefix
      ? prefix.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
      : `inbox_${crypto.randomBytes(4).toString('hex')}`;
    const address = `${username}@${domain}`;
    const mailboxId = `mbx_${crypto.randomBytes(10).toString('hex')}`;

    // STRICT: Production inboxes must be completely empty! NO fake emails, NO mock sender data.
    this.storage.set(mailboxId, {
      address,
      messages: [],
      createdAt: Date.now(),
    });

    return {
      id: mailboxId,
      address,
      domain,
      username,
    };
  }

  async getMessages(mailboxId: string): Promise<EmailMessage[]> {
    const data = this.storage.get(mailboxId);
    if (!data) return [];
    return [...data.messages].sort((a, b) => b.receivedAt - a.receivedAt);
  }

  async getMessage(mailboxId: string, messageId: string): Promise<EmailMessage | null> {
    const data = this.storage.get(mailboxId);
    if (!data) return null;
    const msg = data.messages.find(m => m.id === messageId);
    if (msg) {
      msg.isRead = true;
      return msg;
    }
    return null;
  }

  async deleteMailbox(mailboxId: string): Promise<boolean> {
    return this.storage.delete(mailboxId);
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      ok: true,
      latencyMs: 1,
      lastChecked: Date.now(),
      providerName: this.providerName,
    };
  }

  // Accept genuine inbound webhook email
  receiveInboundMessage(mailboxId: string, message: EmailMessage): boolean {
    const data = this.storage.get(mailboxId);
    if (!data) return false;
    data.messages.unshift(message);
    return true;
  }
}
