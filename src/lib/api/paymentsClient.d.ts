// TypeScript declaration shim for src/lib/api/paymentsClient.js
// Mirrors runtime exports and re-exports P2PPaymentResponse for TS consumers.

import type {
  ECashBridgeRequest,
  ECashBridgeResponse,
  P2PPaymentRequest,
  P2PPaymentResponse,
} from "../../../types/payments";
export type {
  ECashBridgeRequest,
  ECashBridgeResponse,
  P2PPaymentRequest,
  P2PPaymentResponse,
} from "../../../types/payments";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;
  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>
  );
  isNetworkError(): boolean;
  isValidationError(): boolean;
  isAuthError(): boolean;
  getUserFriendlyMessage(): string;
}

export class PaymentsClient {
  baseUrl: string;
  private authToken: string | null;
  constructor();
  setAuthToken(token: string): void;
  getAuthHeaders(): Record<string, string>;
  makeRequest(endpoint: string, options?: RequestInit): Promise<unknown>;
  sendP2PPayment(
    paymentRequest: P2PPaymentRequest
  ): Promise<P2PPaymentResponse>;
  executeECashBridge(
    bridgeRequest: ECashBridgeRequest
  ): Promise<ECashBridgeResponse>;
  getPaymentHistory(options?: {
    page?: number;
    limit?: number;
    type?: string;
  }): Promise<unknown>;
  getECashBridgeHistory(options?: {
    page?: number;
    limit?: number;
    operationType?: string;
  }): Promise<unknown>;
  getSpendingLimits(): Promise<unknown>;
  getNodeHealthStatus(): Promise<unknown>;
}

export const paymentsClient: PaymentsClient;
export default paymentsClient;
