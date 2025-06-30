/**
 * @fileoverview Nostr Protocol Encryption for Communications
 * @description NIP-59 Gift Wrapping and NIP-04 encryption implementation
 * Privacy-first communication encryption with fallback support
 */

import crypto from 'crypto';

/**
 * Generate a cryptographically secure UUID v4 (browser-compatible)
 */
function generateSecureUUID() {
  return crypto.randomUUID();
}

// Nostr event kinds - Using Established NIPs
const NOSTR_KINDS = {
  // Standard Nostr events
  TEXT_NOTE: 1,
  ENCRYPTED_DIRECT_MESSAGE: 4,
  GIFT_WRAP: 1059,
  GIFT_WRAP_SEAL: 13,
  
  // NIP-28 (Public Chat) events
  CHANNEL_CREATION: 40,      // Channel creation
  CHANNEL_METADATA: 41,      // Channel metadata
  CHANNEL_MESSAGE: 42,       // Channel message
  CHANNEL_HIDE_MESSAGE: 43,  // Hide message
  CHANNEL_MUTE_USER: 44,     // Mute user
  
  // NIP-29 (Relay-based Groups) events
  GROUP_CHAT_MESSAGE: 9,     // Group chat message
  GROUP_THREAD_REPLY: 10,    // Group thread reply
  GROUP_THREAD_MENTION: 11,  // Group thread mention
  GROUP_CHAT_THREAD: 12,     // Group chat thread
  GROUP_ADMIN_REQUEST: 9000, // Group admin request
  GROUP_ADMIN_RESPONSE: 9001, // Group admin response
  GROUP_ADMIN_CREATE: 9002,  // Group admin create
  GROUP_ADMIN_METADATA: 9003, // Group admin metadata
  GROUP_ADMIN_MEMBERS: 9004, // Group admin members
  GROUP_ADMIN_ROLES: 9005,   // Group admin roles
  GROUP_ADMIN_INVITE: 9006,  // Group admin invite
  GROUP_ADMIN_LEAVE: 9007,   // Group admin leave
};

/**
 * Generate Nostr event structure
 */
function createNostrEvent(kind, content, pubkey, tags = []) {
  const event = {
    id: '',
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind,
    tags,
    content,
    sig: ''
  };
  
  // Generate event ID (hash of serialized event)
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);
  
  event.id = crypto.createHash('sha256').update(serialized).digest('hex');
  
  return event;
}

/**
 * NIP-04 Encryption (fallback for non-supporting clients)
 */
export class NIP04Encryption {
  /**
   * Encrypt message using NIP-04 standard
   */
  static async encrypt(message, recipientPubkey, senderPrivkey) {
    try {
      // Generate shared secret using ECDH
      const sharedSecret = await this.generateSharedSecret(recipientPubkey, senderPrivkey);
      
      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(16));
      
      // Encrypt using AES-256-CBC
      const encoder = new TextEncoder();
      const messageBuffer = encoder.encode(message);
      
      const key = await crypto.subtle.importKey(
        'raw',
        sharedSecret,
        { name: 'AES-CBC' },
        false,
        ['encrypt']
      );
      
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv },
        key,
        messageBuffer
      );
      
      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);
      
      // Base64 encode
      return btoa(String.fromCharCode(...combined));
      
    } catch (error) {
      throw new Error(`NIP-04 encryption failed: ${error.message}`);
    }
  }
  
  /**
   * Decrypt NIP-04 encrypted message
   */
  static async decrypt(encryptedMessage, senderPubkey, recipientPrivkey) {
    try {
      // Decode base64
      const combined = new Uint8Array(
        atob(encryptedMessage).split('').map(c => c.charCodeAt(0))
      );
      
      // Extract IV and encrypted data
      const iv = combined.slice(0, 16);
      const encrypted = combined.slice(16);
      
      // Generate shared secret
      const sharedSecret = await this.generateSharedSecret(senderPubkey, recipientPrivkey);
      
      // Decrypt
      const key = await crypto.subtle.importKey(
        'raw',
        sharedSecret,
        { name: 'AES-CBC' },
        false,
        ['decrypt']
      );
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv },
        key,
        encrypted
      );
      
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
      
    } catch (error) {
      throw new Error(`NIP-04 decryption failed: ${error.message}`);
    }
  }
  
  /**
   * Generate shared secret for ECDH
   */
  static async generateSharedSecret(pubkey, privkey) {
    // Simplified implementation - in production, use proper secp256k1 library
    const encoder = new TextEncoder();
    const combined = encoder.encode(pubkey + privkey);
    return await crypto.subtle.digest('SHA-256', combined);
  }
}

/**
 * NIP-59 Gift Wrapping (maximum privacy)
 */
export class NIP59GiftWrapping {
  /**
   * Create gift-wrapped message
   */
  static async createGiftWrap(message, recipientPubkey, senderPrivkey, options = {}) {
    try {
      const {
        delayMinutes = 0,
        familyContext = null,
        requiresApproval = false,
        expiry = null
      } = options;
      
      // Step 1: Create the inner event (seal)
      const sealEvent = createNostrEvent(
        NOSTR_KINDS.GIFT_WRAP_SEAL,
        message,
        senderPrivkey, // In production: derive public key from private key
        [
          ['p', recipientPubkey],
          ...(familyContext ? [['family', familyContext]] : []),
          ...(requiresApproval ? [['approval', 'required']] : []),
          ...(expiry ? [['expiry', expiry.toString()]] : [])
        ]
      );
      
      // Step 2: Encrypt the seal
      const encryptedSeal = await NIP04Encryption.encrypt(
        JSON.stringify(sealEvent),
        recipientPubkey,
        senderPrivkey
      );
      
      // Step 3: Create random keypair for gift wrap
      const randomPubkey = crypto.randomUUID();  // In production: derive from private key
      
      // Step 4: Create gift wrap event
      const giftWrapEvent = createNostrEvent(
        NOSTR_KINDS.GIFT_WRAP,
        encryptedSeal,
        randomPubkey,
        [
          ['p', recipientPubkey],
          ['delay', delayMinutes.toString()]
        ]
      );
      
      // Step 5: Calculate delivery time
      const deliveryTime = new Date(Date.now() + (delayMinutes * 60 * 1000));
      
      return {
        event: giftWrapEvent,
        deliveryTime,
        metadata: {
          encrypted: true,
          giftWrapped: true,
          delayed: delayMinutes > 0,
          requiresApproval,
          familyContext
        }
      };
      
    } catch (error) {
      throw new Error(`Gift wrap creation failed: ${error.message}`);
    }
  }
  
  /**
   * Unwrap gift-wrapped message
   */
  static async unwrapGiftWrap(giftWrapEvent, recipientPrivkey) {
    try {
      // Step 1: Decrypt the gift wrap content
      const encryptedSeal = giftWrapEvent.content;
      
      // Step 2: Find sender from gift wrap (requires additional lookup)
      const senderTag = giftWrapEvent.tags.find(tag => tag[0] === 'p');
      if (!senderTag) {
        throw new Error('No sender found in gift wrap');
      }
      
      // Step 3: Decrypt the seal
      const sealJson = await NIP04Encryption.decrypt(
        encryptedSeal,
        giftWrapEvent.pubkey, // Random pubkey from gift wrap
        recipientPrivkey
      );
      
      const sealEvent = JSON.parse(sealJson);
      
      // Step 4: Extract message content
      return {
        message: sealEvent.content,
        sender: sealEvent.pubkey,
        timestamp: sealEvent.created_at,
        tags: sealEvent.tags,
        metadata: {
          giftWrapped: true,
          unwrapped: true
        }
      };
      
    } catch (error) {
      throw new Error(`Gift wrap unwrapping failed: ${error.message}`);
    }
  }
}

/**
 * NIP-28 Group Channel Management (Family/Peer Groups)
 */
export class NostrGroupChannels {
  /**
   * Create group channel (NIP-28 Channel Creation)
   */
  static createGroupChannel(channelData, senderPubkey, options = {}) {
    const {
      groupType = 'peer', // 'family' or 'peer'
      privacyLevel = 'giftwrapped',
      familyFederationId = null,
      adminPubkeys = []
    } = options;
    
    const channelInfo = {
      name: channelData.name,
      about: channelData.description || `${groupType} group for secure communications`,
      picture: channelData.picture || null
    };
    
    const tags = [
      ['group-type', groupType], // Custom tag for family vs peer distinction
      ['privacy-level', privacyLevel],
      ...(groupType === 'family' && familyFederationId ? [['family-federation', familyFederationId]] : []),
      ...adminPubkeys.map(pubkey => ['admin', pubkey]),
      ...(groupType === 'family' ? [['guardian-oversight', 'true'], ['spending-context', 'family-banking']] : []),
      ...(groupType === 'peer' ? [['trust-level', 'verified'], ['relationship', channelData.relationship || 'business']] : [])
    ];
    
    return createNostrEvent(
      NOSTR_KINDS.CHANNEL_CREATION,
      JSON.stringify(channelInfo),
      senderPubkey,
      tags
    );
  }
  
  /**
   * Create group message (NIP-28 Channel Message)
   */
  static createGroupMessage(message, channelId, senderPubkey, members, options = {}) {
    const {
      groupType = 'peer',
      priority = 'normal',
      requiresGuardianApproval = false,
      emergencyLevel = null,
      familyId = null
    } = options;
    
    const tags = [
      ['e', channelId], // NIP-28 channel reference
      ...members.map(memberPub => ['p', memberPub]), // Group members
      [`${groupType}-group`, 'true'], // Context tag
      ['group-type', groupType], // Group type distinction
      ['privacy-level', options.privacyLevel || 'giftwrapped'],
      ['priority', priority],
      ...(requiresGuardianApproval ? [['guardian-approval', 'required']] : []),
      ...(emergencyLevel ? [['emergency', emergencyLevel]] : []),
      ...(familyId ? [['family-context', familyId]] : [])
    ];
    
    return createNostrEvent(
      NOSTR_KINDS.CHANNEL_MESSAGE,
      message,
      senderPubkey,
      tags
    );
  }
  
  /**
   * Create group membership management event (NIP-29 Enhanced)
   */
  static createGroupMembership(groupId, memberUpdates, adminPubkey, options = {}) {
    const {
      groupType = 'peer',
      familyFederationId = null
    } = options;
    
    const tags = [
      ['e', groupId],
      ...memberUpdates.map(update => [
        'p', 
        update.npub, 
        '', 
        update.role // NIP-29 role format
      ]),
      ...(groupType === 'family' && familyFederationId ? [
        ['family-federation', familyFederationId],
        ['family-role', 'member'],
        ['spending-limits', '10000'] // Family banking context
      ] : [])
    ];
    
    return createNostrEvent(
      NOSTR_KINDS.GROUP_ADMIN_MEMBERS,
      '',
      adminPubkey,
      tags
    );
  }
  
  /**
   * Create emergency communication event (using NIP-28 foundation)
   */
  static createEmergencyGroupMessage(message, channelId, senderPubkey, members, emergencyType, familyId) {
    const tags = [
      ['e', channelId],
      ...members.map(memberPub => ['p', memberPub]),
      ['family-group', 'true'],
      ['group-type', 'family'],
      ['emergency', emergencyType],
      ['priority', 'critical'],
      ['guardian-approval', 'required'],
      ['broadcast', 'true'],
      ['family-context', familyId]
    ];
    
    return createNostrEvent(
      NOSTR_KINDS.CHANNEL_MESSAGE,
      message,
      senderPubkey,
      tags
    );
  }
}

/**
 * Satnam Gift Wrapped Group Communications
 * Integrates NIP-28/29 with NIP-59 for privacy-enhanced family/peer group messaging
 */
export class SatnamGiftWrappedGroupCommunications {
  /**
   * Create a family group using NIP-28 foundation with NIP-59 privacy
   */
  static async createFamilyGroup(groupData, adminPubkey, adminPrivkey, options = {}) {
    const {
      familyFederationId,
      adminPubkeys = [adminPubkey],
      privacyLevel = 'giftwrapped'
    } = options;
    
    // Step 1: Create NIP-28 channel creation event
    const channelEvent = NostrGroupChannels.createGroupChannel(
      groupData,
      adminPubkey,
      {
        groupType: 'family',
        privacyLevel,
        familyFederationId,
        adminPubkeys
      }
    );
    
    // Step 2: Gift wrap the channel creation if maximum privacy
    if (privacyLevel === 'giftwrapped') {
      const giftWrappedChannel = await NIP59GiftWrapping.createGiftWrap(
        JSON.stringify(channelEvent),
        adminPubkey, // Self-wrap or to other admins
        adminPrivkey,
        {
          delayMinutes: options.delayMinutes || 0,
          familyContext: familyFederationId,
          requiresApproval: false // Channel creation doesn't need approval
        }
      );
      
      return {
        channelId: channelEvent.id,
        giftWrappedEvent: giftWrappedChannel.event,
        channelEvent: channelEvent,
        deliveryTime: giftWrappedChannel.deliveryTime,
        metadata: { ...giftWrappedChannel.metadata, groupType: 'family' }
      };
    }
    
    return {
      channelId: channelEvent.id,
      channelEvent: channelEvent,
      deliveryTime: new Date(),
      metadata: { encrypted: false, giftWrapped: false, groupType: 'family' }
    };
  }
  
  /**
   * Create a peer group using NIP-28 foundation
   */
  static async createPeerGroup(groupData, adminPubkey, adminPrivkey, options = {}) {
    const {
      relationship = 'business',
      privacyLevel = 'giftwrapped'
    } = options;
    
    // Use same NIP-28 foundation with peer-specific tags
    const channelEvent = NostrGroupChannels.createGroupChannel(
      { ...groupData, relationship },
      adminPubkey,
      {
        groupType: 'peer',
        privacyLevel
      }
    );
    
    if (privacyLevel === 'giftwrapped') {
      const giftWrappedChannel = await NIP59GiftWrapping.createGiftWrap(
        JSON.stringify(channelEvent),
        adminPubkey,
        adminPrivkey,
        {
          delayMinutes: options.delayMinutes || 0,
          requiresApproval: false
        }
      );
      
      return {
        channelId: channelEvent.id,
        giftWrappedEvent: giftWrappedChannel.event,
        channelEvent: channelEvent,
        deliveryTime: giftWrappedChannel.deliveryTime,
        metadata: { ...giftWrappedChannel.metadata, groupType: 'peer' }
      };
    }
    
    return {
      channelId: channelEvent.id,
      channelEvent: channelEvent,
      deliveryTime: new Date(),
      metadata: { encrypted: false, giftWrapped: false, groupType: 'peer' }
    };
  }
  
  /**
   * Send group message with Gift Wrapping (replaces custom family NIPs)
   */
  static async sendGroupMessage(messageData, sender, privacyLevel = 'giftwrapped', options = {}) {
    const messageId = generateSecureUUID();
    const {
      channelId,
      members,
      groupType = 'peer',
      familyId,
      priority = 'normal',
      requiresApproval = false,
      delayMinutes = 0
    } = messageData;
    
    // Step 1: Create NIP-28 group message event
    const groupMessage = NostrGroupChannels.createGroupMessage(
      messageData.content,
      channelId,
      sender.pubkey,
      members,
      {
        groupType,
        priority,
        requiresApproval,
        familyId,
        privacyLevel,
        ...options
      }
    );
    
    // Step 2: Apply privacy level
    switch (privacyLevel) {
      case 'giftwrapped': {
        // Gift wrap for all group members
        const giftWrappedMessages = await Promise.all(
          members.map(async (memberPubkey) => {
            const giftWrap = await NIP59GiftWrapping.createGiftWrap(
              JSON.stringify(groupMessage),
              memberPubkey,
              sender.privkey,
              {
                delayMinutes,
                familyContext: familyId,
                requiresApproval,
                expiry: options.expiry
              }
            );
            
            return {
              recipientPubkey: memberPubkey,
              giftWrappedEvent: giftWrap.event,
              deliveryTime: giftWrap.deliveryTime
            };
          })
        );
        
        return {
          messageId,
          groupMessage,
          giftWrappedMessages,
          deliveryTime: giftWrappedMessages[0]?.deliveryTime || new Date(),
          metadata: {
            encrypted: true,
            giftWrapped: true,
            groupType,
            memberCount: members.length,
            delayed: delayMinutes > 0,
            requiresApproval
          }
        };
      }
        
      case 'encrypted': {
        // Use NIP-04 encryption for each member
        const encryptedMessages = await Promise.all(
          members.map(async (memberPubkey) => {
            const encrypted = await NIP04Encryption.encrypt(
              JSON.stringify(groupMessage),
              memberPubkey,
              sender.privkey
            );
            
            return {
              recipientPubkey: memberPubkey,
              encryptedContent: encrypted
            };
          })
        );
        
        return {
          messageId,
          groupMessage,
          encryptedMessages,
          deliveryTime: new Date(),
          metadata: {
            encrypted: true,
            giftWrapped: false,
            groupType,
            memberCount: members.length,
            immediate: true
          }
        };
      }
        
      case 'standard': {
        // Basic NIP-04 encryption
        const basicEncryptedMessages = await Promise.all(
          members.map(async (memberPubkey) => {
            const encrypted = await NIP04Encryption.encrypt(
              JSON.stringify(groupMessage),
              memberPubkey,
              sender.privkey
            );
            
            return {
              recipientPubkey: memberPubkey,
              encryptedContent: encrypted
            };
          })
        );
        
        return {
          messageId,
          groupMessage,
          encryptedMessages: basicEncryptedMessages,
          deliveryTime: new Date(),
          metadata: {
            encrypted: true,
            giftWrapped: false,
            groupType,
            memberCount: members.length,
            level: 'standard'
          }
        };
      }
        
      default:
        throw new Error(`Unknown privacy level: ${privacyLevel}`);
    }
  }
  
  /**
   * Legacy compatibility: Encrypt single message with privacy level
   */
  static async encryptMessage(message, recipient, sender, privacyLevel, options = {}) {
    const messageId = generateSecureUUID();
    
    switch (privacyLevel) {
      case 'giftwrapped': {
        const giftWrap = await NIP59GiftWrapping.createGiftWrap(
          message,
          recipient.pubkey,
          sender.privkey,
          {
            delayMinutes: options.delayMinutes || 0,
            familyContext: options.familyId,
            requiresApproval: options.requiresApproval,
            expiry: options.expiry
          }
        );
        
        return {
          messageId,
          encryptedContent: giftWrap.event,
          deliveryTime: giftWrap.deliveryTime,
          metadata: giftWrap.metadata
        };
      }
        
      case 'encrypted': {
        const encrypted = await NIP04Encryption.encrypt(
          message,
          recipient.pubkey,
          sender.privkey
        );
        
        return {
          messageId,
          encryptedContent: encrypted,
          deliveryTime: new Date(),
          metadata: {
            encrypted: true,
            giftWrapped: false,
            immediate: true
          }
        };
      }
        
      case 'standard': {
        const basicEncrypted = await NIP04Encryption.encrypt(
          message,
          recipient.pubkey,
          sender.privkey
        );
        
        return {
          messageId,
          encryptedContent: basicEncrypted,
          deliveryTime: new Date(),
          metadata: {
            encrypted: true,
            giftWrapped: false,
            level: 'standard'
          }
        };
      }
        
      default:
        throw new Error(`Unknown privacy level: ${privacyLevel}`);
    }
  }
  
  /**
   * Decrypt message (enhanced for gift-wrapped group messages)
   */
  static async decryptMessage(encryptedData, recipientPrivkey, senderPubkey) {
    if (encryptedData.metadata?.giftWrapped) {
      const unwrapped = await NIP59GiftWrapping.unwrapGiftWrap(
        encryptedData.encryptedContent,
        recipientPrivkey
      );
      
      // Check if this is a group message (contains NIP-28 structure)
      try {
        const groupMessage = JSON.parse(unwrapped.message);
        if (groupMessage.kind === NOSTR_KINDS.CHANNEL_MESSAGE) {
          return {
            message: groupMessage.content,
            groupMessage: groupMessage,
            metadata: { ...unwrapped.metadata, isGroupMessage: true }
          };
        }
      } catch {
        // Not a JSON group message, treat as regular message
      }
      
      return unwrapped;
    } else {
      const decrypted = await NIP04Encryption.decrypt(
        encryptedData.encryptedContent,
        senderPubkey,
        recipientPrivkey
      );
      
      // Check if this is an encrypted group message
      try {
        const groupMessage = JSON.parse(decrypted);
        if (groupMessage.kind === NOSTR_KINDS.CHANNEL_MESSAGE) {
          return {
            message: groupMessage.content,
            groupMessage: groupMessage,
            metadata: { ...encryptedData.metadata, isGroupMessage: true }
          };
        }
      } catch {
        // Not a JSON group message, treat as regular message
      }
      
      return {
        message: decrypted,
        metadata: encryptedData.metadata
      };
    }
  }
}

// Legacy alias for backward compatibility
export const CommunicationEncryption = SatnamGiftWrappedGroupCommunications;

// Named exports for ES6 import syntax
export { NOSTR_KINDS };

export default {
  NIP04Encryption,
  NIP59GiftWrapping,
  NostrGroupChannels,
  SatnamGiftWrappedGroupCommunications,
  CommunicationEncryption, // Legacy alias
  NOSTR_KINDS
};