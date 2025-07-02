// src/components/communications/GiftwrappedMessaging.tsx - KEEP EXISTING NAME
import { useEffect, useState } from 'react';
import { FamilyNostrFederation } from '../../lib/fedimint/family-nostr-federation';
import { GiftwrappedCommunicationService, GiftWrappedMessage } from '../../lib/giftwrapped-communication-service';

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

interface GiftwrappedMessagingProps {
  familyMember: FamilyMember;
}

export function GiftwrappedMessaging({ familyMember }: GiftwrappedMessagingProps) {
  const [messages, setMessages] = useState<GiftWrappedMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [recipient, setRecipient] = useState('');
  const [isGroupMessage, setIsGroupMessage] = useState(false);
  const [selectedPrivacyLevel, setSelectedPrivacyLevel] = useState<'standard' | 'enhanced' | 'maximum'>('maximum');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const federation = new FamilyNostrFederation();
  const giftWrapService = new GiftwrappedCommunicationService();

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const loadedContacts = await giftWrapService.loadContacts(familyMember.id);
      setContacts(loadedContacts);
    } catch (error) {
      console.error('Failed to load contacts:', error);
      setError('Failed to load contacts');
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
      const giftWrappedMessage = await giftWrapService.createGiftWrappedMessage(
        newMessage,
        familyMember.npub,
        recipient,
        selectedPrivacyLevel,
        isGroupMessage ? 'group' : 'individual'
      );

      setMessages(prev => [...prev, giftWrappedMessage]);
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      setError('Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const addContact = async (contactData: Omit<Contact, 'id' | 'supportsGiftWrap'>) => {
    try {
      const result = await giftWrapService.addContact(contactData, familyMember.id);
      if (result.success && result.contact) {
        setContacts(prev => [...prev, result.contact]);
      }
    } catch (error) {
      console.error('Failed to add contact:', error);
      setError('Failed to add contact');
    }
  };

  const handleContactSelect = (contact: Contact) => {
    setRecipient(contact.npub);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Private Family Communications
        </h3>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-xs text-gray-500">End-to-End Encrypted</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Contacts List */}
      <div className="mb-4">
        <h4 className="font-medium text-gray-900 mb-2">Contacts</h4>
        <div className="max-h-32 overflow-y-auto space-y-1">
          {contacts.map(contact => (
            <div 
              key={contact.id}
              onClick={() => handleContactSelect(contact)}
              className="flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-50"
            >
              <div>
                <span className="text-sm font-medium">{contact.username}</span>
                <span className="text-xs text-gray-500 ml-2">
                  {contact.supportsGiftWrap ? '🔒' : '🛡️'}
                </span>
              </div>
              <span className="text-xs text-gray-400">{contact.trustLevel}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Privacy Level Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Privacy Level</label>
        <select 
          value={selectedPrivacyLevel}
          onChange={(e) => setSelectedPrivacyLevel(e.target.value as 'standard' | 'enhanced' | 'maximum')}
          className="w-full p-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="maximum">🔒 Gift Wrapped (Maximum Privacy)</option>
          <option value="enhanced">🛡️ Encrypted (Standard Privacy)</option>
          <option value="standard">👁️ Minimal (Public Interactions)</option>
        </select>
      </div>

      {/* Message List */}
      <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
        {messages.map(message => (
          <div key={message.id} className="p-3 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-start mb-1">
              <span className="font-medium text-sm text-gray-900">
                {message.sender === familyMember.npub ? 'You' : message.sender}
              </span>
              <span className="text-xs text-gray-500">
                {message.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm text-gray-700">{message.content}</p>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-xs text-purple-600">
                {message.privacyLevel === 'maximum' ? '🔒 Gift Wrapped' : 
                 message.privacyLevel === 'enhanced' ? '🛡️ Encrypted' : '👁️ Minimal'}
              </span>
              {message.deliveryMethod === 'delayed' && (
                <span className="text-xs text-orange-600">⏰ Delayed</span>
              )}
              <span className="text-xs text-green-600">
                {message.type === 'group' ? 'Group' : 'Individual'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Message Composition */}
      <div className="space-y-3">
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="Recipient npub or select from contacts"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
          />
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={isGroupMessage}
              onChange={(e) => setIsGroupMessage(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Group</span>
          </label>
        </div>
        
        <div className="flex space-x-2">
          <textarea
            placeholder="Type your private message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 p-2 border border-gray-300 rounded-lg text-sm resize-none"
            rows={2}
          />
          <button
            onClick={sendGiftwrappedMessage}
            disabled={!newMessage.trim() || !recipient || isLoading}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>

      {/* Add Contact Form */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <button
          onClick={() => {
            const username = prompt('Contact username:');
            const npub = prompt('Contact npub:');
            if (username && npub) {
              addContact({
                username,
                npub,
                trustLevel: 'known',
                relationshipType: 'friend'
              });
            }
          }}
          className="text-sm text-blue-700 hover:text-blue-900"
        >
          + Add New Contact
        </button>
      </div>
    </div>
  );
}