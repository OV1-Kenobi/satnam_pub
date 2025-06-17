/**
 * User-related type definitions for privacy-first Nostr authentication
 * NO pubkey/npub storage - uses encrypted data and auth hashes only
 */

/**
 * User status for multi-user onboarding flow
 */
export type UserStatus = "pending" | "active" | "returning";

/**
 * Represents a user in the system with privacy-first design
 * SECURITY: No pubkeys stored - only auth hashes and encrypted data
 */
export interface User {
  id: string;
  username: string;
  auth_hash: string; // Non-reversible hash for authentication
  encrypted_profile?: string; // User-encrypted optional data
  is_discoverable: boolean; // Opt-in discoverability
  user_status: UserStatus; // Onboarding status
  onboarding_completed: boolean; // Identity verification complete
  invited_by?: string; // User ID who invited them
  encryption_hint?: string; // Hint for user's encryption method
  relay_url?: string; // User's preferred relay
  role: "admin" | "user";
  familyId?: string;
  avatar?: string;
  created_at: number; // Unix timestamp to match NostrEvent
  last_login?: number; // Unix timestamp
  npub?: string; // Optional Nostr public key for backward compatibility
}

/**
 * User profile information (derived from User interface)
 */
export interface UserProfile {
  id: string;
  username: string;
  avatar?: string;
  role: "admin" | "user";
  familyId?: string;
  is_discoverable: boolean;
  relay_url?: string;
  created_at: number;
  last_login?: number;
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
 * Payload for OTP authentication (privacy-first)
 */
export interface OTPAuthPayload {
  auth_hash: string; // Use auth hash instead of npub
  otp_code: string;
  session_token: string;
}

/**
 * Privacy-first onboarding session
 * SECURITY: No pubkey storage during onboarding
 */
export interface OnboardingSession {
  id: string;
  temp_username: string;
  auth_challenge_hash?: string; // Hash of auth challenge
  platform_id?: string; // Non-reversible platform identifier
  session_token: string;
  expires_at: number; // Unix timestamp
  completed: boolean;
  created_at: number; // Unix timestamp
}

/**
 * Privacy-first user registration
 * SECURITY: Uses auth hash and encrypted data only
 */
export interface UserRegistration {
  username: string;
  auth_hash: string; // Non-reversible hash created from pubkey
  encrypted_profile?: string; // User-encrypted optional data
  encryption_hint?: string; // Hint for encryption method
  invite_code?: string; // Optional family/group invitation
}

/**
 * Audit log entry for security tracking
 */
export interface AuthAuditLog {
  id: string;
  user_id: string;
  action: string;
  encrypted_details?: string; // User-encrypted audit details
  ip_hash?: string; // Hashed IP for privacy
  user_agent_hash?: string; // Hashed user agent
  success: boolean;
  created_at: number; // Unix timestamp
}
