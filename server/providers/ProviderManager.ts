import type { EmailProvider, CreateMailboxResult } from './EmailProvider.ts';
import { MailTmProvider } from './MailTmProvider.ts';
import { InboxesProvider } from './InboxesProvider.ts';
import { GuerrillaMailProvider } from './GuerrillaMailProvider.ts';
import { CustomApiProvider } from './CustomApiProvider.ts';
import { NativeVirtualProvider } from './NativeVirtualProvider.ts';
import type { EmailMessage, ProviderHealth } from '../types.ts';

export interface RegisteredProvider {
  id: string;
  name: string;
  instance: EmailProvider;
  enabled: boolean;
  priority: number;
  health: ProviderHealth;
}

export class ProviderManager {
  private providers: RegisteredProvider[] = [];
  public mailTmProvider: MailTmProvider;
  public inboxesProvider: InboxesProvider;
  public guerrillaProvider: GuerrillaMailProvider;
  public customApiProvider: CustomApiProvider;
  public nativeProvider: NativeVirtualProvider;

  constructor() {
    this.mailTmProvider = new MailTmProvider();
    this.inboxesProvider = new InboxesProvider();
    this.guerrillaProvider = new GuerrillaMailProvider();
    this.customApiProvider = new CustomApiProvider();
    this.nativeProvider = new NativeVirtualProvider();

    // Enable all free inbound providers out-of-the-box
    this.providers = [
      {
        id: 'mailtm',
        name: 'Mail.tm Live Inbound Relay (Active MX)',
        instance: this.mailTmProvider,
        enabled: true,
        priority: 1,
        health: { ok: true, latencyMs: 120, lastChecked: Date.now(), providerName: 'Mail.tm Live Inbound Relay', activeDomain: 'uberip.com' },
      },
      {
        id: 'inboxes',
        name: 'Inboxes & AirMail Global Relay (18+ Domains)',
        instance: this.inboxesProvider,
        enabled: true,
        priority: 2,
        health: { ok: true, latencyMs: 150, lastChecked: Date.now(), providerName: 'Inboxes & AirMail Global Relay', activeDomain: 'getairmail.com' },
      },
      {
        id: 'guerrillamail',
        name: 'Guerrilla Mail Free MX (10 Domains)',
        instance: this.guerrillaProvider,
        enabled: true,
        priority: 3,
        health: { ok: true, latencyMs: 180, lastChecked: Date.now(), providerName: 'Guerrilla Mail Free MX', activeDomain: 'sharklasers.com' },
      },
      {
        id: 'native',
        name: 'Aether Core Virtual Relay (Premium Domains)',
        instance: this.nativeProvider,
        enabled: true,
        priority: 4,
        health: { ok: true, latencyMs: 1, lastChecked: Date.now(), providerName: 'Aether Core Virtual Relay', activeDomain: 'aethermail.cx' },
      },
      {
        id: 'custom_api',
        name: 'Custom Email Gateway API',
        instance: this.customApiProvider,
        enabled: this.customApiProvider.isConfigured(),
        priority: 5,
        health: { ok: this.customApiProvider.isConfigured(), latencyMs: 0, lastChecked: Date.now(), providerName: 'Custom Email Gateway API' },
      },
    ];

    // Background health check cycle
    setTimeout(() => this.runHealthChecks(), 2000);
    setInterval(() => this.runHealthChecks(), 180000);
  }

  async runHealthChecks(): Promise<Record<string, ProviderHealth>> {
    const results: Record<string, ProviderHealth> = {};
    for (const p of this.providers) {
      if (!p.enabled) continue;
      try {
        const h = await p.instance.healthCheck();
        p.health = h;
        results[p.id] = h;
      } catch (err: any) {
        p.health = {
          ok: false,
          latencyMs: 999,
          lastChecked: Date.now(),
          providerName: p.name,
          error: err.message,
        };
        results[p.id] = p.health;
      }
    }
    return results;
  }

  async testSingleProvider(id: string): Promise<ProviderHealth> {
    const p = this.providers.find(x => x.id === id);
    if (!p) throw new Error('Provider not found');
    const h = await p.instance.healthCheck();
    p.health = h;
    return h;
  }

  async getDomainMappings(): Promise<{ providerId: string; providerName: string; domains: string[]; enabled: boolean }[]> {
    const result: { providerId: string; providerName: string; domains: string[]; enabled: boolean }[] = [];
    for (const p of this.providers) {
      let domains: string[] = [];
      try {
        domains = await p.instance.getDomains();
      } catch {
        domains = [];
      }
      result.push({
        providerId: p.id,
        providerName: p.name,
        domains,
        enabled: p.enabled,
      });
    }
    return result;
  }

  getProvidersSummary() {
    return this.providers.map(p => ({
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      priority: p.priority,
      health: p.health,
    }));
  }

  setProviderStatus(id: string, enabled: boolean) {
    const p = this.providers.find(x => x.id === id);
    if (p) {
      p.enabled = enabled;
      return true;
    }
    return false;
  }

  async getAllAvailableDomains(): Promise<{ domain: string; providerId: string; providerName: string }[]> {
    const list: { domain: string; providerId: string; providerName: string }[] = [];
    const enabledProviders = this.providers
      .filter(p => p.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const p of enabledProviders) {
      try {
        const domains = await p.instance.getDomains();
        for (const d of domains) {
          if (!list.some(item => item.domain === d)) {
            list.push({ domain: d, providerId: p.id, providerName: p.name });
          }
        }
      } catch (e) {
        console.warn(`[ProviderManager] Failed to get domains from ${p.id}:`, e);
      }
    }

    if (list.length === 0) {
      list.push({ domain: 'uberip.com', providerId: 'mailtm', providerName: 'Mail.tm Live Inbound Relay' });
    }
    return list;
  }

  async createMailboxWithFailover(prefix?: string, requestedDomain?: string): Promise<{ result: CreateMailboxResult; providerId: string }> {
    const enabledProviders = this.providers.filter(p => p.enabled);

    // 1. If a specific domain is requested, find the provider that hosts this domain
    if (requestedDomain) {
      const normDomain = requestedDomain.toLowerCase().trim();
      for (const p of enabledProviders) {
        try {
          const doms = await p.instance.getDomains();
          if (doms.map(d => d.toLowerCase()).includes(normDomain)) {
            const res = await p.instance.createMailbox(prefix, normDomain);
            return { result: res, providerId: p.id };
          }
        } catch (err: any) {
          console.warn(`[ProviderManager] Provider ${p.id} failed for requested domain ${normDomain}:`, err.message);
        }
      }
    }

    // 2. Otherwise try candidates sorted by priority
    const candidates = this.providers
      .filter(p => p.enabled && p.health.ok)
      .sort((a, b) => a.priority - b.priority);

    // If candidate list is empty because health check hasn't run yet, try enabled providers
    const targetList = candidates.length > 0 ? candidates : enabledProviders;

    for (const p of targetList) {
      try {
        const res = await p.instance.createMailbox(prefix, requestedDomain);
        return { result: res, providerId: p.id };
      } catch (err: any) {
        console.warn(`[ProviderManager] Provider ${p.id} failed to create mailbox:`, err.message);
      }
    }

    // Direct fallback to first available enabled provider
    const fallbackProvider = targetList[0] || this.providers[0];
    const directRes = await fallbackProvider.instance.createMailbox(prefix, requestedDomain);
    return { result: directRes, providerId: fallbackProvider.id };
  }

  getProviderInstance(providerId: string): EmailProvider {
    const found = this.providers.find(p => p.id === providerId);
    return found ? found.instance : this.mailTmProvider;
  }
}
