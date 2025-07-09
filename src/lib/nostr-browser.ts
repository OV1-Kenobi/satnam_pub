// Browser-compatible Nostr utilities using proper secp256k1
// Uses @noble/secp256k1 for cryptographic operations

import { getPublicKey as secp256k1GetPublicKey, getSharedSecret, sign, verify, utils } from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

// Nostr event interface
export interface Event {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

// Nostr event without signature
export interface UnsignedEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}

// NIP-19 utilities
export const nip19 = {
  /**
   * Encode npub from public key
   */
  npubEncode(pubkey: string): string {
    const bytes = this.hexToBytes(pubkey);
    return 'npub' + this.base58Encode(bytes);
  },

  /**
   * Decode npub to get public key
   */
  npubDecode(npub: string): string {
    if (!npub.startsWith('npub')) {
      throw new Error('Invalid npub format');
    }
    const bytes = this.base58Decode(npub.slice(4));
    return this.bytesToHex(bytes);
  },

  /**
   * Encode nsec from private key
   */
  nsecEncode(seckey: string): string {
    const bytes = this.hexToBytes(seckey);
    return 'nsec' + this.base58Encode(bytes);
  },

  /**
   * Decode nsec to get private key
   */
  nsecDecode(nsec: string): string {
    if (!nsec.startsWith('nsec')) {
      throw new Error('Invalid nsec format');
    }
    const bytes = this.base58Decode(nsec.slice(4));
    return this.bytesToHex(bytes);
  },

  /**
   * Decode any NIP-19 string
   */
  decode(str: string): { type: string; data: string } {
    if (str.startsWith('npub')) {
      return { type: 'npub', data: this.npubDecode(str) };
    } else if (str.startsWith('nsec')) {
      return { type: 'nsec', data: this.nsecDecode(str) };
    } else {
      throw new Error('Unsupported NIP-19 format');
    }
  },

  /**
   * Convert hex string to bytes
   */
  hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  },

  /**
   * Convert bytes to hex string
   */
  bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  /**
   * Simple base58 encoding
   */
  base58Encode(bytes: Uint8Array): string {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt(0);
    for (let i = 0; i < bytes.length; i++) {
      num = num * BigInt(256) + BigInt(bytes[i]);
    }
    
    let str = '';
    while (num > 0) {
      str = alphabet[Number(num % BigInt(58))] + str;
      num = num / BigInt(58);
    }
    
    // Add leading zeros
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
      str = '1' + str;
    }
    
    return str;
  },

  /**
   * Simple base58 decoding
   */
  base58Decode(str: string): Uint8Array {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt(0);
    let leadingZeros = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const index = alphabet.indexOf(char);
      if (index === -1) {
        throw new Error('Invalid base58 character');
      }
      num = num * BigInt(58) + BigInt(index);
    }
    
    // Count leading zeros
    for (let i = 0; i < str.length && str[i] === '1'; i++) {
      leadingZeros++;
    }
    
    // Convert to bytes
    const bytes: number[] = [];
    while (num > 0) {
      bytes.unshift(Number(num % BigInt(256)));
      num = num / BigInt(256);
    }
    
    // Add leading zeros
    for (let i = 0; i < leadingZeros; i++) {
      bytes.unshift(0);
    }
    
    return new Uint8Array(bytes);
  }
};

// NIP-04 encryption utilities
export const nip04 = {
  /**
   * Encrypt message using NIP-04
   */
  async encrypt(plaintext: string, recipientPubkey: string, senderPrivkey: string): Promise<string> {
    // Generate shared secret using secp256k1 ECDH
    const sharedSecret = await this.getSharedSecret(senderPrivkey, recipientPubkey);
    
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(16));
    
    // Encrypt with AES-256-CBC
    const key = await crypto.subtle.importKey(
      'raw',
      sharedSecret instanceof Uint8Array ? sharedSecret : new Uint8Array(await sharedSecret),
      { name: 'AES-CBC' },
      false,
      ['encrypt']
    );
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv },
      key,
      new TextEncoder().encode(plaintext)
    );
    
    // Return base64 encoded result
    const encryptedBytes = new Uint8Array(encrypted);
    const combined = new Uint8Array(iv.length + encryptedBytes.length);
    combined.set(iv);
    combined.set(encryptedBytes, iv.length);
    
    return btoa(String.fromCharCode(...combined));
  },

  /**
   * Decrypt message using NIP-04
   */
  async decrypt(ciphertext: string, senderPubkey: string, recipientPrivkey: string): Promise<string> {
    // Decode base64
    const combined = new Uint8Array(
      atob(ciphertext).split('').map(char => char.charCodeAt(0))
    );
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 16);
    const encrypted = combined.slice(16);
    
    // Generate shared secret using secp256k1 ECDH
    const sharedSecret = await this.getSharedSecret(recipientPrivkey, senderPubkey);
    
    // Decrypt with AES-256-CBC
    const key = await crypto.subtle.importKey(
      'raw',
      sharedSecret instanceof Uint8Array ? sharedSecret : new Uint8Array(await sharedSecret),
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      key,
      encrypted
    );
    
    return new TextDecoder().decode(decrypted);
  },

  /**
   * Generate shared secret using secp256k1 ECDH
   */
  async getSharedSecret(privkey: string, pubkey: string): Promise<Uint8Array> {
    const privkeyBytes = nip19.hexToBytes(privkey);
    const pubkeyBytes = nip19.hexToBytes(pubkey);
    
    // Use secp256k1 for proper ECDH
    const sharedPoint = getSharedSecret(privkeyBytes, pubkeyBytes);
    
    // Hash the shared point to get the final secret
    return sha256(sharedPoint);
  }
};

// NIP-05 utilities
export const nip05 = {
  /**
   * Verify NIP-05 identifier
   */
  async verifyNip05(identifier: string, pubkey: string): Promise<boolean> {
    try {
      const [localPart, domain] = identifier.split('@');
      if (!localPart || !domain) {
        return false;
      }
      
      const response = await fetch(`https://${domain}/.well-known/nostr.json?name=${localPart}`);
      if (!response.ok) {
        return false;
      }
      
      const data = await response.json();
      const names = data.names || {};
      
      return names[localPart] === pubkey;
    } catch (error) {
      console.error('NIP-05 verification failed:', error);
      return false;
    }
  }
};

// Event utilities
export const finalizeEvent = {
  /**
   * Sign and finalize a Nostr event using proper secp256k1
   */
  async sign(event: UnsignedEvent, privateKey: string): Promise<Event> {
    // Generate event ID
    const eventId = await this.generateEventId(event);
    
    // Sign the event using secp256k1
    const signature = await this.signEvent(eventId, privateKey);
    
    return {
      ...event,
      id: eventId,
      sig: signature
    };
  },

  /**
   * Generate event ID using SHA256
   */
  async generateEventId(event: UnsignedEvent): Promise<string> {
    const eventString = JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content
    ]);
    
    const hash = sha256(new TextEncoder().encode(eventString));
    return nip19.bytesToHex(hash);
  },

  /**
   * Sign event ID using secp256k1
   */
  async signEvent(eventId: string, privateKey: string): Promise<string> {
    const privkeyBytes = nip19.hexToBytes(privateKey);
    const messageBytes = new TextEncoder().encode(eventId);
    
    // Sign using secp256k1
    const signature = await sign(sha256(messageBytes), privkeyBytes);
    
    return nip19.bytesToHex(signature);
  }
};

export const verifyEvent = {
  /**
   * Verify event signature using secp256k1
   */
  async verify(event: Event): Promise<boolean> {
    try {
      // Reconstruct event without signature
      const unsignedEvent: UnsignedEvent = {
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        kind: event.kind,
        tags: event.tags,
        content: event.content
      };
      
      // Generate expected event ID
      const expectedId = await finalizeEvent.generateEventId(unsignedEvent);
      
      // Verify signature using secp256k1
      const messageBytes = new TextEncoder().encode(expectedId);
      const pubkeyBytes = nip19.hexToBytes(event.pubkey);
      const signatureBytes = nip19.hexToBytes(event.sig);
      
      // Verify the signature directly
      return verify(signatureBytes, sha256(messageBytes), pubkeyBytes);
    } catch (error) {
      console.error('Event verification failed:', error);
      return false;
    }
  }
};

// Key generation utilities
export const generateSecretKey = {
  /**
   * Generate a new secret key using secp256k1
   */
  async generate(): Promise<string> {
    const privateKey = utils.randomPrivateKey();
    return nip19.bytesToHex(privateKey);
  }
};

export const getPublicKey = {
  /**
   * Get public key from private key using secp256k1
   */
  async fromPrivateKey(privateKey: string): Promise<string> {
    const privkeyBytes = nip19.hexToBytes(privateKey);
    const publicKey = secp256k1GetPublicKey(privkeyBytes);
    return nip19.bytesToHex(publicKey);
  }
}; 

// SimplePool for managing relay connections
export class SimplePool {
  private relays: Map<string, WebSocket> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map();

  constructor() {
    // Initialize with default relays
  }

  /**
   * Connect to a relay
   */
  async connect(relayUrl: string): Promise<void> {
    if (this.relays.has(relayUrl)) {
      return; // Already connected
    }

    try {
      const ws = new WebSocket(relayUrl);
      
      ws.onopen = () => {
        console.log(`Connected to relay: ${relayUrl}`);
      };

      ws.onerror = (error) => {
        console.error(`Relay connection error (${relayUrl}):`, error);
      };

      ws.onclose = () => {
        console.log(`Disconnected from relay: ${relayUrl}`);
        this.relays.delete(relayUrl);
      };

      this.relays.set(relayUrl, ws);
    } catch (error) {
      console.error(`Failed to connect to relay (${relayUrl}):`, error);
    }
  }

  /**
   * Disconnect from a relay
   */
  disconnect(relayUrl: string): void {
    const ws = this.relays.get(relayUrl);
    if (ws) {
      ws.close();
      this.relays.delete(relayUrl);
    }
  }

  /**
   * Send an event to all connected relays
   */
  async publish(event: any): Promise<void> {
    const eventMessage = JSON.stringify(['EVENT', event]);
    
    for (const [relayUrl, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(eventMessage);
      }
    }
  }

  /**
   * Subscribe to events from relays
   */
  async subscribe(filters: any[], onEvent: (event: any) => void): Promise<string> {
    const subscriptionId = Math.random().toString(36).substring(2);
    
    for (const [relayUrl, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        const message = JSON.stringify(['REQ', subscriptionId, ...filters]);
        ws.send(message);
        
        // Store subscription for cleanup
        if (!this.subscriptions.has(relayUrl)) {
          this.subscriptions.set(relayUrl, new Set());
        }
        this.subscriptions.get(relayUrl)!.add(subscriptionId);
      }
    }

    return subscriptionId;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    for (const [relayUrl, ws] of this.relays) {
      ws.close();
    }
    this.relays.clear();
    this.subscriptions.clear();
  }
} 

// NIP-59 Gift Wrapped Events
export const nip59 = {
  /**
   * Encrypt a gift wrapped event
   */
  async encryptGiftWrapped(
    event: any,
    recipientPubkey: string,
    senderPrivkey: string
  ): Promise<string> {
    // Create gift wrapped event structure
    const giftWrappedEvent = {
      kind: 1059, // Gift wrapped event
      pubkey: event.pubkey,
      created_at: event.created_at,
      content: await nip04.encrypt(event.content, recipientPubkey, senderPrivkey),
      tags: [
        ['p', recipientPubkey], // Recipient
        ['wrapped-event', JSON.stringify(event)] // Original event
      ]
    };

    return JSON.stringify(giftWrappedEvent);
  },

  /**
   * Decrypt a gift wrapped event
   */
  async decryptGiftWrapped(
    giftWrappedEvent: any,
    recipientPrivkey: string,
    senderPubkey: string
  ): Promise<any> {
    try {
      // Decrypt the content
      const decryptedContent = await nip04.decrypt(
        giftWrappedEvent.content,
        senderPubkey,
        recipientPrivkey
      );

      // Find the wrapped event in tags
      const wrappedEventTag = giftWrappedEvent.tags.find(
        (tag: string[]) => tag[0] === 'wrapped-event'
      );

      if (wrappedEventTag) {
        const originalEvent = JSON.parse(wrappedEventTag[1]);
        originalEvent.content = decryptedContent;
        return originalEvent;
      }

      throw new Error('No wrapped event found in gift wrapped event');
    } catch (error) {
      console.error('Failed to decrypt gift wrapped event:', error);
      throw error;
    }
  },

  /**
   * Verify gift wrapped event signature
   */
  async verifyGiftWrapped(giftWrappedEvent: any): Promise<boolean> {
    try {
      // Verify the gift wrapped event signature
      const eventToVerify = {
        ...giftWrappedEvent,
        sig: giftWrappedEvent.sig
      };

      return await verifyEvent.verify(eventToVerify);
    } catch (error) {
      console.error('Failed to verify gift wrapped event:', error);
      return false;
    }
  }
}; 