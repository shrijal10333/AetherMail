import React, { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Mail, Shield, Check } from 'lucide-react';

interface SeoPageTemplateProps {
  pageKey: string;
  onGoToInbox: () => void;
}

export const SeoPageTemplate: React.FC<SeoPageTemplateProps> = ({ pageKey, onGoToInbox }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  if (pageKey === 'how-it-works') {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
            How AetherMail Works
          </h1>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">
            A simple, secure approach to temporary email communication.
          </p>
        </div>

        {/* 3-Step Clean Layout with subtle visual timeline */}
        <div className="relative border-l border-white/[0.08] ml-4 sm:ml-8 pl-6 sm:pl-8 space-y-12 my-10">
          {/* Step 1 */}
          <div className="relative">
            <span className="absolute -left-[35px] sm:-left-[43px] top-0 flex items-center justify-center w-6 h-6 rounded-full bg-zinc-900 border border-white/20 text-[11px] font-mono font-medium text-white">
              01
            </span>
            <h2 className="text-base font-semibold text-white mb-1.5">
              Create an address
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-lg">
              When you open AetherMail, a disposable email address is provisioned immediately. You can use the randomly generated address or customize your username prefix. No passwords or registration needed.
            </p>
          </div>

          {/* Step 2 */}
          <div className="relative">
            <span className="absolute -left-[35px] sm:-left-[43px] top-0 flex items-center justify-center w-6 h-6 rounded-full bg-zinc-900 border border-white/20 text-[11px] font-mono font-medium text-white">
              02
            </span>
            <h2 className="text-base font-semibold text-white mb-1.5">
              Receive your email
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-lg">
              Use your temporary address for online verifications, trial signups, or downloads. Our inbound mail server receives the SMTP transmission and streams it to your browser in real time via Server-Sent Events.
            </p>
          </div>

          {/* Step 3 */}
          <div className="relative">
            <span className="absolute -left-[35px] sm:-left-[43px] top-0 flex items-center justify-center w-6 h-6 rounded-full bg-zinc-900 border border-white/20 text-[11px] font-mono font-medium text-white">
              03
            </span>
            <h2 className="text-base font-semibold text-white mb-1.5">
              Read it privately
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-lg">
              Click any incoming message to read its contents in an isolated sandbox. Malicious scripts, tracking beacons, and cross-site vectors are neutralized. When you are finished, discard the mailbox with one click.
            </p>
          </div>
        </div>

        <div className="text-center pt-8 border-t border-white/[0.06]">
          <button
            onClick={onGoToInbox}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-white text-zinc-950 hover:bg-zinc-200 transition-colors"
          >
            <span>Open Your Inbox</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // FAQ Page
  if (pageKey === 'faq') {
    const faqs = [
      {
        q: 'What is temporary email?',
        a: 'A temporary email is a short-lived inbox that receives incoming mail without requiring you to share your personal email. It is ideal for signing up for one-time services or verifying registrations without exposing your inbox to spam lists.',
      },
      {
        q: 'How long does my mailbox remain active?',
        a: 'Every AetherMail mailbox remains reliably active for a guaranteed 7-day (168-hour) lifecycle from creation. Once the 7-day lifespan expires, the mailbox is safely retired and quarantined to prevent accidental recycling.',
      },
      {
        q: 'Can I refresh the page?',
        a: 'Yes. Refreshing the browser or navigating between pages will never delete or regenerate your mailbox. Your active mailbox is bound to your secure session.',
      },
      {
        q: 'Will my mailbox disappear after logout?',
        a: 'No. Logging out does not delete your mailbox. When you log back in, authenticated accounts can access their active and historical mailboxes.',
      },
      {
        q: 'Can I receive verification emails and codes?',
        a: 'Yes. AetherMail receives authentic verification emails, OTP codes, password reset notifications, and confirmation links sent by external web platforms.',
      },
      {
        q: 'Are attachments supported?',
        a: 'Yes. Our server parses standard MIME attachments (such as PDF files, invoices, or images) and enables safe downloading.',
      },
      {
        q: 'Can I send emails?',
        a: 'No. AetherMail is strictly an inbound-only receiving service. Preventing outbound sending protects our relay domains against spam blocklisting and ensures fast, reliable delivery for everyone.',
      },
      {
        q: 'Is temporary email anonymous?',
        a: 'Temporary email provides privacy from commercial trackers and data brokers because you never provide personal identifying details. However, like all internet protocols, network connections transmit standard TCP/IP routing metadata. Do not use temporary email for unlawful activities.',
      },
      {
        q: 'Are emails stored permanently?',
        a: 'No. When a mailbox expires or you explicitly generate a new email, the old messages are queued for permanent deletion. We do not maintain permanent email archives.',
      },
    ];

    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
            Frequently Asked Questions
          </h1>
          <p className="text-sm text-zinc-400">
            Clear, accurate answers regarding mailbox retention and privacy.
          </p>
        </div>

        <div className="space-y-2 mb-10">
          {faqs.map((faq, i) => {
            const isOpen = openFaq === i;
            return (
              <div
                key={i}
                className="rounded-lg border border-white/[0.06] bg-[#0E111A]/60 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  className="w-full p-4 flex items-center justify-between text-left text-xs font-medium text-zinc-200 hover:text-white transition-colors"
                >
                  <span>{faq.q}</span>
                  {isOpen ? (
                    <ChevronUp className="w-3.5 h-3.5 text-zinc-400 shrink-0 ml-2" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0 ml-2" />
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-1 text-xs text-zinc-400 leading-relaxed border-t border-white/[0.04]">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Privacy Policy
  if (pageKey === 'privacy') {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-12 text-xs text-zinc-300 leading-relaxed space-y-5">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Privacy Policy</h1>
        <p className="text-zinc-400">Last updated: September 2026</p>
        <p>
          At AetherMail, privacy is our foundational principle. We designed our disposable email service to require zero personal information for standard usage.
        </p>
        <h2 className="text-sm font-semibold text-white pt-2">1. Information We Do Not Collect</h2>
        <p>
          We do not require your real name, physical address, credit card, or telephone number to create or use a temporary mailbox. We do not sell user data to advertising networks.
        </p>
        <h2 className="text-sm font-semibold text-white pt-2">2. Mailbox Retention & Deletion</h2>
        <p>
          Messages sent to disposable addresses are stored temporarily in memory to display in your active session. When your mailbox expires or when you click "New Email", previous messages are discarded. We make no representations of permanent data retention.
        </p>
        <h2 className="text-sm font-semibold text-white pt-2">3. Limitations</h2>
        <p>
          Disposable email is intended for non-critical, transient communications. Do not use temporary email for permanent accounts, banking credentials, medical records, or legal notifications.
        </p>
      </div>
    );
  }

  // Terms of Service
  if (pageKey === 'terms') {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-12 text-xs text-zinc-300 leading-relaxed space-y-5">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Terms of Service</h1>
        <p className="text-zinc-400">Last updated: September 2026</p>
        <p>
          By accessing or using AetherMail, you agree to comply with and be bound by these terms.
        </p>
        <h2 className="text-sm font-semibold text-white pt-2">Acceptable Use</h2>
        <p>
          You agree to use AetherMail only for lawful purposes, such as evaluating software, protecting your personal email from marketing solicitations, and automated QA testing.
        </p>
        <h2 className="text-sm font-semibold text-white pt-2">Prohibited Conduct</h2>
        <p>
          You may not use this service to engage in financial fraud, distribution of malware, denial-of-service attacks, or any activity that violates applicable local or international laws.
        </p>
      </div>
    );
  }

  // Generic SEO Landing Pages (e.g. /temp-mail, /temporary-email, /10-minute-mail)
  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-12 text-center">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-3">
        Disposable Temporary Email
      </h1>
      <p className="text-sm text-zinc-400 max-w-lg mx-auto mb-8 leading-relaxed">
        Fast, clean, temporary inboxes that protect your real email address from spam and security breaches.
      </p>

      <button
        onClick={onGoToInbox}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-medium bg-white text-zinc-950 hover:bg-zinc-200 transition-colors"
      >
        <Mail className="w-3.5 h-3.5" />
        <span>Generate Temporary Email</span>
      </button>
    </div>
  );
};
