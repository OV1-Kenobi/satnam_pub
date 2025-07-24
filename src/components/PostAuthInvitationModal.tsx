// Post-Authentication Invitation Modal for Authenticated Users
// File: src/components/PostAuthInvitationModal.tsx

import { X } from 'lucide-react';
import React, { useState } from 'react';
import { SessionInfo } from '../utils/secureSession.js';

interface PostAuthInvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSkip: () => void;
  sessionInfo: SessionInfo;
}

export function PostAuthInvitationModal({
  isOpen,
  onClose,
  onSkip,
  sessionInfo
}: PostAuthInvitationModalProps) {
  const [inviteConfig, setInviteConfig] = useState({
    personalMessage: '',
    courseCredits: 1,
    expiryDays: 30,
    recipientNostrPubkey: '',
    sendAsGiftWrappedDM: false
  });
  const [generatedInvite, setGeneratedInvite] = useState<{
    qrImage: string;
    inviteUrl: string;
    inviteToken: string;
    giftWrappedMessage?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateInvite = async () => {
    setLoading(true);
    setError(null); // Clear any previous errors
    try {
      const response = await fetch('/api/authenticated/generate-peer-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include HttpOnly cookies
        body: JSON.stringify({
          // Privacy-first: Only send NIP05 for spam prevention in gift-wrapped messages
          inviterNip05: sessionInfo.user?.nip05,
          personalMessage: inviteConfig.personalMessage,
          courseCredits: inviteConfig.courseCredits,
          expiryDays: inviteConfig.expiryDays,
          recipientNostrPubkey: inviteConfig.sendAsGiftWrappedDM ? inviteConfig.recipientNostrPubkey : null,
          sendAsGiftWrappedDM: inviteConfig.sendAsGiftWrappedDM
        })
      });

      const result = await response.json();
      if (result.success) {
        setGeneratedInvite({
          qrImage: result.qrCodeImage,
          inviteUrl: result.inviteUrl,
          inviteToken: result.inviteToken,
          giftWrappedMessage: result.giftWrappedMessage
        });
      }
    } catch (error) {
      console.error('Failed to generate invite:', error);
      setError('Failed to generate invitation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onSkip();
    }
  };

  if (!isOpen || !sessionInfo.isAuthenticated) return null;

  return (
    <div
      className="modal-overlay-bitcoin-citadel transition-opacity duration-300"
      onClick={handleBackdropClick}
    >
      <div
        className="modal-content-bitcoin-citadel transform transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300 z-10"
          aria-label="Skip invitation and continue"
        >
          <X className="h-5 w-5 text-white" />
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🎉</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Welcome to Satnam.pub!</h2>
          <p className="text-purple-200 mb-4">
            Authentication successful. Want to invite a peer to join you?
          </p>
          <h3 className="text-lg font-semibold text-white">
            🎓 Invite a Peer
          </h3>
        </div>

        {!generatedInvite ? (
          <div className="space-y-4">
            {/* Error Display */}
            {error && (
              <div className="bg-red-500/10 border border-red-400/30 rounded-lg p-3 mb-4">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            {/* Personal Message */}
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                Personal Message (Optional)
              </label>
              <textarea
                value={inviteConfig.personalMessage}
                onChange={(e) => setInviteConfig(prev => ({
                  ...prev,
                  personalMessage: e.target.value
                }))}
                className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-sm h-20 text-white placeholder-purple-300 focus:border-purple-400 focus:outline-none"
                placeholder="Join me on Satnam.pub for sovereign Bitcoin education!"
              />
            </div>

            {/* Course Credits */}
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                Course Credits Gift
              </label>
              <select
                value={inviteConfig.courseCredits}
                onChange={(e) => setInviteConfig(prev => ({
                  ...prev,
                  courseCredits: parseInt(e.target.value)
                }))}
                className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:border-purple-400 focus:outline-none"
              >
                <option value={1}>1 Course Credit</option>
              </select>
              <div className="text-xs text-purple-300 mt-1">
                Both you and your peer will receive 1 course credit
              </div>
            </div>

            {/* Gift Wrapped DM Option */}
            <div className="border border-purple-400/30 rounded-lg p-4 bg-purple-500/10">
              <div className="flex items-center space-x-2 mb-3">
                <input
                  type="checkbox"
                  checked={inviteConfig.sendAsGiftWrappedDM}
                  onChange={(e) => setInviteConfig(prev => ({
                    ...prev,
                    sendAsGiftWrappedDM: e.target.checked
                  }))}
                  className="rounded border-purple-400 bg-white/10 text-purple-500 focus:ring-purple-400"
                />
                <label className="text-sm font-medium text-purple-200">
                  🎁 Send as Gift Wrapped Nostr DM
                </label>
              </div>

              {inviteConfig.sendAsGiftWrappedDM && (
                <div>
                  <label className="block text-xs text-purple-300 mb-1">
                    Recipient's Nostr Public Key (npub)
                  </label>
                  <input
                    type="text"
                    value={inviteConfig.recipientNostrPubkey}
                    onChange={(e) => setInviteConfig(prev => ({
                      ...prev,
                      recipientNostrPubkey: e.target.value
                    }))}
                    className="w-full p-2 bg-white/10 border border-purple-400/30 rounded text-sm text-white placeholder-purple-300 focus:border-purple-400 focus:outline-none"
                    placeholder="npub1..."
                  />
                  <div className="text-xs text-purple-300 mt-1">
                    🛡️ Maximum privacy - your identity hidden from relays
                  </div>
                </div>
              )}
            </div>

            {/* Expiry */}
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                Invitation Expires In
              </label>
              <select
                value={inviteConfig.expiryDays}
                onChange={(e) => setInviteConfig(prev => ({
                  ...prev,
                  expiryDays: parseInt(e.target.value)
                }))}
                className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:border-purple-400 focus:outline-none"
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={onSkip}
                className="flex-1 bg-white/10 text-white py-3 px-4 rounded-lg hover:bg-white/20 transition-colors duration-200"
              >
                Skip for Now
              </button>
              <button
                onClick={handleGenerateInvite}
                disabled={loading || (inviteConfig.sendAsGiftWrappedDM && !inviteConfig.recipientNostrPubkey)}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-medium transition-all duration-300"
              >
                {loading ? 'Generating...' : 'Generate Invitation'}
              </button>
            </div>

            {/* Info Box */}
            <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-400/30">
              <h4 className="font-medium text-blue-300 mb-2">
                🎓 Peer Invitation Benefits
              </h4>
              <div className="text-sm text-blue-200 space-y-1">
                <p>• Share Satnam.pub with your network</p>
                <p>• 1 course credit for both you and your peer</p>
                <p>• Complete privacy protection</p>
                <p>• Gift Wrapped DM for maximum Nostr privacy</p>
              </div>
            </div>

            {/* Current User Info */}
            {sessionInfo.user && (
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="text-xs text-purple-300 mb-1">Inviting as:</div>
                <div className="text-sm text-white font-mono">
                  {sessionInfo.user.nip05 || sessionInfo.user.npub.substring(0, 16) + '...'}
                </div>
                <div className="text-xs text-purple-400">
                  {sessionInfo.user.federationRole} • {sessionInfo.user.authMethod.toUpperCase()}
                </div>
              </div>
            )}
          </div>
        ) : (
          <InvitationResultDisplay
            generatedInvite={generatedInvite}
            inviteConfig={inviteConfig}
            onGenerateNew={() => setGeneratedInvite(null)}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

// Result Display Component
interface InvitationResultDisplayProps {
  generatedInvite: {
    qrImage: string;
    inviteUrl: string;
    inviteToken: string;
    giftWrappedMessage?: string;
  };
  inviteConfig: {
    personalMessage: string;
    courseCredits: number;
    expiryDays: number;
    recipientNostrPubkey: string;
    sendAsGiftWrappedDM: boolean;
  };
  onGenerateNew: () => void;
  onClose: () => void;
}

function InvitationResultDisplay({
  generatedInvite,
  inviteConfig,
  onGenerateNew,
  onClose
}: InvitationResultDisplayProps) {
  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(generatedInvite.inviteUrl);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  return (
    <div className="text-center space-y-4">
      <h4 className="font-medium text-white mb-3">
        🎉 Invitation Ready!
      </h4>

      {!inviteConfig.sendAsGiftWrappedDM ? (
        <>
          {/* QR Code Display */}
          <div className="bg-white p-4 border-2 border-emerald-400/30 rounded-lg inline-block">
            <img
              src={generatedInvite.qrImage}
              alt="Peer Invitation QR Code"
              className="w-48 h-48 mx-auto"
            />
          </div>

          {/* Invite URL */}
          <div className="bg-white/10 p-3 rounded-lg">
            <div className="text-xs text-purple-300 mb-1">Share this link:</div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={generatedInvite.inviteUrl}
                readOnly
                className="flex-1 text-xs font-mono bg-white/10 p-2 border border-white/20 rounded text-white"
              />
              <button
                onClick={handleCopyUrl}
                className="px-3 py-2 bg-purple-500 text-white rounded text-sm hover:bg-purple-600 transition-colors duration-200"
              >
                Copy
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-400/30">
          <h5 className="font-medium text-purple-200 mb-2">
            🎁 Gift Wrapped DM Sent Successfully
          </h5>
          <div className="text-sm text-purple-300 space-y-1">
            <p>✅ Invitation sent via encrypted Nostr DM</p>
            <p>🛡️ Your identity is hidden from relay operators</p>
            <p>📩 Recipient will receive invitation in their Nostr DMs</p>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-yellow-500/10 rounded-lg p-4 border border-yellow-400/30">
        <h5 className="font-medium text-yellow-300 mb-2">
          📋 Next Steps
        </h5>
        <div className="text-sm text-yellow-200 space-y-1">
          {!inviteConfig.sendAsGiftWrappedDM ? (
            <>
              <p>• Share the QR code or URL with your peer</p>
              <p>• They'll receive {inviteConfig.courseCredits} course credits upon signup</p>
              <p>• You'll also receive {inviteConfig.courseCredits} bonus credits</p>
            </>
          ) : (
            <>
              <p>• Your peer will receive a private DM with the invitation</p>
              <p>• Both of you will receive {inviteConfig.courseCredits} course credits</p>
              <p>• The invitation expires in {inviteConfig.expiryDays} days</p>
            </>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3 mt-6">
        <button
          onClick={onGenerateNew}
          className="flex-1 bg-white/10 text-white py-2 px-4 rounded-lg hover:bg-white/20 transition-colors duration-200"
        >
          Generate Another
        </button>
        <button
          onClick={onClose}
          className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 text-white py-2 px-4 rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all duration-200"
        >
          Done
        </button>
      </div>
    </div>
  );
}