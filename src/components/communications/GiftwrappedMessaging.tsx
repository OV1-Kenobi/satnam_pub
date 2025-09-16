// src/components/communications/GiftwrappedMessaging.tsx - KEEP EXISTING NAME
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GroupData } from '../../../api/endpoints/communications';
import { addGroupMember, blockSender as blockSenderAPI, createGroup, createGroupTopic, deleteMessage as deleteMessageAPI, getGroupDetails, leaveGroup, listUserGroups, removeGroupMember, updateGroupPreferences } from '../../../api/endpoints/communications';
import { central_event_publishing_service as CEPS } from '../../../lib/central_event_publishing_service';
import { usePrivacyFirstMessaging } from '../../hooks/usePrivacyFirstMessaging';
import { nostrProfileService } from '../../lib/nostr-profile-service';
import { ErrorBoundary } from '../ErrorBoundary';

import type { NostrProfile } from '../../lib/nostr-profile-service';


import { sendMeetingInvite } from '../../lib/communications/meeting-invites';
import { showTimeoutError } from '../../lib/utils/error-messages';
import { DashboardNotification, NotificationService } from '../../services/notificationService';
import { showToast } from '../../services/toastService';
import { useAuth } from '../auth/AuthProvider';
import { SecurePeerInvitationModal } from '../SecurePeerInvitationModal';
import { PeerInvitationModal } from './PeerInvitationModal';
import { VideoMeetingLauncher } from './VideoMeetingLauncher';

import fetchWithAuth from '../../lib/auth/fetch-with-auth';









interface FamilyMember {
  id: string;
  npub: string;
  username: string;
  role: 'adult' | 'offspring' | 'guardian' | 'steward';
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
  nip05?: string;
  avatarUrl?: string;
  displayName?: string;
}
interface Conversation {
  id: string;
  count: number;
  lastCreatedAt: string | null;
  // Optional metadata if backend provides it
  name?: string;
  title?: string;
  avatar_url?: string;
  participants?: number;
  participant_count?: number;
  encryption_level?: 'maximum' | 'enhanced' | 'standard' | string;
  status?: string;
  role?: 'owner' | 'admin' | 'member' | string;
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
  const [subject, setSubject] = useState('');

  const [recipient, setRecipient] = useState('');
  const [isGroupMessage, setIsGroupMessage] = useState(false);
  const [useStandardDm, setUseStandardDm] = useState(false);

  // Groups data (real group listing)
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [showProtocolHelp, setShowProtocolHelp] = useState(false);
  const [bitchatEnabled, setBitchatEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('SATNAM_BITCHAT') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('SATNAM_BITCHAT', bitchatEnabled ? '1' : '0'); } catch { }
  }, [bitchatEnabled]);

  const [groupsError, setGroupsError] = useState<string | null>(null);

  const loadGroups = async () => {
    try {
      setGroupsLoading(true);
      setGroupsError(null);
      const res = await listUserGroups();
      if (res.success) {
        setGroups(Array.isArray(res.data) ? res.data : []);
      } else {
        const msg = res.error || 'Failed to load groups';
        setGroupsError(msg);
        showTimeoutError('groups', msg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load groups';
      setGroupsError(msg);
      showTimeoutError('groups', e instanceof Error && e.name === 'TimeoutError' ? undefined : msg);
    } finally {
      setGroupsLoading(false);
    }
  };

  useEffect(() => {
    // Load groups on mount
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Create Group modal state
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [cgName, setCgName] = useState('');
  const [cgType, setCgType] = useState<'family' | 'business' | 'friends' | 'advisors'>('friends');
  const [cgEnc, setCgEnc] = useState<'gift-wrap' | 'nip04'>('gift-wrap');
  const [cgLoading, setCgLoading] = useState(false);
  const [cgError, setCgError] = useState<string | null>(null);

  const onSubmitCreateGroup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = cgName.trim();
    if (!trimmedName) {
      setCgError('Name is required');
      return;
    }
    if (trimmedName.length > 100) {
      setCgError('Name must be less than 100 characters');
      return;
    }
    if (!/^[\w\s-]+$/.test(trimmedName)) {
      setCgError('Name can only contain letters, numbers, spaces, and hyphens');
      return;
    }
    try {
      setCgLoading(true);
      setCgError(null);
      const res = await createGroup(trimmedName, cgType, cgEnc);
      if (res.success) {
        setShowCreateGroupModal(false);
        setCgName('');
        showToast.success('Group created');
        loadGroups();
      } else {
        setCgError(res.error || 'Failed to create group');
      }
    } catch (err) {
      setCgError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setCgLoading(false);
    }
  };  // Member management modals state
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberGroupId, setAddMemberGroupId] = useState<string | null>(null);
  const [addMemberHash, setAddMemberHash] = useState('');
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  const [showRemoveMemberModal, setShowRemoveMemberModal] = useState(false);
  const [removeMemberGroupId, setRemoveMemberGroupId] = useState<string | null>(null);
  const [removeMemberHash, setRemoveMemberHash] = useState<string | null>(null);
  const [removeMemberLoading, setRemoveMemberLoading] = useState(false);

  // Topic creation modal state
  const [showCreateTopicModal, setShowCreateTopicModal] = useState(false);
  const [createTopicGroupId, setCreateTopicGroupId] = useState<string | null>(null);
  const [topicName, setTopicName] = useState('');
  const [topicDesc, setTopicDesc] = useState('');
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);

  // Confirmation modals: block sender, delete message, leave group
  const [showBlockSenderModal, setShowBlockSenderModal] = useState(false);
  const [blockSenderId, setBlockSenderId] = useState<string | null>(null);
  const [blockSenderLoading, setBlockSenderLoading] = useState(false);
  const [blockSenderError, setBlockSenderError] = useState<string | null>(null);

  const [showDeleteMessageModal, setShowDeleteMessageModal] = useState(false);
  const [deleteTargetMsg, setDeleteTargetMsg] = useState<UnifiedMsg | null>(null);
  const [deleteMessageLoading, setDeleteMessageLoading] = useState(false);
  const [deleteMessageError, setDeleteMessageError] = useState<string | null>(null);

  const [showLeaveGroupModal, setShowLeaveGroupModal] = useState(false);
  const [leaveGroupId, setLeaveGroupId] = useState<string | null>(null);
  const [leaveGroupName, setLeaveGroupName] = useState<string | null>(null);
  const [leaveGroupLoading, setLeaveGroupLoading] = useState(false);
  const [leaveGroupError, setLeaveGroupError] = useState<string | null>(null);

  // Add Member modal contact selection
  const [addMemberSelectedNpub, setAddMemberSelectedNpub] = useState<string>('');



  const [selectedPrivacyLevel] = useState<'standard' | 'enhanced' | 'maximum'>('maximum');
  const auth = useAuth();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSigningSetup, setShowSigningSetup] = useState(false);
  const inviteBtnRef = useRef<HTMLButtonElement | null>(null);

  const [showPeerInvitationModal, setShowPeerInvitationModal] = useState(false);

  // Notifications
  const notificationService = NotificationService.getInstance();
  // Persistent message history state
  const [history, setHistory] = useState<MessageHistoryItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // NIP-59 incoming subscription via messaging hook
  const messaging = usePrivacyFirstMessaging();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const incomingSorted = useMemo(() => {
    return [...(messaging.incomingMessages || [])].sort(
      (a: any, b: any) => (b?.created_at || 0) - (a?.created_at || 0)
    );
  }, [messaging.incomingMessages]);

  useEffect(() => {
    const isDebug = () => {
      try {
        // Enable via console: localStorage.setItem('SATNAM_DEBUG_COMM','1') or window.__SATNAM_DEBUG_COMM = true
        return (
          (typeof window !== 'undefined' && (window as any).__SATNAM_DEBUG_COMM === true) ||
          (typeof window !== 'undefined' && window.localStorage?.getItem('SATNAM_DEBUG_COMM') === '1')
        );
      } catch { return false; }
    };

    if (!messaging.messageSubscription) {
      if (isDebug()) console.log('[Comm] startMessageSubscription() trigger (sessionId=%s)', messaging.sessionId);
      void messaging.startMessageSubscription();
    }

    // Cleanup only on unmount or when sessionId changes, not on every re-render
    return () => {
      if (isDebug()) console.log('[Comm] stopMessageSubscription() cleanup (sessionId=%s)', messaging.sessionId);
      try {
        messaging.stopMessageSubscription();
      } catch (error) {
        console.error('Failed to stop message subscription:', error);
      }
    };
  }, [messaging.sessionId]);
  // Thread and filtering state
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [blockedSenders, setBlockedSenders] = useState<Set<string>>(new Set());
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  type UnifiedMsg = {
    id: string;
    source: 'server' | 'nip59';
    created_at: number; // seconds epoch for nip59, ISO->ms normalized for server
    senderId?: string; // hex pubkey for nip59
    content?: string;
    protocol?: string; // 'nip59' | 'nip04' | ... from server
    server: MessageHistoryItem | null;
    nip59?: any; // inner Nostr event
    serverConversationId?: string;
  };
  // Helper: build server-backed threads map by conversation id
  const buildServerThreads = (
    historyList: MessageHistoryItem[],
    hidden: Set<string>
  ): Map<string, UnifiedMsg[]> => {
    const map = new Map<string, UnifiedMsg[]>();
    for (const m of historyList) {
      const convId = `${m.sender_hash}:${m.recipient_hash}`;
      const t: UnifiedMsg = {
        id: m.id,
        source: "server",
        created_at: Date.parse(m.created_at) / 1000,
        protocol: (m as any).protocol,
        server: m,
        serverConversationId: convId,
      };
      if (!hidden.has(m.id)) {
        if (!map.has(convId)) map.set(convId, []);
        map.get(convId)!.push(t);
      }
    }
    return map;
  };

  // Helper: build NIP-59 threads map keyed by synthetic sender conversation id
  const buildNip59Threads = (
    events: any[],
    hidden: Set<string>,
    blocked: Set<string>
  ): Map<string, UnifiedMsg[]> => {
    const map = new Map<string, UnifiedMsg[]>();
    for (const ev of events) {
      const senderHex = typeof (ev as any)?.pubkey === "string" ? (ev as any).pubkey : "unknown";
      if (blocked.has(senderHex)) continue;
      const convId = `nip59:${senderHex}`;
      const t: UnifiedMsg = {
        id: (ev as any).id,
        source: "nip59",
        created_at: (ev as any).created_at || Math.floor(Date.now() / 1000),
        senderId: senderHex,
        content: (ev as any).content,
        protocol: "nip59",
        server: null,
        nip59: ev,
      };
      if (!hidden.has(t.id)) {
        if (!map.has(convId)) map.set(convId, []);
        map.get(convId)!.push(t);
      }
    }
    return map;
  };

  // Helper: merge two maps and produce sorted thread list
  const mergeAndSortThreads = (
    serverMap: Map<string, UnifiedMsg[]>,
    nip59Map: Map<string, UnifiedMsg[]>,
    read: Set<string>
  ) => {
    const byConv = new Map<string, UnifiedMsg[]>();
    for (const [k, v] of serverMap.entries()) byConv.set(k, v.slice());
    for (const [k, v] of nip59Map.entries()) {
      const arr = byConv.get(k) || [];
      arr.push(...v);
      byConv.set(k, arr);
    }
    const threads = Array.from(byConv.entries()).map(([id, items]) => {
      const sorted = items.sort((a, b) => b.created_at - a.created_at);
      const unreadCount = sorted.filter((m) => !read.has(m.id)).length;
      const isServerThread = !id.startsWith("nip59:");
      const title = isServerThread ? id.slice(0, 20) + "…" : `${id.slice(6, 14)}…`;
      return {
        id,
        items: sorted,
        unreadCount,
        isServerThread,
        title,
        lastCreatedAt: sorted[0]?.created_at || 0,
      };
    });
    threads.sort((a, b) => b.lastCreatedAt - a.lastCreatedAt);
    return threads;
  };


  const unifiedThreads = useMemo(() => {
    const serverMap = buildServerThreads(history, hiddenIds);
    const nip59Map = buildNip59Threads(incomingSorted as any[], hiddenIds, blockedSenders);
    return mergeAndSortThreads(serverMap, nip59Map, readIds);
  }, [history, incomingSorted, hiddenIds, readIds, blockedSenders]);



  const markThreadAsRead = async (threadId: string) => {
    try {
      const thread = unifiedThreads.find(t => t.id === threadId);
      if (!thread) return;
      // Update local first
      const ids = thread.items.map(m => m.id);
      setReadIds((prev) => {
        const next = new Set(prev);
        ids.forEach(id => next.add(id));
        return next;
      });
      // Server update only for server threads
      if (thread.isServerThread && thread.items.some(i => i.server)) {
        const upTo = new Date((thread.items[0].created_at || 0) * 1000).toISOString();
        const res = await fetch(`/api/communications/unread`, {
          method: 'POST',
          headers: auth.sessionToken ? { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.sessionToken}` } : { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: thread.items[0].serverConversationId, upToCreatedAt: upTo }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
      }
      showToast.success('Thread marked as read');
    } catch (e) {
      showToast.error(e instanceof Error ? e.message : 'Failed to mark thread as read', { title: 'Unread update' });
    }
  };

  const deleteMessage = async (m: UnifiedMsg) => {
    try {
      // Optimistic local hide
      setHiddenIds(prev => new Set(prev).add(m.id));
      if (m.source === 'server' && m.server?.id) {
        const resp = await deleteMessageAPI(m.server.id);
        if (!resp.success) {
          throw new Error(resp.error || 'Delete not supported');
        }
      } else {
        // nip59 inner: not persisted, local only
      }
      showToast.success('Message deleted');
    } catch (e) {
      showToast.warning(e instanceof Error ? e.message : 'Delete failed', { title: 'Delete message' });
    }
  };

  const blockSender = (m: UnifiedMsg) => {
    const sender = m.senderId;
    if (!sender) { showToast.info('Sender unknown for this message'); return; }
    setBlockSenderId(sender);
    setBlockSenderError(null);
    setShowBlockSenderModal(true);
  };

  const confirmBlockSender = async () => {
    if (!blockSenderId) return;
    try {
      setBlockSenderLoading(true);
      setBlockedSenders(prev => new Set(prev).add(blockSenderId));
      const resp = await blockSenderAPI(blockSenderId);
      if (!resp.success) throw new Error(resp.error || 'Block not supported');
      showToast.success('Sender blocked');
      setShowBlockSenderModal(false);
      setBlockSenderId(null);
    } catch (e) {
      setBlockSenderError(e instanceof Error ? e.message : 'Block failed');
      showToast.warning(e instanceof Error ? e.message : 'Block failed', { title: 'Block sender' });
    } finally {
      setBlockSenderLoading(false);
    }
  };



  const onRequestDeleteMessage = (m: UnifiedMsg) => {
    setDeleteTargetMsg(m);
    setDeleteMessageError(null);
    setShowDeleteMessageModal(true);
  };

  const confirmDeleteMessage = async () => {
    if (!deleteTargetMsg) return;
    try {
      setDeleteMessageLoading(true);
      await deleteMessage(deleteTargetMsg);
      setShowDeleteMessageModal(false);
      setDeleteTargetMsg(null);
    } catch (e) {
      setDeleteMessageError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteMessageLoading(false);
    }
  };


  const loadHistory = async (cursor?: string) => {
    setLoadingHistory(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      params.set('limit', '30');
      const res = await fetch(`/api/communications/messages?${params.toString()}`, {
        headers: auth.sessionToken ? { Authorization: `Bearer ${auth.sessionToken}` } : undefined,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load messages');

      setHistory((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setConversations(data.conversations || []);
      setNextCursor(data.nextCursor || null);
    } catch (err) {
      console.error('Failed to load message history:', err);
      const isAbort = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
      if (isAbort) {
        showTimeoutError('messaging');
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to load message history';
        showTimeoutError('messaging', msg);
      }
    } finally {
      window.clearTimeout(timeoutId);
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

      const timeoutMs = 8000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = window.setTimeout(() => {
          window.clearTimeout(id);
          reject(new Error('Contacts request timed out'));
        }, timeoutMs);
      });

      const loadedContacts = await Promise.race([
        giftWrapService.loadContacts(familyMember.id),
        timeoutPromise,
      ]);
      setContacts(loadedContacts as any);
    } catch (error) {
      console.error('Failed to load contacts:', error);
      const msg = error instanceof Error ? error.message : 'Failed to load contacts';
      setError(msg);
      showTimeoutError('contacts', error instanceof Error && error.name === 'TimeoutError' ? undefined : msg);
    }
  };


  // Contacts map for quick lookup
  const contactsByNpub = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.npub, c);
    return m;
  }, [contacts]);

  // Nostr profile cache (fetched from relays via nostrProfileService)
  const [profiles, setProfiles] = useState<Record<string, NostrProfile>>({});

  // Prefetch Nostr profiles for NIP-59 threads when no contact match exists
  useEffect(() => {
    const seen = new Set<string>();
    for (const thread of unifiedThreads) {
      if (thread.isServerThread) continue;
      const first = thread.items.find((i) => i.senderId);
      let pubHex: string | null = null;
      try {
        pubHex = first && first.senderId ? String(first.senderId) : null;
      } catch {
        pubHex = null;
      }
      if (!pubHex) continue;
      let npub: string;
      try {
        npub = pubHex.startsWith("npub1") ? pubHex : CEPS.encodeNpub(pubHex);
      } catch {
        continue;
      }
      if (seen.has(npub) || profiles[npub]) continue;
      seen.add(npub);
      void nostrProfileService.fetchProfileWithDebounce(npub).then((p) => {
        if (p) {
          setProfiles((prev: Record<string, NostrProfile>) => (prev[npub] ? prev : { ...prev, [npub]: p }));
        }
      });
    }
  }, [unifiedThreads, profiles]);

  // Render thread header with contact/profile info
  const getThreadHeaderContent = (thread: { id: string; isServerThread: boolean; title: string; items: UnifiedMsg[]; }) => {
    if (thread.isServerThread) {
      return (
        <span className="text-sm font-medium text-purple-900 truncate max-w-[200px]">{thread.title}</span>
      );
    }
    let npub: string | null = null;
    try {
      const first = thread.items.find(i => i.senderId);
      npub = first && first.senderId ? CEPS.encodeNpub(first.senderId) : null;
    } catch {
      npub = null;
    }
    const contact = npub ? contactsByNpub.get(npub) : undefined;
    const prof = npub ? profiles[npub] : undefined;
    const display = (contact && (contact.nip05 || contact.username))
      || (prof && (prof.nip05 || prof.displayName || prof.name))
      || (npub ? `${npub.slice(0, 12)}…` : thread.title);
    const avatar = (contact && contact.avatarUrl) || (prof && prof.picture) || null;

    return (
      <div className="flex items-center gap-2">
        {avatar ? <img src={String(avatar)} alt="avatar" className="w-5 h-5 rounded-full object-cover" /> : null}
        <span className="text-sm font-medium text-purple-900 truncate max-w-[200px]">{display}</span>
        {!contact && npub ? (
          <button
            onClick={(e) => { e.stopPropagation(); setRecipient(npub!); showToast.info('Recipient set. Use Contacts to add them.'); }}
            className="text-[11px] text-purple-700 hover:text-purple-900"
            aria-label="Add to contacts"
            title="Add to contacts"
          >
            Add
          </button>
        ) : null}
      </div>
    );
  };
  // Compact timestamp formatter: today -> 12:34p, this year -> Aug 27, older -> 2023
  const formatCompactTimestamp = (input: string | number | Date): string => {
    const d = new Date(input);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) {
      let h = d.getHours();
      const m = d.getMinutes();
      const ap = h >= 12 ? 'p' : 'a';
      h = h % 12; if (h === 0) h = 12;
      const mm = m < 10 ? `0${m}` : String(m);
      return `${h}:${mm}${ap}`;
    }
    if (d.getFullYear() === now.getFullYear()) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[d.getMonth()]} ${d.getDate()}`;
    }
    return String(d.getFullYear());
  };

  // Group helpers (real group data)
  const getGroupHeaderContent = (g: GroupData) => {
    const name = g.name || (g.id ? `Group ${g.id.slice(0, 8)}…` : 'Group');
    const avatar = g.avatar_url || null;
    const members = g.member_count;
    const last = g.lastActivity ? formatCompactTimestamp(g.lastActivity) : null;
    const enc = g.encryption_type;
    const encTag = enc === 'gift-wrap' ? '🔒 Sealed' : enc === 'nip04' ? '🛡️ NIP-04' : null;
    const role = g.role;

    return (
      <div className="flex items-center gap-2">
        {avatar ? (
          <img src={String(avatar)} alt="group avatar" className="w-5 h-5 rounded-full object-cover" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-purple-200 text-[11px] flex items-center justify-center" aria-hidden>
            👥
          </div>
        )}
        <span className="text-sm font-medium text-purple-900 truncate max-w-[200px]">{name}</span>
        {typeof members === 'number' ? (
          <span className="text-[11px] text-purple-700">{members} members</span>
        ) : null}
        {encTag ? <span className="text-[11px] text-purple-700">{encTag}</span> : null}
        {role ? <span className="text-[10px] px-1 py-[1px] rounded bg-purple-200 text-purple-800">{role}</span> : null}
        {last ? <span className="text-[10px] text-purple-600 ml-1">{last}</span> : null}
      </div>
    );
  };

  // Admin group details state
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [groupMembers, setGroupMembers] = useState<Record<string, any[]>>({});
  const [groupTopics, setGroupTopics] = useState<Record<string, any[]>>({});
  const [groupDetailsLoading, setGroupDetailsLoading] = useState<Record<string, boolean>>({});
  const [groupDetailsError, setGroupDetailsError] = useState<Record<string, string | null>>({});
  const [groupMembersMeta, setGroupMembersMeta] = useState<Record<string, { page: number; pageSize: number; total: number; hasMore: boolean }>>({});
  const [groupTopicsMeta, setGroupTopicsMeta] = useState<Record<string, { page: number; pageSize: number; total: number; hasMore: boolean }>>({});
  const [groupMembersLoadingMore, setGroupMembersLoadingMore] = useState<Record<string, boolean>>({});
  const [groupTopicsLoadingMore, setGroupTopicsLoadingMore] = useState<Record<string, boolean>>({});

  const toggleGroupDetails = async (g: GroupData) => {
    const role = (g.role || '').toLowerCase();
    const isAdmin = role === 'owner' || role === 'admin';
    if (!isAdmin) return;
    setExpandedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
      return next;
    });
    if (!groupMembers[g.id] && !groupDetailsLoading[g.id]) {
      setGroupDetailsLoading(s => ({ ...s, [g.id]: true }));
      const res = await getGroupDetails(g.id, 1, 100);
      if (res.success) {
        setGroupMembers(s => ({ ...s, [g.id]: res.data?.members || [] }));
        setGroupTopics(s => ({ ...s, [g.id]: res.data?.topics || [] }));
        if (res.data?.membersMeta) setGroupMembersMeta(s => ({ ...s, [g.id]: res.data!.membersMeta }));
        if (res.data?.topicsMeta) setGroupTopicsMeta(s => ({ ...s, [g.id]: res.data!.topicsMeta }));
        setGroupDetailsError(s => ({ ...s, [g.id]: null }));
      } else {
        setGroupDetailsError(s => ({ ...s, [g.id]: res.error || 'Failed to load details' }));
      }
      setGroupDetailsLoading(s => ({ ...s, [g.id]: false }));
    }
  };
  const loadMoreMembers = async (g: GroupData) => {
    const meta = groupMembersMeta[g.id] || { page: 1, pageSize: 100, total: 0, hasMore: false };
    if (!meta.hasMore || groupMembersLoadingMore[g.id]) return;
    try {
      setGroupMembersLoadingMore(s => ({ ...s, [g.id]: true }));
      const nextPage = (meta.page || 1) + 1;
      const res = await getGroupDetails(g.id, nextPage, meta.pageSize || 100);
      if (res.success) {
        const newMembers = res.data?.members || [];
        setGroupMembers(s => ({ ...s, [g.id]: [...(s[g.id] || []), ...newMembers] }));
        if (res.data?.membersMeta) setGroupMembersMeta(s => ({ ...s, [g.id]: res.data!.membersMeta }));
        if (res.data?.topics && res.data?.topicsMeta) {
          // keep topics in sync if server returns them
          setGroupTopics(s => ({ ...s, [g.id]: res.data!.topics }));
          setGroupTopicsMeta(s => ({ ...s, [g.id]: res.data!.topicsMeta }));
        }
      } else {
        showTimeoutError('groups', res.error || 'Failed to load more members');
      }
    } finally {
      setGroupMembersLoadingMore(s => ({ ...s, [g.id]: false }));
    }
  };

  const loadMoreTopics = async (g: GroupData) => {
    const meta = groupTopicsMeta[g.id] || { page: 1, pageSize: 100, total: 0, hasMore: false };
    if (!meta.hasMore || groupTopicsLoadingMore[g.id]) return;
    try {
      setGroupTopicsLoadingMore(s => ({ ...s, [g.id]: true }));
      const nextPage = (meta.page || 1) + 1;
      const res = await getGroupDetails(g.id, nextPage, meta.pageSize || 100);
      if (res.success) {
        const newTopics = res.data?.topics || [];
        setGroupTopics(s => ({ ...s, [g.id]: [...(s[g.id] || []), ...newTopics] }));
        if (res.data?.topicsMeta) setGroupTopicsMeta(s => ({ ...s, [g.id]: res.data!.topicsMeta }));
        if (res.data?.members && res.data?.membersMeta) {
          // keep members in sync if server returns them
          setGroupMembers(s => ({ ...s, [g.id]: res.data!.members }));
          setGroupMembersMeta(s => ({ ...s, [g.id]: res.data!.membersMeta }));
        }
      } else {
        showTimeoutError('groups', res.error || 'Failed to load more topics');
      }
    } finally {
      setGroupTopicsLoadingMore(s => ({ ...s, [g.id]: false }));
    }
  };


  const onAddMember = (g: GroupData) => {
    const role = (g.role || '').toLowerCase();
    if (!(role === 'owner' || role === 'admin')) return;
    setAddMemberGroupId(g.id);
    setAddMemberHash('');
    setAddMemberError(null);
    setShowAddMemberModal(true);
  };

  const submitAddMember = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!addMemberGroupId) return;
    const hash = addMemberHash.trim();
    if (!hash) { setAddMemberError('Member hash is required'); return; }
    // Prevent duplicates
    const existing = (groupMembers[addMemberGroupId] || []).some((m: any) => String(m.member_hash) === hash);
    if (existing) { setAddMemberError('This member is already in the group'); return; }
    try {
      setAddMemberLoading(true);
      setAddMemberError(null);
      const res = await addGroupMember(addMemberGroupId, hash);
      if (res.success) {
        showToast.success('Member added');
        const ps = groupMembersMeta[addMemberGroupId]?.pageSize || 100;
        const det = await getGroupDetails(addMemberGroupId, 1, ps);
        if (det.success) {
          setGroupMembers(s => ({ ...s, [addMemberGroupId]: det.data?.members || [] }));
          setGroupTopics(s => ({ ...s, [addMemberGroupId]: det.data?.topics || [] }));
          if (det.data?.membersMeta) setGroupMembersMeta(s => ({ ...s, [addMemberGroupId]: det.data!.membersMeta }));
          if (det.data?.topicsMeta) setGroupTopicsMeta(s => ({ ...s, [addMemberGroupId]: det.data!.topicsMeta }));
        }
        setShowAddMemberModal(false);
        setAddMemberHash('');
      } else {
        setAddMemberError(res.error || 'Failed to add member');
      }
    } catch (err) {
      setAddMemberError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAddMemberLoading(false);
    }
  };

  const onRemoveMember = (g: GroupData, memberHash: string) => {
    const role = (g.role || '').toLowerCase();
    if (!(role === 'owner' || role === 'admin')) return;
    setRemoveMemberGroupId(g.id);
    setRemoveMemberHash(memberHash);
    setShowRemoveMemberModal(true);
  };

  const confirmRemoveMember = async () => {
    if (!removeMemberGroupId || !removeMemberHash) return;
    try {
      setRemoveMemberLoading(true);
      const res = await removeGroupMember(removeMemberGroupId, removeMemberHash);
      if (res.success) {
        showToast.success('Member removed');
        setGroupMembers(s => ({ ...s, [removeMemberGroupId]: (s[removeMemberGroupId] || []).filter((m: any) => m.member_hash !== removeMemberHash) }));
        setGroupMembersMeta(s => {
          const prev = s[removeMemberGroupId] || { page: 1, pageSize: 100, total: 0, hasMore: false };
          const total = Math.max(0, (prev.total || 0) - 1);
          const hasMore = total > (prev.page * prev.pageSize);
          return { ...s, [removeMemberGroupId]: { ...prev, total, hasMore } };
        });
        setShowRemoveMemberModal(false);
      } else {
        showTimeoutError('groups', res.error || 'Failed to remove member');
      }
    } finally {
      setRemoveMemberLoading(false);
    }
  };

  const onOpenCreateTopic = (g: GroupData) => {
    const role = (g.role || '').toLowerCase();
    if (!(role === 'owner' || role === 'admin')) return;
    setCreateTopicGroupId(g.id);
    setTopicName('');
    setTopicDesc('');
    setTopicError(null);
    setShowCreateTopicModal(true);
  };

  const submitCreateTopic = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!createTopicGroupId) return;
    if (!topicName.trim()) { setTopicError('Topic name is required'); return; }
    try {
      setTopicLoading(true);
      setTopicError(null);
      const res = await createGroupTopic(createTopicGroupId, topicName.trim(), topicDesc.trim() || null);
      if (res.success) {
        showToast.success('Topic created');
        const ps = groupTopicsMeta[createTopicGroupId]?.pageSize || 100;
        const det = await getGroupDetails(createTopicGroupId, 1, ps);
        if (det.success) {
          setGroupTopics(s => ({ ...s, [createTopicGroupId]: det.data?.topics || [] }));
          setGroupMembers(s => ({ ...s, [createTopicGroupId]: det.data?.members || [] }));
          if (det.data?.topicsMeta) setGroupTopicsMeta(s => ({ ...s, [createTopicGroupId]: det.data!.topicsMeta }));
          if (det.data?.membersMeta) setGroupMembersMeta(s => ({ ...s, [createTopicGroupId]: det.data!.membersMeta }));
        }
        setShowCreateTopicModal(false);
        setTopicName('');
        setTopicDesc('');
      } else {
        setTopicError(res.error || 'Failed to create topic');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create topic';
      setTopicError(msg);
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        showTimeoutError('groups');
      } else {
        showTimeoutError('groups', msg);
      }
    } finally {
      setTopicLoading(false);
    }
  };




  const onGroupViewMembers = (g: GroupData) => {
    showToast.info('Members list coming soon', { title: 'Groups' });
  };
  const onGroupMute = async (g: GroupData) => {
    const nextMuted = !g.muted;
    const res = await updateGroupPreferences(g.id, nextMuted);
    if (res.success) {
      showToast.success(nextMuted ? 'Group muted' : 'Group unmuted');
      loadGroups();
    } else {
      showToast.error(res.error || 'Failed to update preferences');
    }
  };
  const onGroupLeave = (g: GroupData) => {
    setLeaveGroupId(g.id);
    setLeaveGroupName(g.name);
    setLeaveGroupError(null);
    setShowLeaveGroupModal(true);
  };

  const confirmLeaveGroup = async () => {
    if (!leaveGroupId) return;
    try {
      setLeaveGroupLoading(true);
      const res = await leaveGroup(leaveGroupId);
      if (res.success) {
        showToast.success('Left group');
        setShowLeaveGroupModal(false);
        setLeaveGroupId(null);
        setLeaveGroupName(null);
        loadGroups();
      } else {
        setLeaveGroupError(res.error || 'Failed to leave group');
        showToast.error(res.error || 'Failed to leave group');
      }
    } finally {
      setLeaveGroupLoading(false);
    }
  };



  // Thread categorization for Contacts/Strangers/Groups tabs
  const [currentTab, setCurrentTab] = useState<'contacts' | 'strangers' | 'groups' | 'bitchat'>('contacts');

  const getThreadNpub = (thread: { isServerThread: boolean; items: UnifiedMsg[]; }): string | null => {
    if (thread.isServerThread) return null;
    const first = thread.items.find(i => i.senderId);
    if (first && first.senderId) {
      try { return CEPS.encodeNpub(first.senderId); } catch { return null; }
    }
    return null;
  };

  const isStrangerThread = (thread: { isServerThread: boolean; items: UnifiedMsg[]; }): boolean => {
    if (thread.isServerThread) return false; // treat server-backed threads as known
    const npub = getThreadNpub(thread);
    return !npub || !contactsByNpub.has(npub);
  };

  const contactThreads = useMemo(() => unifiedThreads.filter(t => !isStrangerThread(t)), [unifiedThreads, contactsByNpub]);
  const strangerThreads = useMemo(() => unifiedThreads.filter(t => isStrangerThread(t)), [unifiedThreads, contactsByNpub]);

  const contactsUnread = useMemo(() => contactThreads.reduce((a, t) => a + (t.unreadCount || 0), 0), [contactThreads]);
  const strangersUnread = useMemo(() => strangerThreads.reduce((a, t) => a + (t.unreadCount || 0), 0), [strangerThreads]);
  const groupsUnread = useMemo(() => {
    try {
      return (groups || []).reduce((acc: number, g: any) => {
        // Prefer numeric unread fields if present
        const numericCandidates = [g?.unread_count, g?.unread, g?.unreadMessages, g?.unread_messages];
        const numeric = numericCandidates.find((v: any) => typeof v === 'number' && Number.isFinite(v) && v > 0);
        if (typeof numeric === 'number') return acc + numeric;
        // Fallback to boolean flags (count 1 if any true)
        const boolCandidates = [g?.has_unread, g?.hasUnread];
        const has = boolCandidates.find((v: any) => typeof v === 'boolean');
        return acc + (has ? (has ? 1 : 0) : 0);
      }, 0);
    } catch {
      return 0;
    }
  }, [groups]);

  const filteredThreads = currentTab === 'contacts' ? contactThreads : currentTab === 'strangers' ? strangerThreads : [];


  const threadItems = useMemo(() => {
    return filteredThreads.map((thread) => {
      const isExpanded = expandedThreads.has(thread.id);
      const toggle = () => setExpandedThreads(prev => {
        const next = new Set(prev);
        if (next.has(thread.id)) next.delete(thread.id); else next.add(thread.id);
        return next;
      });
      return (
        <div key={thread.id} className="bg-white rounded-lg border border-purple-200">
          <button
            onClick={toggle}
            className="w-full px-3 py-2 flex items-center justify-between hover:bg-purple-50 focus:outline-none"
            aria-expanded={isExpanded}
            aria-controls={`thread-${thread.id}`}
          >
            <div className="flex items-center gap-2">
              {getThreadHeaderContent(thread)}
              {thread.unreadCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] text-[10px] px-1 bg-red-600 text-white rounded-full">
                  {thread.unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); void markThreadAsRead(thread.id); }}
                className="text-[11px] text-purple-700 hover:text-purple-900"
                aria-label="Mark thread as read"
              >
                Mark read
              </button>
              <svg className={`w-4 h-4 text-purple-700 ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.187l3.71-3.956a.75.75 0 111.08 1.04l-4.24 4.52a.75.75 0 01-1.08 0l-4.24-4.52a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </button>

          {isExpanded && (
            <div id={`thread-${thread.id}`} className="border-t border-purple-100">
              {thread.items.map((m) => {
                const createdAt = formatCompactTimestamp(m.created_at * 1000);
                const sender = m.senderId ? `${m.senderId.slice(0, 8)}…` : (m.server ? m.server.sender_hash.slice(0, 8) + '…' : 'unknown');
                const isUnread = !readIds.has(m.id);
                return (
                  <div key={m.id} className={`group p-3 flex flex-col gap-1 ${isUnread ? 'bg-purple-50/50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-purple-900">{sender}</span>
                        <span className="text-[11px] text-purple-700">{createdAt}</span>
                        {m.source === 'nip59' && (m as any)?.nip59?.sig && (
                          <span className="text-green-600" title="Verified signature">✅</span>
                        )}
                        {m.protocol === 'nip59' && (
                          <span className="text-purple-700" title="NIP-59 encrypted">🔒</span>
                        )}
                        {(((m as any)?.protocol === 'nip17') || (m.source === 'nip59' && !(m as any)?.nip59?.sig)) && (
                          <span
                            className="text-indigo-700 text-[11px] border border-indigo-300 rounded px-1 py-[1px]"
                            title="Unsigned inner event, sealed per NIP-17"
                          >
                            Sealed (NIP-17)
                          </span>
                        )}
                        {m.source === 'server' && !m.protocol && (
                          <span className="text-gray-500" title="Standard message">📝</span>
                        )}
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (m.senderId) { setRecipient(m.senderId); }
                            else { showToast.info('Recipient not available from server history'); }
                            setNewMessage(prev => prev?.startsWith('Re: ') ? prev : `Re: ${prev || ''}`);
                          }}
                          className="text-[11px] text-purple-700 hover:text-purple-900"
                          aria-label="Reply"
                        >Reply</button>
                        <button
                          onClick={() => {
                            const content = m.content || '';
                            setNewMessage(`Forwarded: ${content}`);
                            showToast.info('Select a recipient to forward');
                          }}
                          className="text-[11px] text-purple-700 hover:text-purple-900"
                          aria-label="Forward"
                        >Forward</button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void (async () => {
                              try {
                                let npub: string | null = null;
                                if (m.senderId) {
                                  try { npub = CEPS.encodeNpub(m.senderId); } catch { }
                                }
                                if (!npub) {
                                  showToast.info('Invite not available for this message');
                                  return;
                                }
                                const encoder = new TextEncoder();
                                const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${familyMember.npub}-${Date.now()}`));
                                const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
                                const roomId = `satnam-${hash.slice(0, 16)}`;
                                const res = await sendMeetingInvite({ hostNpub: familyMember.npub, inviteeNpub: npub, roomName: roomId, nip05: undefined });
                                if (res?.success) {
                                  showToast.success('Meeting invite sent', { title: 'Meeting' });
                                } else {
                                  throw new Error((res as any)?.error || 'Failed to send invite');
                                }
                              } catch (err) {
                                const msg = err instanceof Error ? err.message : 'Failed to send meeting invite';
                                showToast.error(msg, { title: 'Meeting' });
                              }
                            })();
                          }}
                          className="text-[11px] text-purple-700 hover:text-purple-900"
                          aria-label="Invite to meeting"
                        >Invite to meeting</button>

                        <button
                          onClick={() => onRequestDeleteMessage(m)}
                          className="text-[11px] text-purple-700 hover:text-purple-900"
                          aria-label="Delete"
                        >Delete</button>
                        {m.senderId && (
                          <button
                            onClick={() => void blockSender(m)}
                            className="text-[11px] text-purple-700 hover:text-purple-900"
                            aria-label="Block sender"
                          >Block</button>
                        )}
                      </div>
                    </div>
                    {/* Subject headline */}
                    {((m as any)?.server && (m as any).server.subject) ? (
                      <div className="text-[12px] font-semibold text-purple-900">
                        {(m as any).server.subject}
                      </div>
                    ) : (m.content ? (
                      <div className="text-[12px] font-semibold text-purple-900">
                        {String(m.content).split('\n')[0].slice(0, 80)}
                      </div>
                    ) : null)}

                    <div className="text-[12px] text-gray-800 whitespace-pre-wrap break-words">
                      {m.content ? m.content : m.server ? `${m.server.encryption_level === 'maximum' ? '🔒 Gift Wrapped' : m.server.encryption_level === 'enhanced' ? '🛡️ Encrypted' : '👁️ Minimal'} · ${m.server.message_type === 'group' ? 'Group' : 'Direct'} · ${m.server.status || 'sent'}` : '[no content]'}
                      {(m as any)?.server?.protocol && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-purple-200/70 text-purple-800 border border-purple-300">
                          {(m as any).server.protocol}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    });
  }, [filteredThreads, readIds, expandedThreads, markThreadAsRead, getThreadHeaderContent, onRequestDeleteMessage]);

  const sendGiftwrappedMessage = async () => {
    if (!newMessage.trim() || !recipient) {
      setError('Please enter both a recipient and message');
      return;
    }



    setIsLoading(true);
    setError(null);

    try {
      console.log('🔐 GiftwrappedMessaging: Using hybrid signing approach for message sending');

      // Prefix subject when provided so all clients see it clearly
      const contentToSend = subject.trim() ? `Subject: ${subject.trim()}\n\n${newMessage}` : newMessage;

      let result: { success: boolean; messageId?: string; deliveryMethod?: string; error?: string };

      if (useStandardDm && !isGroupMessage) {
        // Standard NIP-04 send (better compatibility with external clients)
        const deliveryId = await CEPS.sendStandardDirectMessage(recipient, contentToSend);
        // Persist a normalized record (protocol='nip04')
        try {
          await fetchWithAuth('/api/communications/giftwrapped', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: contentToSend,
              recipient,
              communicationType: 'individual',
              messageType: 'direct',
              encryptionLevel: 'standard',
              standardDm: true,
              protocol: 'nip04'
            }),
            timeoutMs: 15000
          });
        } catch (e) {
          console.warn('Standard DM persisted with warnings:', e);
        }
        result = { success: true, messageId: deliveryId, deliveryMethod: 'nip04' };
      } else {
        const { GiftwrappedCommunicationService } = await import('../../lib/giftwrapped-communication-service');
        const giftWrapService = new GiftwrappedCommunicationService();
        // Use sendGiftwrappedMessage which goes through hybrid signing
        result = await giftWrapService.sendGiftwrappedMessage({
          content: contentToSend,
          sender: familyMember.npub,
          recipient: recipient,
          encryptionLevel: selectedPrivacyLevel,
          communicationType: isGroupMessage ? 'family' : 'individual'
        });
      }

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
        setSubject('');
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
      const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      if (isTimeout) {
        showTimeoutError('messaging');
      } else {
        showTimeoutError('messaging', errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // addContact removed (unused)

  // handleContactSelect removed (unused)

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
            <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">
              1 credit each
            </span>

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
          <div className="flex items-center space-x-3">

            <button
              onClick={() => setShowSigningSetup(true)}
              className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 hover:bg-gray-200"
              title="Session settings"
            >
              Settings
            </button>



          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* New Message block */}
        <div className="mb-6 rounded-xl border border-purple-300 bg-purple-100/60 p-4 w-full md:w-8/12 mx-auto">
          <button
            onClick={() => setShowPeerInvitationModal(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium"
          >
            Invite Peers
          </button>
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">1 credit each</span>

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
            {/* Subject line */}
            <input
              type="text"
              placeholder="Subject (optional)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 p-2 border border-purple-300 rounded-lg text-sm bg-white mb-2"
            />

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

                {/* Protocol selector */}
                {!isGroupMessage && (
                  <label className="flex items-center gap-2 text-xs text-purple-900 mr-3">
                    <input
                      type="checkbox"
                      checked={useStandardDm}
                      onChange={(e) => setUseStandardDm(e.target.checked)}
                      className="rounded"
                    />
                    <span>Use standard messaging for external Nostr clients (NIP-04)</span>
                  </label>
                )}

                <button
                  onClick={() => showToast.info('Video recorder UI coming next', { title: 'Video Message' })}
                  className="p-2 rounded-lg bg-purple-200/60 text-purple-900 hover:bg-purple-300/60"
                  title="Record video message"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-3 2H6a2 2 0 01-2-2V8a2 2 0 012-2h6a2 2 0 012 2v6z" />
                  </svg>
                </button>
                {/* Live Meeting (Jitsi) */}
                <VideoMeetingLauncher
                  currentUser={{ npub: familyMember.npub, nip05: undefined }}
                  selectedContact={recipient && recipient.startsWith('npub1') ? { npub: recipient, displayName: (contactsByNpub.get(recipient)?.username) || `${recipient.slice(0, 12)}…` } : undefined}
                  buttonClassName="p-2 rounded-lg bg-purple-200/60 text-purple-900 hover:bg-purple-300/60"
                  iconClassName="w-4 h-4"
                />
                <button
                  onClick={() => setShowProtocolHelp((v) => !v)}
                  className="p-2 rounded-lg bg-purple-200/60 text-purple-900 hover:bg-purple-300/60"
                  title="Protocol order: NIP-17 → NIP-59 → NIP-44. Click for setup help."
                  aria-label="Messaging protocol help"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" />
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
            {showProtocolHelp && (
              <div className="mt-2 p-3 border border-purple-200 rounded-lg bg-purple-50/60 text-[12px] text-purple-900 space-y-2">
                <div className="font-medium">Delivery protocols: NIP-17 → NIP-59 → NIP-44 (fallback)</div>
                <div>
                  <div className="font-semibold">iOS (Damus)</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Open Damus → Settings → Relays (if supported for DMs/inbox)</li>
                    <li>Ensure inbox relays include: wss://relay.damus.io, wss://nos.lol, wss://relay.nostr.band, wss://auth.nostr1.com, wss://relay.0xchat.com</li>
                    <li>Publish your inbox relays (Kind 10050) so others can discover where to send NIP-17 DMs</li>
                    <li>If manual publish is needed: create Kind 10050 with r tags for each relay or content: {'{"inbox":["wss://relay.damus.io","wss://nos.lol","wss://relay.nostr.band","wss://auth.nostr1.com","wss://relay.0xchat.com"]}'}</li>
                  </ul>
                </div>
                <div>
                  <div className="font-semibold">Android (Amethyst)</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Open profile → ••• menu → "Edit Relays" or Settings → Relays</li>
                    <li>Include inbox relays: wss://relay.damus.io, wss://nos.lol, wss://relay.nostr.band, wss://auth.nostr1.com, wss://relay.0xchat.com (optionally wss://nostr.wine)</li>
                    <li>In Advanced/profile editing, enable "Publish Inbox Relays (Kind 10050)"</li>
                    <li>If manual publish is needed: create Kind 10050 with r tags for each relay or content: {'{"inbox":["wss://relay.damus.io","wss://nos.lol", ...]}'}</li>
                    <li>Save/sync and wait 10–30s for relay propagation</li>
                  </ul>
                </div>
                <div className="text-[12px] text-purple-900">
                  Alternative client: <span className="font-semibold">0xchat</span> supports private Nostr chat and PoW-enabled relays. Adding
                  <span className="font-mono"> wss://relay.0xchat.com </span> to your Kind 10050 relays can improve delivery.
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const template = `Hi! To receive sealed DMs from me, please publish your inbox relays (Kind 10050).\n\nFor iOS (Damus): Settings → Relays (if available). Add: wss://relay.damus.io, wss://nos.lol, wss://relay.nostr.band, wss://auth.nostr1.com, wss://relay.0xchat.com. Publish Kind 10050. If manual: Kind 10050 with r tags per relay or content: {"inbox":["wss://relay.damus.io","wss://nos.lol","wss://relay.nostr.band","wss://auth.nostr1.com","wss://relay.0xchat.com"]}.\n\nFor Android (Amethyst): Profile → ••• → Edit Relays or Settings → Relays. Add same relays (optionally wss://nostr.wine). Enable "Publish Inbox Relays (Kind 10050)". If manual: Kind 10050 with r tags or inbox JSON. Save and wait 10–30s.\n\nAlternative client: 0xchat supports private Nostr chat and PoW-enabled relays; adding wss://relay.0xchat.com to your Kind 10050 can improve delivery.`;
                      setNewMessage(prev => prev ? `${prev}\n\n${template}` : template);
                      try { await navigator.clipboard?.writeText(template); } catch { }
                    }}
                    className="px-2 py-1 bg-purple-200/80 hover:bg-purple-300/80 text-purple-900 rounded"
                  >
                    Copy Setup Message
                  </button>
                  <span className="text-[11px] text-purple-700">This will paste a help message into the input and copy it to your clipboard.</span>
                </div>
              </div>
            )}

          </div>
        </div>


        {/* Conversations (Unified Threads) - moved below Send Message */}
        <div className="mb-6 rounded-xl border border-purple-300 bg-purple-100/60 p-4 w-full md:w-8/12 mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-purple-900">Conversations</h4>
            <div className="flex gap-2">
              {nextCursor && (
                <button
                  disabled={loadingHistory}
                  onClick={() => nextCursor && loadHistory(nextCursor)}
                  className="text-xs text-purple-700 hover:text-purple-900 disabled:opacity-50"
                  aria-label="Load older"
                >
                  {loadingHistory ? 'Loading…' : 'Load older'}
                </button>
              )}
              <button
                onClick={() => void messaging.startMessageSubscription()}
                className="text-xs text-purple-700 hover:text-purple-900"
                aria-label="Refresh conversations"
              >
                Refresh
              </button>

              <label className="ml-3 flex items-center gap-1 text-[11px] text-purple-900">
                <input type="checkbox" className="rounded" checked={bitchatEnabled} onChange={(e) => setBitchatEnabled(e.target.checked)} />
                <span>Enable Bitchat</span>
              </label>

            </div>
          </div>
          {/* Conversations internal tabs (moved from top-right) */}
          <div className="flex items-center gap-2 mb-2" role="tablist" aria-label="Conversation categories">
            <button
              role="tab"
              aria-selected={currentTab === 'contacts'}
              onClick={() => setCurrentTab('contacts')}
              className={`px-2 py-1 rounded border text-xs ${currentTab === 'contacts' ? 'bg-white border-purple-300 text-purple-900' : 'bg-purple-200/60 border-transparent text-purple-800'}`}
            >
              Contacts{contactsUnread > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] text-[10px] px-1 bg-red-600 text-white rounded-full">{contactsUnread}</span>
              )}
            </button>
            <button
              role="tab"
              aria-selected={currentTab === 'groups'}
              onClick={() => setCurrentTab('groups')}
              className={`px-2 py-1 rounded border text-xs ${currentTab === 'groups' ? 'bg-white border-purple-300 text-purple-900' : 'bg-purple-200/60 border-transparent text-purple-800'}`}
            >
              Groups{groupsUnread > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] text-[10px] px-1 bg-red-600 text-white rounded-full">{groupsUnread}</span>
              )}
            </button>
            {bitchatEnabled && (
              <button
                role="tab"
                aria-selected={currentTab === 'bitchat'}
                onClick={() => setCurrentTab('bitchat')}
                className={`px-2 py-1 rounded border text-xs ${currentTab === 'bitchat' ? 'bg-white border-purple-300 text-purple-900' : 'bg-purple-200/60 border-transparent text-purple-800'}`}
              >
                Bitchat
              </button>
            )}
            <button
              role="tab"
              aria-selected={currentTab === 'strangers'}
              onClick={() => setCurrentTab('strangers')}
              className={`px-2 py-1 rounded border text-xs ${currentTab === 'strangers' ? 'bg-white border-purple-300 text-purple-900' : 'bg-purple-200/60 border-transparent text-purple-800'}`}
            >
              Strangers{strangersUnread > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] text-[10px] px-1 bg-red-600 text-white rounded-full">{strangersUnread}</span>
              )}
            </button>
          </div>


          <div className="space-y-2 max-h-96 overflow-y-auto">
            {currentTab === 'bitchat' ? (
              <div className="text-xs text-purple-900 space-y-2">
                <div className="font-medium">Bitchat</div>
                <div className="flex items-center gap-2">
                  <input type="text" placeholder="Enter geohash (e.g. 9q8yy)" className="border border-purple-300 rounded px-2 py-1 text-xs" />
                  <button className="text-xs bg-purple-600 text-white rounded px-2 py-1 hover:bg-purple-700">Connect</button>
                </div>
                <div className="text-[11px] text-purple-700">Public geo-rooms with minimal privacy. Use for discovery only.</div>
              </div>
            ) : currentTab === 'groups' ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-purple-800">Your Groups</div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => loadGroups()} className="text-xs text-purple-700 hover:text-purple-900" aria-label="Refresh groups">Refresh</button>
                    <button onClick={() => setShowCreateGroupModal(true)} className="text-xs text-white bg-purple-600 hover:bg-purple-700 rounded px-2 py-1" aria-label="Create group">Create Group</button>
                  </div>
                </div>
                {groupsLoading ? (
                  <div className="p-3 text-xs text-purple-700">Loading groups...</div>
                ) : groupsError ? (
                  <div className="p-3 text-xs text-red-600">{groupsError}</div>
                ) : groups.length === 0 ? (
                  <div className="p-3 text-xs text-purple-700">No groups yet</div>
                ) : (
                  groups.map((g) => (
                    <div key={g.id} className="group p-3 bg-white rounded-lg border border-purple-200">
                      <div className="flex items-center justify-between">
                        {getGroupHeaderContent(g)}
                        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-2">
                          <button onClick={() => onGroupViewMembers(g)} className="text-[11px] text-purple-700 hover:text-purple-900" aria-label="View members">Members</button>
                          <button onClick={() => onGroupMute(g)} className="text-[11px] text-purple-700 hover:text-purple-900" aria-label="Mute group">{g.muted ? 'Unmute' : 'Mute'}</button>
                          {(['owner', 'admin'].includes(String(g.role || '').toLowerCase())) && (
                            <button onClick={() => toggleGroupDetails(g)} className="text-[11px] text-purple-700 hover:text-purple-900" aria-label="Manage group">Details</button>
                          )}
                          <button onClick={() => onGroupLeave(g)} className="text-[11px] text-purple-700 hover:text-purple-900" aria-label="Leave group">Leave</button>
                        </div>
                      </div>
                      {expandedGroupIds.has(g.id) && (


                        <div className="mt-2 border-t border-purple-100 pt-2 text-[12px]">
                          {groupDetailsLoading[g.id] ? (
                            <div className="text-purple-700">Loading details…</div>
                          ) : groupDetailsError[g.id] ? (
                            <div className="text-red-600">{groupDetailsError[g.id]}</div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                {(() => {
                                  const shown = (groupTopics[g.id]?.length || 0);
                                  const total = groupTopicsMeta[g.id]?.total ?? shown;
                                  return (
                                    <div className="text-purple-900">Topics: Showing {shown} of {total}</div>
                                  );
                                })()}
                                <div className="flex items-center gap-2">
                                  <button onClick={() => onAddMember(g)} className="text-[11px] text-emerald-700 hover:text-emerald-900" aria-label="Add member">Add member</button>
                                  <button onClick={() => onOpenCreateTopic(g)} className="text-[11px] text-purple-700 hover:text-purple-900" aria-label="Create topic">Create topic</button>
                                </div>
                              </div>
                              {groupTopicsMeta[g.id]?.hasMore && (
                                <div className="mt-1">
                                  <button
                                    onClick={() => loadMoreTopics(g)}
                                    disabled={!!groupTopicsLoadingMore[g.id]}
                                    className="text-[11px] text-purple-700 hover:text-purple-900 disabled:opacity-50"
                                  >
                                    {groupTopicsLoadingMore[g.id] ? 'Loading…' : 'Load More Topics'}
                                  </button>
                                </div>
                              )}
                              <div className="mt-2">
                                {(() => {
                                  const shown = (groupMembers[g.id]?.length || 0);
                                  const total = groupMembersMeta[g.id]?.total ?? shown;
                                  return (
                                    <div className="text-purple-900 mb-1">Members (Showing {shown} of {total})</div>
                                  );
                                })()}
                                <ul className="space-y-1">
                                  {(groupMembers[g.id] || []).map((m: any) => (
                                    <li key={m.member_hash} className="flex items-center justify-between">
                                      <span className="text-gray-700">{m.member_hash}</span>
                                      {(['owner', 'admin'].includes(String(g.role || '').toLowerCase())) && (
                                        <button onClick={() => onRemoveMember(g, m.member_hash)} className="text-[11px] text-red-700 hover:text-red-900" aria-label="Remove member">Remove</button>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                                {groupMembersMeta[g.id]?.hasMore && (
                                  <div className="mt-1">
                                    <button
                                      onClick={() => loadMoreMembers(g)}
                                      disabled={!!groupMembersLoadingMore[g.id]}
                                      className="text-[11px] text-purple-700 hover:text-purple-900 disabled:opacity-50"
                                    >
                                      {groupMembersLoadingMore[g.id] ? 'Loading…' : 'Load More Members'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : (
              filteredThreads.length === 0 ? (
                <div className="p-3 text-xs text-purple-700">No conversations yet</div>
              ) : (
                threadItems
              )
            )}
          </div>
        </div>


        {/* Contacts block */}
        <ErrorBoundary>
          <div className="mb-6 rounded-xl border border-purple-300 bg-purple-100/60 p-4 w-full md:w-8/12 mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-purple-900">Contacts List</h4>
              <button
                onClick={loadContacts}
                className="text-xs text-purple-700 hover:text-purple-900"
              >
                Refresh
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {contacts.slice(0, 5).map((c) => {
                const avatar = (c as any).avatar || (c as any).picture || null;
                const nip05 = (c as any).nip05 || null;
                const display = (c as any).displayName || (c as any).username || nip05 || c.npub;
                const npubShort = c.npub?.slice(0, 12) + '…';
                return (
                  <div key={c.id} className="p-3 bg-white rounded-lg border border-purple-200 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {avatar ? (
                        <img src={String(avatar)} alt="avatar" className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-purple-200/70 text-[10px] text-purple-800 flex items-center justify-center">
                          {(String(display || '').charAt(0) || '?').toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-purple-900 truncate">{display}</div>
                        <div className="text-[11px] text-purple-600 truncate">{nip05 || npubShort}</div>
                      </div>
                    </div>
                    <div className="text-xs text-purple-700">{(c as any).trustLevel || ''}</div>
                  </div>
                );
              })}
            </div>
            {contacts.length > 5 && (
              <button className="mt-2 text-xs text-purple-700 hover:text-purple-900" onClick={() => showToast.info('Open Contacts Manager', { title: 'Contacts' })}>
                View all contacts
              </button>
            )}
          </div>
        </ErrorBoundary>


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

        {showPeerInvitationModal && (
          <PeerInvitationModal
            isOpen={showPeerInvitationModal}
            onClose={() => setShowPeerInvitationModal(false)}
            onSendInvitation={() => { }}
            senderProfile={{
              npub: auth.user?.hashed_npub || familyMember.npub,
            }}
          />
        )}



        {/* Add Member Modal */}
        {showAddMemberModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowAddMemberModal(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-member-title">
              <div className="flex items-center justify-between mb-4">
                <h3 id="add-member-title" className="text-lg font-semibold text-gray-900">Add Member</h3>
                <button onClick={() => setShowAddMemberModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <form onSubmit={submitAddMember} className="space-y-4">
                <div>
                  <label htmlFor="add-member-contact" className="block text-xs text-gray-600 mb-1">Select contact (optional)</label>
                  <select id="add-member-contact" value={addMemberSelectedNpub} onChange={(e) => setAddMemberSelectedNpub(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="">Choose a contact…</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.npub}>
                        {(c.displayName || (c as any).username || c.nip05 || c.npub)}
                      </option>
                    ))}
                  </select>
                  {addMemberSelectedNpub && (
                    <div className="mt-1 text-[11px] text-purple-600 truncate">npub: {addMemberSelectedNpub}</div>
                  )}
                </div>
                <div>
                  <label htmlFor="add-member-hash" className="block text-xs text-gray-600 mb-1">Member hash</label>
                  <input id="add-member-hash" type="text" value={addMemberHash} onChange={(e) => setAddMemberHash(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="hash..." />
                  <div className="mt-1 text-[11px] text-gray-500">Note: selecting a contact does not auto-fill the member hash. Ask the member for their group hash.</div>
                </div>
                {addMemberError && <div className="text-xs text-red-600">{addMemberError}</div>}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowAddMemberModal(false)} className="text-xs text-gray-700 hover:text-gray-900">Cancel</button>
                  <button type="submit" disabled={addMemberLoading} className="text-xs text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded px-3 py-1.5">
                    {addMemberLoading ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Remove Member Modal */}
        {showRemoveMemberModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowRemoveMemberModal(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="remove-member-title">
              <div className="flex items-center justify-between mb-4">
                <h3 id="remove-member-title" className="text-lg font-semibold text-gray-900">Remove Member</h3>
                <button onClick={() => setShowRemoveMemberModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="text-sm text-gray-800 mb-4">Are you sure you want to remove <span className="font-mono text-purple-700">{removeMemberHash}</span>?</div>



              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRemoveMemberModal(false)} className="text-xs text-gray-700 hover:text-gray-900">Cancel</button>
                <button type="button" onClick={() => void confirmRemoveMember()} disabled={removeMemberLoading} className="text-xs text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded px-3 py-1.5">{removeMemberLoading ? 'Removing…' : 'Remove'}</button>
              </div>
            </div>
          </div>
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


        {/* Create Group Modal */}
        {showCreateGroupModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCreateGroupModal(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="create-group-title">
              <div className="flex items-center justify-between mb-4">
                <h3 id="create-group-title" className="text-lg font-semibold text-gray-900">Create Group</h3>
                <button onClick={() => setShowCreateGroupModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <form onSubmit={onSubmitCreateGroup} className="space-y-4">
                <div>
                  <label htmlFor="cg-name" className="block text-xs text-gray-600 mb-1">Name</label>
                  <input id="cg-name" type="text" value={cgName} onChange={(e) => setCgName(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="e.g. Weekend Friends" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label htmlFor="cg-type" className="block text-xs text-gray-600 mb-1">Group type</label>
                    <select id="cg-type" value={cgType} onChange={(e) => setCgType(e.target.value as any)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                      <option value="family">family</option>
                      <option value="business">business</option>
                      <option value="friends">friends</option>
                      <option value="advisors">advisors</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label htmlFor="cg-enc" className="block text-xs text-gray-600 mb-1">Encryption</label>
                    <select id="cg-enc" value={cgEnc} onChange={(e) => setCgEnc(e.target.value as any)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                      <option value="gift-wrap">gift-wrap</option>
                      <option value="nip04">nip04</option>
                    </select>
                  </div>
                </div>

                {cgError && <div className="text-xs text-red-600">{cgError}</div>}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowCreateGroupModal(false)} className="text-xs text-gray-700 hover:text-gray-900">Cancel</button>
                  <button type="submit" disabled={cgLoading} className="text-xs text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded px-3 py-1.5">
                    {cgLoading ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}


        {/* Block Sender Modal */}
        {showBlockSenderModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowBlockSenderModal(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="block-sender-title">
              <div className="flex items-center justify-between mb-4">
                <h3 id="block-sender-title" className="text-lg font-semibold text-gray-900">Block Sender</h3>
                <button onClick={() => setShowBlockSenderModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="text-sm text-gray-800 mb-2">Are you sure you want to block this sender?</div>
              {blockSenderId && <div className="text-xs font-mono text-purple-700 break-all">{blockSenderId}</div>}
              {blockSenderError && <div className="text-xs text-red-600 mt-2">{blockSenderError}</div>}
              <div className="flex items-center justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowBlockSenderModal(false)} className="text-xs text-gray-700 hover:text-gray-900">Cancel</button>
                <button type="button" onClick={() => void confirmBlockSender()} disabled={blockSenderLoading} className="text-xs text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded px-3 py-1.5">{blockSenderLoading ? 'Blocking…' : 'Block'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Message Modal */}
        {showDeleteMessageModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowDeleteMessageModal(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-message-title">
              <div className="flex items-center justify-between mb-4">
                <h3 id="delete-message-title" className="text-lg font-semibold text-gray-900">Delete Message</h3>
                <button onClick={() => setShowDeleteMessageModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="text-sm text-gray-800 mb-2">Are you sure you want to delete this message?</div>
              {deleteMessageError && <div className="text-xs text-red-600">{deleteMessageError}</div>}
              <div className="flex items-center justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowDeleteMessageModal(false)} className="text-xs text-gray-700 hover:text-gray-900">Cancel</button>
                <button type="button" onClick={() => void confirmDeleteMessage()} disabled={deleteMessageLoading} className="text-xs text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded px-3 py-1.5">{deleteMessageLoading ? 'Deleting…' : 'Delete'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Leave Group Modal */}
        {showLeaveGroupModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowLeaveGroupModal(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="leave-group-title">
              <div className="flex items-center justify-between mb-4">
                <h3 id="leave-group-title" className="text-lg font-semibold text-gray-900">Leave Group</h3>
                <button onClick={() => setShowLeaveGroupModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="text-sm text-gray-800 mb-2">Are you sure you want to leave{leaveGroupName ? ` “${leaveGroupName}”` : ''}?</div>
              {leaveGroupError && <div className="text-xs text-red-600">{leaveGroupError}</div>}
              <div className="flex items-center justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowLeaveGroupModal(false)} className="text-xs text-gray-700 hover:text-gray-900">Cancel</button>
                <button type="button" onClick={() => void confirmLeaveGroup()} disabled={leaveGroupLoading} className="text-xs text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded px-3 py-1.5">{leaveGroupLoading ? 'Leaving…' : 'Leave'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Create Topic Modal */}
        {showCreateTopicModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCreateTopicModal(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="create-topic-title">
              <div className="flex items-center justify-between mb-4">
                <h3 id="create-topic-title" className="text-lg font-semibold text-gray-900">Create Topic</h3>
                <button onClick={() => setShowCreateTopicModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <form onSubmit={submitCreateTopic} className="space-y-4">
                <div>
                  <label htmlFor="topic-name" className="block text-xs text-gray-600 mb-1">Topic name</label>
                  <input id="topic-name" type="text" value={topicName} onChange={(e) => setTopicName(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="e.g. Planning" />
                </div>
                <div>
                  <label htmlFor="topic-desc" className="block text-xs text-gray-600 mb-1">Description (optional)</label>
                  <textarea id="topic-desc" value={topicDesc} onChange={(e) => setTopicDesc(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" rows={3} />
                </div>
                {topicError && <div className="text-xs text-red-600">{topicError}</div>}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowCreateTopicModal(false)} className="text-xs text-gray-700 hover:text-gray-900">Cancel</button>
                  <button type="submit" disabled={topicLoading} className="text-xs text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded px-3 py-1.5">{topicLoading ? 'Creating…' : 'Create'}</button>
                </div>
              </form>
            </div>
          </div>
        )}


      </div>
    </div >
  );
}