/**
 * Shared messaging types for Satnam.pub
 */

export type SigningMethod =
  | "giftwrapped"
  | "nip04"
  | "nip44"
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

