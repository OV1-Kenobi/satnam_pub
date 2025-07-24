/**
 * Shared types used across multiple components
 */

/**
 * MASTER CONTEXT COMPLIANCE: Unified FamilyMember interface
 * Extended to support control board operations while maintaining privacy-first principles
 */
export interface FamilyMember {
  id: string;
  name?: string;
  username: string; // REQUIRED - never undefined
  lightningAddress?: string; // OPTIONAL - can be undefined
  role: "private" | "offspring" | "adult" | "steward" | "guardian" | "admin";
  avatar?: string;
  balance?: number; // Optional balance for display
  nip05Verified?: boolean; // Optional NIP-05 verification status

  // Control Board Extended Properties
  familyId?: string; // Family federation identifier
  nostrPubkey?: string; // Nostr public key for identity verification
  privacyLevel?: "standard" | "enhanced" | "maximum"; // Privacy preference level
  lastActivity?: string | Date; // Last activity timestamp
  dailyLimit?: number; // Daily spending limit (sovereignty: -1 = unlimited)
  status?: "active" | "inactive" | "suspended"; // Account status
  nip05?: string; // NIP-05 identifier (username@domain.tld)
  nwcConnection?: string; // Nostr Wallet Connect connection string for self-custody
  created_at?: string | number; // Account creation timestamp (flexible for compatibility)
  updated_at?: string | number; // Last update timestamp (flexible for compatibility)

  spendingLimits?: {
    daily?: number;
    weekly?: number;
    monthly?: number;
    requiresApproval?: number; // Optional approval threshold
    setBy?: string;
    lastUpdated?: Date;
  };
}

/**
 * Common transaction interface
 */
export interface Transaction {
  id: string;
  type: "sent" | "received";
  amount: number;
  from: string;
  to: string;
  memo?: string;
  timestamp: Date;
  privacyRouted: boolean;
  status: "completed" | "pending" | "failed";
}

/**
 * Node status interface
 */
export interface NodeStatus {
  phoenixd: {
    connected: boolean;
    automatedLiquidity: boolean;
    version?: string;
  };
  voltage: {
    connected: boolean;
    nodeId?: string;
  };
  lnproxy: {
    active: boolean;
    privacyLevel: "high" | "medium" | "low";
  };
  lnbits: {
    operational: boolean;
  };
}

/**
 * Payment request interface
 */
export interface PaymentRequest {
  fromMember: string;
  toMember: string;
  amount: number;
  memo?: string;
  privacyRouting: boolean;
}

/**
 * Payment route interface
 */
export interface PaymentRoute {
  type: "lightning" | "ecash" | "internal";
  estimatedFee: number;
  estimatedTime: number; // milliseconds
  privacy: "high" | "medium" | "low";
  reliability: number; // 0-1
}

/**
 * Validation errors interface
 */
export interface ValidationErrors {
  fromMember?: string;
  toMember?: string;
  amount?: string;
  memo?: string;
}

/**
 * Modal props interface
 */
export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Common form state interface
 */
export interface PaymentFormState {
  from: string;
  to: string;
  satsAmount: string;
  usdAmount: string;
  memo: string;
}
