export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  downloadUrl?: string;
  contentBase64?: string;
}

export interface EmailMessage {
  id: string;
  mailboxId: string;
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: number;
  readAt: number | null;
  isRead: boolean;
  hasAttachments: boolean;
  attachments?: EmailAttachment[];
  security?: {
    spf: 'pass' | 'neutral' | 'fail';
    dkim: 'pass' | 'neutral' | 'fail';
    dmarc: 'pass' | 'neutral' | 'fail';
    tls: boolean;
  };
  headers?: Record<string, string>;
}

export type MailboxStatus = 'CLAIMED' | 'UNCLAIMED' | 'EXPIRED' | 'DELETED';

export interface Mailbox {
  id: string;
  address: string;
  normalizedAddress: string;
  provider: string;
  domain: string;
  username: string;
  createdAt: number;
  claimedAt: number;
  expiresAt: number; // Exactly createdAt + 7 days
  ownerSessionId: string | null;
  ownerUserId: string | null;
  status: MailboxStatus;
  messageCount: number;
  isArchived?: boolean;
  customPrefix?: boolean;
  providerData?: Record<string, any>;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'user' | 'admin';
  createdAt: number;
  apiKey?: string;
  activeMailboxId?: string;
}

export interface AdminAuditLog {
  id: string;
  adminUserId: string;
  adminEmail: string;
  action: string;
  target?: string;
  timestamp: number;
  ip?: string;
  result: 'success' | 'failure';
  details?: Record<string, any>;
}

export interface ProviderHealth {
  ok: boolean;
  latencyMs: number;
  lastChecked: number;
  providerName: string;
  activeDomain?: string;
  error?: string;
}

export interface AdminMetrics {
  totalVisitors: number;
  totalUsers: number;
  activeMailboxesCount: number;
  claimedAddressesCount: number;
  unclaimedAddressesCount: number;
  totalEmailsReceived: number;
  messagesToday: number;
  expiringSoonCount: number;
  requestsPerMinute: number;
  providerHealthSummary: Record<string, ProviderHealth>;
  errorRate: number;
}

export interface SystemSettings {
  defaultTtlHours: number;
  maxMessageLimit: number;
  rateLimitMaxRequests: number;
  rateLimitWindowSeconds: number;
  domainWhitelist: string[];
  domainBlacklist: string[];
  blockedSenderPatterns: string[];
}

export interface SuspiciousActivitySummary {
  blockedIpsCount: number;
  blockedPatternsCount: number;
  recentUnauthorizedAttempts: AdminAuditLog[];
  rateLimitedEntities: { key: string; count: number; resetInSec: number }[];
}

