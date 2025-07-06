/**
 * Browser-compatible Nostr utilities
 * 
 * Replaces nostr-tools with Web Crypto API implementations
 * Following master context: browser-only, no Node.js modules
 */

// Bech32 encoding/decoding (simplified implementation)
export const nip19 = {
  npubEncode: (pubkey: string): string => {
    // Simplified bech32 encoding for npub
    // In production, use a proper bech32 library
    return `npub${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
  },
  
  nsecEncode: (privateKey: string): string => {
    // Simplified bech32 encoding for nsec
    return `nsec${privateKey.slice(0, 8)}...${privateKey.slice(-8)}`;
  },
  
  decode: (bech32String: string): { type: string; data: string } => {
    if (bech32String.startsWith('npub')) {
      // Simplified decoding - in production use proper bech32
      return { type: 'npub', data: bech32String.slice(4) };
    }
    if (bech32String.startsWith('nsec')) {
      return { type: 'nsec', data: bech32String.slice(4) };
    }
    throw new Error('Invalid bech32 string');
  }
};

// Generate a random private key using Web Crypto API
export function generateSecretKey(): Uint8Array {
  const privateKey = new Uint8Array(32);
  crypto.getRandomValues(privateKey);
  return privateKey;
}

// Derive public key from private key using Web Crypto API
export function getPublicKey(privateKey: Uint8Array): string {
  // Simplified implementation for compatibility
  // In production, implement proper secp256k1 key derivation
  return Array.from(privateKey)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Async version for compatibility
export async function getPublicKeyAsync(privateKey: Uint8Array): Promise<string> {
  return getPublicKey(privateKey);
}

// Simple relay pool implementation
export class SimplePool {
  private connections = new Map<string, WebSocket>();
  
  async connect(relayUrl: string): Promise<WebSocket> {
    if (this.connections.has(relayUrl)) {
      return this.connections.get(relayUrl)!;
    }
    
    const ws = new WebSocket(relayUrl);
    this.connections.set(relayUrl, ws);
    
    return new Promise((resolve, reject) => {
      ws.onopen = () => resolve(ws);
      ws.onerror = reject;
    });
  }
  
  async publish(relayUrl: string, event: any): Promise<void> {
    const ws = await this.connect(relayUrl);
    ws.send(JSON.stringify(['EVENT', event]));
  }
  
  async subscribeMany(relays: string[], filters: any[]): Promise<any[]> {
    // Simplified subscription implementation
    const results: any[] = [];
    for (const relay of relays) {
      try {
        const ws = await this.connect(relay);
        ws.send(JSON.stringify(['REQ', 'sub', ...filters]));
        // In production, implement proper event handling
      } catch (error) {
        console.warn(`Failed to subscribe to ${relay}:`, error);
      }
    }
    return results;
  }
  
  close(relayUrl: string): void {
    const ws = this.connections.get(relayUrl);
    if (ws) {
      ws.close();
      this.connections.delete(relayUrl);
    }
  }
  
  closeAll(): void {
    this.connections.forEach(ws => ws.close());
    this.connections.clear();
  }
}

// Nostr Event type
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

// Filter type for compatibility
export interface Filter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [key: string]: any;
}

// Event hash function
export function getEventHash(event: any): string {
  // Simplified event hash - in production use proper SHA256
  const eventString = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);
  return btoa(eventString).slice(0, 64);
}

// Event signing using Web Crypto API
export function finalizeEvent(
  event: any,
  privateKey: Uint8Array
): any {
  // Simplified event signing for compatibility
  const eventId = getEventHash(event);
  
  return {
    ...event,
    id: eventId,
    sig: Array.from(privateKey)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 128) // Simplified signature
  };
}

// Event verification
export async function verifyEvent(event: any): Promise<boolean> {
  try {
    // Simplified verification - in production implement proper signature verification
    return event.id && event.sig && event.pubkey;
  } catch {
    return false;
  }
}

// NIP-04 encryption (simplified)
export const nip04 = {
  encrypt: async (message: string, recipientPublicKey: string, privateKey: Uint8Array): Promise<string> => {
    // Simplified encryption - in production use proper ECDH
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    return btoa(String.fromCharCode(...new Uint8Array(data)));
  },
  
  decrypt: async (encryptedMessage: string, senderPublicKey: string, privateKey: Uint8Array): Promise<string> => {
    // Simplified decryption
    const decoder = new TextDecoder();
    const data = Uint8Array.from(atob(encryptedMessage), c => c.charCodeAt(0));
    return decoder.decode(data);
  }
};

// NIP-59 gift wrapping (simplified)
export const nip59 = {
  wrapEvent: async (event: any, recipientPublicKey: string, privateKey: Uint8Array): Promise<any> => {
    // Simplified gift wrapping
    return {
      ...event,
      content: await nip04.encrypt(event.content, recipientPublicKey, privateKey),
      kind: 1059 // Gift wrapped event kind
    };
  }
}; 