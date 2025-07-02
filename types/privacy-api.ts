/**
 * Privacy-Enhanced API Types
 * Standardized types for all API endpoints with privacy level support
 */

// Re-export the standardized privacy types
export {
  PrivacyLevel,
  PrivacyMetrics,
  PrivacySettings,
} from "../src/types/privacy";

// Enhanced request types with privacy support
export interface PrivacyAwareRequest {
  privacyLevel: PrivacyLevel;
  requireGuardianApproval?: boolean;
  metadataProtection?: number;
}

export interface PaymentRequest extends PrivacyAwareRequest {
  amount: number;
  recipient: string;
  memo?: string;
  routingPreference?: "lightning" | "lnproxy" | "cashu" | "fedimint" | "auto";
  maxFee?: number;
  timeoutMs?: number;
}

export interface PaymentResponse {
  success: boolean;
  paymentId?: string;
  privacyLevel: PrivacyLevel;
  routingUsed: "lightning" | "lnproxy" | "cashu" | "fedimint";
  privacyMetrics: {
    metadataProtection: number;
    anonymityScore: number;
    routingPrivacy: number;
  };
  fee?: number;
  error?: string;
}

export interface FamilyMemberRequest extends PrivacyAwareRequest {
  familyId: string;
  memberRole: "parent" | "child" | "guardian";
  permissions: string[];
}

export interface GuardianApprovalRequest {
  familyId: string;
  memberHash: string;
  operationType: "payment" | "privacy_change" | "permission_update";
  requestedPrivacyLevel: PrivacyLevel;
  operationDetails: any;
  expiresInHours?: number;
}

export interface GuardianApprovalResponse {
  approvalId: string;
  status: "pending" | "approved" | "rejected" | "expired";
  requiredSignatures: number;
  currentSignatures: number;
  expiresAt: string;
}

export interface PrivacyAuditEntry {
  id: string;
  userHash: string;
  operationType: string;
  privacyLevel: PrivacyLevel;
  metadataProtection: number;
  timestamp: string;
  operationDetails: any;
}

export interface TransactionWithPrivacy {
  id: string;
  type: "payment" | "receive" | "swap";
  amount: number;
  fee: number;
  timestamp: string;
  status: "pending" | "completed" | "failed";
  privacyLevel: PrivacyLevel;
  privacyRouting: boolean;
  metadataProtectionLevel: number;
  memo?: string;
  counterparty?: string;
}

export interface IndividualWalletWithPrivacy {
  memberId: string;
  username: string;
  lightningAddress: string;
  lightningBalance: number;
  cashuBalance: number;
  fedimintBalance: number;
  privacySettings: {
    defaultPrivacyLevel: PrivacyLevel;
    allowMinimalPrivacy: boolean;
    lnproxyEnabled: boolean;
    cashuPreferred: boolean;
    requireGuardianApproval: boolean;
  };
  spendingLimits: {
    daily: number;
    weekly: number;
    requiresApproval: number;
  };
  recentTransactions: TransactionWithPrivacy[];
}

export interface FamilyMemberWithPrivacy {
  id: string;
  name: string;
  role: "parent" | "child" | "guardian";
  permissions: string[];
  lightningAddress: string;
  defaultPrivacyLevel: PrivacyLevel;
  guardianApprovalRequired: boolean;
  privacyPreferences: {
    allowPublicTransactions: boolean;
    maxPublicAmount: number;
    preferredRouting: "lightning" | "cashu" | "fedimint";
  };
  balance: {
    lightning: number;
    cashu: number;
    fedimint: number;
  };
  allowance?: {
    weekly: number;
    nextPayment: string;
    privacyLevel: PrivacyLevel;
  };
  status: "active" | "inactive";
  joinedAt: string;
}

// API Error types with privacy context
export interface PrivacyAPIError {
  error: string;
  code: string;
  privacyImpact?: "none" | "metadata_leak" | "identity_exposure";
  suggestedPrivacyLevel?: PrivacyLevel;
  guardianApprovalRequired?: boolean;
}

// Validation schemas
export const PrivacyLevelSchema = {
  type: "string",
  enum: ["giftwrapped", "encrypted", "minimal"],
} as const;

export const PaymentRequestSchema = {
  type: "object",
  required: ["amount", "recipient", "privacyLevel"],
  properties: {
    amount: { type: "number", minimum: 1 },
    recipient: { type: "string", minLength: 1 },
    privacyLevel: PrivacyLevelSchema,
    memo: { type: "string", maxLength: 500 },
    routingPreference: {
      type: "string",
      enum: ["lightning", "lnproxy", "cashu", "fedimint", "auto"],
    },
    maxFee: { type: "number", minimum: 0 },
    timeoutMs: { type: "number", minimum: 1000, maximum: 300000 },
  },
} as const;
