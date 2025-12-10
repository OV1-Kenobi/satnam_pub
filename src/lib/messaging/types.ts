/**
 * Shared messaging types for Satnam.pub
 *
 * Includes NIP-17 compliant DM types with Blossom attachment support.
 */

import type { AttachmentDescriptor } from "../api/blossom-client";

export type SigningMethod =
  | "giftwrapped"
  | "nfc"
  | "nip04"
  | "nip07"
  | "nip44"
  | "session"
  | "signed"
  | "group";

export type SecurityLevel = "maximum" | "standard" | "high" | "medium" | "low";

export interface MessageSendResult {
  success: boolean;
  messageId?: string;
  signingMethod?: SigningMethod;
  securityLevel?: SecurityLevel;
  userMessage?: string;
  error?: string;
  deliveryTime?: string;
}

/**
 * Content structure for NIP-17 compliant DMs with attachment support.
 * This JSON structure is what gets NIP-44 encrypted in the inner event.
 *
 * @example
 * ```json
 * {
 *   "text": "Check out this video!",
 *   "attachments": [{
 *     "url": "https://blossom.nostr.build/abc123",
 *     "fileName": "vacation.mp4",
 *     "mimeType": "video/mp4",
 *     "mediaType": "video",
 *     "size": 12345678,
 *     "sha256": "abc123...",
 *     "enc": {
 *       "algo": "AES-GCM",
 *       "key": "base64-encoded-key",
 *       "iv": "base64-encoded-iv"
 *     }
 *   }]
 * }
 * ```
 */
export interface NIP17MessageContent {
  /** Message text content */
  text: string;
  /** Optional Blossom-encrypted attachments */
  attachments?: AttachmentDescriptor[];
}

/**
 * Extended MessageData with attachment support for DMs.
 * Used by ClientMessageService.sendGiftWrappedMessage().
 */
export interface MessageDataWithAttachments {
  /** Recipient npub or NIP-05 identifier */
  recipient: string;
  /** Message text content */
  content: string;
  /** Message type (e.g., "direct", "otp", "notification") */
  messageType: string;
  /** Encryption level */
  encryptionLevel: string;
  /** Communication type (e.g., "individual", "family") */
  communicationType: string;
  /**
   * Optional attachments to include in the message.
   * Each attachment contains encrypted file URL and decryption keys.
   */
  attachments?: AttachmentDescriptor[];
}

/**
 * Re-export AttachmentDescriptor for convenience
 */
export type { AttachmentDescriptor } from "../api/blossom-client";
