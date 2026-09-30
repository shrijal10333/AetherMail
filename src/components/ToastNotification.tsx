import React, { useEffect } from 'react';
import { Mail, X, ArrowRight } from 'lucide-react';
import { useMailbox } from '../context/MailboxContext';

export const ToastNotification: React.FC = () => {
  const { newEmailNotification, clearNotification, selectMessage } = useMailbox();

  useEffect(() => {
    if (!newEmailNotification) return;
    const timer = setTimeout(() => {
      clearNotification();
    }, 6000);
    return () => clearTimeout(timer);
  }, [newEmailNotification, clearNotification]);

  if (!newEmailNotification) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in slide-in-from-bottom-3 duration-150">
      <div className="rounded-xl border border-white/10 bg-[#121520]/95 p-3.5 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <Mail className="w-3.5 h-3.5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400">
                New message received
              </span>
              <button
                onClick={clearNotification}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            <p className="text-xs font-semibold text-white truncate mt-0.5">
              {newEmailNotification.subject || '(No Subject)'}
            </p>
            <p className="text-[11px] text-zinc-400 truncate">
              {newEmailNotification.fromName || newEmailNotification.from}
            </p>

            <button
              onClick={() => {
                selectMessage(newEmailNotification);
                clearNotification();
              }}
              className="mt-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
            >
              <span>View</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
