/**
 * User-related type definitions for Nostr-native authentication
 */

/**
 * Represents a user in the system with Nostr-native identity
 */
export interface User {
  id: string;
  username: string;
  npub: string; // Nostr public key (bech32 encoded)
  nip05: string; // username@satnam.pub
  lightning_address: string; // username@satnam.pub
  relay_url?: string; // User's preferred relay
  role: "admin" | "user";
  familyId?: string;
  avatar?: string;
  created_at: number; // Unix timestamp to match NostrEvent
  last_login?: number; // Unix timestamp to match created_at
}

/**
 * Nostr event interface for authentication
 */
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * Payload for Nostr authentication
 */
export interface NostrAuthPayload {
  npub: string;
  signed_event: NostrEvent;
  session_token?: string;
}

/**
 * Payload for OTP authentication
 */
export interface OTPAuthPayload {
  npub: string;
  otp_code: string;
  session_token: string;
}
