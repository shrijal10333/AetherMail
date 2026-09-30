import React, { useState } from 'react';
import { Mail, Sun, Moon, LogOut, Key, Layers, Menu, X, Shield, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMailbox } from '../context/MailboxContext';

interface HeaderProps {
  currentTab: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onSelectTab: (tab: string) => void;
  onOpenAuth: () => void;
  onOpenAdmin: () => void;
  onOpenMyMailboxes: () => void;
  onOpenChangePassword: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  theme,
  onToggleTheme,
  onSelectTab,
  onOpenAuth,
  onOpenAdmin,
  onOpenMyMailboxes,
  onOpenChangePassword,
}) => {
  const { user, logout } = useAuth();
  const { messages } = useMailbox();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Accurate unread count: strictly where readAt is null and !isRead
  const unreadCount = messages.filter(m => !m.isRead && m.readAt === null).length;
  const isAdmin = user?.role === 'admin';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-[#090A0F]/80 backdrop-blur-md transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Left: Brand + Status Indicator */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onSelectTab('inbox')}
            className="flex items-center gap-2.5 text-left group cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-100 group-hover:border-zinc-500 transition-colors">
              <Mail className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-zinc-100 group-hover:text-white transition-colors">
              AetherMail
            </span>
          </button>

          <div className="h-3 w-px bg-white/10 hidden sm:block" />

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-zinc-400 font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Service Operational</span>
          </div>
        </div>

        {/* Center: Clean Linear-style Navigation */}
        <nav className="hidden md:flex items-center gap-1 text-[13px] font-medium text-zinc-400">
          <button
            onClick={() => onSelectTab('inbox')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              currentTab === 'inbox'
                ? 'text-zinc-100 bg-white/[0.05]'
                : 'hover:text-zinc-200 hover:bg-white/[0.02]'
            }`}
          >
            <span>Inbox</span>
            {unreadCount > 0 && (
              <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-mono font-medium">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onSelectTab('how-it-works')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              currentTab === 'how-it-works'
                ? 'text-zinc-100 bg-white/[0.05]'
                : 'hover:text-zinc-200 hover:bg-white/[0.02]'
            }`}
          >
            How It Works
          </button>

          <button
            onClick={() => onSelectTab('faq')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              currentTab === 'faq'
                ? 'text-zinc-100 bg-white/[0.05]'
                : 'hover:text-zinc-200 hover:bg-white/[0.02]'
            }`}
          >
            FAQ
          </button>

          <button
            onClick={() => onSelectTab('blog')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              currentTab === 'blog'
                ? 'text-zinc-100 bg-white/[0.05]'
                : 'hover:text-zinc-200 hover:bg-white/[0.02]'
            }`}
          >
            Blog
          </button>

          <button
            onClick={() => onSelectTab('api')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              currentTab === 'api'
                ? 'text-zinc-100 bg-white/[0.05]'
                : 'hover:text-zinc-200 hover:bg-white/[0.02]'
            }`}
          >
            API
          </button>
        </nav>

        {/* Right: Theme Toggle & Login/Account & Admin (ONLY if role === 'admin') */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={onToggleTheme}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {/* ADMIN BUTTON: Strictly shown ONLY if authenticated user has role === 'admin' */}
          {isAdmin && (
            <button
              onClick={onOpenAdmin}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
              title="Admin Control Center"
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Admin</span>
            </button>
          )}

          {user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 text-xs font-medium px-2.5 py-1.5 rounded-md border border-white/10 hover:border-white/20 bg-zinc-900/60 text-zinc-200 transition-colors"
              >
                <div className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] text-white">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:inline font-mono">{user.email.split('@')[0]}</span>
                {isAdmin && (
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1 rounded border border-amber-500/20">
                    admin
                  </span>
                )}
              </button>

              {userMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-52 rounded-lg border border-white/10 bg-[#121520] shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-75 text-xs"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <div className="px-2.5 py-1.5 border-b border-white/[0.06] mb-1">
                    <p className="font-semibold text-zinc-100 truncate">{user.name}</p>
                    <p className="text-[11px] text-zinc-400 font-mono truncate">{user.email}</p>
                  </div>

                  <button
                    onClick={onOpenMyMailboxes}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-zinc-300 hover:bg-white/[0.06] rounded text-left transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5 text-zinc-400" />
                    <span>My Mailboxes</span>
                  </button>

                  <button
                    onClick={() => onSelectTab('api')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-zinc-300 hover:bg-white/[0.06] rounded text-left transition-colors"
                  >
                    <Key className="w-3.5 h-3.5 text-zinc-400" />
                    <span>API Token</span>
                  </button>

                  <button
                    onClick={onOpenChangePassword}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-zinc-300 hover:bg-white/[0.06] rounded text-left transition-colors"
                  >
                    <Lock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Change Password</span>
                  </button>

                  {isAdmin && (
                    <button
                      onClick={onOpenAdmin}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-amber-300 hover:bg-amber-500/10 rounded text-left transition-colors border-t border-white/[0.06] mt-1 pt-1.5"
                    >
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                      <span>Admin Dashboard</span>
                    </button>
                  )}

                  <div className="border-t border-white/[0.06] mt-1 pt-1">
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-rose-400 hover:bg-rose-500/10 rounded text-left transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-white text-zinc-950 hover:bg-zinc-200 transition-colors"
            >
              Sign In
            </button>
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="md:hidden p-1.5 text-zinc-400 hover:text-white"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div className="md:hidden border-t border-white/[0.06] bg-[#090A0F] px-4 py-3 space-y-1 text-sm">
          <button
            onClick={() => { onSelectTab('inbox'); setMobileNavOpen(false); }}
            className="w-full text-left px-3 py-2 text-zinc-300 hover:bg-white/[0.04] rounded-md"
          >
            Inbox {unreadCount > 0 && `(${unreadCount})`}
          </button>
          <button
            onClick={() => { onSelectTab('how-it-works'); setMobileNavOpen(false); }}
            className="w-full text-left px-3 py-2 text-zinc-300 hover:bg-white/[0.04] rounded-md"
          >
            How It Works
          </button>
          <button
            onClick={() => { onSelectTab('faq'); setMobileNavOpen(false); }}
            className="w-full text-left px-3 py-2 text-zinc-300 hover:bg-white/[0.04] rounded-md"
          >
            FAQ
          </button>
          <button
            onClick={() => { onSelectTab('blog'); setMobileNavOpen(false); }}
            className="w-full text-left px-3 py-2 text-zinc-300 hover:bg-white/[0.04] rounded-md"
          >
            Blog
          </button>
          <button
            onClick={() => { onSelectTab('api'); setMobileNavOpen(false); }}
            className="w-full text-left px-3 py-2 text-zinc-300 hover:bg-white/[0.04] rounded-md"
          >
            API
          </button>

          {isAdmin && (
            <button
              onClick={() => { onOpenAdmin(); setMobileNavOpen(false); }}
              className="w-full text-left px-3 py-2 text-amber-300 hover:bg-amber-500/10 rounded-md font-medium"
            >
              Admin Dashboard
            </button>
          )}
        </div>
      )}
    </header>
  );
};
