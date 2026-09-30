import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Search,
  Users,
  Mail,
  RefreshCw,
  Power,
  Clock,
  AlertTriangle,
  FileText,
  Sliders,
  Globe,
  Trash2,
  Flame,
  Key,
  Check,
  CheckCircle,
  Eye,
  Activity,
  Lock,
  ArrowRight,
  Server,
  Zap,
} from 'lucide-react';
import { api } from '../services/api';
import { AdminAuditLog, SystemSettings, SuspiciousActivitySummary, ProviderDomainMapping } from '../types';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenChangePassword?: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose, onOpenChangePassword }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'mailboxes' | 'messages' | 'providers' | 'settings' | 'abuse' | 'audit'>('overview');
  const [metrics, setMetrics] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [blockedIps, setBlockedIps] = useState<string[]>([]);
  const [blockedPatterns, setBlockedPatterns] = useState<string[]>([]);
  const [domainMappings, setDomainMappings] = useState<ProviderDomainMapping[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    defaultTtlHours: 168,
    maxMessageLimit: 50,
    rateLimitMaxRequests: 60,
    rateLimitWindowSeconds: 60,
    domainWhitelist: [],
    domainBlacklist: [],
    blockedSenderPatterns: [],
  });
  const [suspiciousActivity, setSuspiciousActivity] = useState<SuspiciousActivitySummary | null>(null);

  // Search & input states
  const [mailboxSearch, setMailboxSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [newBlockIp, setNewBlockIp] = useState('');
  const [newBlockPattern, setNewBlockPattern] = useState('');
  const [newWhitelistDomain, setNewWhitelistDomain] = useState('');
  const [newBlacklistDomain, setNewBlacklistDomain] = useState('');

  // Selected item inspectors
  const [selectedMailboxDetail, setSelectedMailboxDetail] = useState<any | null>(null);
  const [selectedMessageDetail, setSelectedMessageDetail] = useState<any | null>(null);

  // Status & feedback
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const [metricsData, mbxData, msgData, auditData, mappingsData, settingsData, suspData] = await Promise.all([
        api.getAdminMetrics(),
        api.getAdminMailboxes(mailboxSearch),
        api.getAdminMessages(messageSearch),
        api.getAdminAuditLogs(),
        api.getProviderDomainMappings(),
        api.getAdminSettings(),
        api.getSuspiciousActivity(),
      ]);

      setMetrics(metricsData.metrics);
      setProviders(metricsData.providers || []);
      setBlockedIps(metricsData.blockedIps || []);
      setMailboxes(mbxData.mailboxes || []);
      setMessages(msgData.messages || []);
      setAuditLogs(auditData.logs || []);
      setDomainMappings(mappingsData.mappings || []);
      if (settingsData?.settings) {
        setSystemSettings(settingsData.settings);
      }
      if (suspData?.summary) {
        setSuspiciousActivity(suspData.summary);
      }
      if (suspData?.blockedPatterns) {
        setBlockedPatterns(suspData.blockedPatterns);
      }
    } catch (err: any) {
      console.error('Admin API error:', err);
      setAuthError(err.message || 'Access denied: Administrator role required.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Search Mailboxes
  const handleSearchMailboxes = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.getAdminMailboxes(mailboxSearch);
      setMailboxes(res.mailboxes || []);
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // Search Messages
  const handleSearchMessages = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.getAdminMessages(messageSearch);
      setMessages(res.messages || []);
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // View Mailbox Detail
  const handleInspectMailbox = async (id: string) => {
    try {
      const res = await api.getAdminMailboxDetail(id);
      setSelectedMailboxDetail(res);
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // Manual Expire Mailbox
  const handleExpireMailbox = async (id: string, address: string) => {
    if (!confirm(`Are you sure you want to immediately expire mailbox "${address}"?`)) return;
    try {
      await api.expireAdminMailbox(id);
      showNotification(`Mailbox ${address} expired successfully.`);
      const res = await api.getAdminMailboxes(mailboxSearch);
      setMailboxes(res.mailboxes || []);
      if (selectedMailboxDetail?.mailbox?.id === id) {
        setSelectedMailboxDetail(null);
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // Delete Mailbox
  const handleDeleteMailbox = async (id: string, address: string) => {
    if (!confirm(`PERMANENT ACTION: Are you sure you want to delete mailbox "${address}" and all associated messages?`)) return;
    try {
      await api.deleteAdminMailbox(id);
      showNotification(`Mailbox ${address} deleted.`);
      const res = await api.getAdminMailboxes(mailboxSearch);
      setMailboxes(res.mailboxes || []);
      if (selectedMailboxDetail?.mailbox?.id === id) {
        setSelectedMailboxDetail(null);
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // Flush Mailbox Messages
  const handleFlushMailbox = async (id: string, address: string) => {
    if (!confirm(`Are you sure you want to flush/clear all messages from mailbox "${address}"?`)) return;
    try {
      await api.flushAdminMailbox(id);
      showNotification(`Messages flushed for ${address}.`);
      const res = await api.getAdminMailboxes(mailboxSearch);
      setMailboxes(res.mailboxes || []);
      if (selectedMailboxDetail?.mailbox?.id === id) {
        handleInspectMailbox(id);
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // Provider Controls
  const handleToggleProvider = async (id: string, currentEnabled: boolean) => {
    try {
      const res = await api.toggleProvider(id, !currentEnabled);
      setProviders(res.providers);
      showNotification(`Provider ${id} ${!currentEnabled ? 'enabled' : 'disabled'}.`);
    } catch (e: any) {
      showNotification(e.message || 'Failed to toggle provider', 'error');
    }
  };

  const handleTestSingleProvider = async (id: string) => {
    setTestingProviderId(id);
    try {
      const res = await api.testSingleProvider(id);
      showNotification(`Provider test successful! Latency: ${res.health?.latencyMs}ms`);
      setProviders(res.providers);
    } catch (e: any) {
      showNotification(e.message || 'Provider connection test failed', 'error');
    } finally {
      setTestingProviderId(null);
    }
  };

  const handleBatchHealthCheck = async () => {
    try {
      const res = await api.runAdminHealthCheck();
      setProviders(res.providers);
      showNotification('Gateway health check complete.');
    } catch (e: any) {
      showNotification(e.message, 'error');
    }
  };

  // Abuse Controls: Block/Unblock IP
  const handleBlockIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockIp.trim()) return;
    try {
      const res = await api.blockIp(newBlockIp.trim(), true);
      setBlockedIps(res.blockedIps);
      setNewBlockIp('');
      showNotification(`IP ${newBlockIp.trim()} added to blocklist.`);
    } catch (err: any) {
      showNotification(err.message || 'Could not block IP', 'error');
    }
  };

  const handleUnblockIp = async (ip: string) => {
    try {
      const res = await api.blockIp(ip, false);
      setBlockedIps(res.blockedIps);
      showNotification(`IP ${ip} unblocked.`);
    } catch (err: any) {
      showNotification(err.message || 'Could not unblock IP', 'error');
    }
  };

  // Abuse Controls: Block/Unblock Sender Pattern
  const handleBlockSenderPattern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockPattern.trim()) return;
    try {
      const res = await api.blockSenderPattern(newBlockPattern.trim(), true);
      setBlockedPatterns(res.blockedPatterns);
      setNewBlockPattern('');
      showNotification(`Pattern "${newBlockPattern.trim()}" blocked.`);
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleUnblockSenderPattern = async (pattern: string) => {
    try {
      const res = await api.blockSenderPattern(pattern, false);
      setBlockedPatterns(res.blockedPatterns);
      showNotification(`Pattern "${pattern}" unblocked.`);
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // System Settings Save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await api.updateAdminSettings(systemSettings);
      setSystemSettings(res.settings);
      showNotification('System settings saved successfully.');
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddWhitelistDomain = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhitelistDomain.trim()) return;
    const dom = newWhitelistDomain.toLowerCase().trim();
    if (!systemSettings.domainWhitelist.includes(dom)) {
      setSystemSettings({
        ...systemSettings,
        domainWhitelist: [...systemSettings.domainWhitelist, dom],
      });
    }
    setNewWhitelistDomain('');
  };

  const handleRemoveWhitelistDomain = (dom: string) => {
    setSystemSettings({
      ...systemSettings,
      domainWhitelist: systemSettings.domainWhitelist.filter(d => d !== dom),
    });
  };

  const handleAddBlacklistDomain = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlacklistDomain.trim()) return;
    const dom = newBlacklistDomain.toLowerCase().trim();
    if (!systemSettings.domainBlacklist.includes(dom)) {
      setSystemSettings({
        ...systemSettings,
        domainBlacklist: [...systemSettings.domainBlacklist, dom],
      });
    }
    setNewBlacklistDomain('');
  };

  const handleRemoveBlacklistDomain = (dom: string) => {
    setSystemSettings({
      ...systemSettings,
      domainBlacklist: systemSettings.domainBlacklist.filter(d => d !== dom),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-100">
      <div className="max-w-5xl w-full rounded-xl border border-white/10 bg-[#0d0f15] shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden text-xs">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] bg-[#121520]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white tracking-tight text-sm">AetherMail Administration</h3>
                <span className="text-[10px] font-mono font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  ROLE: ADMIN
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">Inbound mail infrastructure, mailbox governance, and security controls</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenChangePassword && (
              <button
                onClick={onOpenChangePassword}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition-colors text-[11px] cursor-pointer"
                title="Change Admin Password"
              >
                <Lock className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">Change Password</span>
              </button>
            )}

            <button
              onClick={loadData}
              className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 transition-colors cursor-pointer"
              title="Refresh telemetry"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {statusMessage && (
          <div
            className={`px-4 py-2 border-b text-[12px] flex items-center justify-between ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/20 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/20 text-rose-300'
            }`}
          >
            <span>{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} className="text-zinc-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {authError ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="text-base font-semibold text-white mb-1">Access Denied</h4>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">{authError}</p>
          </div>
        ) : (
          <>
            {/* Tabs Strip */}
            <div className="flex items-center gap-1 px-4 border-b border-white/[0.06] bg-[#121520]/50 overflow-x-auto">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-2 px-3 font-medium border-b-2 transition-colors cursor-pointer shrink-0 text-[12px] ${
                  activeTab === 'overview'
                    ? 'border-white text-white bg-white/[0.03]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Overview
              </button>

              <button
                onClick={() => setActiveTab('mailboxes')}
                className={`py-2 px-3 font-medium border-b-2 transition-colors cursor-pointer shrink-0 text-[12px] ${
                  activeTab === 'mailboxes'
                    ? 'border-white text-white bg-white/[0.03]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Mailboxes ({mailboxes.length})
              </button>

              <button
                onClick={() => setActiveTab('messages')}
                className={`py-2 px-3 font-medium border-b-2 transition-colors cursor-pointer shrink-0 text-[12px] ${
                  activeTab === 'messages'
                    ? 'border-white text-white bg-white/[0.03]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Messages ({messages.length})
              </button>

              <button
                onClick={() => setActiveTab('providers')}
                className={`py-2 px-3 font-medium border-b-2 transition-colors cursor-pointer shrink-0 text-[12px] ${
                  activeTab === 'providers'
                    ? 'border-white text-white bg-white/[0.03]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Providers ({providers.length})
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`py-2 px-3 font-medium border-b-2 transition-colors cursor-pointer shrink-0 text-[12px] ${
                  activeTab === 'settings'
                    ? 'border-white text-white bg-white/[0.03]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                System Settings
              </button>

              <button
                onClick={() => setActiveTab('abuse')}
                className={`py-2 px-3 font-medium border-b-2 transition-colors cursor-pointer shrink-0 text-[12px] ${
                  activeTab === 'abuse'
                    ? 'border-white text-white bg-white/[0.03]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Abuse & Security ({blockedIps.length + blockedPatterns.length})
              </button>

              <button
                onClick={() => setActiveTab('audit')}
                className={`py-2 px-3 font-medium border-b-2 transition-colors cursor-pointer shrink-0 text-[12px] ${
                  activeTab === 'audit'
                    ? 'border-white text-white bg-white/[0.03]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Audit Log ({auditLogs.length})
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loading ? (
                <div className="py-16 text-center text-zinc-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-400" />
                  <span>Loading administrator metrics and telemetry...</span>
                </div>
              ) : (
                <>
                  {/* OVERVIEW TAB */}
                  {activeTab === 'overview' && (
                    <div className="space-y-4">
                      {/* Metric Stat Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06]">
                          <div className="text-zinc-500 text-[11px] mb-1">Total Users</div>
                          <div className="text-xl font-semibold text-white font-mono">
                            {metrics?.totalUsers ?? 1}
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-1">Registered accounts</div>
                        </div>

                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06]">
                          <div className="text-zinc-500 text-[11px] mb-1">Active Mailboxes</div>
                          <div className="text-xl font-semibold text-emerald-400 font-mono">
                            {metrics?.activeMailboxesCount ?? 0}
                          </div>
                          <div className="text-[10px] text-emerald-500/80 mt-1">Currently open sessions</div>
                        </div>

                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06]">
                          <div className="text-zinc-500 text-[11px] mb-1">Claimed Addresses</div>
                          <div className="text-xl font-semibold text-blue-400 font-mono">
                            {metrics?.claimedAddressesCount ?? 0}
                          </div>
                          <div className="text-[10px] text-blue-500/80 mt-1">Bound to users/guests</div>
                        </div>

                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06]">
                          <div className="text-zinc-500 text-[11px] mb-1">Unclaimed Addresses</div>
                          <div className="text-xl font-semibold text-zinc-300 font-mono">
                            {metrics?.unclaimedAddressesCount ?? 0}
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-1">In quarantine/pool</div>
                        </div>

                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06]">
                          <div className="text-zinc-500 text-[11px] mb-1">Messages Received</div>
                          <div className="text-xl font-semibold text-white font-mono">
                            {metrics?.totalEmailsReceived ?? 0}
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-1">Lifetime processed</div>
                        </div>

                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06]">
                          <div className="text-zinc-500 text-[11px] mb-1">Messages Today</div>
                          <div className="text-xl font-semibold text-emerald-400 font-mono">
                            {metrics?.messagesToday ?? 0}
                          </div>
                          <div className="text-[10px] text-emerald-500/80 mt-1">Since 00:00 UTC</div>
                        </div>

                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06]">
                          <div className="text-zinc-500 text-[11px] mb-1">Expiring &lt;24h</div>
                          <div className="text-xl font-semibold text-amber-400 font-mono">
                            {metrics?.expiringSoonCount ?? 0}
                          </div>
                          <div className="text-[10px] text-amber-500/80 mt-1">Approaching TTL limit</div>
                        </div>

                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06]">
                          <div className="text-zinc-500 text-[11px] mb-1">Error Rate</div>
                          <div className="text-xl font-semibold text-zinc-300 font-mono">
                            {metrics?.errorRate ?? 0}%
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-1">Gateway anomalies</div>
                        </div>
                      </div>

                      {/* Providers status bar */}
                      <div className="p-4 rounded-lg bg-zinc-900/60 border border-white/[0.06]">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-semibold text-zinc-200">Email Gateway Status</span>
                          <button
                            onClick={handleBatchHealthCheck}
                            className="text-zinc-400 hover:text-white flex items-center gap-1 text-[11px] cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Ping Gateway</span>
                          </button>
                        </div>

                        <div className="space-y-2">
                          {providers.map(p => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between p-2.5 rounded bg-zinc-900 border border-white/[0.04]"
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${p.health?.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                <span className="font-medium text-zinc-200">{p.name}</span>
                                <span className="text-zinc-500 font-mono text-[11px]">
                                  {p.health?.latencyMs}ms latency
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded ${p.enabled ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-500 bg-zinc-800'}`}>
                                  {p.enabled ? 'Operational' : 'Disabled'}
                                </span>
                                <button
                                  onClick={() => handleTestSingleProvider(p.id)}
                                  disabled={testingProviderId === p.id}
                                  className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                                >
                                  {testingProviderId === p.id ? 'Testing...' : 'Test'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MAILBOXES TAB */}
                  {activeTab === 'mailboxes' && (
                    <div className="space-y-4">
                      {/* Search Bar */}
                      <form onSubmit={handleSearchMailboxes} className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
                          <input
                            type="text"
                            value={mailboxSearch}
                            onChange={e => setMailboxSearch(e.target.value)}
                            placeholder="Search by address, mailbox ID, or owner user ID..."
                            className="w-full bg-zinc-900 border border-white/10 rounded-md pl-8 pr-3 py-1.5 font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
                          />
                        </div>
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-md font-medium bg-white text-zinc-950 hover:bg-zinc-200 transition-colors cursor-pointer"
                        >
                          Search
                        </button>
                      </form>

                      {/* Mailbox Detail Inspector Drawer / Modal */}
                      {selectedMailboxDetail && (
                        <div className="p-4 rounded-lg bg-zinc-900/90 border border-blue-500/30 space-y-3">
                          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                            <div className="flex items-center gap-2">
                              <Eye className="w-4 h-4 text-blue-400" />
                              <span className="font-semibold text-white">Mailbox Inspector</span>
                              <span className="font-mono text-blue-400">{selectedMailboxDetail.mailbox?.address}</span>
                            </div>
                            <button
                              onClick={() => setSelectedMailboxDetail(null)}
                              className="text-zinc-400 hover:text-white"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                            <div className="p-2 rounded bg-black/40 border border-white/[0.04]">
                              <span className="text-zinc-500 block">Status:</span>
                              <span className="font-mono text-emerald-400">{selectedMailboxDetail.mailbox?.status}</span>
                            </div>
                            <div className="p-2 rounded bg-black/40 border border-white/[0.04]">
                              <span className="text-zinc-500 block">Provider:</span>
                              <span className="font-mono text-zinc-200">{selectedMailboxDetail.mailbox?.provider}</span>
                            </div>
                            <div className="p-2 rounded bg-black/40 border border-white/[0.04]">
                              <span className="text-zinc-500 block">Created:</span>
                              <span className="font-mono text-zinc-300">
                                {new Date(selectedMailboxDetail.mailbox?.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="p-2 rounded bg-black/40 border border-white/[0.04]">
                              <span className="text-zinc-500 block">Expires:</span>
                              <span className="font-mono text-amber-400">
                                {new Date(selectedMailboxDetail.mailbox?.expiresAt).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Quick Admin Actions on Selected Mailbox */}
                          <div className="flex items-center gap-2 pt-1 border-t border-white/[0.04]">
                            <button
                              onClick={() => handleExpireMailbox(selectedMailboxDetail.mailbox?.id, selectedMailboxDetail.mailbox?.address)}
                              className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                            >
                              <Clock className="w-3 h-3" />
                              <span>Manual Expire</span>
                            </button>
                            <button
                              onClick={() => handleFlushMailbox(selectedMailboxDetail.mailbox?.id, selectedMailboxDetail.mailbox?.address)}
                              className="px-2.5 py-1 rounded bg-zinc-800 border border-white/10 text-zinc-200 hover:bg-zinc-700 transition-colors flex items-center gap-1"
                            >
                              <Flame className="w-3 h-3 text-rose-400" />
                              <span>Flush Messages</span>
                            </button>
                            <button
                              onClick={() => handleDeleteMailbox(selectedMailboxDetail.mailbox?.id, selectedMailboxDetail.mailbox?.address)}
                              className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 transition-colors flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete Mailbox</span>
                            </button>
                          </div>

                          {/* Messages in this mailbox */}
                          <div className="pt-2">
                            <span className="text-zinc-400 font-semibold block mb-1">
                              Stored Messages ({selectedMailboxDetail.messages?.length || 0})
                            </span>
                            {selectedMailboxDetail.messages?.length === 0 ? (
                              <div className="text-zinc-500 italic p-2 bg-black/30 rounded">No messages in mailbox.</div>
                            ) : (
                              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {selectedMailboxDetail.messages.map((m: any) => (
                                  <div key={m.id} className="p-2 rounded bg-black/30 border border-white/[0.04] text-[11px] flex justify-between items-center">
                                    <div>
                                      <span className="font-semibold text-white">{m.from}</span>: {m.subject}
                                      <div className="text-zinc-500 text-[10px]">{new Date(m.receivedAt).toLocaleTimeString()}</div>
                                    </div>
                                    <button
                                      onClick={() => setSelectedMessageDetail(m)}
                                      className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:text-white"
                                    >
                                      Inspect
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Mailbox List */}
                      <div className="space-y-2">
                        {mailboxes.length === 0 ? (
                          <div className="p-8 text-center text-zinc-500">No mailboxes match search.</div>
                        ) : (
                          mailboxes.map(mb => (
                            <div
                              key={mb.id}
                              className="p-3 rounded-lg bg-zinc-900/60 border border-white/[0.04] flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-white/10 transition-colors"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-white font-medium">{mb.address}</span>
                                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${mb.isExpired ? 'text-zinc-500 bg-zinc-800' : 'text-emerald-400 bg-emerald-500/10'}`}>
                                    {mb.status}
                                  </span>
                                  <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800/80 px-1.5 py-0.2 rounded">
                                    {mb.provider}
                                  </span>
                                </div>
                                <div className="text-[11px] text-zinc-400 mt-1 flex flex-wrap items-center gap-2">
                                  <span>Owner: {mb.ownerEmail || mb.ownerType}</span>
                                  <span>·</span>
                                  <span>Created: {new Date(mb.createdAt).toLocaleDateString()}</span>
                                  <span>·</span>
                                  <span>Expires: {new Date(mb.expiresAt).toLocaleDateString()}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-zinc-400 font-mono text-[11px] mr-2">
                                  {mb.messageCount} msgs
                                </span>

                                <button
                                  onClick={() => handleInspectMailbox(mb.id)}
                                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                                  title="Inspect Details"
                                >
                                  Inspect
                                </button>

                                <button
                                  onClick={() => handleExpireMailbox(mb.id, mb.address)}
                                  disabled={mb.status === 'EXPIRED'}
                                  className="px-2 py-1 rounded bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-colors"
                                  title="Manual Expire"
                                >
                                  Expire
                                </button>

                                <button
                                  onClick={() => handleDeleteMailbox(mb.id, mb.address)}
                                  className="p-1 rounded bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors"
                                  title="Delete Mailbox"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* MESSAGES TAB */}
                  {activeTab === 'messages' && (
                    <div className="space-y-4">
                      {/* Search Bar */}
                      <form onSubmit={handleSearchMessages} className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
                          <input
                            type="text"
                            value={messageSearch}
                            onChange={e => setMessageSearch(e.target.value)}
                            placeholder="Search messages by sender, recipient, or subject..."
                            className="w-full bg-zinc-900 border border-white/10 rounded-md pl-8 pr-3 py-1.5 font-mono text-zinc-100 focus:outline-none"
                          />
                        </div>
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-md font-medium bg-white text-zinc-950 hover:bg-zinc-200 transition-colors cursor-pointer"
                        >
                          Search
                        </button>
                      </form>

                      {/* Selected Message Inspector */}
                      {selectedMessageDetail && (
                        <div className="p-4 rounded-lg bg-zinc-900/90 border border-blue-500/30 space-y-2">
                          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                            <span className="font-semibold text-white">Message Inspector</span>
                            <button onClick={() => setSelectedMessageDetail(null)} className="text-zinc-400 hover:text-white">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="text-[11px] space-y-1">
                            <div><span className="text-zinc-500">From:</span> <span className="text-white font-medium">{selectedMessageDetail.from}</span></div>
                            <div><span className="text-zinc-500">To:</span> <span className="text-white font-medium">{selectedMessageDetail.to}</span></div>
                            <div><span className="text-zinc-500">Subject:</span> <span className="text-white font-medium">{selectedMessageDetail.subject}</span></div>
                            <div><span className="text-zinc-500">Date:</span> <span className="text-zinc-400">{new Date(selectedMessageDetail.receivedAt).toLocaleString()}</span></div>
                            <div className="p-2.5 mt-2 rounded bg-black/50 border border-white/[0.04] max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] text-zinc-300">
                              {selectedMessageDetail.bodyText || selectedMessageDetail.snippet || '(No plain text content)'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Messages List */}
                      <div className="space-y-2">
                        {messages.length === 0 ? (
                          <div className="p-8 text-center text-zinc-500">
                            No received messages recorded in system yet.
                          </div>
                        ) : (
                          messages.map(msg => (
                            <div
                              key={msg.id}
                              className="p-3 rounded-lg bg-zinc-900/60 border border-white/[0.04] flex items-center justify-between hover:border-white/10 transition-colors"
                            >
                              <div className="flex-1 min-w-0 pr-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-white truncate">{msg.from}</span>
                                  <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
                                  <span className="text-zinc-400 font-mono text-[11px] truncate">{msg.to}</span>
                                  <span className="text-[11px] text-zinc-500 font-mono ml-auto shrink-0">
                                    {new Date(msg.receivedAt).toLocaleTimeString()}
                                  </span>
                                </div>
                                <div className="text-zinc-300 font-medium truncate">{msg.subject}</div>
                                <div className="text-[11px] text-zinc-500 truncate mt-0.5">{msg.snippet}</div>
                              </div>

                              <button
                                onClick={() => setSelectedMessageDetail(msg)}
                                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors shrink-0"
                              >
                                Inspect
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* PROVIDERS TAB */}
                  {activeTab === 'providers' && (
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <span className="font-semibold text-zinc-200 block">Inbound Providers</span>
                        {providers.map(p => (
                          <div
                            key={p.id}
                            className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${p.health?.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                <span className="font-medium text-zinc-100">{p.name}</span>
                                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1 rounded">
                                  Priority {p.priority}
                                </span>
                              </div>
                              <div className="text-zinc-400 text-[11px] mt-1">
                                Status: {p.health?.ok ? 'Operational' : (p.health?.error || 'Offline')} · Latency: {p.health?.latencyMs}ms · Last check: {new Date(p.health?.lastChecked).toLocaleTimeString()}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleTestSingleProvider(p.id)}
                                disabled={testingProviderId === p.id}
                                className="px-2.5 py-1 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
                              >
                                {testingProviderId === p.id ? 'Testing...' : 'Test Connection'}
                              </button>

                              <button
                                onClick={() => handleToggleProvider(p.id, p.enabled)}
                                className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                                  p.enabled
                                    ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                                    : 'bg-white text-zinc-950 hover:bg-zinc-200'
                                }`}
                              >
                                {p.enabled ? 'Disable' : 'Enable'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Domain Mapping Section */}
                      <div className="p-4 rounded-lg bg-zinc-900/60 border border-white/[0.06] space-y-3">
                        <span className="font-semibold text-zinc-200 block">Domain Mapping & Relay Routing</span>
                        <div className="space-y-2">
                          {domainMappings.map(dm => (
                            <div key={dm.providerId} className="p-3 rounded bg-zinc-900 border border-white/[0.04]">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-white">{dm.providerName}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${dm.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                                  {dm.enabled ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {dm.domains.length === 0 ? (
                                  <span className="text-zinc-500 italic text-[11px]">No active MX domains configured.</span>
                                ) : (
                                  dm.domains.map(dom => (
                                    <span key={dom} className="px-2 py-0.5 rounded bg-zinc-800/80 border border-white/[0.06] font-mono text-[11px] text-zinc-300">
                                      @{dom}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SYSTEM SETTINGS TAB */}
                  {activeTab === 'settings' && (
                    <form onSubmit={handleSaveSettings} className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Default TTL */}
                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06] space-y-1.5">
                          <label className="font-semibold text-white block">Default Mailbox TTL</label>
                          <p className="text-zinc-400 text-[11px]">Duration before inactive or unclaimed mailboxes expire</p>
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="number"
                              min="1"
                              max="720"
                              value={systemSettings.defaultTtlHours}
                              onChange={e => setSystemSettings({ ...systemSettings, defaultTtlHours: parseInt(e.target.value) || 168 })}
                              className="w-24 bg-zinc-900 border border-white/10 rounded px-2.5 py-1 font-mono text-white text-center"
                            />
                            <span className="text-zinc-400">hours ({Math.round(systemSettings.defaultTtlHours / 24)} days)</span>
                          </div>
                        </div>

                        {/* Max Message Limit */}
                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06] space-y-1.5">
                          <label className="font-semibold text-white block">Max Message Limit</label>
                          <p className="text-zinc-400 text-[11px]">Maximum stored messages retained per temporary mailbox</p>
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="number"
                              min="5"
                              max="500"
                              value={systemSettings.maxMessageLimit}
                              onChange={e => setSystemSettings({ ...systemSettings, maxMessageLimit: parseInt(e.target.value) || 50 })}
                              className="w-24 bg-zinc-900 border border-white/10 rounded px-2.5 py-1 font-mono text-white text-center"
                            />
                            <span className="text-zinc-400">messages / mailbox</span>
                          </div>
                        </div>

                        {/* Rate Limiting Requests */}
                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06] space-y-1.5">
                          <label className="font-semibold text-white block">Rate Limit Threshold</label>
                          <p className="text-zinc-400 text-[11px]">Max requests per client IP / session before rate throttling</p>
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="number"
                              min="10"
                              max="1000"
                              value={systemSettings.rateLimitMaxRequests}
                              onChange={e => setSystemSettings({ ...systemSettings, rateLimitMaxRequests: parseInt(e.target.value) || 60 })}
                              className="w-24 bg-zinc-900 border border-white/10 rounded px-2.5 py-1 font-mono text-white text-center"
                            />
                            <span className="text-zinc-400">requests</span>
                          </div>
                        </div>

                        {/* Rate Limiting Window */}
                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06] space-y-1.5">
                          <label className="font-semibold text-white block">Rate Limit Window</label>
                          <p className="text-zinc-400 text-[11px]">Sliding evaluation window duration in seconds</p>
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="number"
                              min="10"
                              max="3600"
                              value={systemSettings.rateLimitWindowSeconds}
                              onChange={e => setSystemSettings({ ...systemSettings, rateLimitWindowSeconds: parseInt(e.target.value) || 60 })}
                              className="w-24 bg-zinc-900 border border-white/10 rounded px-2.5 py-1 font-mono text-white text-center"
                            />
                            <span className="text-zinc-400">seconds</span>
                          </div>
                        </div>
                      </div>

                      {/* Domain Whitelist & Blacklist */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Whitelist */}
                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06] space-y-2">
                          <label className="font-semibold text-white block">Domain Whitelist</label>
                          <p className="text-zinc-400 text-[11px]">Authorized domain suffixes allowed for generation</p>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={newWhitelistDomain}
                              onChange={e => setNewWhitelistDomain(e.target.value)}
                              placeholder="e.g. securemail.io"
                              className="flex-1 bg-zinc-900 border border-white/10 rounded px-2.5 py-1 font-mono text-white"
                            />
                            <button
                              type="button"
                              onClick={handleAddWhitelistDomain}
                              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-medium"
                            >
                              Add
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {systemSettings.domainWhitelist.length === 0 ? (
                              <span className="text-zinc-500 text-[11px]">All available provider domains allowed.</span>
                            ) : (
                              systemSettings.domainWhitelist.map(d => (
                                <span key={d} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px] flex items-center gap-1">
                                  <span>{d}</span>
                                  <button type="button" onClick={() => handleRemoveWhitelistDomain(d)} className="hover:text-white">
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Blacklist */}
                        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-white/[0.06] space-y-2">
                          <label className="font-semibold text-white block">Domain Blacklist</label>
                          <p className="text-zinc-400 text-[11px]">Disallowed sender domains blocked from receiving inbound</p>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={newBlacklistDomain}
                              onChange={e => setNewBlacklistDomain(e.target.value)}
                              placeholder="e.g. junkspam.org"
                              className="flex-1 bg-zinc-900 border border-white/10 rounded px-2.5 py-1 font-mono text-white"
                            />
                            <button
                              type="button"
                              onClick={handleAddBlacklistDomain}
                              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-medium"
                            >
                              Add
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {systemSettings.domainBlacklist.length === 0 ? (
                              <span className="text-zinc-500 text-[11px]">No domains currently blacklisted.</span>
                            ) : (
                              systemSettings.domainBlacklist.map(d => (
                                <span key={d} className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono text-[11px] flex items-center gap-1">
                                  <span>{d}</span>
                                  <button type="button" onClick={() => handleRemoveBlacklistDomain(d)} className="hover:text-white">
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="submit"
                          disabled={actionLoading}
                          className="px-4 py-2 rounded-md font-medium bg-white text-zinc-950 hover:bg-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{actionLoading ? 'Saving...' : 'Save System Settings'}</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {/* ABUSE & SECURITY TAB */}
                  {activeTab === 'abuse' && (
                    <div className="space-y-4">
                      {/* Suspicious Traffic Monitor */}
                      <div className="p-4 rounded-lg bg-zinc-900/60 border border-white/[0.06] space-y-3">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-amber-400" />
                          <span className="font-semibold text-white">Suspicious Traffic & Security Telemetry</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="p-2.5 rounded bg-zinc-900 border border-white/[0.04]">
                            <span className="text-zinc-500 block text-[10px]">Blocked IPs</span>
                            <span className="text-base font-semibold text-rose-400 font-mono">{blockedIps.length}</span>
                          </div>
                          <div className="p-2.5 rounded bg-zinc-900 border border-white/[0.04]">
                            <span className="text-zinc-500 block text-[10px]">Blocked Sender Patterns</span>
                            <span className="text-base font-semibold text-amber-400 font-mono">{blockedPatterns.length}</span>
                          </div>
                          <div className="p-2.5 rounded bg-zinc-900 border border-white/[0.04]">
                            <span className="text-zinc-500 block text-[10px]">Active Rate Limits</span>
                            <span className="text-base font-semibold text-blue-400 font-mono">
                              {suspiciousActivity?.rateLimitedEntities?.length || 0}
                            </span>
                          </div>
                        </div>

                        {/* Recent Unauthorized Admin Attempts */}
                        {suspiciousActivity?.recentUnauthorizedAttempts && suspiciousActivity.recentUnauthorizedAttempts.length > 0 && (
                          <div className="pt-2">
                            <span className="text-zinc-400 text-[11px] font-semibold block mb-1.5">
                              Recent Unauthorized Access Attempts ({suspiciousActivity.recentUnauthorizedAttempts.length})
                            </span>
                            <div className="space-y-1 max-h-36 overflow-y-auto">
                              {suspiciousActivity.recentUnauthorizedAttempts.map((log: any) => (
                                <div key={log.id} className="p-2 rounded bg-rose-950/20 border border-rose-500/20 font-mono text-[10px] flex justify-between items-center text-rose-300">
                                  <span>{log.action} ({log.adminEmail}) from IP {log.ip || 'unknown'}</span>
                                  <span className="text-zinc-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* IP Blocklist */}
                      <div className="p-4 rounded-lg bg-zinc-900/60 border border-white/[0.06] space-y-3">
                        <span className="font-semibold text-white block">IP Address Blocklist</span>
                        <form onSubmit={handleBlockIp} className="flex gap-2">
                          <input
                            type="text"
                            value={newBlockIp}
                            onChange={e => setNewBlockIp(e.target.value)}
                            placeholder="Enter IP address to block (e.g. 192.168.1.50)..."
                            className="flex-1 bg-zinc-900 border border-white/10 rounded-md px-3 py-1.5 font-mono text-zinc-100 focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="px-3 py-1.5 rounded-md font-medium bg-rose-600 text-white hover:bg-rose-500 transition-colors cursor-pointer"
                          >
                            Block IP
                          </button>
                        </form>

                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {blockedIps.length === 0 ? (
                            <div className="p-3 text-center text-zinc-500">No IPs currently blocked.</div>
                          ) : (
                            blockedIps.map(ip => (
                              <div
                                key={ip}
                                className="flex items-center justify-between p-2 rounded bg-zinc-900/80 border border-white/[0.04] font-mono"
                              >
                                <span className="text-rose-400">{ip}</span>
                                <button
                                  onClick={() => handleUnblockIp(ip)}
                                  className="text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800 text-[10px] cursor-pointer"
                                >
                                  Unblock
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Sender Patterns Blocklist */}
                      <div className="p-4 rounded-lg bg-zinc-900/60 border border-white/[0.06] space-y-3">
                        <span className="font-semibold text-white block">Abusive Sender Patterns</span>
                        <p className="text-zinc-400 text-[11px]">Match wildcard sender patterns to reject incoming malicious spam</p>
                        <form onSubmit={handleBlockSenderPattern} className="flex gap-2">
                          <input
                            type="text"
                            value={newBlockPattern}
                            onChange={e => setNewBlockPattern(e.target.value)}
                            placeholder="e.g. *@spammer.top or *malware*..."
                            className="flex-1 bg-zinc-900 border border-white/10 rounded-md px-3 py-1.5 font-mono text-zinc-100 focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="px-3 py-1.5 rounded-md font-medium bg-amber-600 text-white hover:bg-amber-500 transition-colors cursor-pointer"
                          >
                            Block Pattern
                          </button>
                        </form>

                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {blockedPatterns.length === 0 ? (
                            <div className="p-3 text-center text-zinc-500">No sender patterns blocked.</div>
                          ) : (
                            blockedPatterns.map(p => (
                              <div
                                key={p}
                                className="flex items-center justify-between p-2 rounded bg-zinc-900/80 border border-white/[0.04] font-mono"
                              >
                                <span className="text-amber-400">{p}</span>
                                <button
                                  onClick={() => handleUnblockSenderPattern(p)}
                                  className="text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800 text-[10px] cursor-pointer"
                                >
                                  Unblock
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AUDIT LOG TAB */}
                  {activeTab === 'audit' && (
                    <div className="space-y-2">
                      {auditLogs.length === 0 ? (
                        <div className="p-8 text-center text-zinc-500">
                          No audit log entries recorded yet.
                        </div>
                      ) : (
                        auditLogs.map(log => (
                          <div
                            key={log.id}
                            className="p-2.5 rounded bg-zinc-900/60 border border-white/[0.04] font-mono text-[11px]"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${log.result === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                <span className="text-amber-300 font-semibold">{log.action}</span>
                              </div>
                              <span className="text-zinc-500">{new Date(log.timestamp).toLocaleString()}</span>
                            </div>
                            <div className="text-zinc-300 mt-1">Admin: {log.adminEmail} · IP: {log.ip || 'internal'}</div>
                            {log.target && <div className="text-zinc-500 mt-0.5">Target: {log.target}</div>}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
