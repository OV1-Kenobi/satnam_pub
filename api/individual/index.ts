// Individual API Endpoints Index
// File: api/individual/index.ts

export { default as cashuBearer } from "./cashu/bearer";
export { default as cashuWallet } from "./cashu/wallet";
export { default as lightningWallet } from "./lightning/wallet";
export { default as lightningZap } from "./lightning/zap";
export { default as wallet } from "./wallet";

// API route mappings for individual endpoints
export const individualRoutes = {
  // Main wallet endpoint
  "GET /api/individual/wallet": "./wallet",

  // Lightning endpoints
  "GET /api/individual/lightning/wallet": "./lightning/wallet",
  "POST /api/individual/lightning/zap": "./lightning/zap",

  // Cashu endpoints
  "GET /api/individual/cashu/wallet": "./cashu/wallet",
  "POST /api/individual/cashu/bearer": "./cashu/bearer",
};

// Type definitions for API responses
export interface IndividualWalletResponse {
  memberId: string;
  username: string;
  lightningAddress: string;
  lightningBalance: number;
  ecashBalance: number;
  spendingLimits?: {
    daily: number;
    weekly: number;
    requiresApproval: number;
  };
  recentTransactions: Array<{
    id: string;
    type: "sent" | "received";
    amount: number;
    timestamp: Date;
    status: string;
    memo?: string;
  }>;
  privacySettings: {
    defaultRouting: "lightning" | "ecash";
    lnproxyEnabled: boolean;
    guardianProtected: boolean;
  };
}

export interface LightningWalletResponse {
  zapHistory: Array<{
    id: string;
    amount: number;
    recipient: string;
    memo?: string;
    timestamp: Date;
    status: "pending" | "completed" | "failed";
  }>;
  transactions: Array<{
    id: string;
    type: "zap" | "payment" | "invoice";
    amount: number;
    fee: number;
    recipient?: string;
    sender?: string;
    memo?: string;
    timestamp: Date;
    status: "pending" | "completed" | "failed";
    paymentHash: string;
  }>;
}

export interface CashuWalletResponse {
  bearerInstruments: Array<{
    id: string;
    amount: number;
    formFactor: "qr" | "nfc" | "dm" | "physical";
    created: Date;
    redeemed: boolean;
    token: string;
  }>;
  transactions: Array<{
    id: string;
    type: "mint" | "melt" | "send" | "receive";
    amount: number;
    fee: number;
    recipient?: string;
    sender?: string;
    memo?: string;
    timestamp: Date;
    status: "pending" | "completed" | "failed";
    tokenId: string;
  }>;
}

export interface ZapRequest {
  memberId: string;
  amount: number;
  recipient: string;
  memo?: string;
}

export interface ZapResponse {
  success: boolean;
  zapId: string;
  amount: number;
  recipient: string;
  memo: string;
  status: string;
  timestamp: string;
  fee: number;
  paymentHash: string;
}

export interface BearerRequest {
  memberId: string;
  amount: number;
  formFactor: "qr" | "nfc" | "dm" | "physical";
  recipientNpub?: string;
}

export interface BearerResponse {
  success: boolean;
  bearerId: string;
  amount: number;
  formFactor: "qr" | "nfc" | "dm" | "physical";
  token: string;
  created: string;
  redeemed: boolean;
  qrCode?: string;
  nfcData?: object;
  dmStatus?: {
    recipientNpub: string;
    sent: boolean;
    messageId: string;
  };
}
