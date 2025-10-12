// Type declarations for paymentsClient.js to satisfy strict TypeScript in TSX imports
// This file provides minimal, safe typings without changing runtime behavior.

export class ApiError extends Error {
  constructor(message: string, statusCode?: number);
  getUserFriendlyMessage(): string;
}

export const paymentsClient: {
  sendPayment(request: unknown): Promise<unknown>;
  sendP2PPayment(request: unknown): Promise<unknown>;
  getBalance(): Promise<unknown>;
  getTransactionHistory(): Promise<unknown>;
  getNodeHealthStatus(): Promise<unknown>;
};

