// Individual Wallet API Service
// File: src/services/individualApi.ts

// Use relative paths for Bolt.new compatibility
const API_BASE = "";

// API Response Types
export interface IndividualWalletData {
  memberId: string;
  username: string;
  lightningAddress: string;
  lightningBalance: number;
  ecashBalance: number;
  spendingLimits: {
    daily: number; // SOVEREIGNTY: -1 = unlimited (Adults/Stewards/Guardians), positive = limit (Offspring only)
    weekly: number; // SOVEREIGNTY: -1 = unlimited (Adults/Stewards/Guardians), positive = limit (Offspring only)
    requiresApproval: number; // SOVEREIGNTY: -1 = no approval (Adults/Stewards/Guardians), positive = threshold (Offspring only)
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

export interface LightningWalletData {
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

export interface CashuWalletData {
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

// Cross-Mint API Types - SOVEREIGNTY COMPLIANT
export interface MultiNutPaymentRequest {
  memberId: string;
  amount: number;
  recipient: string;
  memo?: string;
  mintPreference?: "satnam-first" | "external-first" | "balanced";
  userRole?: "private" | "offspring" | "adult" | "steward" | "guardian"; // SOVEREIGNTY: Role for cross-mint authorization
}

export interface MultiNutPaymentResponse {
  success: boolean;
  paymentId: string;
  totalAmount: number;
  mintSources: { mint: string; amount: number }[];
  status: "pending" | "completed" | "failed";
  created: string;
}

export interface NutSwapRequest {
  memberId: string;
  fromMint: string;
  toMint: string;
  amount: number;
  fromProtocol?: "fedimint" | "cashu" | "satnam"; // ECASH BRIDGE: Source protocol
  toProtocol?: "fedimint" | "cashu" | "satnam"; // ECASH BRIDGE: Destination protocol
  userRole?: "private" | "offspring" | "adult" | "steward" | "guardian"; // SOVEREIGNTY: Role for cross-mint authorization
}

export interface NutSwapResponse {
  success: boolean;
  swapId: string;
  fromMint: string;
  toMint: string;
  amount: number;
  status: "pending" | "completed" | "failed";
  created: string;
}

export interface ExternalNutsRequest {
  memberId: string;
  externalToken: string;
  storagePreference?: "satnam-mint" | "keep-external" | "auto";
  userRole?: "private" | "offspring" | "adult" | "steward" | "guardian"; // SOVEREIGNTY: Role for cross-mint authorization
}

export interface ExternalNutsResponse {
  success: boolean;
  amount: number;
  sourceMint: string;
  destinationMint: string;
  storagePreference: string;
  processed: string;
}

// API Service Class
export class IndividualApiService {
  private static async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE}/api${endpoint}`;

    // Get JWT token from SecureTokenManager
    let authHeaders: Record<string, string> = {};
    try {
      const { SecureTokenManager } = await import(
        "../lib/auth/secure-token-manager"
      );
      const accessToken = SecureTokenManager.getAccessToken();
      // Debug (non-sensitive): log presence and short preview only
      if (typeof window !== "undefined") {
        const preview = accessToken ? accessToken.slice(0, 12) + "…" : "";
        console.debug(
          "[IndividualApi] JWT present:",
          Boolean(accessToken),
          preview
        );
      }
      if (accessToken) {
        authHeaders.Authorization = `Bearer ${accessToken}`;
      }
    } catch (error) {
      console.warn("Failed to get access token:", error);
    }

    const defaultOptions: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...options.headers,
      },
      credentials: "include", // Include cookies for fallback authentication
    };

    const response = await fetch(url, { ...defaultOptions, ...options });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `HTTP ${response.status}: ${response.statusText}`
      );
    }

    return response.json();
  }

  // Get main wallet data (now privacy-enhanced)
  static async getWalletData(memberId: string): Promise<IndividualWalletData> {
    return this.makeRequest<IndividualWalletData>(
      `/individual/wallet?memberId=${encodeURIComponent(memberId)}`
    );
  }

  // Get privacy-enhanced wallet data
  static async getPrivacyWalletData(memberId: string): Promise<any> {
    return this.makeRequest<any>(
      `/individual/wallet?memberId=${encodeURIComponent(memberId)}`
    );
  }

  // Update privacy settings
  static async updatePrivacySettings(
    memberId: string,
    settings: any
  ): Promise<any> {
    return this.makeRequest<any>(
      `/individual/wallet?memberId=${encodeURIComponent(memberId)}`,
      {
        method: "POST",
        body: JSON.stringify(settings),
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  // Get Lightning wallet data
  static async getLightningWalletData(
    memberId: string
  ): Promise<LightningWalletData> {
    return this.makeRequest<LightningWalletData>(
      `/individual/lightning/wallet?memberId=${encodeURIComponent(memberId)}`
    );
  }

  // Get Cashu wallet data
  static async getCashuWalletData(memberId: string): Promise<CashuWalletData> {
    return this.makeRequest<CashuWalletData>(
      `/individual/cashu/wallet?memberId=${encodeURIComponent(memberId)}`
    );
  }

  // Send Lightning zap
  static async sendLightningZap(zapRequest: ZapRequest): Promise<ZapResponse> {
    return this.makeRequest<ZapResponse>("/individual/lightning/zap", {
      method: "POST",
      body: JSON.stringify(zapRequest),
    });
  }

  // Create Cashu bearer note
  static async createBearerNote(
    bearerRequest: BearerRequest
  ): Promise<BearerResponse> {
    return this.makeRequest<BearerResponse>("/individual/cashu/bearer", {
      method: "POST",
      body: JSON.stringify(bearerRequest),
    });
  }

  // Cross-Mint API Methods

  // Create multi-nut payment
  static async createMultiNutPayment(
    paymentRequest: MultiNutPaymentRequest
  ): Promise<MultiNutPaymentResponse> {
    return this.makeRequest<MultiNutPaymentResponse>(
      "/individual/cross-mint/multi-nut-payment",
      {
        method: "POST",
        body: JSON.stringify(paymentRequest),
      }
    );
  }

  // Perform nut swap
  static async performNutSwap(
    swapRequest: NutSwapRequest
  ): Promise<NutSwapResponse> {
    return this.makeRequest<NutSwapResponse>(
      "/individual/cross-mint/nut-swap",
      {
        method: "POST",
        body: JSON.stringify(swapRequest),
      }
    );
  }

  // Receive external nuts
  static async receiveExternalNuts(
    externalRequest: ExternalNutsRequest
  ): Promise<ExternalNutsResponse> {
    return this.makeRequest<ExternalNutsResponse>(
      "/individual/cross-mint/receive-external",
      {
        method: "POST",
        body: JSON.stringify(externalRequest),
      }
    );
  }

  // Get cross-mint wallet data (external mint balances, etc.)
  static async getCrossMintWalletData(memberId: string): Promise<{
    externalMintBalances: Record<string, number>;
    supportedMints: string[];
    multiNutPayments: Array<{
      id: string;
      totalAmount: number;
      mintSources: { mint: string; amount: number }[];
      status: "pending" | "completed" | "failed";
      created: string;
    }>;
    nutSwapHistory: Array<{
      id: string;
      fromMint: string;
      toMint: string;
      amount: number;
      status: "pending" | "completed" | "failed";
      created: string;
    }>;
  }> {
    return this.makeRequest(
      `/individual/cross-mint/wallet?memberId=${encodeURIComponent(memberId)}`
    );
  }

  // Utility method to handle API errors
  static handleApiError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "An unexpected error occurred";
  }
}

// Export individual functions for easier importing
export const {
  getWalletData,
  getLightningWalletData,
  getCashuWalletData,
  sendLightningZap,
  createBearerNote,
  createMultiNutPayment,
  performNutSwap,
  receiveExternalNuts,
  getCrossMintWalletData,
  handleApiError,
} = IndividualApiService;
