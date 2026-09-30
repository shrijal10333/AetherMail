import type { EmailMessage, ProviderHealth } from '../types.ts';

export interface CreateMailboxResult {
  id: string;
  address: string;
  domain: string;
  username: string;
  token?: string;
  providerData?: Record<string, any>;
}

export interface EmailProvider {
  readonly providerName: string;
  getDomains(): Promise<string[]>;
  createMailbox(prefix?: string, requestedDomain?: string): Promise<CreateMailboxResult>;
  getMessages(mailboxId: string, address: string, providerData?: any): Promise<EmailMessage[]>;
  getMessage(mailboxId: string, messageId: string, address: string, providerData?: any): Promise<EmailMessage | null>;
  deleteMailbox(mailboxId: string, address: string, providerData?: any): Promise<boolean>;
  healthCheck(): Promise<ProviderHealth>;
}
