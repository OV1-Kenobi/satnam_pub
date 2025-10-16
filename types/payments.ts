// Centralized payment-related type definitions
// This file provides a single source of truth for payment types used across the app.

// Branded positive number type for amounts (compile-time aid)
export type PositiveNumber = number & { readonly __brand: "PositiveNumber" };

export interface P2PPaymentRequest {
  toUser: string;
  /**
   * Amount (sats). Must be a positive, finite number.
   * @minimum 1
   */
  amount: number;
  memo?: string;
  paymentType: "P2P_INTERNAL_LIGHTNING" | "P2P_EXTERNAL_LIGHTNING";
  enablePrivacy?: boolean;
}

export interface P2PPaymentResponse {
  success: boolean;
  paymentId?: string;
  paymentHash?: string;
  routing?: {
    preferredNode: string;
    reason?: string;
  };
  privacy?: {
    enabled: boolean;
    serviceUrl?: string;
  };
  security?: {
    validated: boolean;
    environment: string;
  };
  error?: string;
}

export interface ECashBridgeRequest {
  sourceToken: string;
  targetDestination: string;
  operationType:
    | "ECASH_FEDIMINT_TO_CASHU"
    | "ECASH_CASHU_TO_FEDIMINT"
    | "ECASH_FEDIMINT_TO_FEDIMINT"
    | "ECASH_CASHU_EXTERNAL_SWAP";
  isMultiNut?: boolean;
  enablePrivacy?: boolean;
}

export interface ECashBridgeResponse {
  success: boolean;
  operationId?: string;
  conversionId?: string;
  resultToken?: string;
  /** @minimum 0 */
  conversionFee?: number;
  routing?: {
    preferredNode: string;
    reason?: string;
  };
  privacy?: {
    enabled: boolean;
    serviceUrl?: string;
  };
  expiresAt?: string;
  error?: string;
}
