import React, { useState } from 'react';
import { RefreshCw, Paperclip, Inbox as InboxIcon } from 'lucide-react';
import { useMailbox } from '../context/MailboxContext';
import { EmailMessage } from '../types';

export const InboxList: React.FC = () => {
  const {
    messages,
    isLoadingMessages,
    isCheckingNew,
    selectMessage,
    selectedMessage,
    mailbox,
  } = useMailbox();

  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'read' | 'attachments'>('all');

  const formatTimestamp = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Accurate unread check: message is unread ONLY if readAt is null and !isRead
  const unreadCount = messages.filter(m => !m.isRead && m.readAt === null).length;
  const readCount = messages.filter(m => m.isRead || m.readAt !== null).length;

  const filteredMessages = messages.filter(msg => {
    const isUnread = !msg.isRead && msg.readAt === null;
    if (activeFilter === 'unread') return isUnread;
    if (activeFilter === 'read') return !isUnread;
    if (activeFilter === 'attachments') return msg.hasAttachments;
    return true;
  });

  return (
    <div className="w-full max-w-3xl mx-auto px-4 mt-4 mb-16">
      {/* Inbox Filter Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-2 border-b border-white/[0.06] text-xs text-zinc-400">
        <div className="flex items-center gap-1.5 font-medium">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-white/10 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All ({messages.length})
          </button>

          <button
            onClick={() => setActiveFilter('unread')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              activeFilter === 'unread'
                ? 'bg-white/10 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Unread ({unreadCount})
          </button>

          <button
            onClick={() => setActiveFilter('read')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              activeFilter === 'read'
                ? 'bg-white/10 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Read ({readCount})
          </button>

          <button
            onClick={() => setActiveFilter('attachments')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              activeFilter === 'attachments'
                ? 'bg-white/10 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Attachments
          </button>

          {isCheckingNew && (
            <span className="flex items-center gap-1 text-[11px] text-zinc-400 ml-2 animate-pulse font-mono">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Scanning...</span>
            </span>
          )}
        </div>

        <div className="text-[11px] text-zinc-500 font-mono">
          Unread: {unreadCount}
        </div>
      </div>

      {/* Main Mail List Container */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0E111A]/60 backdrop-blur-md overflow-hidden">
        {isLoadingMessages && messages.length === 0 ? (
          <div className="py-16 text-center text-xs text-zinc-500">
            <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-zinc-400" />
            <span>Connecting to temporary mailbox...</span>
          </div>
        ) : messages.length === 0 ? (
          /* Honest Empty State: REAL MAIL ONLY */
          <div className="py-20 px-6 text-center">
            <div className="w-10 h-10 rounded-full bg-zinc-900 border border-white/[0.06] text-zinc-500 flex items-center justify-center mx-auto mb-3">
              <InboxIcon className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-medium text-zinc-200 mb-1">
              Your inbox is empty
            </h4>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
              Messages sent to your temporary address <span className="text-zinc-300 font-mono select-all">{mailbox?.address}</span> will appear here.
            </p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            No messages matching the "{activeFilter}" filter.
          </div>
        ) : (
          /* Email Rows: Fixed Blue Bug (Highlighted ONLY when readAt is null and !isRead) */
          <div className="divide-y divide-white/[0.04]">
            {filteredMessages.map(msg => {
              const isSelected = selectedMessage?.id === msg.id;
              // Message is unread STRICTLY when readAt is null and !isRead
              const isUnread = !msg.isRead && msg.readAt === null;

              return (
                <div
                  key={msg.id}
                  onClick={() => selectMessage(msg)}
                  className={`group px-4 py-3.5 flex items-start gap-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-white/[0.08]'
                      : isUnread
                      ? 'bg-white/[0.02] hover:bg-white/[0.05]'
                      : 'hover:bg-white/[0.02]'
                  }`}
                >
                  {/* Unread Indicator Dot (shown ONLY for genuinely unread messages) */}
                  <div className="pt-1.5 shrink-0">
                    <span
                      className={`block w-1.5 h-1.5 rounded-full ${
                        isUnread ? 'bg-blue-500' : 'bg-transparent'
                      }`}
                    />
                  </div>

                  {/* Sender & Subject & Snippet */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <span
                        className={`text-xs truncate ${
                          isUnread ? 'font-semibold text-white' : 'font-normal text-zinc-400'
                        }`}
                      >
                        {msg.fromName || msg.from}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono text-zinc-400">
                        {msg.hasAttachments && (
                          <Paperclip className="w-3 h-3 text-zinc-400" />
                        )}
                        <span>{formatTimestamp(msg.receivedAt)}</span>
                      </div>
                    </div>

                    <div
                      className={`text-xs truncate mb-0.5 ${
                        isUnread ? 'font-medium text-zinc-200' : 'text-zinc-400'
                      }`}
                    >
                      {msg.subject || '(No Subject)'}
                    </div>

                    <p className="text-xs text-zinc-400 truncate font-normal">
                      {msg.snippet || msg.bodyText}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
