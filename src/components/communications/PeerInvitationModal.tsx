import { useState } from 'react';
import { MessageSendResult, nostrMessageService } from '../../lib/nostr-message-service';
import { PrivacyLevel, getDefaultPrivacyLevel } from '../../types/privacy';

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
  const [recipientNpub, setRecipientNpub] = useState('');
  const [invitationType, setInvitationType] = useState('friend');
  const [personalMessage, setPersonalMessage] = useState('');
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(getDefaultPrivacyLevel());
  const [isSending, setIsSending] = useState(false);

  // Enhanced message sending function using authenticated user's keys
  const sendMessage = async (content: string, recipient: string, privacyLevel: PrivacyLevel): Promise<MessageSendResult> => {
    try {
      const result = await nostrMessageService.sendMessage({
        content,
        recipientNpub: recipient,
        privacyLevel,
        messageType: 'invitation'
      });

      return result;
    } catch (error) {
      console.error('Message sending failed:', error);
      return {
        success: false,
        method: privacyLevel as any,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  const handleSendInvitation = async () => {
    if (!recipientNpub || isSending) return;

    setIsSending(true);

    try {
      // Create invitation message
      const invitationMessage = personalMessage ||
        `Hi! I'd like to connect with you on Satnam.pub for secure Bitcoin communications and family coordination. This is a ${invitationType} invitation.`;

      // Use the enhanced privacy-aware message sending
      const result = await sendMessage(invitationMessage, recipientNpub, privacyLevel);

      if (result.success) {
        // Call the parent callback
        onSendInvitation({
          recipientNpub,
          invitationType,
          personalMessage: invitationMessage,
          privacyLevel
        });

        // Reset form
        setRecipientNpub('');
        setPersonalMessage('');
        onClose();

        // Show success message with details
        const privacyMethod = result.method === 'giftwrapped' ? 'Gift Wrapped (Maximum Privacy)' :
          result.method === 'encrypted' ? 'Encrypted DM (Selective Privacy)' :
            'Public Note (Minimal Privacy)';

        alert(`Peer invitation sent successfully!\n\nMethod: ${privacyMethod}\nMessage ID: ${result.messageId || 'N/A'}\nRelay: ${result.relayUrl || 'Multiple relays'}`);
      } else {
        throw new Error(result.error || 'Failed to send invitation');
      }
    } catch (error) {
      console.error('Invitation sending failed:', error);
      alert(`Failed to send invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
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
              Contact's Nostr Public Key (npub)
            </label>
            <input
              type="text"
              value={recipientNpub}
              onChange={(e) => setRecipientNpub(e.target.value)}
              placeholder="npub1..."
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:bg-white/20 focus:border-purple-400 transition-all duration-300"
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

          {/* Privacy Level Selector */}
          <div className="bg-white/10 p-4 rounded-lg border border-white/20">
            <h4 className="font-semibold text-white mb-3">Privacy Level</h4>
            <div className="space-y-3">
              {[
                {
                  level: 'giftwrapped' as PrivacyLevel,
                  label: 'Maximum Privacy',
                  description: 'Gift Wrapped - Complete metadata protection',
                  icon: '🔒',
                  features: ['Hidden identity', 'Timing obfuscation', 'Zero PII exposure']
                },
                {
                  level: 'encrypted' as PrivacyLevel,
                  label: 'Selective Privacy',
                  description: 'Encrypted with controlled metadata',
                  icon: '🛡️',
                  features: ['Encrypted content', 'Some metadata visible', 'Family context preserved']
                },
                {
                  level: 'minimal' as PrivacyLevel,
                  label: 'Transparent',
                  description: 'Standard encryption for public interactions',
                  icon: '👁️',
                  features: ['Public Lightning Address', 'Business communications', 'Social interactions']
                }
              ].map(option => (
                <div key={option.level} className="flex items-start space-x-3">
                  <input
                    type="radio"
                    name="privacyLevel"
                    checked={privacyLevel === option.level}
                    onChange={() => setPrivacyLevel(option.level)}
                    className="mt-1 text-purple-500 focus:ring-purple-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-lg">{option.icon}</span>
                      <div className="font-medium text-white">{option.label}</div>
                    </div>
                    <div className="text-sm text-purple-200 mb-2">{option.description}</div>
                    <div className="flex flex-wrap gap-2">
                      {option.features.map(feature => (
                        <span key={feature} className="text-xs bg-white/10 text-purple-200 px-2 py-1 rounded">
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/10 p-4 rounded-lg border border-white/20">
            <div className="text-sm text-white font-semibold mb-2">
              Your Profile Preview:
            </div>
            <div className="text-xs text-purple-200 space-y-1">
              <div>Username: {senderProfile?.username || 'Unknown User'}</div>
              <div>Lightning Address: {senderProfile?.username || 'user'}@satnam.pub</div>
              <div>Secure Communications: {privacyLevel === PrivacyLevel.GIFTWRAPPED ? 'Giftwrapped' : privacyLevel === PrivacyLevel.ENCRYPTED ? 'Encrypted' : 'Standard'} Nostr DMs</div>
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
            disabled={!recipientNpub || isSending}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-500 disabled:to-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all duration-300"
          >
            {isSending ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Sending...</span>
              </div>
            ) : (
              'Send Invitation'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}