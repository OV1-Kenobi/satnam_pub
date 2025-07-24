/**
 * Family-related type definitions
 */

/**
 * Represents a family member (legacy interface)
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
  role: "private" | "offspring" | "adult" | "steward" | "guardian";
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
 * Enhanced Family Treasury with dual-protocol support
 */
export interface EnhancedFamilyTreasury {
  // Lightning operations for external payments and zaps
  lightningBalance: number;
  lightningAddress: string; // family@satnam.pub
  phoenixdStatus: {
    connected: boolean;
    automatedLiquidity: boolean;
    channelCount: number;
    totalCapacity: number;
    liquidityRatio: number;
  };

  // Fedimint eCash for internal governance
  fedimintEcashBalance: number;
  guardiansOnline: number;
  guardiansTotal: number;
  consensusThreshold: number;
  pendingApprovals: FamilyApproval[];

  // Unified operations
  recentTransactions: (LightningTransaction | FedimintTransaction)[];
  monthlySpending: {
    lightning: number;
    fedimint: number;
    total: number;
  };

  // Analytics
  weeklyGrowth: number;
  monthlyGrowth: number;
  lastUpdated: Date;
}

/**
 * Family payment routing intelligence
 */
export interface FamilyPaymentRouting {
  paymentType: "external" | "zap" | "internal_governance" | "allowance";
  recommendedProtocol: "lightning" | "fedimint";
  reason: string;
  estimatedFee: number;
  estimatedTime: number; // milliseconds
  privacyLevel: "high" | "medium" | "low";
}

/**
 * Family governance approval for Fedimint operations
 */
export interface FamilyApproval {
  id: string;
  type:
    | "allowance_distribution"
    | "emergency_withdrawal"
    | "spending_limit_change"
    | "guardian_change";
  description: string;
  amount?: number;
  recipient?: string;
  requiredSignatures: number;
  currentSignatures: number;
  guardianApprovals: GuardianApproval[];
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: Date;
  expiresAt: Date;
  createdBy: string;
}

/**
 * Guardian approval for family governance
 */
export interface GuardianApproval {
  guardianId: string;
  guardianName: string;
  approved: boolean;
  signedAt?: Date;
  signature?: string;
}

/**
 * Lightning transaction for family treasury
 */
export interface LightningTransaction {
  id: string;
  type: "lightning";
  direction: "incoming" | "outgoing";
  amount: number;
  fee: number;
  from: string;
  to: string;
  paymentHash: string;
  invoice?: string;
  description: string;
  timestamp: Date;
  status: "completed" | "pending" | "failed";
  privacyRouted: boolean;
  familyMember?: string;
}

/**
 * Fedimint eCash transaction for family governance
 */
export interface FedimintTransaction {
  id: string;
  type: "fedimint";
  direction: "incoming" | "outgoing";
  amount: number;
  fee: number;
  from: string;
  to: string;
  noteId: string;
  description: string;
  timestamp: Date;
  status: "completed" | "pending" | "failed";
  requiresApproval: boolean;
  approvalId?: string;
  familyMember?: string;
}

/**
 * PhoenixD family channel management
 */
export interface PhoenixDFamilyChannel {
  channelId: string;
  familyMember: string;
  capacity: number;
  localBalance: number;
  remoteBalance: number;
  status: "active" | "inactive" | "pending" | "closing";
  automatedLiquidity: boolean;
  lastActivity: Date;
}

/**
 * Fedimint guardian status for family
 */
export interface FamilyGuardian {
  id: string;
  name: string;
  publicKey: string;
  status: "online" | "offline" | "syncing";
  lastSeen: Date;
  votingPower: number;
  familyRole:
    | "adult"
    | "steward"
    | "guardian"
    | "trusted_relative"
    | "family_advisor";
}

/**
 * Family Nostr zapping configuration
 */
export interface FamilyZapConfig {
  enabled: boolean;
  familyLightningAddress: string; // family@satnam.pub
  defaultZapAmount: number;
  maxZapAmount: number;
  allowedMembers: string[]; // member IDs who can zap
  zapSplitRules?: {
    memberId: string;
    percentage: number;
  }[];
}

/**
 * Enhanced family member with dual-protocol support
 */
export interface DualProtocolFamilyMember extends FamilyMember {
  // Lightning specific
  lightningBalance: number;
  phoenixdChannels: PhoenixDFamilyChannel[];
  zapReceived24h: number;
  zapSent24h: number;

  // Fedimint specific
  fedimintBalance: number;
  guardianStatus?: "active" | "inactive" | "pending";
  votingPower?: number;
  pendingApprovals: string[]; // approval IDs

  // Unified
  totalBalance: number;
  preferredProtocol: "lightning" | "fedimint" | "auto";
  privacySettings: {
    enableLNProxy: boolean;
    enableFedimintPrivacy: boolean;
  };
}

/**
 * Represents a family profile in the system
 */
export interface FamilyProfile {
  id: string;
  name: string;
  members: FamilyMember[];
  createdAt?: string;
  updatedAt?: string;
}
