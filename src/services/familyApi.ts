// Family API Service (Privacy-Enhanced)
// File: src/services/familyApi.ts

const API_BASE = "";

// Legacy interface for backward compatibility
export interface FamilyMember {
  id: string;
  name: string;
  role: "adult" | "child" | "guardian";
  permissions: string[];
  lightningAddress: string;
  balance: {
    lightning: number;
    ecash: number;
  };
  payment?: {
    weekly: number;
    nextPayment: string;
  };
  status: "active" | "inactive";
  joinedAt: string;
}

// New privacy-enhanced interface (preferred)
export type { FamilyMemberWithPrivacy } from "../../types/privacy-api";

export interface FamilyMembersResponse {
  members: FamilyMember[];
  totalMembers: number;
  activeMembers: number;
}

export interface LightningStatus {
  nodeId: string;
  alias: string;
  isOnline: boolean;
  blockHeight: number;
  channels: {
    active: number;
    pending: number;
    total: number;
  };
  balance: {
    confirmed: number;
    unconfirmed: number;
    total: number;
  };
  peers: number;
  version: string;
  network: string;
  fees: {
    baseFee: number;
    feeRate: number;
  };
}

export interface FedimintStatus {
  federationId: string;
  name: string;
  status: string;
  guardians: {
    total: number;
    online: number;
    threshold: number;
  };
  balance: {
    totalEcash: number;
    familyBalance: number;
  };
  modules: {
    lightning: {
      enabled: boolean;
      gateway: string;
      status: string;
    };
    mint: {
      enabled: boolean;
      denominations: number[];
    };
    wallet: {
      enabled: boolean;
      onchainAddress: string;
    };
  };
  network: string;
  version: string;
  uptime: number;
  lastSync: string;
}

export interface PhoenixdStatus {
  status: string;
  version: string;
  nodeId: string;
  alias: string;
  isConnected: boolean;
  network: string;
  blockHeight: number;
  balance: {
    onchain: number;
    lightning: number;
    total: number;
  };
  channels: {
    active: number;
    inactive: number;
    pending: number;
    total: number;
  };
  peers: Array<{
    nodeId: string;
    alias: string;
    isConnected: boolean;
  }>;
  fees: {
    baseFee: number;
    feeRate: number;
  };
  uptime: number;
  lastRestart: string;
  config: {
    autoLiquidity: boolean;
    maxFeePercent: number;
    maxRelayFee: number;
  };
}

export interface FamilyPaymentRequest {
  memberId: string;
  amount: number;
  recipient: string;
  memo?: string;
  paymentType?: string;
}

export interface FamilyPaymentResponse {
  paymentId: string;
  status: string;
  amount: number;
  fees: number;
  recipient: string;
  memo: string;
  timestamp: string;
  preimage: string;
  route: {
    hops: number;
    totalTimeLock: number;
  };
}

// API Service Class
export class FamilyApiService {
  private static async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE}/api${endpoint}`;

    const defaultOptions: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      credentials: "include", // Include cookies for authentication
    };

    const response = await fetch(url, { ...defaultOptions, ...options });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `HTTP ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();
    return data.data || data; // Handle both wrapped and unwrapped responses
  }

  // Family Members Management
  static async getFamilyMembers(): Promise<FamilyMembersResponse> {
    return this.makeRequest<FamilyMembersResponse>("/family/members");
  }

  static async getFamilyMember(memberId: string): Promise<FamilyMember> {
    return this.makeRequest<FamilyMember>(
      `/family/members?memberId=${encodeURIComponent(memberId)}`
    );
  }

  static async addFamilyMember(member: {
    name: string;
    role: "adult" | "child" | "guardian";
  }): Promise<FamilyMember> {
    return this.makeRequest<FamilyMember>("/family/members", {
      method: "POST",
      body: JSON.stringify(member),
    });
  }

  // Service Status Checks
  static async getLightningStatus(): Promise<LightningStatus> {
    return this.makeRequest<LightningStatus>("/lightning/status");
  }

  static async getFedimintStatus(): Promise<FedimintStatus> {
    return this.makeRequest<FedimintStatus>("/fedimint/status");
  }

  static async getPhoenixdStatus(): Promise<PhoenixdStatus> {
    return this.makeRequest<PhoenixdStatus>("/phoenixd/status");
  }

  // Payment Processing
  static async sendPayment(
    paymentRequest: FamilyPaymentRequest
  ): Promise<FamilyPaymentResponse> {
    return this.makeRequest<FamilyPaymentResponse>("/payments/send", {
      method: "POST",
      body: JSON.stringify(paymentRequest),
    });
  }

  // System Health
  static async getSystemHealth(): Promise<{
    status: string;
    timestamp: string;
    service: string;
    version: string;
    uptime: number;
    services: {
      lightning: string;
      phoenixd: string;
      fedimint: string;
      database: string;
    };
  }> {
    return this.makeRequest("/health");
  }

  static async testApi(): Promise<{
    message: string;
    timestamp: string;
    environment: string;
    endpoints: string[];
  }> {
    return this.makeRequest("/test");
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
  getFamilyMembers,
  getFamilyMember,
  addFamilyMember,
  getLightningStatus,
  getFedimintStatus,
  getPhoenixdStatus,
  sendPayment,
  getSystemHealth,
  testApi,
  handleApiError,
} = FamilyApiService;
