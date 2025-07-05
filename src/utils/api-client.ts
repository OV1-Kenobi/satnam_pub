/**
 * Browser-compatible API Client for Satnam.pub
 * Handles authentication and API communication
 */

export interface AuthRequest {
  type: 'otp-initiate' | 'otp-verify';
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
    this.apiBaseUrl = import.meta.env.VITE_API_URL || "/api";
  }

  /**
   * Authenticate user with OTP flow
   */
  async authenticateUser(request: AuthRequest): Promise<AuthResponse | VerificationResponse> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/auth/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
          timestamp: new Date().toISOString()
        }
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
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
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
        method: 'DELETE',
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
}

// Export both the class and a default instance
export const apiClient = new ApiClient();
