/**
 * Shared types used across multiple components
 */

// Re-export family types for convenience
export type {
  DualProtocolFamilyMember,
  EnhancedFamilyTreasury,
  FamilyApproval,
  FamilyGuardian,
  FamilyMember,
  FamilyPaymentRouting,
  FamilyProfile,
  FamilyZapConfig,
  FedimintTransaction,
  GuardianApproval,
  LightningTransaction,
  PhoenixDFamilyChannel,
  SatnamFamilyMember,
} from "../../types/family";

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
