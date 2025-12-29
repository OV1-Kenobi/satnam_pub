import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { resolvePlatformLightningDomain } from '../../config/domain.client';
import { usePrivacyFirstMessaging } from '../../hooks/usePrivacyFirstMessaging';
import fetchWithAuth from '../../lib/auth/fetch-with-auth';
import { getCEPS } from '../../lib/ceps';
import type { MessageSendResult } from '../../lib/messaging/client-message-service';
import { nip05Utils } from '../../lib/nip05-verification';
import { showToast } from '../../services/toastService';
import { PrivacyLevel } from '../../types/privacy';
import { generateQRCodeDataURL, getRecommendedErrorCorrection } from '../../utils/qr-code-browser';

import ContactsSelector from '../shared/ContactsSelector';


function buildAboutTemplate(inviteUrl: string, hostedQrUrl?: string): string {
  const parts = [
    "Join me on Satnam — privacy-first family coordination:",
    inviteUrl,
    hostedQrUrl ? `QR: ${hostedQrUrl}` : undefined,
  ].filter(Boolean) as string[];
  return parts.join("\n");
}

async function downloadQrImage(src: string, width: number, height: number, filename: string) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load QR image'));
  });
  img.src = src;
  await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const pad = Math.floor(Math.min(width, height) * 0.1);
  const size = Math.min(width, height) - pad * 2;
  const x = Math.floor((width - size) / 2);
  const y = Math.floor((height - size) / 2);
  ctx.drawImage(img, x, y, size, size);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to encode image');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}


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
  const messaging = usePrivacyFirstMessaging();
  const [recipientsInput, setRecipientsInput] = useState('');
  const [invitationType, setInvitationType] = useState('friend');
  const [personalMessage, setPersonalMessage] = useState('');
  const [privacyLevel] = useState<PrivacyLevel>(PrivacyLevel.ENCRYPTED);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState<{ total: number; current: number }>({ total: 0, current: 0 });
  const mountedRef = useRef(true);
  const sendAbortRef = useRef<AbortController | null>(null);
  const successAlertTimerRef = useRef<number | null>(null);

  const [showContacts, setShowContacts] = useState(false);
  const [lastInvite, setLastInvite] = useState<{ inviteUrl?: string; qrCodeImage?: string; hostedQrUrl?: string } | null>(null);
  // Client-generated QR code state
  const [generatedQRCode, setGeneratedQRCode] = useState<string | null>(null);
  const [qrGenerating, setQrGenerating] = useState(false);

  // Generate QR code client-side for inviteUrl
  const generateQRForInvite = useCallback(async (inviteUrl: string): Promise<string | null> => {
    if (!inviteUrl) return null;

    try {
      const dataUrl = await generateQRCodeDataURL(inviteUrl, {
        size: 256,
        margin: 4,
        errorCorrectionLevel: getRecommendedErrorCorrection('url'),
      });
      return dataUrl;
    } catch (err) {
      console.error('Failed to generate QR code:', err);
      return null;
    }
  }, []);

  // Effect to generate QR code when lastInvite changes
  useEffect(() => {
    const generateQR = async () => {
      // Only generate if we have inviteUrl but no qrCodeImage from API
      if (lastInvite?.inviteUrl && !lastInvite?.qrCodeImage && !generatedQRCode) {
        setQrGenerating(true);
        const qrDataUrl = await generateQRForInvite(lastInvite.inviteUrl);
        if (mountedRef.current) {
          setGeneratedQRCode(qrDataUrl);
          setQrGenerating(false);
        }
      }
    };

    if (lastInvite) {
      generateQR();
    } else {
      // Reset when no invite
      setGeneratedQRCode(null);
    }
  }, [lastInvite, generatedQRCode, generateQRForInvite]);

  const handleShare = async () => {
    try {
      const url = lastInvite?.inviteUrl || lastInvite?.hostedQrUrl;
      if (!url) {
        showToast.warning('No invitation link available to share yet.', { title: 'Nothing to share' });
        return;
      }
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
      if (nav.share) {
        await nav.share({
          title: 'Satnam Invitation',
          text: 'Join me on Satnam — privacy-first family coordination',
          url
        });
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        showToast.success('Invite link copied to clipboard', { title: 'Copied' });
        return;
      }
      // Last-resort fallback
      showToast.warning('Sharing not supported on this device.', { title: 'Share unavailable' });
    } catch (error) {
      try {
        const url = lastInvite?.inviteUrl || lastInvite?.hostedQrUrl || '';
        if (url && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          showToast.success('Invite link copied to clipboard', { title: 'Copied' });
          return;
        }
      } catch (err) {
        // ignore secondary failure
      }
      showToast.error(error instanceof Error ? error.message : 'Unknown error', { title: 'Share failed' });
    }
  };


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
      const CEPS = await getCEPS();
      const eventId = await (CEPS as any).sendStandardDirectMessage(recipient, content);
      const result: MessageSendResult = { success: true, messageId: eventId, signingMethod: 'nip04', securityLevel: 'standard' };
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
        const CEPS = await getCEPS();
        let recipientNpubResolved: string | null = null;
        try {
          if (recipientRaw.startsWith('npub1')) {
            recipientNpubResolved = recipientRaw;
          } else if (recipientRaw.includes('@') && nip05Utils.validateFormat(recipientRaw)) {
            const verification = await nip05Utils.verify(recipientRaw);
            if (verification.verified && verification.pubkey) {
              recipientNpubResolved = (CEPS as any).encodeNpub(verification.pubkey);
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
          setLastInvite({ inviteUrl: data?.inviteUrl, qrCodeImage: data?.qrCodeImage, hostedQrUrl: data?.hostedQrUrl });

          if (!inviteUrl) {
            failureCount++;
            showToast.error(`Invite link missing for ${recipientRaw}`, { title: 'Generation error' });
            continue;
          }
        }

        // 2) Compose message
        const senderNip05 = senderProfile?.username ? `${senderProfile.username}@${resolvePlatformLightningDomain()}` : undefined;
        const senderLine = senderNip05 ? `Sender: ${senderNip05}` : (senderProfile?.npub ? `Sender: ${senderProfile.npub}` : '');
        const intro = personalMessage && personalMessage.trim().length > 0
          ? personalMessage.trim()
          : `Hi! I'd like to connect with you on Satnam.pub for secure Bitcoin communications and family coordination. This is a ${invitationType} invitation.`;
        const referralInfo = `\n\n🎓 Referral Rewards: When you join through this invite, we each receive 1 course credit. Credits are valid for basic courses in the Satnam app and the upcoming Citadel Academy.`;
        const linkLine = `\n\n🔗 Join via my secure invite link: ${inviteUrl}`;
        const header = senderLine ? `${senderLine}\n\n` : '';
        const invitationMessage = `${header}${intro}${referralInfo}${linkLine}`;

        // 3) Send via CEPS (standard NIP-04/44)
        // At this point recipientNpubResolved is guaranteed to be a valid string (continue statements above handle null cases)
        const recipientNpub = recipientNpubResolved!;
        try {
          const result = await sendMessage(invitationMessage, recipientNpub);
          if (result.success) {
            successCount++;
            // 3b) Log the outgoing message into conversation history (protocol: nip04)
            try {
              await fetchWithAuth('/api/communications/giftwrapped', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  content: invitationMessage,
                  recipient: recipientNpub,
                  communicationType: 'individual',
                  messageType: 'direct',
                  encryptionLevel: 'enhanced',
                  standardDm: true,
                  protocol: 'nip04'
                }),
                timeoutMs: 15000
              });
            } catch (logErr) {
              console.warn('PeerInvite: failed to log outgoing message', logErr);
            }
            // 3c) Auto-add contact for successful peer invite exchange
            try {
              await messaging.addContact({
                npub: recipientNpub,
                displayName: recipientRaw,
                trustLevel: 'known',
                preferredEncryption: 'auto',
                tags: []
              });
            } catch (addErr) {
              console.warn('PeerInvite: auto-add contact failed', addErr);
            }
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
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowContacts(true)}
                className="px-3 py-2 text-sm bg-purple-700 hover:bg-purple-800 text-white rounded"
              >
                Select Contacts
              </button>
            </div>

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
            <label className="block text-sm font-medium text-white mb-2">Personal Message (Optional)</label>
            <textarea
              value={personalMessage}
              onChange={(e) => setPersonalMessage(e.target.value)}
              placeholder="I'd like to connect with you on Satnam.pub for secure communications..."
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:bg-white/20 focus:border-purple-400 transition-all duration-300 resize-none"
              rows={3}
            />
          </div>

          {lastInvite && (
            <div className="mt-4 space-y-2">
              {/* QR Code Display - prefer API-provided, fallback to client-generated */}
              {(() => {
                const qrSrc = lastInvite.qrCodeImage || generatedQRCode;

                if (qrSrc) {
                  return (
                    <div className="flex justify-center">
                      <img src={qrSrc} alt="Invitation QR Code" className="w-28 h-28 rounded-lg" />
                    </div>
                  );
                } else if (qrGenerating) {
                  return (
                    <div className="flex justify-center">
                      <div className="w-28 h-28 bg-white/10 rounded-lg flex items-center justify-center">
                        <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
                      </div>
                    </div>
                  );
                } else if (lastInvite.inviteUrl) {
                  return (
                    <div className="flex justify-center">
                      <div className="w-28 h-28 bg-red-500/10 rounded-lg flex items-center justify-center border border-red-500/30">
                        <p className="text-red-300 text-xs text-center px-2">QR generation failed</p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              {lastInvite.hostedQrUrl && (
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={lastInvite.hostedQrUrl}
                    readOnly
                    className="flex-1 bg-white/10 border border-white/20 rounded px-3 py-2 text-white text-sm font-mono"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(lastInvite.hostedQrUrl!)}
                    className="px-3 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded"
                  >
                    Copy QR Link
                  </button>
                </div>
              )}
              {/* Action buttons - show if we have any QR source */}
              {(() => {
                const qrSrc = lastInvite.hostedQrUrl || lastInvite.qrCodeImage || generatedQRCode;
                const hasQR = !!qrSrc;

                return (
                  <div className="flex flex-wrap gap-2">
                    {/* Download buttons - only show if we have a QR code */}
                    {hasQR && (
                      <>
                        <button
                          onClick={() => downloadQrImage(qrSrc!, 512, 512, 'satnam-invite-qr-512.png')}
                          className="px-3 py-2 text-xs bg-slate-600 hover:bg-slate-700 text-white rounded"
                        >
                          Square 512
                        </button>
                        <button
                          onClick={() => downloadQrImage(qrSrc!, 1080, 1080, 'satnam-invite-qr-1080.png')}
                          className="px-3 py-2 text-xs bg-slate-600 hover:bg-slate-700 text-white rounded"
                        >
                          Square 1080
                        </button>
                        <button
                          onClick={() => downloadQrImage(qrSrc!, 1080, 1920, 'satnam-invite-qr-story.png')}
                          className="px-3 py-2 text-xs bg-slate-600 hover:bg-slate-700 text-white rounded"
                        >
                          Story 9:16
                        </button>
                        <button
                          onClick={() => downloadQrImage(qrSrc!, 1920, 1080, 'satnam-invite-qr-banner.png')}
                          className="px-3 py-2 text-xs bg-slate-600 hover:bg-slate-700 text-white rounded"
                        >
                          Banner 16:9
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => navigator.clipboard.writeText(buildAboutTemplate(lastInvite.inviteUrl || '', lastInvite.hostedQrUrl))}
                      className="px-3 py-2 text-xs bg-slate-700 hover:bg-slate-800 text-white rounded"
                    >
                      Copy Profile About Template
                    </button>
                    <button
                      onClick={handleShare}
                      className="px-3 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded"
                    >
                      Share
                    </button>
                  </div>
                );
              })()}
            </div>
          )}


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
              <div>Lightning Address: {senderProfile?.lightningAddress || `${senderProfile?.username || 'user'}@${resolvePlatformLightningDomain()}`}</div>
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
        <ContactsSelector
          isOpen={showContacts}
          onClose={() => setShowContacts(false)}
          onSelectContact={(contact) => {
            if (contact?.npub) {
              setRecipientsInput((prev) => (prev ? prev + '\n' : '') + contact.npub);
            }
          }}
          title="Select Contacts to Invite"
        />

      </div>
    </div >
  );
}