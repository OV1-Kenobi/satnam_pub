import { useEffect, useRef, useState } from 'react';
import { central_event_publishing_service as CEPS } from '../../../lib/central_event_publishing_service';
import fetchWithAuth from '../../lib/auth/fetch-with-auth';
import type { MessageSendResult } from '../../lib/messaging/client-message-service';
import { nip05Utils } from '../../lib/nip05-verification';
import { showToast } from '../../services/toastService';
import { PrivacyLevel } from '../../types/privacy';


interface SenderProfile {
  username?: string;
  npub?: string;
  lightningAddress?: string;
}

interface PeerInvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendInvitation: (invitation: {
    recipientNpub: string;
    invitationType: string;
    personalMessage: string;
    privacyLevel: PrivacyLevel;
  }) => void;
  senderProfile: SenderProfile;
}

export function PeerInvitationModal({
  isOpen,
  onClose,
  onSendInvitation,
  senderProfile
}: PeerInvitationModalProps) {
  const [recipientsInput, setRecipientsInput] = useState('');
  const [invitationType, setInvitationType] = useState('friend');
  const [personalMessage, setPersonalMessage] = useState('');
  const [privacyLevel] = useState<PrivacyLevel>(PrivacyLevel.ENCRYPTED);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState<{ total: number; current: number }>({ total: 0, current: 0 });
  const mountedRef = useRef(true);
  const sendAbortRef = useRef<AbortController | null>(null);
  const successAlertTimerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (sendAbortRef.current) {
        sendAbortRef.current.abort();
        sendAbortRef.current = null;
      }
      if (successAlertTimerRef.current !== null) {
        clearTimeout(successAlertTimerRef.current);
        successAlertTimerRef.current = null;
      }
    };
  }, []);

  // Default to standard NIP-04/44 direct messaging for external compatibility
  const sendMessage = async (content: string, recipient: string): Promise<MessageSendResult> => {
    try {
      const eventId = await CEPS.sendStandardDirectMessage(recipient, content);
      const result: MessageSendResult = { success: true, messageId: eventId, signingMethod: 'nip04', securityLevel: 'standard' } as any;
      return result;
    } catch (error) {
      console.error('Message sending failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      } as MessageSendResult;
    }
  };

  const handleSendInvitation = async () => {
    const raw = recipientsInput?.trim() || '';
    if (!raw || isSending) return;

    const tokens = raw
      .split(/[\n,]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    setIsSending(true);
    setProgress({ total: tokens.length, current: 0 });

    let successCount = 0;
    let failureCount = 0;

    try {
      for (let i = 0; i < tokens.length; i++) {
        const recipientRaw = tokens[i];
        if (!mountedRef.current) break;
        setProgress({ total: tokens.length, current: i + 1 });

        // Resolve recipient to npub (supports npub and NIP-05)
        let recipientNpubResolved: string | null = null;
        try {
          if (recipientRaw.startsWith('npub1')) {
            recipientNpubResolved = recipientRaw;
          } else if (recipientRaw.includes('@') && nip05Utils.validateFormat(recipientRaw)) {
            const verification = await nip05Utils.verify(recipientRaw);
            if (verification.verified && verification.pubkey) {
              recipientNpubResolved = CEPS.encodeNpub(verification.pubkey);
            } else {
              throw new Error(verification.error || 'NIP-05 could not be verified');
            }
          } else {
            throw new Error('Invalid recipient format (use npub1… or username@domain)');
          }
        } catch (e) {
          console.warn('Recipient resolution failed:', recipientRaw, e);
          failureCount++;
          showToast.error(`Invalid recipient: ${recipientRaw}`, { title: 'Invite not sent' });
          continue;
        }

        // 1) Generate invite link (per recipient)
        let inviteUrl = '';
        {
          const generateResp = await fetchWithAuth('/api/authenticated/generate-peer-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              personalMessage: personalMessage || '',
              courseCredits: 1,
              expiryDays: 30
            }),
            timeoutMs: 15000
          });
          if (!generateResp.ok) {
            failureCount++;
            showToast.error(`Invite link failed for ${recipientRaw}`, { title: 'Generation error' });
            continue;
          }
          const data = await generateResp.json();
          inviteUrl = data?.inviteUrl || '';
          if (!inviteUrl) {
            failureCount++;
            showToast.error(`Invite link missing for ${recipientRaw}`, { title: 'Generation error' });
            continue;
          }
        }

        // 2) Compose message
        const senderNip05 = senderProfile?.username ? `${senderProfile.username}@satnam.pub` : undefined;
        const senderLine = senderNip05 ? `Sender: ${senderNip05}` : (senderProfile?.npub ? `Sender: ${senderProfile.npub}` : '');
        const intro = personalMessage && personalMessage.trim().length > 0
          ? personalMessage.trim()
          : `Hi! I'd like to connect with you on Satnam.pub for secure Bitcoin communications and family coordination. This is a ${invitationType} invitation.`;
        const referralInfo = `\n\n🎓 Referral Rewards: When you join through this invite, we each receive 1 course credit. Credits are valid for basic courses in the Satnam app and the upcoming Citadel Academy.`;
        const linkLine = `\n\n🔗 Join via my secure invite link: ${inviteUrl}`;
        const header = senderLine ? `${senderLine}\n\n` : '';
        const invitationMessage = `${header}${intro}${referralInfo}${linkLine}`;

        // 3) Send via CEPS (standard NIP-04/44)
        try {
          const result = await sendMessage(invitationMessage, recipientNpubResolved);
          if (result.success) {
            successCount++;
          } else {
            failureCount++;
            showToast.error(`Delivery failed to ${recipientRaw}`, { title: 'Message error' });
          }
        } catch (e) {
          failureCount++;
          showToast.error(`Delivery failed to ${recipientRaw}`, { title: 'Message error' });
        }
      }

      // Callback for backward compatibility (first recipient only)
      if (tokens[0]) {
        onSendInvitation({
          recipientNpub: tokens[0],
          invitationType,
          personalMessage: personalMessage || '',
          privacyLevel
        });
      }

      // Reset and close
      setRecipientsInput('');
      setPersonalMessage('');
      onClose();

      // Post-send toast
      if (successCount > 0 && failureCount === 0) {
        showToast.success("Invite sent. You'll both get 1 course credit when they join.", {
          title: 'Invitations sent',
          duration: 6000
        });
      } else if (successCount > 0 && failureCount > 0) {
        showToast.warning(`Some invites failed: ${successCount} sent, ${failureCount} failed`, {
          title: 'Partial success',
          duration: 7000
        });
      } else {
        showToast.error('All invitations failed to send', { title: 'No invites sent' });
      }
    } catch (error) {
      console.error('Invitation sending failed:', error);
      if (mountedRef.current) {
        showToast.error(error instanceof Error ? error.message : 'Unknown error', {
          title: 'Failed to send invitations'
        });
      }
    } finally {
      if (!mountedRef.current) return;
      setIsSending(false);
    }
  };
  if (!isOpen) return null;

  return (
    <div className="modal-overlay transition-opacity duration-300">
      <div
        className="modal-content transform transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300 z-10"
          aria-label="Close invitation modal"
        >
          <span className="text-white text-xl">✕</span>
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl">👥</span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Invite New Contact</h2>
          <p className="text-purple-200">
            Connect with someone new on Satnam.pub for secure communications
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Recipients (npub or NIP-05), comma or newline separated
            </label>
            <textarea
              value={recipientsInput}
              onChange={(e) => setRecipientsInput(e.target.value)}
              placeholder="npub1...\nuser@domain.com\nnpub1..."
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:bg-white/20 focus:border-purple-400 transition-all duration-300 resize-y"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Relationship Type
            </label>
            <select
              value={invitationType}
              onChange={(e) => setInvitationType(e.target.value)}
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:bg-white/20 focus:border-purple-400 transition-all duration-300"
            >
              <option value="friend" className="bg-purple-900 text-white">Friend (Personal connections)</option>
              <option value="business" className="bg-purple-900 text-white">Business (Professional contacts)</option>
              <option value="family-associate" className="bg-purple-900 text-white">Family Associate (Extended family/trusted contacts)</option>
            </select>
          </div>

          {/* Referral Rewards */}
          <div className="bg-white/10 p-4 rounded-lg border border-white/20">
            <h4 className="font-semibold text-white mb-2">Referral Rewards</h4>
            <ul className="list-disc list-inside text-sm text-green-200 space-y-1">
              <li>
                You and your invitee each receive <span className="font-semibold text-white">1 course credit</span> when they join through your invite.
              </li>
              <li>
                Credits are valid for basic courses in the Satnam app and the upcoming <span className="font-semibold text-white">Citadel Academy</span>.
              </li>
              <li>
                Your message will include a secure invite link so credits are tracked automatically upon acceptance.
              </li>
            </ul>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Personal Message (Optional)
            </label>
            <textarea
              value={personalMessage}
              onChange={(e) => setPersonalMessage(e.target.value)}
              placeholder="I'd like to connect with you on Satnam.pub for secure communications..."
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:bg-white/20 focus:border-purple-400 transition-all duration-300 resize-none"
              rows={3}
            />
          </div>

          {/* Messaging method (fixed for compatibility) */}
          <div className="bg-white/10 p-4 rounded-lg border border-white/20">
            <h4 className="font-semibold text-white mb-2">Messaging Method</h4>
            <div className="text-sm text-blue-200 bg-blue-500/10 border border-blue-500/20 rounded-md p-3">
              This invitation will be sent via standard NIP-04/44 encrypted direct message for maximum compatibility with external Nostr clients and relays.
            </div>
          </div>

          <div className="bg-white/10 p-4 rounded-lg border border-white/20">
            <div className="text-sm text-white font-semibold mb-2">
              Your Profile Preview:
            </div>
            <div className="text-xs text-purple-200 space-y-1">
              <div>Username: {senderProfile?.username || 'Unknown User'}</div>
              <div>Lightning Address: {senderProfile?.username || 'user'}@satnam.pub</div>
              <div>Secure Communications: Encrypted Nostr DMs</div>
            </div>
          </div>
        </div>

        <div className="flex space-x-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-white/10 text-white border border-white/20 rounded-lg hover:bg-white/20 transition-all duration-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSendInvitation}
            disabled={!recipientsInput.trim() || isSending}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-500 disabled:to-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all duration-300"
          >
            {isSending ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>
                  Sending {progress.current}/{progress.total}...
                </span>
              </div>
            ) : (
              'Send Invitation'
            )}
          </button>
        </div>
      </div>
    </div >
  );
}