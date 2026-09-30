import React from 'react';
import { Mail, Shield } from 'lucide-react';

interface FooterProps {
  onSelectTab: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onSelectTab }) => {
  return (
    <footer className="w-full border-t border-white/[0.06] bg-[#07080D] mt-auto py-10 text-xs text-zinc-500">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-8 border-b border-white/[0.04]">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-300">
              <Mail className="w-3 h-3" />
            </div>
            <span className="font-semibold text-sm text-zinc-200 tracking-tight">
              AetherMail
            </span>
          </div>

          {/* Links */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-zinc-400">
            <button
              onClick={() => onSelectTab('inbox')}
              className="hover:text-zinc-200 transition-colors"
            >
              Inbox
            </button>
            <button
              onClick={() => onSelectTab('how-it-works')}
              className="hover:text-zinc-200 transition-colors"
            >
              How It Works
            </button>
            <button
              onClick={() => onSelectTab('faq')}
              className="hover:text-zinc-200 transition-colors"
            >
              FAQ
            </button>
            <button
              onClick={() => onSelectTab('blog')}
              className="hover:text-zinc-200 transition-colors"
            >
              Blog
            </button>
            <button
              onClick={() => onSelectTab('api')}
              className="hover:text-zinc-200 transition-colors"
            >
              API
            </button>
            <button
              onClick={() => onSelectTab('privacy')}
              className="hover:text-zinc-200 transition-colors"
            >
              Privacy Policy
            </button>
            <button
              onClick={() => onSelectTab('terms')}
              className="hover:text-zinc-200 transition-colors"
            >
              Terms of Service
            </button>
          </div>
        </div>

        {/* Bottom copyright & disclaimer */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-zinc-400">
          <p>
            © {new Date().getFullYear()} AetherMail. Disposable temporary email infrastructure.
          </p>

          <p className="max-w-md sm:text-right">
            Temporary inboxes are public ephemeral receivers. Do not use for permanent financial or medical services.
          </p>
        </div>
      </div>
    </footer>
  );
};
