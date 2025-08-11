/**
 * Secure Messaging Example Component
 * 
 * Demonstrates how to use the secure message signing system for different message types.
 * Shows both NIP-07 and encrypted nsec signing methods with proper user consent.
 */

import React, { useState } from 'react';
import { Send, Shield, AlertTriangle, CheckCircle, Settings } from 'lucide-react';
import { 
  useSecureMessageSigningContext,
  useGroupMessageSigning,
  useDirectMessageSigning,
  useInvitationMessageSigning,
  useSigningPreferences,
  useSigningSecurity
} from './MessagingIntegrationWrapper';

export const SecureMessagingExample: React.FC = () => {
  const [messageContent, setMessageContent] = useState('');
  const [recipientPubkey, setRecipientPubkey] = useState('');
  const [groupId, setGroupId] = useState('');
  const [messageType, setMessageType] = useState<'group' | 'direct' | 'invitation'>('direct');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Hooks for different message types
  const { signGroupMessage } = useGroupMessageSigning();
  const { signDirectMessage } = useDirectMessageSigning();
  const { signInvitationMessage } = useInvitationMessageSigning();
  
  // Signing preferences and security
  const { 
    signingPreference, 
    setSigningPreference, 
    availableMethods 
  } = useSigningPreferences();
  
  const { securityStatus } = useSigningSecurity();

  const handleSendMessage = async () => {
    if (!messageContent.trim()) {
      setResult('Please enter a message');
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      let signingResult;

      switch (messageType) {
        case 'group':
          if (!groupId.trim()) {
            setResult('Please enter a group ID');
            return;
          }
          signingResult = await signGroupMessage(messageContent, groupId);
          break;

        case 'direct':
          if (!recipientPubkey.trim()) {
            setResult('Please enter recipient pubkey');
            return;
          }
          signingResult = await signDirectMessage(messageContent, recipientPubkey);
          break;

        case 'invitation':
          if (!recipientPubkey.trim()) {
            setResult('Please enter recipient pubkey');
            return;
          }
          signingResult = await signInvitationMessage(messageContent, recipientPubkey);
          break;

        default:
          setResult('Invalid message type');
          return;
      }

      if (signingResult.success) {
        setResult(`✅ Message signed successfully with ${signingResult.method}!\nEvent ID: ${signingResult.signedEvent?.id}`);
        setMessageContent('');
      } else {
        setResult(`❌ Signing failed: ${signingResult.error}`);
      }

    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getSecurityStatusColor = () => {
    switch (securityStatus.level) {
      case 'maximum': return 'text-green-600 bg-green-50 border-green-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'unavailable': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center space-x-2">
          <Shield className="h-6 w-6 text-blue-600" />
          <span>Secure Message Signing Demo</span>
        </h2>

        {/* Security Status */}
        <div className={`p-4 rounded-lg border mb-6 ${getSecurityStatusColor()}`}>
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span className="font-semibold">Security Level: {securityStatus.level.toUpperCase()}</span>
          </div>
          <p className="text-sm mt-1">{securityStatus.description}</p>
        </div>

        {/* Signing Method Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Signing Method
          </label>
          <div className="space-y-2">
            {availableMethods.map((method) => (
              <label key={method.method} className="flex items-center space-x-3">
                <input
                  type="radio"
                  name="signingMethod"
                  value={method.method}
                  checked={signingPreference === method.method}
                  onChange={(e) => setSigningPreference(e.target.value as 'nip07' | 'encrypted-nsec')}
                  disabled={!method.available}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className={`text-sm ${method.available ? 'text-gray-900' : 'text-gray-400'}`}>
                      {method.name}
                    </span>
                    {method.recommended && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                        Recommended
                      </span>
                    )}
                    {!method.available && (
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                        Unavailable
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{method.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Message Type Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Message Type
          </label>
          <select
            value={messageType}
            onChange={(e) => setMessageType(e.target.value as 'group' | 'direct' | 'invitation')}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="direct">Direct Message (NIP-59 Gift-Wrapped)</option>
            <option value="group">Group Message (NIP-58)</option>
            <option value="invitation">Invitation Message</option>
          </select>
        </div>

        {/* Recipient/Group Input */}
        {messageType === 'group' ? (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Group ID
            </label>
            <input
              type="text"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="Enter group ID..."
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recipient Public Key
            </label>
            <input
              type="text"
              value={recipientPubkey}
              onChange={(e) => setRecipientPubkey(e.target.value)}
              placeholder="npub1... or hex pubkey"
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* Message Content */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Message Content
          </label>
          <textarea
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            placeholder="Enter your message..."
            rows={4}
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Zero-Content Storage Notice */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-blue-800 text-sm">Zero-Content Storage Policy</h4>
              <p className="text-blue-700 text-sm mt-1">
                We do NOT store the content of your messages. Your message content remains private 
                and is only used for signing purposes. To access message history, use other Nostr 
                clients like <a href="https://0xchat.com" target="_blank" rel="noopener noreferrer" 
                className="underline hover:text-blue-900">0xchat</a>.
              </p>
            </div>
          </div>
        </div>

        {/* Send Button */}
        <button
          onClick={handleSendMessage}
          disabled={isLoading || !messageContent.trim()}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Signing Message...</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              <span>Sign & Send Message</span>
            </>
          )}
        </button>

        {/* Result Display */}
        {result && (
          <div className={`mt-4 p-4 rounded-lg border ${
            result.startsWith('✅') 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex items-start space-x-2">
              {result.startsWith('✅') ? (
                <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              )}
              <pre className="text-sm whitespace-pre-wrap font-mono">{result}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
