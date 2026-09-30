import React, { useState, useEffect } from 'react';
import { X, Layers, Clock } from 'lucide-react';
import { api } from '../services/api';
import { Mailbox } from '../types';
import { useMailbox } from '../context/MailboxContext';

interface MyMailboxesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MyMailboxesModal: React.FC<MyMailboxesModalProps> = ({ isOpen, onClose }) => {
  const { mailbox: currentMailbox } = useMailbox();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.getMyMailboxes()
      .then(res => setMailboxes(res))
      .catch(() => setMailboxes(currentMailbox ? [currentMailbox] : []))
      .finally(() => setLoading(false));
  }, [isOpen, currentMailbox]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-100">
      <div className="max-w-md w-full rounded-xl border border-white/10 bg-[#121520] p-5 shadow-2xl relative max-h-[80vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Mailbox History</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Addresses associated with this session.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
          {loading ? (
            <div className="p-8 text-center text-zinc-500">
              Loading mailboxes...
            </div>
          ) : mailboxes.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              No previous mailboxes recorded.
            </div>
          ) : (
            mailboxes.map(mb => {
              const isActive = currentMailbox?.id === mb.id;
              const isExpired = mb.expiresAt < Date.now();

              return (
                <div
                  key={mb.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    isActive
                      ? 'bg-white/[0.04] border-white/20'
                      : 'bg-zinc-900/40 border-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-xs text-white font-medium truncate select-all">
                      {mb.address}
                    </span>
                    {isActive ? (
                      <span className="text-[10px] text-emerald-400 font-mono">
                        Active
                      </span>
                    ) : isExpired ? (
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Expired
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                    <span>{new Date(mb.createdAt).toLocaleDateString()}</span>
                    <span>{mb.messageCount || 0} messages</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-white/[0.06] flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
