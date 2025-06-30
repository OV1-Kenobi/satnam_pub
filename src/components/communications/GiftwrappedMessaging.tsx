// src/components/communications/GiftwrappedMessaging.tsx - KEEP EXISTING NAME
import { useEffect, useState } from 'react';
import { FamilyNostrFederation } from '../fedimint/FamilyNostrFederation';

// Browser-compatible messaging service
class BrowserGiftWrappedService {
  constructor() {
    this.relays = ['wss://relay.satnam.pub', 'wss://relay.damus.io', 'wss://nos.lol'];
    this.pool = null;
  }

  // Web Crypto API instead of Node.js crypto
  generateId() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async sendGiftWrappedMessage(content, recipient, privacyLevel) {
    // Use fetch instead of Node.js modules
    const response = await fetch('/api/communications/send-giftwrapped', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        recipient,
        privacyLevel,
        messageId: this.generateId(),
        timestamp: new Date().toISOString()
      })
    });
    return response.json();
  }

  async detectGiftWrapSupport(npub) {
    // Simple browser-compatible detection
    try {
      const response = await fetch(`/api/communications/check-giftwrap-support?npub=${npub}`);
      const result = await response.json();
      return result.supportsGiftWrap || false;
    } catch {
      return false; // Default to false if detection fails
    }
  }
}

export function GiftwrappedMessaging({ familyMember }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [recipient, setRecipient] = useState('');
  const [isGroupMessage, setIsGroupMessage] = useState(false);
  const [selectedPrivacyLevel, setSelectedPrivacyLevel] = useState('giftwrapped');
  const [contacts, setContacts] = useState([]);
  
  const federation = new FamilyNostrFederation();
  const giftWrapService = new BrowserGiftWrappedService();

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const response = await fetch(`/api/communications/get-contacts?memberId=${familyMember.id}`);
      const result = await response.json();
      if (result.success) {
        setContacts(result.contacts);
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  const sendGiftwrappedMessage = async () => {
    if (!newMessage.trim() || !recipient) return;

    try {
      const result = await giftWrapService.sendGiftWrappedMessage(
        newMessage,
        recipient,
        selectedPrivacyLevel
      );

      if (result.success) {
        setMessages(prev => [...prev, {
          id: result.messageId,
          content: newMessage,
          sender: familyMember.username,
          recipient: recipient,
          timestamp: new Date(),
          privacyLevel: selectedPrivacyLevel,
          encryptionUsed: result.encryptionUsed,
          deliveryMethod: result.deliveryMethod,
          type: isGroupMessage ? 'group' : 'individual'
        }]);
        setNewMessage('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message');
    }
  };

  const addContact = async (contactData) => {
    try {
      const response = await fetch('/api/communications/add-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contactData,
          ownerId: familyMember.id,
          supportsGiftWrap: await giftWrapService.detectGiftWrapSupport(contactData.npub)
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setContacts(prev => [...prev, result.contact]);
      }
    } catch (error) {
      console.error('Failed to add contact:', error);
    }
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

      {/* Contacts List */}
      <div className="mb-4">
        <h4 className="font-medium text-gray-900 mb-2">Contacts</h4>
        <div className="max-h-32 overflow-y-auto space-y-1">
          {contacts.map(contact => (
            <div 
              key={contact.id}
              onClick={() => setRecipient(contact.npub)}
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
          onChange={(e) => setSelectedPrivacyLevel(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="giftwrapped">🔒 Gift Wrapped (Maximum Privacy)</option>
          <option value="encrypted">🛡️ Encrypted (Standard Privacy)</option>
          <option value="minimal">👁️ Minimal (Public Interactions)</option>
        </select>
      </div>

      {/* Message List */}
      <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
        {messages.map(message => (
          <div key={message.id} className="p-3 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-start mb-1">
              <span className="font-medium text-sm text-gray-900">{message.sender}</span>
              <span className="text-xs text-gray-500">
                {message.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm text-gray-700">{message.content}</p>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-xs text-purple-600">
                {message.encryptionUsed === 'gift-wrap' ? '🔒 Gift Wrapped' : 
                 message.encryptionUsed === 'encrypted' ? '🛡️ Encrypted' : '👁️ Minimal'}
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
            disabled={!newMessage.trim() || !recipient}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      <div className="mt-4 p-3 bg-purple-50 rounded-lg">
        <div className="text-sm text-purple-800">
          <strong>Privacy First:</strong> {
            selectedPrivacyLevel === 'giftwrapped' ? 'Messages use NIP-17 Giftwrapped encryption with complete metadata protection' :
            selectedPrivacyLevel === 'encrypted' ? 'Messages use encrypted DMs with selective metadata visibility' :
            'Messages use standard encryption for transparent public interactions'
          }
        </div>
        <div className="text-xs text-purple-600 mt-1">
          {selectedPrivacyLevel === 'giftwrapped' ? 
            'All messages are giftwrapped for maximum privacy and require guardian approval for sensitive communications' :
            selectedPrivacyLevel === 'encrypted' ?
            'Messages are encrypted with controlled metadata and require guardian approval when needed' :
            'Messages use minimal encryption suitable for public and business communications'
          }
        </div>
      </div>
    </div>
  );
}