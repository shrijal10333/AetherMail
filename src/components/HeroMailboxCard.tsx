import React, { useState, useEffect, useRef } from 'react';
import {
  Copy,
  Check,
  RefreshCw,
  Plus,
  SlidersHorizontal,
  AlertTriangle,
  QrCode,
  X,
  Send,
  Globe,
  Sparkles
} from 'lucide-react';
import { useMailbox } from '../context/MailboxContext';

export const HeroMailboxCard: React.FC = () => {
  const {
    mailbox,
    isLoadingMailbox,
    isCheckingNew,
    mailboxError,
    refreshMessages,
    generateNewMailbox,
    sendTestEmail,
    domains,
  } = useMailbox();

  const [copied, setCopied] = useState(false);
  const [showConfirmNew, setShowConfirmNew] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [customPrefix, setCustomPrefix] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [customError, setCustomError] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Subtle mouse-tracking tilt effect
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  // 7-day countdown state: "6d 23h 58m"
  const [countdownString, setCountdownString] = useState('7d 00h 00m');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!mailbox?.expiresAt) return;

    const updateCountdown = () => {
      const remainingMs = mailbox.expiresAt - Date.now();
      if (remainingMs <= 0) {
        setIsExpired(true);
        setCountdownString('Expired');
        return;
      }

      setIsExpired(false);
      const totalSeconds = Math.floor(remainingMs / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);

      setCountdownString(`${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [mailbox?.expiresAt]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.innerWidth < 768) return;
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setRotateX(-y * 0.008);
    setRotateY(x * 0.008);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  const handleCopy = async () => {
    if (!mailbox?.address) return;
    try {
      await navigator.clipboard.writeText(mailbox.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('input');
      el.value = mailbox.address;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConfirmNew = async () => {
    setShowConfirmNew(false);
    await generateNewMailbox();
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError('');
    if (!customPrefix.trim()) return;

    try {
      await generateNewMailbox(customPrefix.trim(), customDomain || undefined);
      setShowCustomModal(false);
      setCustomPrefix('');
    } catch (err: any) {
      setCustomError(err.message || 'That address is already claimed.');
    }
  };

  const qrSvgUrl = mailbox?.address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=mailto:${encodeURIComponent(mailbox.address)}&bgcolor=090A0F&color=FFFFFF`
    : '';

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pt-12 pb-6 text-center">
      {/* Centered Hero Heading */}
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-2.5">
        Your temporary inbox, instantly.
      </h1>
      <p className="text-sm text-zinc-400 max-w-lg mx-auto mb-10 leading-relaxed font-normal">
        Create a disposable email address and receive messages without exposing your personal inbox.
      </p>

      {/* Main Mailbox Centerpiece Card */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
          transition: 'transform 0.15s ease-out',
        }}
        className="relative rounded-2xl border border-white/[0.08] bg-[#0E111A]/90 backdrop-blur-xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center transition-shadow hover:shadow-[0_25px_60px_rgba(0,0,0,0.6)] hover:border-white/[0.12]"
      >
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

        {/* Top Label */}
        <div className="text-[11px] font-mono tracking-widest text-zinc-500 uppercase mb-3 font-medium">
          YOUR TEMPORARY EMAIL
        </div>

        {/* Address Display */}
        <div className="my-3">
          {isLoadingMailbox ? (
            <div className="h-9 w-64 bg-zinc-800/60 animate-pulse rounded-md mx-auto" />
          ) : mailboxError ? (
            <div className="py-2 text-rose-400 text-xs font-mono">
              {mailboxError}
            </div>
          ) : (
            <div
              onClick={handleCopy}
              className="group inline-flex items-center justify-center gap-2 cursor-pointer py-1 px-3 rounded-lg hover:bg-white/[0.04] transition-colors"
              title="Click to copy address"
            >
              <span className="font-mono text-xl sm:text-2xl font-semibold tracking-tight text-white select-all">
                {mailbox?.address}
              </span>
              <button
                type="button"
                className="text-zinc-500 group-hover:text-zinc-200 transition-colors p-1 cursor-pointer"
                aria-label="Copy address"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        {/* Action Controls Row: [ Copy Address ] [ Refresh ] */}
        <div className="flex items-center justify-center gap-2.5 my-5">
          <button
            onClick={handleCopy}
            disabled={isLoadingMailbox || !mailbox}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-100 text-zinc-950 hover:bg-white active:scale-[0.98]'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Address</span>
              </>
            )}
          </button>

          <button
            onClick={refreshMessages}
            disabled={isCheckingNew || !mailbox}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800/80 hover:bg-zinc-700/80 border border-white/[0.06] hover:text-white transition-all active:scale-[0.98] cursor-pointer"
            title="Check inbox"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingNew ? 'animate-spin text-zinc-200' : ''}`} />
            <span>{isCheckingNew ? 'Checking...' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => setShowQrModal(true)}
            className="p-2 rounded-lg text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-700/80 border border-white/[0.06] transition-colors cursor-pointer"
            title="Show QR Code"
          >
            <QrCode className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Status Line: ● Listening for incoming mail · Expires in 6d 23h 58m (NO EXTEND BUTTON) */}
        <div className="flex items-center justify-center gap-2 text-xs text-zinc-400 my-4 flex-wrap">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span>{isExpired ? 'Mailbox expired' : 'Listening for incoming mail'}</span>
          <span className="text-zinc-600">·</span>
          <span className="font-mono text-zinc-400">
            {isExpired ? 'Expired' : `Expires in ${countdownString}`}
          </span>
        </div>

        {/* Bottom Actions: [ + New Email ] & Custom alias */}
        <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-500">
          <button
            onClick={() => { setCustomError(''); setShowCustomModal(true); }}
            className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Custom alias</span>
          </button>

          <button
            onClick={() => setShowConfirmNew(true)}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100 font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Email</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal for "New Email" */}
      {showConfirmNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="max-w-sm w-full bg-[#121520] border border-white/10 rounded-xl p-5 text-left shadow-2xl">
            <div className="flex items-center gap-2.5 text-zinc-100 font-medium text-sm mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Create a new temporary address?</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-5">
              Your current address will remain available until its scheduled 7-day expiration, but the new address will become your active mailbox.
            </p>
            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => setShowConfirmNew(false)}
                className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmNew}
                className="px-3.5 py-1.5 rounded-md font-medium bg-white text-zinc-950 hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                Create New
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Prefix Modal with Atomic Claim Verification */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="max-w-sm w-full bg-[#121520] border border-white/10 rounded-xl p-5 text-left shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-100">Choose Custom Address</h3>
              <button onClick={() => setShowCustomModal(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {customError && (
              <div className="mb-3 p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{customError}</span>
              </div>
            )}

            <form onSubmit={handleCustomSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Username</label>
                <input
                  type="text"
                  value={customPrefix}
                  onChange={e => {
                    setCustomError('');
                    setCustomPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                  }}
                  placeholder="e.g. devtest99"
                  maxLength={24}
                  className="w-full bg-zinc-900 border border-white/10 rounded-md px-3 py-2 text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Domain</label>
                <select
                  value={customDomain}
                  onChange={e => setCustomDomain(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-md px-3 py-2 text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
                >
                  <option value="">Default Active Domain</option>
                  {domains.map(d => (
                    <option key={d.domain} value={d.domain}>
                      @{d.domain}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-md font-medium bg-white text-zinc-950 hover:bg-zinc-200 transition-colors cursor-pointer"
                >
                  Claim Address
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="max-w-xs w-full bg-[#121520] border border-white/10 rounded-xl p-5 text-center shadow-2xl">
            <h3 className="text-sm font-semibold text-zinc-100 mb-1">Scan Address</h3>
            <p className="text-xs text-zinc-400 mb-4">Scan with mobile camera to send an email.</p>
            <div className="p-3 bg-[#090A0F] border border-white/10 rounded-lg inline-block mb-3">
              <img src={qrSvgUrl} alt="QR Code" className="w-44 h-44 rounded" />
            </div>
            <div className="text-xs font-mono text-zinc-300 break-all mb-4">
              {mailbox?.address}
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
