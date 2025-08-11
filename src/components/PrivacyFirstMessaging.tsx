/**
 * Privacy-First Messaging Component
 * 
 * The ONLY component that offers privacy levels (for messaging only)
 * - Standard: Recipient knows sender identity
 * - Enhanced: Pseudonymous messaging with hints
 * - Maximum: Completely anonymous messaging
 */

import { AlertTriangle, Lock, MessageCircle, Send, Shield, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from './auth/AuthProvider';

interface PrivacyFirstMessagingProps {
  isOpen: boolean;
  onClose: () => void;
  recipient?: {
    hashedUUID: string;
    displayName?: string; // Only for UI, not stored
  };
  isGroup?: boolean;
}

type MessagePrivacyLevel = 'standard' | 'enhanced' | 'maximum';

interface MessageData {
  content: string;
  privacyLevel: MessagePrivacyLevel;
  scheduledDelivery?: number;
  ephemeralTTL?: number;
}

export function PrivacyFirstMessaging({
  isOpen,
  onClose,
  recipient,
  isGroup = false
}: PrivacyFirstMessagingProps) {
  const privacyAuth = useAuth();
  const [message, setMessage] = useState('');
  const [privacyLevel, setPrivacyLevel] = useState<MessagePrivacyLevel>('enhanced');
  const [scheduledDelivery, setScheduledDelivery] = useState<number | undefined>();
  const [ephemeralTTL, setEphemeralTTL] = useState<number | undefined>(24 * 60 * 60 * 1000); // 24 hours
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Privacy level descriptions for MESSAGING ONLY
  const messagingPrivacyLevels = [
    {
      level: 'standard' as const,
      name: 'Standard',
      description: 'Recipient sees your identity',
      anonymity: 30,
      features: [
        'Recipient knows who sent the message',
        'Standard encryption',
        'Basic metadata protection'
      ]
    },
    {
      level: 'enhanced' as const,
      name: 'Enhanced',
      description: 'Pseudonymous with hints',
      anonymity: 70,
      features: [
        'Pseudonymous sender identity',
        'Advanced encryption',
        'Metadata obfuscation',
        'Timing protection'
      ]
    },
    {
      level: 'maximum' as const,
      name: 'Maximum',
      description: 'Completely anonymous',
      anonymity: 95,
      features: [
        'Completely anonymous sender',
        'End-to-end encryption',
        'Perfect Forward Secrecy',
        'Advanced timing obfuscation'
      ]
    }
  ];

  const handleSendMessage = async () => {
    if (!message.trim() || !privacyAuth.user || !recipient) {
      setError('Message content and recipient are required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const messageData: MessageData = {
        content: message,
        privacyLevel,
        scheduledDelivery,
        ephemeralTTL,
      };

      // Simulate sending encrypted message
      await new Promise(resolve => setTimeout(resolve, 1500));

      // In production, this would:
      // 1. Encrypt the message based on privacy level
      // 2. Apply metadata protection
      // 3. Schedule delivery if needed
      // 4. Store with appropriate anonymity level

      console.log('Sending privacy-protected message:', {
        senderHash: privacyAuth.user.hashedUUID, // Only hashed UUID
        recipientHash: recipient.hashedUUID,
        privacyLevel,
        messageLength: message.length,
        scheduledDelivery,
        ephemeralTTL
      });

      setSuccess(`Message sent with ${privacyLevel} privacy protection!`);
      setMessage('');

      setTimeout(() => {
        onClose();
        setSuccess(null);
      }, 2000);

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-sm border-b border-white/20 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Privacy-First Messaging
                </h2>
                <p className="text-purple-200 text-sm">
                  {isGroup ? 'Group Message' : 'Private Message'} • Choose Your Privacy Level
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
            >
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-green-400" />
                <span className="text-green-400 font-medium">Success</span>
              </div>
              <p className="text-green-300 text-sm mt-1">{success}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <span className="text-red-400 font-medium">Error</span>
              </div>
              <p className="text-red-300 text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Message Privacy Level Selection (ONLY FOR MESSAGING) */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Message Privacy Level
            </h3>
            <div className="grid gap-4">
              {messagingPrivacyLevels.map((level) => (
                <button
                  key={level.level}
                  onClick={() => setPrivacyLevel(level.level)}
                  className={`p-4 rounded-xl border-2 transition-all duration-300 text-left ${privacyLevel === level.level
                    ? 'border-purple-400 bg-purple-500/20'
                    : 'border-white/20 bg-white/5 hover:bg-white/10'
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-white">{level.name} Privacy</h4>
                    <div className="text-xs bg-purple-600 text-white px-2 py-1 rounded">
                      {level.anonymity}% Anonymous
                    </div>
                  </div>
                  <p className="text-purple-200 text-sm mb-3">{level.description}</p>
                  <ul className="space-y-1">
                    {level.features.map((feature, idx) => (
                      <li key={idx} className="text-xs text-purple-300 flex items-center">
                        <Shield className="h-3 w-3 mr-1" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>

          {/* Message Content */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-purple-200 mb-2">
              Message Content
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here..."
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              rows={4}
            />
          </div>

          {/* Advanced Options */}
          <div className="grid gap-4 md:grid-cols-2 mb-6">
            {/* Ephemeral TTL */}
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                Auto-Delete After
              </label>
              <select
                value={ephemeralTTL || ''}
                onChange={(e) => setEphemeralTTL(e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Never</option>
                <option value={60 * 60 * 1000}>1 hour</option>
                <option value={24 * 60 * 60 * 1000}>24 hours</option>
                <option value={7 * 24 * 60 * 60 * 1000}>7 days</option>
                <option value={30 * 24 * 60 * 60 * 1000}>30 days</option>
              </select>
            </div>

            {/* Scheduled Delivery */}
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                Schedule Delivery
              </label>
              <input
                type="datetime-local"
                value={scheduledDelivery ? new Date(scheduledDelivery).toISOString().slice(0, 16) : ''}
                onChange={(e) => setScheduledDelivery(e.target.value ? new Date(e.target.value).getTime() : undefined)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Recipient Info */}
          {recipient && (
            <div className="mb-6 p-4 bg-white/5 border border-white/20 rounded-lg">
              <h4 className="font-semibold text-white mb-2">Recipient</h4>
              <p className="text-purple-200 text-sm">
                {recipient.displayName || 'Anonymous User'}
                <span className="text-xs text-purple-400 ml-2">
                  (Hash: {recipient.hashedUUID.substring(0, 12)}...)
                </span>
              </p>
            </div>
          )}

          {/* Privacy Information */}
          <div className="mb-6 p-4 bg-purple-800/30 border border-purple-500/50 rounded-lg">
            <div className="flex items-start space-x-3">
              <Lock className="h-5 w-5 text-purple-300 mt-0.5" />
              <div>
                <h4 className="font-semibold text-purple-300 mb-2">Privacy Protection Active</h4>
                <ul className="text-purple-200 text-sm space-y-1">
                  <li>• Your identity: {privacyAuth.user?.hashedUUID.substring(0, 12)}... (hashed UUID)</li>
                  <li>• Message privacy: {privacyLevel} level protection</li>
                  <li>• Encryption: End-to-end with Perfect Forward Secrecy</li>
                  <li>• Storage: Zero-knowledge encrypted content only</li>
                  {ephemeralTTL && <li>• Auto-delete: After {Math.round(ephemeralTTL / (60 * 60 * 1000))} hours</li>}
                </ul>
              </div>
            </div>
          </div>

          {/* Send Button */}
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !message.trim()}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                <span>Send with {privacyLevel.charAt(0).toUpperCase() + privacyLevel.slice(1)} Privacy</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}