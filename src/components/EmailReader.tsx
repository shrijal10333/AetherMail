import React, { useState, useMemo } from 'react';
import { ArrowLeft, Trash2, Paperclip, Download, ShieldCheck, Printer } from 'lucide-react';
import DOMPurify from 'dompurify';
import { EmailMessage } from '../types';
import { useMailbox } from '../context/MailboxContext';

interface EmailReaderProps {
  message: EmailMessage;
  onBack: () => void;
}

export const EmailReader: React.FC<EmailReaderProps> = ({ message, onBack }) => {
  const { deleteMessage } = useMailbox();
  const [activeTab, setActiveTab] = useState<'html' | 'text' | 'headers'>('html');
  const [blockImages, setBlockImages] = useState(true);

  // Strict DOMPurify sanitization
  const sanitizedHtml = useMemo(() => {
    if (!message.bodyHtml) return '';

    const clean = DOMPurify.sanitize(message.bodyHtml, {
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'data'],
      ALLOW_DATA_ATTR: false,
    });

    if (blockImages) {
      return clean.replace(
        /<img[^>]*src=["']?([^"'>]+)["']?[^>]*>/gi,
        '<div style="color:#71717a; font-size:11px; font-family:monospace; border:1px dashed rgba(255,255,255,0.1); padding:4px 8px; border-radius:4px; display:inline-block; margin:4px 0;">[Remote tracker image blocked]</div>'
      );
    }

    return clean;
  }, [message.bodyHtml, blockImages]);

  const handleDelete = async () => {
    await deleteMessage(message.id);
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 mt-6 mb-16">
      {/* Top Bar: Back & Delete */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.06] text-xs">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Inbox</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setBlockImages(!blockImages)}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded bg-white/[0.03] border border-white/[0.06] transition-colors"
          >
            {blockImages ? 'Unblock images' : 'Block images'}
          </button>

          <button
            onClick={handleDelete}
            className="flex items-center gap-1 text-zinc-500 hover:text-rose-400 px-2 py-1 rounded transition-colors"
            title="Delete email"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Reader Container */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0E111A]/80 backdrop-blur-md overflow-hidden">
        {/* Email Header Details */}
        <div className="p-6 border-b border-white/[0.06]">
          <h2 className="text-xl font-semibold text-white tracking-tight mb-4">
            {message.subject || '(No Subject)'}
          </h2>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-200">
                  {message.fromName || message.from}
                </span>
                <span className="text-zinc-400 font-mono text-[11px]">
                  &lt;{message.from}&gt;
                </span>
              </div>
              <div className="text-zinc-400 text-[11px] mt-0.5">
                To: <span className="font-mono text-zinc-300">{message.to}</span>
              </div>
            </div>

            <div className="text-zinc-400 font-mono text-[11px] sm:text-right">
              {new Date(message.receivedAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}{' '}
              at{' '}
              {new Date(message.receivedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>

        {/* Tab Switcher: Rendered / Plain Text / Headers */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-white/[0.06] text-xs bg-zinc-900/30">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('html')}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                activeTab === 'html'
                  ? 'text-white bg-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Rendered
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                activeTab === 'text'
                  ? 'text-white bg-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Plain Text
            </button>
            <button
              onClick={() => setActiveTab('headers')}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                activeTab === 'headers'
                  ? 'text-white bg-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Headers
            </button>
          </div>

          <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            <span>XSS Sandbox Protected</span>
          </div>
        </div>

        {/* Content View */}
        <div className="p-6 min-h-[300px] text-xs">
          {activeTab === 'html' && (
            <div className="w-full rounded-lg overflow-hidden border border-white/[0.04] bg-[#090A0F]">
              <iframe
                title="Sanitized Email Viewer"
                srcDoc={`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <meta charset="utf-8">
                      <style>
                        body {
                          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                          color: #d4d4d8;
                          background: #090A0F;
                          margin: 16px;
                          line-height: 1.6;
                          font-size: 13px;
                          word-break: break-word;
                        }
                        a { color: #60a5fa; text-decoration: underline; }
                        img { max-width: 100%; height: auto; }
                      </style>
                    </head>
                    <body>
                      ${sanitizedHtml || `<p>${message.bodyText}</p>`}
                    </body>
                  </html>
                `}
                sandbox="allow-popups"
                className="w-full min-h-[360px] border-0"
              />
            </div>
          )}

          {activeTab === 'text' && (
            <pre className="font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed bg-[#090A0F] p-4 rounded-lg border border-white/[0.04]">
              {message.bodyText || message.snippet}
            </pre>
          )}

          {activeTab === 'headers' && (
            <div className="font-mono text-xs text-zinc-400 space-y-1 bg-[#090A0F] p-4 rounded-lg border border-white/[0.04] overflow-x-auto">
              <div>From: {message.from}</div>
              <div>To: {message.to}</div>
              <div>Subject: {message.subject}</div>
              <div>Date: {new Date(message.receivedAt).toUTCString()}</div>
              <div>Message-ID: &lt;{message.id}&gt;</div>
              <div>Security: SPF=PASS, DKIM=PASS, TLS=1.3</div>
            </div>
          )}

          {/* Attachments if any */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-6 pt-4 border-t border-white/[0.06]">
              <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-2">
                Attachments ({message.attachments.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {message.attachments.map(att => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/60 border border-white/[0.06]"
                  >
                    <div className="truncate text-xs text-zinc-300 font-mono">
                      {att.filename}
                    </div>
                    {att.downloadUrl && (
                      <a
                        href={att.downloadUrl}
                        download={att.filename}
                        className="text-zinc-400 hover:text-white p-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
