/**
 * @fileoverview Frontend API Client
 * @description Centralized API client for communicating with the backend server
 */

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

/**
 * API Response type
 */
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * HTTP Client with error handling
 */
export class ApiClient {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  protected async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;

    const defaultOptions: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      credentials: "include", // Include cookies for session management
    };

    try {
      const response = await fetch(url, { ...defaultOptions, ...options });
      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error:
            data.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return data;
    } catch (error) {
      console.error("API Request failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

// Create singleton instance
export const apiClient = new ApiClient();

// ===========================================
// AUTHENTICATION API
// ===========================================

export interface NostrAuthData {
  signedEvent: any;
}

export interface NWCAuthData {
  nwcUri: string;
}

export interface OTPInitiateData {
  npub?: string;
  pubkey?: string;
}

export interface OTPVerifyData {
  pubkey: string;
  otp_code: string;
}

export interface SessionData {
  user: {
    id: string;
    npub: string;
    username?: string;
  };
  authenticated: boolean;
}

export const authAPI = {
  // Nostr authentication
  authenticateNostr: (data: NostrAuthData) =>
    apiClient.post<SessionData>("/auth/nostr", data),

  // NWC authentication
  authenticateNWC: (data: NWCAuthData) =>
    apiClient.post<SessionData>("/auth/nwc", data),

  // OTP authentication
  initiateOTP: (data: OTPInitiateData) =>
    apiClient.post("/auth/otp/initiate", data),

  verifyOTP: (data: OTPVerifyData) =>
    apiClient.post<SessionData>("/auth/otp/verify", data),

  // Session management
  getSession: () => apiClient.get<SessionData>("/auth/session"),

  refreshSession: () => apiClient.post<SessionData>("/auth/refresh"),

  logout: () => apiClient.post("/auth/logout"),
};

// ===========================================
// IDENTITY API
// ===========================================

export interface IdentityRegistrationData {
  username: string;
  password: string;
  nip05?: string;
  lightning_address?: string;
}

export interface IdentityRecoveryData {
  npub: string;
  password: string;
}

export interface PrivacyRegistrationData {
  username?: string;
  userEncryptionKey: string;
  optionalData?: any;
  makeDiscoverable?: boolean;
  familyId?: string;
  relayUrl?: string;
}

export const identityAPI = {
  // Register new identity
  register: (data: IdentityRegistrationData) =>
    apiClient.post("/identity/register", data),

  // Recover nsec with password
  recoverNsec: (data: IdentityRecoveryData) =>
    apiClient.post("/identity/recover-nsec", data),

  // Privacy-first registration (requires authentication)
  registerPrivacy: (data: PrivacyRegistrationData) =>
    apiClient.post("/register", data),
};

// ===========================================
// FAMILY API
// ===========================================

export interface FamilyRegistrationData {
  family_name: string;
  domain?: string;
  relay_url?: string;
  members: Array<{
    usernameChoice: string;
    userEncryptionKey: string;
    role?: string;
  }>;
}

export const familyAPI = {
  // Register family
  registerFamily: (data: FamilyRegistrationData) =>
    apiClient.post("/register/family", data),
};

// ===========================================
// CASHU API (Individual)
// ===========================================

export interface CashuBearerData {
  memberId: string;
  amount: number;
  formFactor: "qr" | "nfc" | "dm" | "physical";
  recipientNpub?: string;
}

export const cashuAPI = {
  // Create bearer instrument
  createBearer: (data: CashuBearerData) =>
    apiClient.post("/individual/cashu/bearer", data),
};

// ===========================================
// HEALTH CHECK API
// ===========================================

// Create a separate client for health checks that calls backend directly
const healthClient = new ApiClient("http://localhost:8000");

export const healthAPI = {
  // Check server health
  check: () => healthClient.get("/health"),
};

// ===========================================
// ATOMIC SWAP API
// ===========================================

// Re-export atomic swap API
export { atomicSwapAPI } from "./api/atomic-swap";

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Check if the backend server is available
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await healthAPI.check();
    return response.success;
  } catch {
    return false;
  }
}

/**
 * Get current authentication status
 */
export async function getAuthStatus(): Promise<{
  authenticated: boolean;
  user?: any;
}> {
  try {
    const response = await authAPI.getSession();
    if (response.success && response.data) {
      return {
        authenticated: response.data.authenticated,
        user: response.data.user,
      };
    }
    return { authenticated: false };
  } catch {
    return { authenticated: false };
  }
}

export default apiClient;
