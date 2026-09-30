import { Mailbox, EmailMessage, User, DomainOption, AdminAuditLog } from '../types';

const SESSION_KEY = 'aether_client_session_id';

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

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  const sessId = getStoredSessionId();
  if (sessId) {
    headers.set('x-session-id', sessId);
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
    return res;
  },

  async getMessages(mailboxId: string): Promise<EmailMessage[]> {
    const res = await request<{ success: boolean; messages: EmailMessage[] }>(`/api/mailbox/${mailboxId}/messages`);
    return res.messages || [];
  },

  async getMessage(mailboxId: string, messageId: string): Promise<EmailMessage> {
    const res = await request<{ success: boolean; message: EmailMessage }>(`/api/mailbox/${mailboxId}/messages/${messageId}`);
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
      return [{ domain: 'uberip.com', providerId: 'mailtm', providerName: 'Mail.tm Live Inbound Relay' }];
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

  // --- Admin (Protected by role === 'admin') ---
  async getAdminMetrics(): Promise<any> {
    return request('/api/admin/metrics');
  },

  async getAdminMailboxes(query?: string): Promise<any> {
    const q = query ? `?q=${encodeURIComponent(query)}` : '';
    return request(`/api/admin/mailboxes${q}`);
  },

  async getAdminMailboxDetail(id: string): Promise<any> {
    return request(`/api/admin/mailboxes/${id}`);
  },

  async expireAdminMailbox(id: string): Promise<any> {
    return request(`/api/admin/mailboxes/${id}/expire`, { method: 'POST' });
  },

  async deleteAdminMailbox(id: string): Promise<any> {
    return request(`/api/admin/mailboxes/${id}`, { method: 'DELETE' });
  },

  async flushAdminMailbox(id: string): Promise<any> {
    return request(`/api/admin/mailboxes/${id}/flush`, { method: 'POST' });
  },

  async getAdminMessages(query?: string): Promise<any> {
    const q = query ? `?q=${encodeURIComponent(query)}` : '';
    return request(`/api/admin/messages${q}`);
  },

  async getAdminAuditLogs(): Promise<{ success: boolean; logs: AdminAuditLog[] }> {
    return request('/api/admin/audit-logs');
  },

  async toggleProvider(providerId: string, enabled: boolean): Promise<any> {
    return request(`/api/admin/providers/${providerId}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },

  async testSingleProvider(providerId: string): Promise<any> {
    return request(`/api/admin/providers/${providerId}/test`, { method: 'POST' });
  },

  async getProviderDomainMappings(): Promise<any> {
    return request('/api/admin/providers/domains');
  },

  async runAdminHealthCheck(): Promise<any> {
    return request('/api/admin/providers/health-check', { method: 'POST' });
  },

  async blockIp(ip: string, block: boolean): Promise<any> {
    return request('/api/admin/abuse/block-ip', {
      method: 'POST',
      body: JSON.stringify({ ip, block }),
    });
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

