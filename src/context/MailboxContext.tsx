import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Mailbox, EmailMessage, DomainOption } from '../types';
import { api } from '../services/api';

interface MailboxContextType {
  mailbox: Mailbox | null;
  messages: EmailMessage[];
  selectedMessage: EmailMessage | null;
  isLoadingMailbox: boolean;
  isLoadingMessages: boolean;
  isCheckingNew: boolean;
  realtimeConnected: boolean;
  mailboxError: string | null;
  domains: DomainOption[];
  newEmailNotification: EmailMessage | null;
  clearNotification: () => void;
  selectMessage: (msg: EmailMessage | null) => void;
  refreshMessages: () => Promise<void>;
  generateNewMailbox: (prefix?: string, domain?: string) => Promise<void>;
  sendTestEmail: () => Promise<void>;
  deleteMailbox: () => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
}

const MailboxContext = createContext<MailboxContextType | undefined>(undefined);

export const MailboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [isLoadingMailbox, setIsLoadingMailbox] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isCheckingNew, setIsCheckingNew] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [mailboxError, setMailboxError] = useState<string | null>(null);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [newEmailNotification, setNewEmailNotification] = useState<EmailMessage | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<any>(null);
  // Track known IDs on client to NEVER notify for old messages on refresh or initial fetch
  const initialLoadDoneRef = useRef(false);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  // Subtle clean ping sound when a genuine real email arrives
  const playChime = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.1); // G5
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {
      // AudioContext restricted before first interaction
    }
  }, []);

  // Fetch available domains once
  useEffect(() => {
    api.getDomains().then(setDomains).catch(() => {});
  }, []);

  // Fetch or initialize active mailbox (Ensures persistence on refresh!)
  const initMailbox = async () => {
    setIsLoadingMailbox(true);
    setMailboxError(null);
    try {
      const data = await api.getActiveMailbox();
      setMailbox(data.mailbox);
      await fetchMessages(data.mailbox.id, true);
    } catch (err: any) {
      console.error('Failed to init mailbox:', err);
      setMailboxError(err.message || 'Email service configuration required');
    } finally {
      setIsLoadingMailbox(false);
    }
  };

  const fetchMessages = async (mailboxId: string, isInitial = false) => {
    setIsLoadingMessages(true);
    try {
      const list = await api.getMessages(mailboxId);
      setMessages(list);

      // If initial load, register all existing messages as seen so they never trigger "New message received"
      if (isInitial || !initialLoadDoneRef.current) {
        list.forEach(m => seenMessageIdsRef.current.add(m.id));
        initialLoadDoneRef.current = true;
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    initMailbox();
  }, []);

  // Setup Real-time SSE Stream & Polling Fallback
  useEffect(() => {
    if (!mailbox?.id) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      const es = new EventSource(`/api/realtime/${mailbox.id}`);
      eventSourceRef.current = es;

      es.onopen = () => {
        setRealtimeConnected(true);
      };

      es.addEventListener('new_message', (evt: MessageEvent) => {
        try {
          const newMsg: EmailMessage = JSON.parse(evt.data);
          // Only notify if not already known to the client
          if (!seenMessageIdsRef.current.has(newMsg.id)) {
            seenMessageIdsRef.current.add(newMsg.id);
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [newMsg, ...prev];
            });
            setNewEmailNotification(newMsg);
            playChime();
          }
        } catch (e) {
          console.error('Failed to parse incoming SSE message:', e);
        }
      });

      es.onerror = () => {
        setRealtimeConnected(false);
      };
    } catch (e) {
      console.warn('SSE not supported or blocked:', e);
      setRealtimeConnected(false);
    }

    // Polling provider every 7 seconds for real incoming email
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      if (!mailbox?.id) return;
      try {
        const fresh = await api.getMessages(mailbox.id);
        setMessages(prev => {
          // Check for genuinely new messages
          const genuinelyNew = fresh.filter(m => !seenMessageIdsRef.current.has(m.id));
          if (genuinelyNew.length > 0 && initialLoadDoneRef.current) {
            genuinelyNew.forEach(m => seenMessageIdsRef.current.add(m.id));
            setNewEmailNotification(genuinelyNew[0]);
            playChime();
          }
          return fresh;
        });
      } catch {
        // Quiet poll error
      }
    }, 7000);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [mailbox?.id, playChime]);

  const refreshMessages = async () => {
    if (!mailbox?.id) return;
    setIsCheckingNew(true);
    try {
      const list = await api.getMessages(mailbox.id);
      setMessages(list);
      list.forEach(m => seenMessageIdsRef.current.add(m.id));
    } finally {
      setTimeout(() => setIsCheckingNew(false), 400);
    }
  };

  const generateNewMailbox = async (prefix?: string, domain?: string) => {
    setIsLoadingMailbox(true);
    setSelectedMessage(null);
    setMailboxError(null);
    try {
      const data = await api.generateNewMailbox(prefix, domain);
      setMailbox(data.mailbox);
      seenMessageIdsRef.current.clear();
      await fetchMessages(data.mailbox.id, true);
    } catch (err: any) {
      setMailboxError(err.message || 'Failed to create new mailbox');
      throw err; // Allow caller component to handle already claimed errors
    } finally {
      setIsLoadingMailbox(false);
    }
  };

  const deleteMailbox = async () => {
    if (!mailbox?.id) return;
    await api.deleteMailbox(mailbox.id);
    await generateNewMailbox();
  };

  const deleteMessage = async (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    if (selectedMessage?.id === messageId) {
      setSelectedMessage(null);
    }
  };

  // Fixed blue unread message bug: Marks read on server & updates local state immediately
  const selectMessage = async (msg: EmailMessage | null) => {
    if (!msg) {
      setSelectedMessage(null);
      return;
    }

    const now = Date.now();
    // Immediately mark read in UI
    const readMsg: EmailMessage = { ...msg, isRead: true, readAt: msg.readAt || now };
    setSelectedMessage(readMsg);
    setMessages(prev =>
      prev.map(m => (m.id === msg.id ? { ...m, isRead: true, readAt: m.readAt || now } : m))
    );

    if (mailbox?.id) {
      // Persist read state on server
      api.markMessageRead(mailbox.id, msg.id).catch(err => console.error('Failed to mark read:', err));

      try {
        const full = await api.getMessage(mailbox.id, msg.id);
        setSelectedMessage({ ...full, isRead: true, readAt: full.readAt || now });
      } catch (e) {
        console.error('Failed to load message detail:', e);
      }
    }
  };

  const sendTestEmail = async () => {
    if (!mailbox?.id) return;
    try {
      const msg = await api.sendTestEmail(mailbox.id);
      setMessages(prev => [msg, ...prev.filter(m => m.id !== msg.id)]);
      setNewEmailNotification(msg);
      playChime();
    } catch (e: any) {
      console.error('Failed to trigger test email:', e);
    }
  };

  const clearNotification = () => setNewEmailNotification(null);

  return (
    <MailboxContext.Provider
      value={{
        mailbox,
        messages,
        selectedMessage,
        isLoadingMailbox,
        isLoadingMessages,
        isCheckingNew,
        realtimeConnected,
        mailboxError,
        domains,
        newEmailNotification,
        clearNotification,
        selectMessage,
        refreshMessages,
        generateNewMailbox,
        sendTestEmail,
        deleteMailbox,
        deleteMessage,
      }}
    >
      {children}
    </MailboxContext.Provider>
  );
};

export const useMailbox = () => {
  const ctx = useContext(MailboxContext);
  if (!ctx) throw new Error('useMailbox must be used within MailboxProvider');
  return ctx;
};
