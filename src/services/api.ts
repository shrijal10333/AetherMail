import { Mailbox, EmailMessage, User, DomainOption, AdminAuditLog } from '../types';

const SESSION_KEY = 'aether_client_session_id';
const ACTIVE_MB_KEY = 'aether_client_active_mailbox';

export function getStoredSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionId(id: string) {
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    // Ignore
  }
}

export function getStoredActiveMailbox(): Mailbox | null {
  try {
    const raw = localStorage.getItem(ACTIVE_MB_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredActiveMailbox(mb: Mailbox | null) {
  try {
    if (mb) {
      localStorage.setItem(ACTIVE_MB_KEY, JSON.stringify(mb));
    } else {
      localStorage.removeItem(ACTIVE_MB_KEY);
    }
  } catch {
    // Ignore
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  const sessId = getStoredSessionId();
  if (sessId) {
    headers.set('x-session-id', sessId);
  }

  const activeMb = getStoredActiveMailbox();
  if (activeMb) {
    headers.set('x-mailbox-id', activeMb.id);
    headers.set('x-mailbox-address', activeMb.address);
    headers.set('x-mailbox-provider', activeMb.provider);
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json();
  if (!res.ok && !data.success) {
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }

  return data;
}

export const api = {
  // --- Mailbox ---
  async getActiveMailbox(): Promise<{ mailbox: Mailbox; sessionId: string }> {
    const res = await request<{ success: boolean; mailbox: Mailbox; sessionId: string }>('/api/mailbox/active');
    if (res.sessionId) {
      setStoredSessionId(res.sessionId);
    }
    if (res.mailbox) {
      setStoredActiveMailbox(res.mailbox);
    }
    return res;
  },

  async generateNewMailbox(prefix?: string, domain?: string): Promise<{ mailbox: Mailbox; sessionId: string }> {
    const res = await request<{ success: boolean; mailbox: Mailbox; sessionId: string }>('/api/mailbox/new', {
      method: 'POST',
      body: JSON.stringify({ prefix, domain }),
    });
    if (res.sessionId) {
      setStoredSessionId(res.sessionId);
    }
    if (res.mailbox) {
      setStoredActiveMailbox(res.mailbox);
    }
    return res;
  },

  async getMessages(mailboxId: string, address?: string): Promise<EmailMessage[]> {
    const activeMb = getStoredActiveMailbox();
    const addr = address || (activeMb?.id === mailboxId ? activeMb.address : undefined);
    const query = addr ? `?address=${encodeURIComponent(addr)}` : '';
    const res = await request<{ success: boolean; messages: EmailMessage[] }>(`/api/mailbox/${mailboxId}/messages${query}`);
    return res.messages || [];
  },

  async getMessage(mailboxId: string, messageId: string, address?: string): Promise<EmailMessage> {
    const activeMb = getStoredActiveMailbox();
    const addr = address || (activeMb?.id === mailboxId ? activeMb.address : undefined);
    const query = addr ? `?address=${encodeURIComponent(addr)}` : '';
    const res = await request<{ success: boolean; message: EmailMessage }>(`/api/mailbox/${mailboxId}/messages/${messageId}${query}`);
    return res.message;
  },

  async markMessageRead(mailboxId: string, messageId: string): Promise<void> {
    await request(`/api/mailbox/${mailboxId}/messages/${messageId}/read`, {
      method: 'POST',
    });
  },

  async deleteMailbox(mailboxId: string): Promise<boolean> {
    const res = await request<{ success: boolean }>(`/api/mailbox/${mailboxId}`, {
      method: 'DELETE',
    });
    setStoredActiveMailbox(null);
    return res.success;
  },

  async sendTestEmail(mailboxId: string): Promise<EmailMessage> {
    const res = await request<{ success: boolean; message: EmailMessage }>(`/api/mailbox/${mailboxId}/test-email`, {
      method: 'POST',
    });
    return res.message;
  },

  async getDomains(): Promise<DomainOption[]> {
    try {
      const res = await request<{ success: boolean; details: DomainOption[] }>('/api/v1/domains');
      return res.details || [];
    } catch {
      return [
        { domain: 'catchmail.io', providerId: 'catchmail', providerName: 'Catchmail Instant Inbound Relay' },
        { domain: 'uberip.com', providerId: 'mailtm', providerName: 'Mail.tm Live Inbound Relay' },
      ];
    }
  },

  // --- Auth & Account ---
  async getMe(): Promise<{ user: User | null; sessionId: string; activeMailboxId?: string }> {
    return request<{ success: boolean; user: User | null; sessionId: string; activeMailboxId?: string }>('/api/auth/me');
  },

  async signup(data: { email: string; password: string; name?: string }): Promise<User> {
    const res = await request<{ success: boolean; user: User }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.user;
  },

  async login(data: { email: string; password: string }): Promise<User> {
    const res = await request<{ success: boolean; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.user;
  },

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<void> {
    await request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async logout(): Promise<void> {
    await request('/api/auth/logout', { method: 'POST' });
    setStoredActiveMailbox(null);
  },

  async getMyMailboxes(): Promise<Mailbox[]> {
    const res = await request<{ success: boolean; mailboxes: Mailbox[] }>('/api/auth/my-mailboxes');
    return res.mailboxes || [];
  },

  async regenerateApiKey(): Promise<string> {
    const res = await request<{ success: boolean; apiKey: string }>('/api/auth/apikey/regenerate', {
      method: 'POST',
    });
    return res.apiKey;
  },

  // --- Admin API ---
  async getAdminMetrics(): Promise<any> {
    const res = await request<{ success: boolean; metrics: any }>('/api/admin/metrics');
    return res.metrics;
  },

  async getAdminMailboxes(query?: string): Promise<{ mailboxes: Mailbox[]; total: number }> {
    const q = query ? `?q=${encodeURIComponent(query)}` : '';
    return request<{ success: boolean; mailboxes: Mailbox[]; total: number }>(`/api/admin/mailboxes${q}`);
  },

  async getAdminMailboxDetail(id: string): Promise<{ mailbox: Mailbox; messages: EmailMessage[] }> {
    return request<{ success: boolean; mailbox: Mailbox; messages: EmailMessage[] }>(`/api/admin/mailboxes/${id}`);
  },

  async expireAdminMailbox(id: string): Promise<any> {
    return request(`/api/admin/mailboxes/${id}/expire`, { method: 'POST' });
  },

  async deleteAdminMailbox(id: string): Promise<void> {
    await request(`/api/admin/mailboxes/${id}`, { method: 'DELETE' });
  },

  async flushAdminMailbox(id: string): Promise<void> {
    await request(`/api/admin/mailboxes/${id}/flush`, { method: 'POST' });
  },

  async getAdminUsers(): Promise<User[]> {
    const res = await request<{ success: boolean; users: User[] }>('/api/admin/users');
    return res.users;
  },

  async getAdminMessages(query?: string): Promise<any> {
    const q = query ? `?q=${encodeURIComponent(query)}` : '';
    return request(`/api/admin/messages${q}`);
  },

  async getAdminAuditLogs(): Promise<{ success: boolean; logs: AdminAuditLog[] }> {
    return request('/api/admin/audit-logs');
  },

  async runAdminHealthCheck(): Promise<{ providers: any }> {
    return request<{ success: boolean; providers: any }>('/api/admin/health-check', { method: 'POST' });
  },

  async testSingleProvider(id: string): Promise<{ health: any; providers: any }> {
    return request<{ success: boolean; health: any; providers: any }>(`/api/admin/providers/${id}/test`, { method: 'POST' });
  },

  async toggleProvider(id: string, enabled: boolean): Promise<{ providers: any }> {
    return request<{ success: boolean; providers: any }>(`/api/admin/providers/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },

  async getProviderDomainMappings(): Promise<any> {
    return request('/api/admin/providers/domains');
  },

  async blockIp(ip: string, block: boolean): Promise<{ blockedIps: string[] }> {
    const res = await request<{ success: boolean; blockedIps: string[] }>('/api/admin/abuse/block-ip', {
      method: 'POST',
      body: JSON.stringify({ ip, block }),
    });
    return res;
  },

  async blockSenderPattern(pattern: string, block: boolean): Promise<any> {
    return request('/api/admin/abuse/block-sender', {
      method: 'POST',
      body: JSON.stringify({ pattern, block }),
    });
  },

  async getSuspiciousActivity(): Promise<any> {
    return request('/api/admin/abuse/suspicious');
  },

  async getAdminSettings(): Promise<any> {
    return request('/api/admin/settings');
  },

  async updateAdminSettings(settings: any): Promise<any> {
    return request('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  },
};
