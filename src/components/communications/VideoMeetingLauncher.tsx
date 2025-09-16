import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GiftwrappedCommunicationService } from '../../lib/giftwrapped-communication-service';
import { showToast } from '../../services/toastService';

export interface VideoMeetingLauncherProps {
  currentUser: {
    npub: string;
    nip05?: string;
  };
  onMeetingCreated?: (roomUrl: string, roomId: string) => void;
  selectedContact?: {
    npub: string;
    displayName: string;
  };
  buttonClassName?: string;
  iconClassName?: string;
}

// Helper: SHA-256 hash to hex using Web Crypto API (browser-native)
async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper: generate room ID without exposing npub directly in the name
async function generateRoomId(npub: string): Promise<string> {
  const hash = await sha256Hex(`${npub}-${Date.now()}`);
  return `satnam-${hash.slice(0, 16)}`;
}

export const VideoMeetingLauncher = ({
  currentUser,
  onMeetingCreated,
  selectedContact,
  buttonClassName,
  iconClassName,
}: VideoMeetingLauncherProps) => {
  const [busy, setBusy] = useState(false);
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [recipientsInput, setRecipientsInput] = useState('');
  const [sendingInvites, setSendingInvites] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const defaultButtonCls = 'p-2 rounded-lg bg-purple-200/60 text-purple-900 hover:bg-purple-300/60 focus:outline-none focus:ring-2 focus:ring-purple-400';
  const defaultIconCls = 'w-4 h-4';

  const parsedRecipients = useMemo(() => {
    return recipientsInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [recipientsInput]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!showInvitePanel) return;
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        setShowInvitePanel(false);
      }
    };
    if (showInvitePanel) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showInvitePanel]);

  const startMeeting = useCallback(async () => {
    if (!currentUser?.npub) return;
    try {
      setBusy(true);
      const roomId = await generateRoomId(currentUser.npub);
      const displayName = encodeURIComponent(
        currentUser.nip05 || `${currentUser.npub.slice(0, 16)}…`
      );
      const roomUrl = `https://meet.jit.si/${roomId}#userInfo.displayName=${displayName}`;

      // Open meeting in a new tab/window immediately for best UX
      window.open(roomUrl, '_blank', 'noopener,noreferrer');

      // Notify parent if provided
      try { onMeetingCreated?.(roomUrl, roomId); } catch (cbErr) { console.warn('onMeetingCreated callback failed:', cbErr); }

      // Auto-invite if a selected contact is present
      if (selectedContact?.npub) {
        try {
          const svc = new GiftwrappedCommunicationService();
          const payload = { type: 'meeting_invitation', room: roomId, url: roomUrl, host: currentUser.nip05 || currentUser.npub, displayName: decodeURIComponent(displayName), ts: Date.now() };
          const res = await svc.sendGiftwrappedMessage({ content: JSON.stringify(payload), recipient: selectedContact.npub, sender: currentUser.npub, encryptionLevel: 'maximum', communicationType: 'individual' });
          if (res.success) {
            showToast.success(`Meeting invite sent to ${selectedContact.displayName || selectedContact.npub.slice(0, 12) + '…'}`);
          } else {
            showToast.error(res.error || 'Failed to send meeting invite');
          }
        } catch (inviteErr) {
          showToast.error('Failed to send meeting invite');
          console.error('Failed to send meeting invite:', inviteErr);
        }
      } else {
        // No selected contact - reveal minimal invite panel so user can enter npub(s)
        setShowInvitePanel(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error starting meeting';
      console.error('VideoMeetingLauncher error:', msg);
      showToast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [currentUser, onMeetingCreated, selectedContact]);

  const sendInvites = useCallback(async () => {
    if (!currentUser?.npub) return;
    const valid = parsedRecipients.filter((r) => r.toLowerCase().startsWith('npub1'));
    if (valid.length === 0) {
      showToast.info('Enter one or more npub addresses (comma or space separated).');
      return;
    }
    setSendingInvites(true);
    try {
      const roomId = await generateRoomId(currentUser.npub);
      const displayName = encodeURIComponent(currentUser.nip05 || `${currentUser.npub.slice(0, 16)}…`);
      const roomUrl = `https://meet.jit.si/${roomId}#userInfo.displayName=${displayName}`;
      const svc = new GiftwrappedCommunicationService();
      const payload = { type: 'meeting_invitation', room: roomId, url: roomUrl, host: currentUser.nip05 || currentUser.npub, displayName: decodeURIComponent(displayName), ts: Date.now() };
      const results = await Promise.allSettled(valid.map((npub) => svc.sendGiftwrappedMessage({ content: JSON.stringify(payload), recipient: npub, sender: currentUser.npub, encryptionLevel: 'maximum', communicationType: 'individual' })));
      const ok = results.filter((r) => r.status === 'fulfilled' && (r as PromiseFulfilledResult<any>).value?.success).length;
      const fail = valid.length - ok;
      if (ok > 0) showToast.success(`Invited ${ok} contact(s)`);
      if (fail > 0) showToast.warning(`Failed to invite ${fail} contact(s)`);
      setShowInvitePanel(false);
      setRecipientsInput('');
    } catch (e) {
      showToast.error('Failed to send invites');
    } finally {
      setSendingInvites(false);
    }
  }, [currentUser, parsedRecipients]);

  return (
    <div className="relative inline-flex" ref={panelRef}>
      <button
        type="button"
        onClick={() => void startMeeting()}
        disabled={busy}
        className={`${buttonClassName || defaultButtonCls} ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
        aria-label="Start video meeting"
        title="Start video meeting"
      >
        {/* Computer monitor icon (inline SVG) */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={iconClassName || defaultIconCls} aria-hidden="true">
          <path d="M3 5.75A1.75 1.75 0 014.75 4h14.5A1.75 1.75 0 0121 5.75v8.5A1.75 1.75 0 0119.25 16H4.75A1.75 1.75 0 013 14.25v-8.5ZM4.75 5.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h14.5a.25.25 0 00.25-.25v-8.5a.25.25 0 00-.25-.25H4.75Z" />
          <path d="M8.75 18a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5Z" />
        </svg>
      </button>

      {showInvitePanel && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-purple-200 rounded-lg shadow-lg p-3 z-10">
          <div className="text-sm font-medium text-purple-900 mb-2">Invite contacts</div>
          <input
            type="text"
            placeholder="Paste npub(s), comma or space separated"
            value={recipientsInput}
            onChange={(e) => setRecipientsInput(e.target.value)}
            className="w-full p-2 border border-purple-300 rounded-md text-sm"
            aria-label="Invite recipients"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowInvitePanel(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-purple-200 text-purple-800 hover:bg-purple-50"
            >Cancel</button>
            <button
              type="button"
              onClick={() => void sendInvites()}
              disabled={sendingInvites}
              className="px-3 py-1.5 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
            >{sendingInvites ? 'Sending…' : 'Send invites'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoMeetingLauncher;

