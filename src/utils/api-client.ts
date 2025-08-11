/**
 * Browser-compatible API Client for Satnam.pub
 * Handles authentication and API communication
 */

export interface AuthRequest {
  type: "otp-initiate" | "otp-verify";
  npub?: string;
  nip05?: string;
  otpKey?: string;
  otp?: string;
}

export interface AuthResponse {
  success: boolean;
  data?: {
    message: string;
    otpKey: string;
    npub: string;
    nip05?: string;
    expiresIn: number;
    messageId: string;
    sentVia: string;
    sender: string;
  };
  error?: string;
  details?: string;
  meta: {
    timestamp: string;
    production?: boolean;
  };
}

export interface VerificationResponse {
  success: boolean;
  data?: {
    authenticated: boolean;
    sessionToken: string;
    userAuth: {
      npub: string;
      nip05?: string;
      federationRole: string | null;
      authMethod: string;
      isWhitelisted: boolean;
      votingPower: number;
      guardianApproved: boolean;
    };
    message: string;
    verificationMethod: string;
    otpSender: string;
  };
  error?: string;
  attemptsRemaining?: number;
  meta: {
    timestamp: string;
  };
}

export class ApiClient {
  private apiBaseUrl: string;

  constructor() {
    // Prefer Netlify functions direct path to avoid redirect ambiguity
    const env =
      typeof import.meta !== "undefined" && (import.meta as any).env
        ? (import.meta as any).env
        : {};
    this.apiBaseUrl =
      env.VITE_API_BASE_URL || env.VITE_API_URL || "/.netlify/functions";
    console.log("🔍 API CLIENT: Constructor", {
      VITE_API_BASE_URL: env.VITE_API_BASE_URL,
      VITE_API_URL: env.VITE_API_URL,
      apiBaseUrl: this.apiBaseUrl,
    });
  }

  /**
   * Authenticate user with OTP flow
   */
  async authenticateUser(
    request: AuthRequest
  ): Promise<AuthResponse | VerificationResponse> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/auth/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (response.ok) {
        return await response.json();
      }

      throw new Error(`Authentication failed: ${response.statusText}`);
    } catch (error) {
      console.error("Authentication error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Authentication failed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Generic GET request
   */
  async get(endpoint: string, params?: Record<string, string>): Promise<any> {
    try {
      const url = new URL(`${this.apiBaseUrl}${endpoint}`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      const response = await fetch(url.toString());

      if (response.ok) {
        return await response.json();
      }

      throw new Error(`GET request failed: ${response.statusText}`);
    } catch (error) {
      console.error("GET request error:", error);
      throw error;
    }
  }

  /**
   * Generic POST request
   */
  async post(endpoint: string, data?: any): Promise<any> {
    try {
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: data ? JSON.stringify(data) : undefined,
      });

      if (response.ok) {
        return await response.json();
      }

      throw new Error(`POST request failed: ${response.statusText}`);
    } catch (error) {
      console.error("POST request error:", error);
      throw error;
    }
  }

  /**
   * Generic PUT request
   */
  async put(endpoint: string, data?: any): Promise<any> {
    try {
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: data ? JSON.stringify(data) : undefined,
      });

      if (response.ok) {
        return await response.json();
      }

      throw new Error(`PUT request failed: ${response.statusText}`);
    } catch (error) {
      console.error("PUT request error:", error);
      throw error;
    }
  }

  /**
   * Generic DELETE request
   */
  async delete(endpoint: string): Promise<any> {
    try {
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
        method: "DELETE",
      });

      if (response.ok) {
        return await response.json();
      }

      throw new Error(`DELETE request failed: ${response.statusText}`);
    } catch (error) {
      console.error("DELETE request error:", error);
      throw error;
    }
  }

  /**
   * Store user data during identity registration
   * MAXIMUM ENCRYPTION: Data is sent as plaintext but immediately hashed server-side
   * The backend uses privacy-first hashing to store all sensitive data in hashed columns only
   */
  async storeUserData(userData: {
    username: string;
    password: string;
    confirmPassword: string;
    npub: string;
    encryptedNsec: string;
    nip05: string;
    lightningAddress?: string;
    generateInviteToken?: boolean;
    deterministicUserId?: string; // Pre-generated DUID from Identity Forge
    invitationToken?: string;
    isImportedAccount?: boolean;
    detectedProfile?: any;
  }): Promise<any> {
    try {
      // Always use API endpoint - no development mode bypasses
      const fullUrl = `${this.apiBaseUrl}/register-identity`;
      console.log("🔍 API CLIENT: Calling register-identity endpoint", {
        apiBaseUrl: this.apiBaseUrl,
        fullUrl: fullUrl,
        hasUsername: !!userData.username,
        hasNpub: !!userData.npub,
        hasEncryptedNsec: !!userData.encryptedNsec,
        timestamp: new Date().toISOString(),
      });

      const requestBody = {
        username: userData.username,
        password: userData.password,
        confirmPassword: userData.confirmPassword,
        npub: userData.npub, // Fixed: endpoint expects 'npub', not 'publicKey'
        encryptedNsec: userData.encryptedNsec,
        nip05: userData.nip05,
        lightningAddress: userData.lightningAddress,
        generateInviteToken: userData.generateInviteToken,
        // DUID Integration: Include pre-generated DUID from Identity Forge
        deterministicUserId: userData.deterministicUserId,
        invitationToken: userData.invitationToken,
        isImportedAccount: userData.isImportedAccount,
        detectedProfile: userData.detectedProfile,
      };

      console.log("🔍 API CLIENT: Request body being sent", {
        ...requestBody,
        password: "[REDACTED]",
        confirmPassword: "[REDACTED]",
        encryptedNsec: "[REDACTED]",
        requestBodyKeys: Object.keys(requestBody),
        timestamp: new Date().toISOString(),
      });

      const response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("🔍 API CLIENT: Response received", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (response.ok) {
        const result = await response.json();
        console.log("🔍 API CLIENT: Registration successful", result);
        return result;
      }

      const errorText = await response.text();
      console.error("🔍 API CLIENT: Registration failed", {
        status: response.status,
        statusText: response.statusText,
        errorText,
      });

      throw new Error(
        `Registration failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    } catch (error) {
      console.error("🔍 API CLIENT: storeUserData error:", error);
      throw error;
    }
  }

  /**
   * Update existing user profile data
   * Uses the correct /identity/profile endpoint for profile updates
   * @param profileUpdates - Profile fields to update
   * @param npub - User's npub for identification
   */
  async updateUserProfile(profileUpdates: {
    npub: string;
    nip05?: string;
    email?: string;
    bio?: string;
    displayName?: string;
    lightningAddress?: string;
  }): Promise<any> {
    try {
      const fullUrl = `${this.apiBaseUrl}/identity/profile`;
      console.log(
        "🔍 API CLIENT: Calling identity/profile endpoint for update",
        {
          apiBaseUrl: this.apiBaseUrl,
          fullUrl: fullUrl,
          updateFields: Object.keys(profileUpdates).filter(
            (key) => key !== "npub"
          ),
        }
      );

      const response = await fetch(fullUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(profileUpdates),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("🔍 API CLIENT: Profile update failed", {
          status: response.status,
          statusText: response.statusText,
          errorText,
        });

        throw new Error(
          `Profile update failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();
      console.log("🔍 API CLIENT: Profile update successful", result);
      return result;
    } catch (error) {
      console.error("🔍 API CLIENT: updateUserProfile error:", error);
      throw error;
    }
  }
}

// Export both the class and a default instance
export const apiClient = new ApiClient();
