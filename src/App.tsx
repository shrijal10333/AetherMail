import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MailboxProvider, useMailbox } from './context/MailboxContext';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HeroMailboxCard } from './components/HeroMailboxCard';
import { InboxList } from './components/InboxList';
import { EmailReader } from './components/EmailReader';
import { AuthModal } from './components/AuthModal';
import { AdminModal } from './components/AdminModal';
import { MyMailboxesModal } from './components/MyMailboxesModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { ApiDocsView } from './components/ApiDocsView';
import { SeoPageTemplate } from './components/SeoPageTemplate';
import { BlogView } from './components/BlogView';
import { ToastNotification } from './components/ToastNotification';

function MainApp() {
  const { user } = useAuth();
  const { selectedMessage, selectMessage } = useMailbox();
  const [currentTab, setCurrentTab] = useState<string>('inbox');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showMyMailboxesModal, setShowMyMailboxesModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [authAlert, setAuthAlert] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('aether_theme') as 'dark' | 'light') || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('aether_theme', theme);
    } catch {
      // Ignore
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Sync tab with URL pathname on initial load and handle browser back/forward
  useEffect(() => {
    const syncWithLocation = () => {
      const path = window.location.pathname.replace(/^\//, '');
      if (
        path &&
        (path === 'temp-mail' ||
          path === 'temporary-email' ||
          path === 'disposable-email' ||
          path === 'temporary-email-address' ||
          path === '10-minute-mail' ||
          path === 'how-it-works' ||
          path === 'faq' ||
          path === 'blog' ||
          path === 'api' ||
          path === 'privacy' ||
          path === 'terms')
      ) {
        setCurrentTab(path);
      } else if (path === 'admin') {
        if (user?.role === 'admin') {
          setShowAdminModal(true);
        } else {
          setAuthAlert('403 Forbidden: Administrator privileges required. You do not have permission to access /admin.');
          setCurrentTab('inbox');
          window.history.replaceState({}, '', '/');
        }
      } else {
        setCurrentTab('inbox');
      }
    };

    syncWithLocation();
    window.addEventListener('popstate', syncWithLocation);
    return () => window.removeEventListener('popstate', syncWithLocation);
  }, [user]);

  const handleSelectTab = (tab: string) => {
    setCurrentTab(tab);
    selectMessage(null);
    const targetUrl = tab === 'inbox' ? '/' : `/${tab}`;
    if (window.location.pathname !== targetUrl) {
      window.history.pushState({}, '', targetUrl);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isSeoPage = [
    'temp-mail',
    'temporary-email',
    'disposable-email',
    'temporary-email-address',
    '10-minute-mail',
    'how-it-works',
    'faq',
    'privacy',
    'terms',
  ].includes(currentTab);

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F] text-zinc-100 selection:bg-blue-500/20 selection:text-blue-200 transition-colors">
      {/* Subtle, refined background ambient glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600/[0.05] blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        {/* Header */}
        <Header
          currentTab={currentTab}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSelectTab={handleSelectTab}
          onOpenAuth={() => setShowAuthModal(true)}
          onOpenAdmin={() => {
            if (user?.role === 'admin') {
              setShowAdminModal(true);
            }
          }}
          onOpenMyMailboxes={() => setShowMyMailboxesModal(true)}
          onOpenChangePassword={() => setShowChangePasswordModal(true)}
        />

        {/* Dynamic Body Content */}
        <main className="flex-1">
          {currentTab === 'inbox' && (
            <>
              {/* Mailbox Centerpiece Card */}
              <HeroMailboxCard />

              {/* Email Reader or Inbox List */}
              {selectedMessage ? (
                <EmailReader
                  message={selectedMessage}
                  onBack={() => selectMessage(null)}
                />
              ) : (
                <InboxList />
              )}
            </>
          )}

          {currentTab === 'blog' && (
            <BlogView onGoToInbox={() => handleSelectTab('inbox')} />
          )}

          {currentTab === 'api' && <ApiDocsView />}

          {isSeoPage && (
            <SeoPageTemplate
              pageKey={currentTab}
              onGoToInbox={() => handleSelectTab('inbox')}
            />
          )}
        </main>

        {/* Footer */}
        <Footer onSelectTab={handleSelectTab} />
      </div>

      {/* Auth Alert Banner */}
      {authAlert && (
        <div className="fixed top-16 right-4 z-50 max-w-md p-4 rounded-xl bg-rose-950/90 border border-rose-500/30 text-rose-200 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-2 duration-200 flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
            !
          </div>
          <div className="flex-1 text-xs">
            <span className="font-semibold block text-white mb-0.5">Access Denied</span>
            <span>{authAlert}</span>
          </div>
          <button
            onClick={() => setAuthAlert(null)}
            className="text-rose-400 hover:text-white p-1"
          >
            ×
          </button>
        </div>
      )}

      {/* Modals & Real-time Alerts */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {user?.role === 'admin' && (
        <AdminModal
          isOpen={showAdminModal}
          onClose={() => setShowAdminModal(false)}
          onOpenChangePassword={() => setShowChangePasswordModal(true)}
        />
      )}

      <MyMailboxesModal
        isOpen={showMyMailboxesModal}
        onClose={() => setShowMyMailboxesModal(false)}
      />

      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
      />

      <ToastNotification />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MailboxProvider>
        <MainApp />
      </MailboxProvider>
    </AuthProvider>
  );
}
