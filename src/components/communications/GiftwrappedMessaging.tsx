// src/components/communications/GiftwrappedMessaging.tsx - KEEP EXISTING NAME
import { useEffect, useRef, useState } from 'react';
import { initializeNSECSessionAfterAuth, nsecSessionBridge } from '../../lib/auth/nsec-session-bridge';
import { NobleEncryption } from '../../lib/crypto/noble-encryption';
import secureNsecManager from '../../lib/secure-nsec-manager';
import { DashboardNotification, NotificationService } from '../../services/notificationService';
import { showToast } from '../../services/toastService';
import { useAuth } from '../auth/AuthProvider';
import { SecurePeerInvitationModal } from '../SecurePeerInvitationModal';

interface FamilyMember {
  id: string;
  npub: string;
  username: string;
  role: 'adult' | 'child' | 'guardian';
  spendingLimits?: {
    daily: number;
    weekly: number;
    requiresApproval: number;
  };
}

interface Contact {
  id: string;
  username: string;
  npub: string;
  supportsGiftWrap: boolean;
  trustLevel: string;
  relationshipType: string;
}
interface MessageHistoryItem {
  id: string;
  sender_hash: string;
  recipient_hash: string;
  created_at: string;
  encryption_level: 'maximum' | 'enhanced' | 'standard';
  communication_type: 'family' | 'individual';
  message_type: 'direct' | 'group' | 'payment' | 'credential';
  status?: 'sent' | 'delivered' | 'read' | 'failed' | 'pending';
}


interface GiftwrappedMessagingProps {
  familyMember: FamilyMember;
  isModal?: boolean;
  onClose?: () => void;
}

export function GiftwrappedMessaging({ familyMember, isModal = false, onClose }: GiftwrappedMessagingProps) {
  // const [messages, setMessages] = useState<GiftWrappedMessage[]>([]); // unused
  const [newMessage, setNewMessage] = useState('');
  const [recipient, setRecipient] = useState('');
  const [isGroupMessage, setIsGroupMessage] = useState(false);
  const [selectedPrivacyLevel] = useState<'standard' | 'enhanced' | 'maximum'>('maximum');
  const auth = useAuth();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSigningSetup, setShowSigningSetup] = useState(false);
  // Session status indicator state
  const [sessionLoading, setSessionLoading] = useState<boolean>(true);
  const [sessionActive, setSessionActive] = useState<boolean>(false);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showSessionModal, setShowSessionModal] = useState<boolean>(false);
  const [creatingSession, setCreatingSession] = useState<boolean>(false);

  // Poll session status every second
  useEffect(() => {
    let timer: number | null = null;
    const poll = () => {
      try {
        const status = nsecSessionBridge.getSessionStatus();
        setSessionActive(status.hasSession && status.canSign);
        setSessionId(status.sessionId);
        // Derive remaining time via secureNsecManager formatting helper when possible
        const activeId = status.sessionId || undefined;
        const stat = secureNsecManager.getSessionStatus(activeId);
        setRemainingMs(stat.active && stat.remainingTime ? stat.remainingTime : 0);
        setSessionLoading(false);
      } catch (e) {
        setSessionActive(false);
        setRemainingMs(0);
        setSessionId(null);
        setSessionLoading(false);
      }
    };
    poll();
    timer = window.setInterval(poll, 1000);
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, []);

  const formatRemaining = (ms: number): string => {
    if (ms <= 0) return '00:00';
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const [showRecoverySession, setShowRecoverySession] = useState(false);
  const inviteBtnRef = useRef<HTMLButtonElement | null>(null);

  // Notifications
  const notificationService = NotificationService.getInstance();
  // Persistent message history state
  const [history, setHistory] = useState<MessageHistoryItem[]>([]);
  const [conversations, setConversations] = useState<{ id: string; count: number; lastCreatedAt: string | null }[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);


  const loadHistory = async (cursor?: string) => {
    try {
      setLoadingHistory(true);
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      params.set('limit', '30');
      const res = await fetch(`/api/communications/messages?${params.toString()}`, {
        headers: auth.sessionToken ? { Authorization: `Bearer ${auth.sessionToken}` } : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load messages');

      setHistory((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setConversations(data.conversations || []);
      setNextCursor(data.nextCursor || null);
    } catch (err) {
      console.error('Failed to load message history:', err);
      showToast.error('Failed to load message history', { title: 'Communications Error' });
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const [unreadCount, setUnreadCount] = useState<number>(notificationService.getStats().unread);
  const [notifications, setNotifications] = useState<DashboardNotification[]>(notificationService.getNotifications());
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifDropdownRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to notification service once
  useEffect(() => {
    const unsubscribe = notificationService.subscribe((list) => {
      setNotifications(list);
      setUnreadCount(notificationService.getStats().unread);
    });
    return () => {
      unsubscribe();
    };
  }, [notificationService]);

  // Manage outside-click listener only when dropdown is open
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!showNotifDropdown) return;
      const target = e.target as Node;
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(target)) {
        setShowNotifDropdown(false);
      }
    };
    if (showNotifDropdown) {
      document.addEventListener('click', onDocClick);
    }
    return () => {
      document.removeEventListener('click', onDocClick);
    };
  }, [showNotifDropdown]);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const { GiftwrappedCommunicationService } = await import('../../lib/giftwrapped-communication-service');
      const giftWrapService = new GiftwrappedCommunicationService();
      const loadedContacts = await giftWrapService.loadContacts(familyMember.id);
      setContacts(loadedContacts);
    } catch (error) {
      console.error('Failed to load contacts:', error);
      setError('Failed to load contacts');
      showToast.error('Failed to load contacts', { title: 'Communications Error', duration: 0 });
    }
  };

  const sendGiftwrappedMessage = async () => {
    if (!newMessage.trim() || !recipient) {
      setError('Please enter both a recipient and message');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔐 GiftwrappedMessaging: Using hybrid signing approach for message sending');

      const { GiftwrappedCommunicationService } = await import('../../lib/giftwrapped-communication-service');
      const giftWrapService = new GiftwrappedCommunicationService();

      // Use sendGiftwrappedMessage which goes through hybrid signing
      const result = await giftWrapService.sendGiftwrappedMessage({
        content: newMessage,
        sender: familyMember.npub,
        recipient: recipient,
        encryptionLevel: selectedPrivacyLevel,
        communicationType: isGroupMessage ? 'family' : 'individual'
      });

      if (result.success) {
        // Optionally push to local history display if desired
        setHistory(prev => [{
          id: result.messageId || 'temp-' + Date.now(),
          sender_hash: familyMember.npub.substring(0, 16) + '...',
          recipient_hash: recipient.substring(0, 16) + '...',
          created_at: new Date().toISOString(),
          encryption_level: selectedPrivacyLevel,
          communication_type: isGroupMessage ? 'family' : 'individual',
          message_type: isGroupMessage ? 'group' : 'direct',
          status: 'sent',
        }, ...prev]);

        setNewMessage('');
        setRecipient('');
        showToast.success(`Message sent successfully using ${result.deliveryMethod || 'hybrid signing'}`, {
          title: '🔐 Secure Message Sent',
          duration: 4000
        });

        // Reload message history
        loadHistory();
      } else {
        throw new Error(result.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      setError(errorMessage);
      showToast.error(errorMessage, { title: 'Message Sending Error', duration: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  const addContact = async (contactData: Omit<Contact, 'id' | 'supportsGiftWrap'>) => {
    try {
      const { GiftwrappedCommunicationService } = await import('../../lib/giftwrapped-communication-service');
      const giftWrapService = new GiftwrappedCommunicationService();
      const result = await giftWrapService.addContact(contactData, familyMember.id);
      if (result.success && result.contact) {
        setContacts(prev => [...prev, result.contact]);
        showToast.success('Contact added to Communications', { title: 'Contact Added', duration: 3000 });
      }
    } catch (error) {
      console.error('Failed to add contact:', error);
      setError('Failed to add contact');
      showToast.error('Failed to add contact', { title: 'Contacts Error', duration: 0 });
    }
  };

  const handleContactSelect = (contact: Contact) => {
    setRecipient(contact.npub);
  };

  if (isModal) {
    // Modal-specific behaviors: body scroll lock + ESC to close
    useEffect(() => {
      document.body.classList.add('modal-open');
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose?.();
      };
      document.addEventListener('keydown', onKey);
      return () => {
        document.body.classList.remove('modal-open');
        document.removeEventListener('keydown', onKey);
      };
    }, []);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose?.();
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleBackdropClick} aria-modal="true" role="dialog">
        {/* Background Image with Overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url('/Nostr-Zapstorm.jpg')`,
          }}
        >
          {/* Gradient overlay with 50% reduced opacity */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/35 via-purple-800/30 to-purple-600/25"></div>
          {/* Additional overlay with 50% reduced opacity */}
          <div className="absolute inset-0 bg-black/10"></div>
        </div>

        {/* Modal Content */}
        <div className="relative z-10 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center space-x-2">
            {/* Invite Peers */}
            <button
              ref={inviteBtnRef}
              onClick={() => {
                if (!auth.sessionToken || !auth.user) {
                  showToast.error('You must be signed in to send invitations', { title: 'Authentication Required', duration: 5000 });
                  return;
                }
                setShowInviteModal(true);
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium"
            >
              Invite Peers
            </button>

            {/* Notifications */}
            <div className="relative" ref={notifDropdownRef}>
              <button
                onClick={() => setShowNotifDropdown((s) => !s)}
                className="relative p-2 rounded-lg hover:bg-gray-100"
                aria-label="Notifications"
              >
                <span className="sr-only">Notifications</span>
                <span>🔔</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] leading-none px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifDropdown && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  <div className="p-2 border-b border-gray-100 text-xs text-gray-500">Recent Notifications</div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 && (
                      <div className="p-3 text-xs text-gray-500">No notifications</div>
                    )}
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          NotificationService.getInstance().markAsRead(n.id);
                          setShowNotifDropdown(false);
                        }}
                        className={`w-full text-left p-3 border-b border-gray-50 hover:bg-gray-50 ${!n.isRead ? 'bg-purple-50/50' : ''}`}
                      >
                        <div className="text-xs font-medium text-gray-900 truncate">{n.title}</div>
                        <div className="text-[11px] text-gray-600 line-clamp-2">{n.content}</div>
                        <div className="text-[10px] text-gray-400 mt-1">{new Date(n.timestamp).toLocaleString()}</div>
                      </button>
                    ))}
                  </div>
                  <div className="p-2 flex justify-between">
                    <button
                      onClick={() => NotificationService.getInstance().markAllAsRead()}
                      className="text-xs text-gray-600 hover:text-gray-900"
                    >
                      Mark all as read
                    </button>
                    <button
                      onClick={() => setShowNotifDropdown(false)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Private Family Communications
            </h3>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-xs text-purple-200">End-to-End Encrypted</span>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={() => onClose?.()}
            className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
            aria-label="Close communications"
          >
            ✕
          </button>

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded-lg">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {/* Rest of the modal content will be added here */}
          <div className="text-white">
            <p>Communications interface will be implemented here...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center">
      <div className="w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Private Family Communications
          </h3>
          {/* Session Status Pill (top-right) */}
          <div className="flex items-center space-x-3">
            {/* Notifications envelope inside New Message block is handled below */}
            {(() => {
              const ms = remainingMs;
              const loading = sessionLoading;
              const active = sessionActive && ms > 0;
              const warn = active && ms <= 5 * 60 * 1000;
              const bg = loading
                ? 'bg-gray-200 text-gray-700'
                : !active
                  ? 'bg-red-100 text-red-700'
                  : warn
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-green-100 text-green-700';
              const label = loading
                ? 'Checking session…'
                : !active
                  ? 'No Session'
                  : `Session active: ${formatRemaining(ms)}`;
              return (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowRecoverySession(true)}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${bg}`}
                    title="Manage signing session"
                  >
                    {label}
                  </button>
                  <button
                    onClick={() => setShowSigningSetup(true)}
                    className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200"
                    title="Session settings"
                  >
                    Settings
                  </button>
                </div>
              );
            })()}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* New Message block */}
        <div className="mb-6 rounded-xl border border-purple-300 bg-purple-100/60 p-4 w-full md:w-8/12 mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-purple-900">New Message</h4>
            {/* Notifications envelope with unread badge */}
            <div className="relative" ref={notifDropdownRef}>
              <button
                onClick={() => setShowNotifDropdown((s) => !s)}
                className="relative p-2 rounded-lg hover:bg-purple-200/60"
                aria-label="Notifications"
              >
                <span className="sr-only">Notifications</span>
                {/* Envelope icon */}
                <svg className="w-5 h-5 text-purple-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] leading-none px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>
              {showNotifDropdown && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  <div className="p-2 border-b border-gray-100 text-xs text-gray-500">Recent Notifications</div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 && (
                      <div className="p-3 text-xs text-gray-500">No notifications</div>
                    )}
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          NotificationService.getInstance().markAsRead(n.id);
                          setShowNotifDropdown(false);
                        }}
                        className={`w-full text-left p-3 border-b border-gray-50 hover:bg-gray-50 ${!n.isRead ? 'bg-purple-50/50' : ''}`}
                      >
                        <div className="text-xs font-medium text-gray-900 truncate">{n.title}</div>
                        <div className="text-[11px] text-gray-600 line-clamp-2">{n.content}</div>
                        <div className="text-[10px] text-gray-400 mt-1">{new Date(n.timestamp).toLocaleString()}</div>
                      </button>
                    ))}
                  </div>
                  <div className="p-2 flex justify-between">
                    <button
                      onClick={() => NotificationService.getInstance().markAllAsRead()}
                      className="text-xs text-gray-600 hover:text-gray-900"
                    >
                      Mark all as read
                    </button>
                    <button
                      onClick={() => setShowNotifDropdown(false)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recipient and content inputs */}
          <div className="space-y-3">
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Recipient npub or select from contacts"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="flex-1 p-2 border border-purple-300 rounded-lg text-sm bg-white"
              />
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={isGroupMessage}
                  onChange={(e) => setIsGroupMessage(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-purple-900">Group</span>
              </label>
            </div>

            <div className="flex space-x-2 items-start">
              <textarea
                placeholder="Type your private message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!isLoading && newMessage.trim() && recipient) {
                      void sendGiftwrappedMessage();
                    }
                  }
                }}
                className="flex-1 p-2 border border-purple-300 rounded-lg text-sm resize-none bg-white"
                rows={2}
              />
              {/* Media buttons */}
              <div className="flex items-center space-x-2">
                {/* Paperclip */}
                <button
                  onClick={() => document.getElementById('gm-file-input')?.click()}
                  className="p-2 rounded-lg bg-purple-200/60 text-purple-900 hover:bg-purple-300/60"
                  title="Attach file"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79V7a5 5 0 00-10 0v10a3 3 0 006 0V8" />
                  </svg>
                </button>
                <input id="gm-file-input" type="file" multiple className="hidden" onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length) {
                    showToast.info(`${files.length} file(s) selected`, { title: 'Attachments' });
                  }
                }} />
                {/* Microphone */}
                <button
                  onClick={() => showToast.info('Voice recording UI coming next', { title: 'Voice Note' })}
                  className="p-2 rounded-lg bg-purple-200/60 text-purple-900 hover:bg-purple-300/60"
                  title="Record voice note"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v3m-4 0h8" />
                  </svg>
                </button>
                {/* Video */}
                <button
                  onClick={() => showToast.info('Video recorder UI coming next', { title: 'Video Message' })}
                  className="p-2 rounded-lg bg-purple-200/60 text-purple-900 hover:bg-purple-300/60"
                  title="Record video message"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-3 2H6a2 2 0 01-2-2V8a2 2 0 012-2h6a2 2 0 012 2v6z" />
                  </svg>
                </button>
              </div>
              <button
                onClick={sendGiftwrappedMessage}
                disabled={!newMessage.trim() || !recipient || isLoading}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {isLoading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>

        {/* Group Conversations block */}
        <div className="mb-6 rounded-xl border border-purple-300 bg-purple-100/60 p-4 w-full md:w-8/12 mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-purple-900">Group Conversations</h4>
            <button
              onClick={() => loadHistory()}
              className="text-xs text-purple-700 hover:text-purple-900"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {conversations.slice(0, 5).map((c) => (
              <div key={c.id} className="p-3 bg-white rounded-lg border border-purple-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-purple-900 truncate">{c.id.slice(0, 20)}…</div>
                  <div className="text-[11px] text-purple-700">{c.count} msgs</div>
                </div>
                <div className="text-[10px] text-purple-600">{c.lastCreatedAt ? new Date(c.lastCreatedAt).toLocaleString() : ''}</div>
              </div>
            ))}
          </div>
          {conversations.length > 5 && (
            <button className="mt-2 text-xs text-purple-700 hover:text-purple-900" onClick={() => showToast.info('Open Group Conversations', { title: 'Groups' })}>
              View all conversations
            </button>
          )}
        </div>

        {/* Contacts block */}
        <div className="mb-6 rounded-xl border border-purple-300 bg-purple-100/60 p-4 w-full md:w-8/12 mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-purple-900">Contacts</h4>
            <button
              onClick={loadContacts}
              className="text-xs text-purple-700 hover:text-purple-900"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {contacts.slice(0, 5).map((contact) => (
              <div key={contact.id} className="p-3 bg-white rounded-lg border border-purple-200 flex items-center justify-between">
                <div className="truncate">
                  <div className="text-sm font-medium text-purple-900 truncate">{contact.username}</div>
                  <div className="text-[11px] text-purple-600 truncate">{contact.npub}</div>
                </div>
                <div className="text-xs text-purple-700">{contact.trustLevel}</div>
              </div>
            ))}
          </div>
          {contacts.length > 5 && (
            <button className="mt-2 text-xs text-purple-700 hover:text-purple-900" onClick={() => showToast.info('Open Contacts Manager', { title: 'Contacts' })}>
              View all contacts
            </button>
          )}
        </div>

        {/* Message Histories block */}
        <div className="mb-6 rounded-xl border border-purple-300 bg-purple-100/60 p-4 w-full md:w-8/12 mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-purple-900">Message Histories</h4>
            <button
              disabled={!nextCursor || loadingHistory}
              onClick={() => nextCursor && loadHistory(nextCursor)}
              className="text-xs text-purple-700 hover:text-purple-900 disabled:opacity-50"
            >
              {loadingHistory ? 'Loading…' : (nextCursor ? 'Load older' : 'Up to date')}
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {history.slice(0, 5).map((m) => (
              <div key={m.id} className="p-3 bg-white rounded-lg border border-purple-200">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-sm text-purple-900">{m.sender_hash.slice(0, 8)}…</span>
                  <span className="text-[11px] text-purple-700">{new Date(m.created_at).toLocaleString()}</span>
                </div>
                <div className="flex items-center space-x-3 text-[11px] text-purple-700">
                  <span>
                    {m.encryption_level === 'maximum' ? '🔒 Gift Wrapped' : m.encryption_level === 'enhanced' ? '🛡️ Encrypted' : '👁️ Minimal'}
                  </span>
                  <span>{m.message_type === 'group' ? 'Group' : 'Direct'}</span>
                  <span>{m.status || 'sent'}</span>
                </div>
              </div>
            ))}
          </div>
          {history.length > 5 && (
            <button className="mt-2 text-xs text-purple-700 hover:text-purple-900" onClick={() => showToast.info('Open Full History', { title: 'History' })}>
              View full history
            </button>
          )}
        </div>

        {/* Recovery Session Modal (Create/Extend/Settings) */}
        {showRecoverySession && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowRecoverySession(false)}>
            <div className="bg-white rounded-lg p-4 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900">Signing Session</h4>
                <button onClick={() => setShowRecoverySession(false)} className="text-gray-500 hover:text-gray-700">✕</button>
              </div>

              {/* Session state */}
              <div className="mb-3">
                <div className="text-sm text-gray-700">
                  {sessionActive && remainingMs > 0 ? (
                    <>Active session — {formatRemaining(remainingMs)} remaining</>
                  ) : (
                    <>No active session</>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Active session = nsec available for signing without extra approvals. NIP-07 removes per-event approvals but requires the extension. Physical MFA is the most secure and always requires approvals.
                </div>
              </div>

              <div className="space-y-2">
                {/* Extend */}
                {sessionActive && remainingMs > 0 && (
                  <button
                    onClick={() => {
                      const ok = secureNsecManager.extendSession(5 * 60 * 1000);
                      if (ok) showToast.success('Session extended by 5 minutes', { title: 'Session' });
                      else showToast.error('Failed to extend session', { title: 'Session' });
                    }}
                    className="w-full px-3 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 text-sm"
                  >
                    Extend Session (+5 min)
                  </button>
                )}

                {/* Create new session */}
                {!sessionActive && (
                  <button
                    onClick={async () => {
                      try {
                        setCreatingSession(true);
                        // Try to fetch encrypted nsec + salt from server using cookie/session
                        const res = await fetch('/api/auth/session-user', {
                          method: 'GET',
                          credentials: 'include',
                          headers: { 'Accept': 'application/json' },
                        });
                        if (!res.ok) {
                          throw new Error(`Session lookup failed (${res.status})`);
                        }
                        const payload = await res.json();
                        const user = payload?.data?.user;
                        const enc = user?.encrypted_nsec;
                        const salt = user?.user_salt;
                        if (!enc || !salt) {
                          throw new Error('Missing encrypted credentials in session; please re-authenticate');
                        }
                        // Decrypt to bech32 nsec
                        const nsec = await NobleEncryption.decryptNsec(enc, String(salt));
                        // Initialize temporary signing session (bech32 accepted)
                        const session = await initializeNSECSessionAfterAuth(nsec, { duration: 15 * 60 * 1000 });
                        if (!session) throw new Error('Failed to create signing session');
                        showToast.success('New signing session started', { title: 'Session', duration: 3500 });
                        setShowRecoverySession(false);
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Failed to start session';
                        showToast.error(msg, { title: 'Session', duration: 5000 });
                      } finally {
                        setCreatingSession(false);
                      }
                    }}
                    disabled={creatingSession}
                    className="w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                  >
                    {creatingSession ? 'Starting…' : 'Start New Session'}
                  </button>
                )}

                {/* Preferences / settings */}
                <button
                  onClick={() => {
                    setShowRecoverySession(false);
                    setShowSigningSetup(true);
                  }}
                  className="w-full px-3 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 text-sm"
                >
                  Session Security Settings
                </button>
              </div>
            </div>
          </div>
        )}


        {showInviteModal && auth.sessionToken && auth.user && (
          <SecurePeerInvitationModal
            isOpen={showInviteModal}
            onClose={() => {
              setShowInviteModal(false);
              inviteBtnRef.current?.focus();
            }}
            sessionInfo={{
              sessionToken: auth.sessionToken,
              user: {
                npub: auth.user.hashed_npub || familyMember.npub,
                nip05: undefined,
                authMethod: 'nip07',
                federationRole: 'adult'
              }
            }}
          />
        )}

        {/* Signing Method Setup Wizard */}
        {showSigningSetup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowSigningSetup(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Message Signing Preferences</h3>
                <button
                  onClick={() => setShowSigningSetup(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  Choose your preferred method for signing messages:
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => {
                      console.log('🔐 Selected session-based signing');
                      setShowSigningSetup(false);
                      showToast.success('Session-based signing configured', { title: 'Success', duration: 3000 });
                    }}
                    className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="font-medium text-gray-900">Session-Based Signing</div>
                    <div className="text-xs text-gray-500">Convenient and secure for authenticated users</div>
                  </button>

                  <button
                    onClick={() => {
                      console.log('🔐 Selected NIP-07 signing');
                      setShowSigningSetup(false);
                      showToast.success('NIP-07 signing configured', { title: 'Success', duration: 3000 });
                    }}
                    className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="font-medium text-gray-900">NIP-07 Browser Extension</div>
                    <div className="text-xs text-gray-500">Maximum security with browser extension</div>
                  </button>
                </div>

                <div className="text-xs text-gray-500 mt-4">
                  You can change this setting anytime by clicking the settings icon.
                </div>
              </div>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}