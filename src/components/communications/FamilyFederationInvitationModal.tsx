import { useState } from 'react';
import { FamilyNostrFederation, NostrEvent } from '../../lib/fedimint/family-nostr-federation.js';
import { PrivacyLevel, getDefaultPrivacyLevel } from '../../types/privacy';
import { showToast } from '../../services/toastService';
import { central_event_publishing_service } from '../../../lib/central_event_publishing_service';

interface FamilyData {
  federationId: string;
  familyName: string;
  guardianThreshold: number;
}

interface FamilyFederationInvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  familyData: FamilyData;
}

export function FamilyFederationInvitationModal({ isOpen, onClose, familyData }: FamilyFederationInvitationModalProps) {
  const [inviteeNpub, setInviteeNpub] = useState('');
  const [inviteeRole, setInviteeRole] = useState('child');
  const [invitationMessage, setInvitationMessage] = useState('');
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(getDefaultPrivacyLevel());
  const [spendingLimits, setSpendingLimits] = useState({
    daily: 10000,
    weekly: 50000,
    requiresApproval: 100000
  });
  const [isSending, setIsSending] = useState(false);

  const federation = new FamilyNostrFederation();

  // Validate npub format
  const isValidNpub = (npub: string): boolean => {
    return npub.startsWith('npub1') && npub.length >= 59;
  };

  // Enhanced message sending function
  const sendMessage = async (content: string, recipient: string, privacyLevel: PrivacyLevel) => {
    switch (privacyLevel) {
      case PrivacyLevel.GIFTWRAPPED:
        // Use Gift Wrapped implementation for complete privacy
        return await sendGiftWrappedMessage(content, recipient);

      case PrivacyLevel.ENCRYPTED:
        // Use encrypted DM implementation
        return await sendEncryptedDM(content, recipient);

      case PrivacyLevel.MINIMAL:
        // Use standard message implementation
        return await sendStandardMessage(content, recipient);
    }
  };

  const sendGiftWrappedMessage = async (content: string, recipient: string) => {
    // Gift Wrapped implementation - complete metadata protection using NIP-17/NIP-59
    console.log('Sending family invitation via gift wrapped message with maximum privacy');
    try {
      const { clientMessageService } = await import('../../lib/messaging/client-message-service');
      const result = await clientMessageService.sendGiftWrappedMessage({
        recipient,
        content,
        messageType: 'direct',
        encryptionLevel: 'maximum',
        communicationType: 'family'
      });
      return { success: result.success, method: 'giftwrapped', messageId: result.messageId };
    } catch (error) {
      console.error('Gift wrapped message failed:', error);
      return { success: false, method: 'giftwrapped', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const sendEncryptedDM = async (content: string, recipient: string) => {
    // Encrypted DM implementation using NIP-04/44 via CEPS
    console.log('Sending family invitation via encrypted DM with selective privacy');
    try {
      const messageId = await central_event_publishing_service.sendStandardDirectMessage(recipient, content);
      return { success: true, method: 'encrypted', messageId };
    } catch (error) {
      console.error('Encrypted DM failed:', error);
      return { success: false, method: 'encrypted', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const sendStandardMessage = async (content: string, recipient: string) => {
    // Standard message implementation - uses same encrypted DM but with less metadata protection
    console.log('Sending family invitation via standard message with minimal encryption');
    try {
      const messageId = await central_event_publishing_service.sendStandardDirectMessage(recipient, content);
      return { success: true, method: 'minimal', messageId };
    } catch (error) {
      console.error('Standard message failed:', error);
      return { success: false, method: 'minimal', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const sendFamilyInvitation = async () => {
    // Validate npub before sending
    if (!isValidNpub(inviteeNpub)) {
      showToast.error('Please enter a valid npub (starts with npub1)');
      return;
    }

    setIsSending(true);
    try {
      // Use the enhanced privacy-aware message sending
      const invitationContent = JSON.stringify({
        type: 'family-federation-invitation',
        federationId: familyData.federationId,
        familyName: familyData.familyName,
        inviterRole: 'adult', // or 'guardian'
        proposedRole: inviteeRole,
        spendingLimits: inviteeRole === 'child' ? spendingLimits : null,
        guardianThreshold: familyData.guardianThreshold,
        privacyLevel: privacyLevel,
        federationBenefits: [
          'Protected nsec with Shamir Secret Sharing',
          'Family Lightning treasury access',
          'Guardian-approved spending for safety',
          'Private family communications',
          'Fedimint eCash for privacy',
          'Family Lightning Address @my.satnam.pub'
        ],
        message: invitationMessage || `You're invited to join the ${familyData.familyName} Family Federation on Satnam.pub`,
        acceptanceInstructions: {
          step1: 'Visit satnam.pub/family-invitation',
          step2: 'Enter your Nostr keys or create new ones',
          step3: 'Complete guardian verification process',
          step4: 'Set up your family Lightning Address'
        }
      });

      // Send message using selected privacy level
      const messageResult = await sendMessage(invitationContent, inviteeNpub, privacyLevel);

      if (messageResult && !messageResult.success) {
        showToast.error(`Failed to send message: ${messageResult.error || 'Unknown error'}`);
        setIsSending(false);
        return;
      }

      const invitationEvent: NostrEvent = {
        pubkey: '', // Will be filled by the federation service
        created_at: Math.floor(Date.now() / 1000),
        kind: privacyLevel === PrivacyLevel.GIFTWRAPPED ? 14 : privacyLevel === PrivacyLevel.ENCRYPTED ? 4 : 1, // Gift Wrapped DM, Encrypted DM, or Public Note
        content: invitationContent,
        tags: [
          ['p', inviteeNpub],
          ['family-invitation', 'true'],
          ['federation-id', familyData.federationId],
          ['proposed-role', inviteeRole]
        ]
      };

      // Require guardian approval for family invitations
      const result = await federation.requestGuardianApprovalForSigning(
        invitationEvent,
        'family-invitation'
      );

      if (result.success) {
        showToast.success('Family invitation sent successfully!');
        onClose();
      } else {
        showToast.error(`Failed to send invitation: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to send family invitation:', error);
      showToast.error(error instanceof Error ? error.message : 'Failed to send invitation');
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
          aria-label="Close family invitation modal"
        >
          <span className="text-white text-xl">✕</span>
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl">👨‍👩‍👧‍👦</span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Invite to Family Federation</h2>
          <p className="text-purple-200">
            Invite someone to join the {familyData?.familyName || 'Family'} Federation for sovereign banking
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Invitee Nostr Public Key (npub)
            </label>
            <input
              type="text"
              value={inviteeNpub}
              onChange={(e) => setInviteeNpub(e.target.value)}
              placeholder="npub1..."
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:bg-white/20 focus:border-purple-400 transition-all duration-300"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Family Role
            </label>
            <select
              value={inviteeRole}
              onChange={(e) => setInviteeRole(e.target.value)}
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:bg-white/20 focus:border-purple-400 transition-all duration-300"
            >
              <option value="offspring" className="bg-purple-900 text-white">Offspring (Limited spending, guardian protection)</option>
              <option value="adult" className="bg-purple-900 text-white">Adult (Full access, guardian responsibilities)</option>
              <option value="guardian" className="bg-purple-900 text-white">Guardian (Approval authority, family oversight)</option>
            </select>
          </div>

          {inviteeRole === 'child' && (
            <div className="bg-white/10 p-4 rounded-lg border border-white/20">
              <h4 className="font-semibold text-white mb-3">Spending Limits</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-purple-200">Daily limit:</span>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      value={spendingLimits.daily}
                      onChange={(e) => setSpendingLimits(prev => ({
                        ...prev,
                        daily: parseInt(e.target.value)
                      }))}
                      className="w-24 p-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:bg-white/20 focus:border-purple-400 transition-all duration-300"
                    />
                    <span className="text-xs text-purple-300">sats</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-purple-200">Weekly limit:</span>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      value={spendingLimits.weekly}
                      onChange={(e) => setSpendingLimits(prev => ({
                        ...prev,
                        weekly: parseInt(e.target.value)
                      }))}
                      className="w-24 p-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:bg-white/20 focus:border-purple-400 transition-all duration-300"
                    />
                    <span className="text-xs text-purple-300">sats</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-purple-200">Requires approval:</span>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      value={spendingLimits.requiresApproval}
                      onChange={(e) => setSpendingLimits(prev => ({
                        ...prev,
                        requiresApproval: parseInt(e.target.value)
                      }))}
                      className="w-24 p-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:bg-white/20 focus:border-purple-400 transition-all duration-300"
                    />
                    <span className="text-xs text-purple-300">sats</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Personal Message (Optional)
            </label>
            <textarea
              value={invitationMessage}
              onChange={(e) => setInvitationMessage(e.target.value)}
              placeholder="Welcome to our family's sovereign banking federation..."
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
                  description: 'Sealed - Complete metadata protection',
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
              Federation Benefits:
            </div>
            <ul className="text-xs text-purple-200 space-y-1">
              <li>• Protected nsec with Shamir Secret Sharing</li>
              <li>• Family Lightning treasury access</li>
              <li>• Guardian-approved spending for safety</li>
              <li>• Private family communications</li>
              <li>• Fedimint eCash for privacy</li>
              <li>• Family Lightning Address @my.satnam.pub</li>
            </ul>
          </div>
        </div>

        <div className="flex space-x-3 mt-8">
          <button
            onClick={onClose}
            disabled={isSending}
            className="flex-1 px-6 py-3 bg-white/10 text-white border border-white/20 rounded-lg hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            Cancel
          </button>
          <button
            onClick={sendFamilyInvitation}
            disabled={!inviteeNpub || isSending}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 disabled:from-gray-500 disabled:to-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all duration-300"
          >
            {isSending ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Sending...
              </span>
            ) : (
              'Send Invitation'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}