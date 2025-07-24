/**
 * @fileoverview Frontend API Client
 * @description Centralized API client for communicating with the backend server
 */

import { authManager } from '../utils/authManager.js';

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
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000), // 10 second timeout
    };

    try {
      const response = await fetch(url, { ...defaultOptions, ...options });

      // Always try to get response text first
      const text = await response.text();

      // Check if response has content
      let data: any = null;
      if (text.trim()) {
        // Check if it looks like JSON
        const contentType = response.headers.get("content-type");
        const hasJsonContent =
          contentType && contentType.includes("application/json");

        if (
          hasJsonContent ||
          text.trim().startsWith("{") ||
          text.trim().startsWith("[")
        ) {
          try {
            data = JSON.parse(text);
          } catch (parseError) {
            console.error("Failed to parse JSON response:", text);
            return {
              success: false,
              error: "Invalid JSON response from server",
            };
          }
        } else {
          // Non-JSON response
          console.warn("Non-JSON response received:", text);
          return {
            success: false,
            error: "Server returned non-JSON response",
          };
        }
      }

      if (!response.ok) {
        // Special handling for auth endpoints - 401 is expected when not authenticated
        if (endpoint.includes("/auth/session") && response.status === 401) {
          return {
            success: true,
            data: { authenticated: false, user: null },
          };
        }

        return {
          success: false,
          error:
            data?.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      // If no data was parsed but response was ok, return success with empty data
      return data || { success: true };
    } catch (error) {
      console.error(
        `API Request failed [${options.method || "GET"} ${url}]:`,
        error
      );

      // Provide more specific error messages
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          success: false,
          error: "Request timed out. The server may be slow to respond.",
        };
      }

      if (
        error instanceof TypeError &&
        error.message.includes("Failed to fetch")
      ) {
        return {
          success: false,
          error:
            "Cannot connect to server. Make sure the backend is running and accessible.",
        };
      }

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

// Create singleton instance lazily to avoid circular dependencies
let _apiClient: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (!_apiClient) {
    _apiClient = new ApiClient();
  }
  return _apiClient;
}

// Export a getter for backward compatibility
export const apiClient = new Proxy({} as ApiClient, {
  get(target, prop) {
    return getApiClient()[prop as keyof ApiClient];
  }
});

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

export const healthAPI = {
  // Check server health - use the main client to go through proxy
  check: () => apiClient.get("/health"),
};

// ===========================================
// ATOMIC SWAP API
// ===========================================

// Re-export atomic swap API
export type { atomicSwapAPI } from "./api/atomic-swap";

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Check if the backend server is available with retry logic
 */
export async function checkServerHealth(retries: number = 1): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await healthAPI.check();
      if (response.success) {
        return true;
      }
    } catch (error) {
      console.warn(
        `Health check failed (attempt ${attempt}/${retries}):`,
        error instanceof Error ? error.message : "Unknown error"
      );

      // If not the last attempt, wait before retrying
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
      }
    }
  }
  return false;
}

/**
 * Get current authentication status with retry logic
 */
export async function getAuthStatus(retries: number = 1): Promise<{
  authenticated: boolean;
  user?: any;
}> {
  // Use the auth manager to prevent multiple simultaneous requests
  try {
    return await authManager.getAuthStatus();
  } catch (error) {
    console.warn(
      "Auth status check failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return { authenticated: false };
  }
}

export default apiClient;
