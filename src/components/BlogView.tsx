import React, { useState } from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { BlogPost } from '../types';

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'what-is-temporary-email',
    title: 'What Is Temporary Email? A Practical Guide to Disposable Inboxes',
    subtitle: 'How disposable addresses work to isolate your primary inbox from online trackers and unwanted solicitations.',
    readTime: '3 min read',
    date: 'Sep 2026',
    category: 'Privacy',
    author: 'AetherMail Security Team',
    summary: 'A temporary email is an on-demand, short-lived mailbox that receives mail without exposing your personal identity or permanent address.',
    content: [
      'Every online service now demands an email address before granting access to articles, downloads, or digital trials. Once entered, that address is frequently added to commercial drip campaigns, traded among data brokers, or caught in third-party data breaches.',
      'A temporary email service gives you an autonomous, disposable address that can receive confirmation codes, activation links, and attachments without requiring any personal credentials or passwords.',
      'Unlike primary email accounts, temporary mailboxes are ephemeral: once you complete your registration or verification, the mailbox and its contents can be left to expire or discarded immediately.',
    ],
  },
  {
    slug: 'how-disposable-email-works',
    title: 'How Disposable Email Works: Relays, MX Routing, and Sandbox Security',
    subtitle: 'An architectural overview of modern ephemeral mail transfer agents.',
    readTime: '4 min read',
    date: 'Sep 2026',
    category: 'Architecture',
    author: 'AetherMail Engineering',
    summary: 'An explanation of DNS MX records, SMTP protocol handshakes, and strict sanitization pipelines.',
    content: [
      'Behind every disposable email service is a Mail Transfer Agent (MTA) connected to public DNS records. When someone sends an email to an address on an active relay domain, internet routers look up the domain’s Mail Exchanger (MX) record.',
      'The sending mail server establishes an encrypted TLS connection with our ingress cluster. Once received, the MIME stream is parsed into sender headers, plain text, and HTML formatting.',
      'Security is the critical differentiator: because received emails may contain malicious scripts or invisible tracking pixels, HTML payloads must be rigorously sanitized using DOMPurify and rendered inside isolated iframe sandboxes with no script execution privileges.',
    ],
  },
  {
    slug: 'temporary-email-vs-personal-inbox',
    title: 'Temporary Email vs Your Personal Inbox: When to Use Each',
    subtitle: 'Clear rules of thumb for protecting your digital identity.',
    readTime: '3 min read',
    date: 'Sep 2026',
    category: 'Security',
    author: 'AetherMail Security Team',
    summary: 'Understanding the boundaries between temporary mailboxes and permanent communication channels.',
    content: [
      'Temporary email is an essential tool in any personal privacy toolkit, but it is not intended to replace your primary email provider. Knowing when to use each prevents accidental lockouts.',
      'Use Temporary Email For:',
      '• One-time software trials, eBook downloads, and webinar access.',
      '• Public Wi-Fi captive portal authentication.',
      '• Testing web applications and account creation workflows during development.',
      '• Forum discussions or services you plan to visit only once.',
      'Use Your Personal Permanent Inbox For:',
      '• Banking, loans, and investment accounts.',
      '• Government communications, legal matters, and healthcare portals.',
      '• Work and primary personal correspondence.',
    ],
  },
  {
    slug: 'how-temporary-email-reduces-spam',
    title: 'How Temporary Email Helps Reduce Spam at the Source',
    subtitle: 'Stop unwanted newsletters before they ever touch your personal inbox.',
    readTime: '3 min read',
    date: 'Sep 2026',
    category: 'Hygiene',
    author: 'AetherMail Privacy Team',
    summary: 'Why inbox compartmentalization is far more effective than relying on spam filters alone.',
    content: [
      'Spam filters attempt to guess which incoming messages are unwanted, but commercial marketers continuously find ways through. The most reliable way to prevent spam is never giving your real address to untrusted parties.',
      'By routing transient interactions through disposable temporary addresses, spam ends up in inboxes that expire naturally. Your personal inbox remains clean, quiet, and reserved exclusively for important correspondence.',
    ],
  },
];

interface BlogViewProps {
  onGoToInbox: () => void;
}

export const BlogView: React.FC<BlogViewProps> = ({ onGoToInbox }) => {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const post = activeSlug ? BLOG_POSTS.find(p => p.slug === activeSlug) : null;

  if (post) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-12">
        <button
          onClick={() => setActiveSlug(null)}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Articles</span>
        </button>

        <article className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
            <span>{post.category}</span>
            <span>·</span>
            <span>{post.readTime}</span>
            <span>·</span>
            <span>{post.date}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            {post.title}
          </h1>

          <p className="text-sm text-zinc-400 font-normal leading-relaxed pb-4 border-b border-white/[0.06]">
            {post.subtitle}
          </p>

          <div className="pt-2 space-y-4 text-xs text-zinc-300 leading-relaxed font-normal">
            {post.content.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <div className="pt-8 mt-8 border-t border-white/[0.06] flex items-center justify-between">
            <span className="text-xs text-zinc-500">AetherMail Editorial</span>
            <button
              onClick={onGoToInbox}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-white text-zinc-950 hover:bg-zinc-200 transition-colors"
            >
              Get a Temporary Email
            </button>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
          Security & Privacy Insights
        </h1>
        <p className="text-sm text-zinc-400">
          Articles on disposable email, inbox hygiene, and security architecture.
        </p>
      </div>

      <div className="space-y-3">
        {BLOG_POSTS.map(item => (
          <div
            key={item.slug}
            onClick={() => setActiveSlug(item.slug)}
            className="p-5 rounded-xl border border-white/[0.06] bg-[#0E111A]/60 hover:bg-[#0E111A] hover:border-white/10 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mb-1.5">
              <span>{item.category}</span>
              <span>·</span>
              <span>{item.readTime}</span>
            </div>

            <h3 className="text-sm font-semibold text-zinc-100 hover:text-white mb-1">
              {item.title}
            </h3>

            <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
              {item.summary}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
