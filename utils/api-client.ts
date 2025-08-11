/**
 * Browser-compatible API Client for Satnam.pub
 * Handles authentication and API communication with enhanced type safety and error handling
 */

/**
 * Authentication credentials interface for OTP signin
 *
 * @interface AuthCredentials
 * @description Defines the structure for authentication credentials used in OTP-based authentication
 *
 * @example
 * ```typescript
 * // For OTP initiation
 * const credentials: AuthCredentials = {
 *   npub: "npub1...",
 *   nip05: "user@satnam.pub"
 * };
 *
 * // For OTP verification
 * const verifyCredentials: AuthCredentials = {
 *   otpKey: "abc123...",
 *   otp: "123456"
 * };
 * ```
 */
export interface AuthCredentials {
  /** Nostr public key in npub format (bech32 encoded) */
  npub?: string;
  /** Raw public key in hex format (64 character hex string) */
  pubkey?: string;
  /** NIP-05 identifier in email-like format (user@domain.com) */
  nip05?: string;
  /** OTP key received from the initiate endpoint */
  otpKey?: string;
  /** 6-digit OTP code for verification */
  otp?: string;
}

/**
 * Authentication response interface
 *
 * @interface AuthResponse
 * @description Defines the structure for authentication responses from OTP signin/verify endpoints
 *
 * @example
 * ```typescript
 * // Successful authentication response
 * const response: AuthResponse = {
 *   success: true,
 *   data: {
 *     authenticated: true,
 *     sessionToken: "jwt_token_here",
 *     userAuth: {
 *       npub: "npub1...",
 *       nip05: "user@satnam.pub",
 *       federationRole: "adult",
 *       authMethod: "otp",
 *       isWhitelisted: true,
 *       votingPower: 1,
 *       guardianApproved: true,
 *       stewardApproved: true,
 *       sessionToken: "jwt_token_here"
 *     },
 *     message: "Authentication successful",
 *     verificationMethod: "gift-wrapped-dm",
 *     otpSender: "npub1..."
 *   },
 *   meta: {
 *     timestamp: "2024-01-01T00:00:00Z"
 *   }
 * };
 * ```
 */
export interface AuthResponse {
  /** Indicates if the authentication request was successful */
  success: boolean;
  /** Authentication data (present when success is true) */
  data?: {
    /** Whether the user is successfully authenticated */
    authenticated: boolean;
    /** JWT session token for authenticated requests */
    sessionToken: string;
    /** Refresh token for session renewal */
    refreshToken: string;
    /** User authentication details */
    userAuth: {
      /** User's Nostr public key in npub format */
      npub: string;
      /** User's NIP-05 identifier (optional) */
      nip05?: string;
      /** User's role in family federation (private|offspring|adult|steward|guardian) */
      federationRole: string | null;
      /** Authentication method used (otp, nip07, etc.) */
      authMethod: string;
      /** Whether user is whitelisted for platform access */
      isWhitelisted: boolean;
      /** User's voting power in governance decisions */
      votingPower: number;
      /** Whether user is approved by guardians */
      guardianApproved: boolean;
      /** Whether user is approved by stewards */
      stewardApproved: boolean;
      /** Session token (duplicate for backward compatibility) */
      sessionToken: string;
    };
    /** Human-readable success message */
    message: string;
    /** Method used for OTP verification (gift-wrapped-dm, nip04-dm, etc.) */
    verificationMethod: string;
    /** Npub of the entity that sent the OTP */
    otpSender: string;
    /** Privacy protection features used */
    privacyProtection: {
      /** Whether gift-wrapped messaging (NIP-59) is supported */
      giftWrappedSupported: boolean;
      /** Encryption method used for OTP delivery */
      encryptionMethod: string;
      /** Level of metadata protection applied */
      metadataProtection: string;
    };
  };
  /** Error message (present when success is false) */
  error?: string;
  /** Additional error details */
  details?: string;
  /** Number of authentication attempts remaining before lockout */
  attemptsRemaining?: number;
  /** Response metadata */
  meta: {
    /** ISO timestamp of the response */
    timestamp: string;
  };
}

/**
 * API Error interface for enhanced error handling
 *
 * @interface ApiError
 * @extends Error
 * @description Enhanced error interface that provides detailed information about API failures
 *
 * @example
 * ```typescript
 * try {
 *   await apiClient.authenticateUser(credentials);
 * } catch (error) {
 *   if (error && typeof error === 'object' && 'status' in error) {
 *     const apiError = error as ApiError;
 *     console.error(`API Error ${apiError.status}: ${apiError.message}`);
 *     console.error('Details:', apiError.details);
 *   }
 * }
 * ```
 */
export interface ApiError extends Error {
  /** HTTP status code (if applicable) */
  status?: number;
  /** Error code for programmatic handling */
  code?: string;
  /** Additional error details and context */
  details?: Record<string, unknown>;
  /** Timestamp when the error occurred */
  timestamp: Date;
}

/**
 * Identity registration data interface
 *
 * @interface IdentityRegistrationData
 * @description Defines the structure for identity registration requests
 */
export interface IdentityRegistrationData {
  /** Username for the new identity */
  username: string;
  /** Password for the new identity */
  password: string;
  /** Password confirmation */
  confirmPassword: string;
  /** NIP-05 identifier */
  nip05: string;
  /** Nostr public key in npub format */
  npub?: string;
  /** Raw public key in hex format */
  pubkey?: string;
  /** Lightning address for payments */
  lightningAddress?: string;
  /** Whether to generate an invite token */
  generateInviteToken?: boolean;
  /** Recovery phrase for account recovery */
  recoveryPhrase?: string;
}

/**
 * Identity registration response interface
 *
 * @interface IdentityRegistrationResponse
 * @description Defines the structure for identity registration responses
 */
export interface IdentityRegistrationResponse {
  success: boolean;
  data?: {
    message: string;
    userId: string;
    npub: string;
    nip05: string;
    inviteToken?: string;
    sessionToken?: string;
  };
  error?: string;
  details?: string;
  meta: {
    timestamp: string;
  };
}

/**
 * OTP initiation data interface
 *
 * @interface OtpInitiationData
 * @description Defines the structure for OTP initiation requests
 */
export interface OtpInitiationData {
  /** Nostr public key in npub format */
  npub?: string;
  /** Raw public key in hex format */
  pubkey?: string;
  /** NIP-05 identifier */
  nip05?: string;
}

/**
 * OTP initiation response interface
 *
 * @interface OtpInitiationResponse
 * @description Defines the structure for OTP initiation responses
 */
export interface OtpInitiationResponse {
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

/**
 * OTP verification data interface
 *
 * @interface OtpVerificationData
 * @description Defines the structure for OTP verification requests
 */
export interface OtpVerificationData {
  /** OTP key received from initiation */
  otpKey: string;
  /** 6-digit OTP code */
  otp: string;
}

// REMOVED: Duplicate UserDataStorage interfaces
// These were causing confusion with the canonical implementation in src/utils/api-client.ts
// The canonical interfaces are defined in the Identity Forge implementation

/**
 * Gift-wrapped message data interface
 *
 * @interface GiftwrappedMessageData
 * @description Defines the structure for gift-wrapped message requests (NIP-59)
 */
export interface GiftwrappedMessageData {
  /** Recipient's public key */
  recipientPubkey: string;
  /** Message content */
  content: string;
  /** Message type */
  kind?: number;
  /** Additional tags */
  tags?: string[][];
  /** Sender's public key (optional for anonymous messages) */
  senderPubkey?: string;
}

/**
 * Gift-wrapped message response interface
 *
 * @interface GiftwrappedMessageResponse
 * @description Defines the structure for gift-wrapped message responses
 */
export interface GiftwrappedMessageResponse {
  success: boolean;
  data?: {
    message: string;
    messageId: string;
    sent: boolean;
    encryptionMethod: string;
  };
  error?: string;
  meta: {
    timestamp: string;
  };
}

/**
 * Health check response interface
 *
 * @interface HealthCheckResponse
 * @description Defines the structure for health check responses
 */
export interface HealthCheckResponse {
  success: boolean;
  data?: {
    status: "healthy" | "degraded" | "unhealthy";
    version: string;
    uptime: number;
    services: {
      database: "up" | "down";
      nostr: "up" | "down";
      lightning: "up" | "down";
    };
  };
  error?: string;
  meta: {
    timestamp: string;
  };
}

/**
 * Family member interface
 *
 * @interface FamilyMember
 * @description Defines the structure for family member data
 */
export interface FamilyMember {
  /** Member's unique identifier */
  id: string;
  /** Member's Nostr public key */
  npub: string;
  /** Member's NIP-05 identifier */
  nip05?: string;
  /** Member's display name */
  name: string;
  /** Member's role in the family federation */
  role: "private" | "offspring" | "adult" | "steward" | "guardian";
  /** Whether the member is active */
  isActive: boolean;
  /** Member's voting power */
  votingPower: number;
  /** Whether the member is approved by guardians */
  guardianApproved: boolean;
  /** Whether the member is approved by stewards */
  stewardApproved: boolean;
  /** Member's spending limits */
  spendingLimits?: {
    daily: number;
    monthly: number;
    requiresApproval: boolean;
  };
}

/**
 * Family members response interface
 *
 * @interface FamilyMembersResponse
 * @description Defines the structure for family members responses
 */
export interface FamilyMembersResponse {
  success: boolean;
  data?: {
    members: FamilyMember[];
    totalMembers: number;
    familyName?: string;
  };
  error?: string;
  meta: {
    timestamp: string;
  };
}

/**
 * Lightning status response interface
 *
 * @interface LightningStatusResponse
 * @description Defines the structure for Lightning Network status responses
 */
export interface LightningStatusResponse {
  success: boolean;
  data?: {
    status: "online" | "offline" | "syncing";
    nodeInfo: {
      alias: string;
      pubkey: string;
      version: string;
      blockHeight: number;
      syncedToChain: boolean;
    };
    channels: {
      active: number;
      inactive: number;
      pending: number;
      totalCapacity: number;
      localBalance: number;
      remoteBalance: number;
    };
    wallet: {
      totalBalance: number;
      confirmedBalance: number;
      unconfirmedBalance: number;
    };
  };
  error?: string;
  meta: {
    timestamp: string;
  };
}

/**
 * Payment data interface
 *
 * @interface PaymentData
 * @description Defines the structure for Lightning Network payment requests
 */
export interface PaymentData {
  /** Lightning invoice to pay */
  invoice?: string;
  /** Recipient's Lightning address */
  lightningAddress?: string;
  /** Recipient's public key */
  recipientPubkey?: string;
  /** Payment amount in satoshis */
  amountSats: number;
  /** Payment description/memo */
  description?: string;
  /** Maximum fee in satoshis */
  maxFeeSats?: number;
  /** Payment timeout in seconds */
  timeoutSeconds?: number;
  /** Whether to use keysend payment */
  keysend?: boolean;
  /** Custom TLV records for keysend */
  tlvRecords?: Record<string, string>;
}

/**
 * Payment response interface
 *
 * @interface PaymentResponse
 * @description Defines the structure for Lightning Network payment responses
 */
export interface PaymentResponse {
  success: boolean;
  data?: {
    paymentHash: string;
    preimage?: string;
    status: "pending" | "succeeded" | "failed";
    amountSats: number;
    feeSats: number;
    route?: {
      totalTimeLock: number;
      totalFees: number;
      totalAmt: number;
      hops: Array<{
        chanId: string;
        chanCapacity: number;
        amtToForward: number;
        fee: number;
        expiry: number;
        pubKey: string;
      }>;
    };
    failureReason?: string;
    paymentRequest?: string;
  };
  error?: string;
  details?: string;
  meta: {
    timestamp: string;
  };
}

/**
 * Enhanced API Client for Satnam.pub platform
 *
 * @class ApiClient
 * @description Provides type-safe, error-resilient API communication with comprehensive error handling,
 * input validation, and proper authentication headers. Replaces the previous implementation that used
 * 'any' types and had limited error handling.
 *
 * @example
 * ```typescript
 * const apiClient = new ApiClient();
 *
 * try {
 *   const response = await apiClient.authenticateUser({
 *     npub: "npub1...",
 *     nip05: "user@satnam.pub"
 *   });
 *
 *   if (response.success && response.data?.authenticated) {
 *     console.log('Authentication successful:', response.data.userAuth);
 *   }
 * } catch (error) {
 *   console.error('Authentication failed:', error);
 * }
 * ```
 */
export class ApiClient {
  private baseUrl: string;
  private authToken: string | null = null;

  /**
   * Initialize the API client with the appropriate base URL
   *
   * @constructor
   * @description Sets up the API client with the current domain's API endpoint
   */
  constructor() {
    // Use current domain for API calls to your backend API
    this.baseUrl = window.location.origin + "/api";
  }

  /**
   * Set authentication token for API requests
   *
   * @param {string} token - JWT authentication token
   * @description Sets the authentication token that will be included in the Authorization header
   * for all subsequent API requests that require authentication
   *
   * @example
   * ```typescript
   * const apiClient = new ApiClient();
   * apiClient.setAuthToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
   * ```
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Clear authentication token
   *
   * @description Removes the authentication token, causing subsequent requests
   * to be made without authentication headers
   */
  clearAuthToken(): void {
    this.authToken = null;
  }

  /**
   * Get current authentication token
   *
   * @returns {string | null} Current authentication token or null if not set
   */
  getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * Get standard headers for API requests
   *
   * @private
   * @param {boolean} includeAuth - Whether to include authentication header (default: true)
   * @returns {Record<string, string>} Standard headers including content type, client identification, CORS headers, and optional authentication
   * @description Provides consistent headers for all API requests including proper content type,
   * client identification, CORS support, and authentication token when available
   */
  private getStandardHeaders(
    includeAuth: boolean = true
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Client-Version": "1.0.0",
      "X-Client-Type": "web-browser",
      // Add CORS headers for cross-origin requests
      "Access-Control-Request-Headers": "Content-Type, Authorization",
    };

    // Add authentication header if token is available and requested
    if (includeAuth && this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Validate authentication credentials
   *
   * @private
   * @param {AuthCredentials} credentials - The credentials to validate
   * @returns {{ isValid: boolean; errors: string[] }} Validation result with detailed error messages
   * @description Performs comprehensive validation of authentication credentials including:
   * - Presence of required identifier fields
   * - Format validation for npub, pubkey, nip05, and OTP
   * - Type checking and structure validation
   */
  private validateCredentials(credentials: AuthCredentials): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!credentials || typeof credentials !== "object") {
      errors.push("Credentials must be a valid object");
      return { isValid: false, errors };
    }

    // Check if at least one identifier is provided
    const hasIdentifier =
      credentials.npub || credentials.pubkey || credentials.nip05;
    if (!hasIdentifier) {
      errors.push(
        "At least one identifier (npub, pubkey, or nip05) is required"
      );
    }

    // Validate npub format if provided
    if (credentials.npub && !credentials.npub.startsWith("npub1")) {
      errors.push('Invalid npub format - must start with "npub1"');
    }

    // Validate pubkey format if provided
    if (credentials.pubkey && !/^[0-9a-fA-F]{64}$/.test(credentials.pubkey)) {
      errors.push("Invalid pubkey format - must be 64 character hex string");
    }

    // Validate nip05 format if provided
    if (credentials.nip05 && !credentials.nip05.includes("@")) {
      errors.push("Invalid nip05 format - must be email-like identifier");
    }

    // Validate OTP if provided
    if (credentials.otp && !/^\d{6}$/.test(credentials.otp)) {
      errors.push("Invalid OTP format - must be exactly 6 digits");
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Safely parse JSON response with fallback for malformed responses
   */
  private async safeParseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get("content-type");

    if (!contentType || !contentType.includes("application/json")) {
      throw new Error(
        `Expected JSON response but received ${
          contentType || "unknown content type"
        }`
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new Error(
        `Failed to parse JSON response: ${
          error instanceof Error ? error.message : "Unknown parsing error"
        }`
      );
    }
  }

  /**
   * Create enhanced API error with detailed information
   */
  private createApiError(
    message: string,
    status?: number,
    details?: Record<string, unknown>
  ): ApiError {
    const error = new Error(message) as ApiError;
    error.status = status;
    error.timestamp = new Date();
    error.details = details;

    // Add error code based on status
    if (status) {
      if (status >= 400 && status < 500) {
        error.code = "CLIENT_ERROR";
      } else if (status >= 500) {
        error.code = "SERVER_ERROR";
      }
    } else {
      error.code = "NETWORK_ERROR";
    }

    return error;
  }

  /**
   * Enhanced authentication method with proper type safety and error handling
   *
   * @param credentials - Authentication credentials containing npub/pubkey/nip05 and optional OTP data
   * @returns Promise resolving to authentication response with session data
   * @throws ApiError with detailed error information
   */
  async authenticateUser(credentials: AuthCredentials): Promise<AuthResponse> {
    // Input validation
    const validation = this.validateCredentials(credentials);
    if (!validation.isValid) {
      throw this.createApiError(
        `Invalid credentials: ${validation.errors.join(", ")}`,
        400,
        { validationErrors: validation.errors }
      );
    }

    try {
      // Determine the appropriate endpoint based on credentials
      let endpoint = "/auth/otp-signin";
      if (credentials.otpKey && credentials.otp) {
        endpoint = "/auth/otp-verify";
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: this.getStandardHeaders(),
        body: JSON.stringify(credentials),
        // Add timeout and signal for better error handling
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      // Parse response safely
      let responseData: AuthResponse;
      try {
        responseData = await this.safeParseResponse<AuthResponse>(response);
      } catch (parseError) {
        throw this.createApiError(
          `Failed to parse server response: ${
            parseError instanceof Error
              ? parseError.message
              : "Unknown parsing error"
          }`,
          response.status,
          {
            originalError: parseError,
            responseStatus: response.status,
            responseStatusText: response.statusText,
          }
        );
      }

      // Handle non-OK responses with detailed error information
      if (!response.ok) {
        const errorMessage =
          responseData.error ||
          responseData.details ||
          `HTTP ${response.status}: ${response.statusText}`;

        const errorDetails: Record<string, unknown> = {
          status: response.status,
          statusText: response.statusText,
          endpoint,
          serverResponse: responseData,
        };

        // Add specific error context based on status code
        if (response.status === 401) {
          errorDetails.context =
            "Authentication failed - invalid credentials or expired session";
        } else if (response.status === 429) {
          errorDetails.context =
            "Rate limit exceeded - too many authentication attempts";
          errorDetails.retryAfter = response.headers.get("Retry-After");
        } else if (response.status === 400) {
          errorDetails.context =
            "Bad request - check credential format and required fields";
        } else if (response.status >= 500) {
          errorDetails.context =
            "Server error - authentication service temporarily unavailable";
        }

        throw this.createApiError(errorMessage, response.status, errorDetails);
      }

      // Validate response structure
      if (!responseData.success) {
        throw this.createApiError(
          responseData.error || "Authentication failed with unknown error",
          response.status,
          { serverResponse: responseData }
        );
      }

      return responseData;
    } catch (error) {
      // Handle network errors and timeouts
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw this.createApiError(
          "Authentication request timed out. Please check your connection and try again.",
          0,
          { errorType: "timeout", originalError: error }
        );
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw this.createApiError("Authentication request was cancelled.", 0, {
          errorType: "cancelled",
          originalError: error,
        });
      }

      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw this.createApiError(
          "Network error: Unable to connect to authentication service. Please check your internet connection.",
          0,
          { errorType: "network", originalError: error }
        );
      }

      // Re-throw ApiError instances
      if (error && typeof error === "object" && "status" in error) {
        throw error;
      }

      // Handle unexpected errors
      throw this.createApiError(
        `Unexpected authentication error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        0,
        { errorType: "unexpected", originalError: error }
      );
    }
  }

  /**
   * Validate identity registration data
   *
   * @private
   * @param {IdentityRegistrationData} data - The identity data to validate
   * @returns {{ isValid: boolean; errors: string[] }} Validation result with detailed error messages
   */
  private validateIdentityRegistrationData(data: IdentityRegistrationData): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data || typeof data !== "object") {
      errors.push("Identity data must be a valid object");
      return { isValid: false, errors };
    }

    // Required fields validation
    if (
      !data.username ||
      typeof data.username !== "string" ||
      data.username.trim().length === 0
    ) {
      errors.push("Username is required and must be a non-empty string");
    } else if (data.username.length < 3 || data.username.length > 50) {
      errors.push("Username must be between 3 and 50 characters");
    } else if (!/^[a-zA-Z0-9_-]+$/.test(data.username)) {
      errors.push(
        "Username can only contain letters, numbers, underscores, and hyphens"
      );
    }

    if (!data.password || typeof data.password !== "string") {
      errors.push("Password is required");
    } else if (data.password.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }

    if (!data.confirmPassword || typeof data.confirmPassword !== "string") {
      errors.push("Password confirmation is required");
    } else if (data.password !== data.confirmPassword) {
      errors.push("Password and confirmation do not match");
    }

    if (!data.nip05 || typeof data.nip05 !== "string") {
      errors.push("NIP-05 identifier is required");
    } else if (!data.nip05.includes("@")) {
      errors.push(
        "NIP-05 identifier must be in email-like format (user@domain.com)"
      );
    }

    // Optional field validation
    if (data.npub && !data.npub.startsWith("npub1")) {
      errors.push('Invalid npub format - must start with "npub1"');
    }

    if (data.pubkey && !/^[0-9a-fA-F]{64}$/.test(data.pubkey)) {
      errors.push("Invalid pubkey format - must be 64 character hex string");
    }

    if (data.lightningAddress && !data.lightningAddress.includes("@")) {
      errors.push(
        "Invalid Lightning address format - must be in email-like format"
      );
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Register a new identity with comprehensive validation and error handling
   *
   * @param {IdentityRegistrationData} identityData - Identity registration data
   * @returns {Promise<IdentityRegistrationResponse>} Promise resolving to registration response
   * @throws {ApiError} Enhanced error with detailed information
   *
   * @example
   * ```typescript
   * const response = await apiClient.registerIdentity({
   *   username: "alice",
   *   password: "securePassword123",
   *   confirmPassword: "securePassword123",
   *   nip05: "alice@satnam.pub",
   *   lightningAddress: "alice@getalby.com",
   *   generateInviteToken: true
   * });
   * ```
   */
  async registerIdentity(
    identityData: IdentityRegistrationData
  ): Promise<IdentityRegistrationResponse> {
    // Input validation
    const validation = this.validateIdentityRegistrationData(identityData);
    if (!validation.isValid) {
      throw this.createApiError(
        `Invalid identity registration data: ${validation.errors.join(", ")}`,
        400,
        { validationErrors: validation.errors }
      );
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/register-identity`, {
        method: "POST",
        headers: this.getStandardHeaders(false), // No auth needed for registration
        body: JSON.stringify(identityData),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      // Parse response safely
      let responseData: IdentityRegistrationResponse;
      try {
        responseData =
          await this.safeParseResponse<IdentityRegistrationResponse>(response);
      } catch (parseError) {
        throw this.createApiError(
          `Failed to parse registration response: ${
            parseError instanceof Error
              ? parseError.message
              : "Unknown parsing error"
          }`,
          response.status,
          {
            originalError: parseError,
            responseStatus: response.status,
            responseStatusText: response.statusText,
          }
        );
      }

      // Handle non-OK responses
      if (!response.ok) {
        const errorMessage =
          responseData.error ||
          responseData.details ||
          `HTTP ${response.status}: ${response.statusText}`;

        const errorDetails: Record<string, unknown> = {
          status: response.status,
          statusText: response.statusText,
          endpoint: "/auth/register-identity",
          serverResponse: responseData,
        };

        // Add specific error context
        if (response.status === 409) {
          errorDetails.context = "Username or NIP-05 identifier already exists";
        } else if (response.status === 400) {
          errorDetails.context =
            "Invalid registration data - check all required fields";
        } else if (response.status === 429) {
          errorDetails.context =
            "Rate limit exceeded - too many registration attempts";
        }

        throw this.createApiError(errorMessage, response.status, errorDetails);
      }

      // Validate response structure
      if (!responseData.success) {
        throw this.createApiError(
          responseData.error ||
            "Identity registration failed with unknown error",
          response.status,
          { serverResponse: responseData }
        );
      }

      return responseData;
    } catch (error) {
      // Handle network errors and timeouts
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw this.createApiError(
          "Registration request timed out. Please check your connection and try again.",
          0,
          { errorType: "timeout", originalError: error }
        );
      }

      // Re-throw ApiError instances
      if (error && typeof error === "object" && "status" in error) {
        throw error;
      }

      // Handle unexpected errors
      throw this.createApiError(
        `Unexpected registration error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        0,
        { errorType: "unexpected", originalError: error }
      );
    }
  }

  /**
   * Validate OTP initiation data
   *
   * @private
   * @param {OtpInitiationData} data - The OTP initiation data to validate
   * @returns {{ isValid: boolean; errors: string[] }} Validation result with detailed error messages
   */
  private validateOtpInitiationData(data: OtpInitiationData): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data || typeof data !== "object") {
      errors.push("OTP initiation data must be a valid object");
      return { isValid: false, errors };
    }

    // At least one identifier is required
    const hasIdentifier = data.npub || data.pubkey || data.nip05;
    if (!hasIdentifier) {
      errors.push(
        "At least one identifier (npub, pubkey, or nip05) is required"
      );
    }

    // Validate formats if provided
    if (data.npub && !data.npub.startsWith("npub1")) {
      errors.push('Invalid npub format - must start with "npub1"');
    }

    if (data.pubkey && !/^[0-9a-fA-F]{64}$/.test(data.pubkey)) {
      errors.push("Invalid pubkey format - must be 64 character hex string");
    }

    if (data.nip05 && !data.nip05.includes("@")) {
      errors.push("Invalid nip05 format - must be email-like identifier");
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate OTP verification data
   *
   * @private
   * @param {OtpVerificationData} data - The OTP verification data to validate
   * @returns {{ isValid: boolean; errors: string[] }} Validation result with detailed error messages
   */
  private validateOtpVerificationData(data: OtpVerificationData): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data || typeof data !== "object") {
      errors.push("OTP verification data must be a valid object");
      return { isValid: false, errors };
    }

    if (!data.otpKey || typeof data.otpKey !== "string") {
      errors.push("OTP key is required and must be a string");
    }

    if (!data.otp || typeof data.otp !== "string") {
      errors.push("OTP code is required and must be a string");
    } else if (!/^\d{6}$/.test(data.otp)) {
      errors.push("Invalid OTP format - must be exactly 6 digits");
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Initiate OTP authentication with comprehensive validation and error handling
   *
   * @param {OtpInitiationData} otpData - OTP initiation data
   * @returns {Promise<OtpInitiationResponse>} Promise resolving to OTP initiation response
   * @throws {ApiError} Enhanced error with detailed information
   */
  async initiateOtp(
    otpData: OtpInitiationData
  ): Promise<OtpInitiationResponse> {
    // Input validation
    const validation = this.validateOtpInitiationData(otpData);
    if (!validation.isValid) {
      throw this.createApiError(
        `Invalid OTP initiation data: ${validation.errors.join(", ")}`,
        400,
        { validationErrors: validation.errors }
      );
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/otp-initiate`, {
        method: "POST",
        headers: this.getStandardHeaders(false), // No auth needed for initiation
        body: JSON.stringify(otpData),
        signal: AbortSignal.timeout(30000),
      });

      let responseData: OtpInitiationResponse;
      try {
        responseData = await this.safeParseResponse<OtpInitiationResponse>(
          response
        );
      } catch (parseError) {
        throw this.createApiError(
          `Failed to parse OTP initiation response: ${
            parseError instanceof Error
              ? parseError.message
              : "Unknown parsing error"
          }`,
          response.status,
          { originalError: parseError }
        );
      }

      if (!response.ok) {
        throw this.createApiError(
          responseData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          { serverResponse: responseData }
        );
      }

      return responseData;
    } catch (error) {
      if (error && typeof error === "object" && "status" in error) {
        throw error;
      }
      throw this.createApiError(
        `Unexpected OTP initiation error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        0,
        { originalError: error }
      );
    }
  }

  /**
   * Verify OTP code with comprehensive validation and error handling
   *
   * @param {OtpVerificationData} verificationData - OTP verification data
   * @returns {Promise<AuthResponse>} Promise resolving to authentication response
   * @throws {ApiError} Enhanced error with detailed information
   */
  async verifyOtp(
    verificationData: OtpVerificationData
  ): Promise<AuthResponse> {
    // Input validation
    const validation = this.validateOtpVerificationData(verificationData);
    if (!validation.isValid) {
      throw this.createApiError(
        `Invalid OTP verification data: ${validation.errors.join(", ")}`,
        400,
        { validationErrors: validation.errors }
      );
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/otp-verify`, {
        method: "POST",
        headers: this.getStandardHeaders(false), // No auth needed for verification
        body: JSON.stringify(verificationData),
        signal: AbortSignal.timeout(30000),
      });

      let responseData: AuthResponse;
      try {
        responseData = await this.safeParseResponse<AuthResponse>(response);
      } catch (parseError) {
        throw this.createApiError(
          `Failed to parse OTP verification response: ${
            parseError instanceof Error
              ? parseError.message
              : "Unknown parsing error"
          }`,
          response.status,
          { originalError: parseError }
        );
      }

      if (!response.ok) {
        throw this.createApiError(
          responseData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          { serverResponse: responseData }
        );
      }

      return responseData;
    } catch (error) {
      if (error && typeof error === "object" && "status" in error) {
        throw error;
      }
      throw this.createApiError(
        `Unexpected OTP verification error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        0,
        { originalError: error }
      );
    }
  }

  // REMOVED: Duplicate storeUserData method
  // This method was causing confusion with the canonical implementation in src/utils/api-client.ts
  // All user data storage should use the Identity Forge implementation which properly handles
  // the register-identity endpoint with the correct interface (username, password, npub, etc.)

  /**
   * Send gift-wrapped message with comprehensive validation and error handling
   *
   * @param {GiftwrappedMessageData} messageData - Message data to send
   * @returns {Promise<GiftwrappedMessageResponse>} Promise resolving to message response
   * @throws {ApiError} Enhanced error with detailed information
   */
  async sendGiftwrappedMessage(
    messageData: GiftwrappedMessageData
  ): Promise<GiftwrappedMessageResponse> {
    if (!messageData || typeof messageData !== "object") {
      throw this.createApiError("Message data must be a valid object", 400);
    }

    if (
      !messageData.recipientPubkey ||
      typeof messageData.recipientPubkey !== "string"
    ) {
      throw this.createApiError("Recipient public key is required", 400);
    }

    if (!messageData.content || typeof messageData.content !== "string") {
      throw this.createApiError("Message content is required", 400);
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/communications/giftwrapped`,
        {
          method: "POST",
          headers: this.getStandardHeaders(),
          body: JSON.stringify(messageData),
          signal: AbortSignal.timeout(30000),
        }
      );

      const responseData =
        await this.safeParseResponse<GiftwrappedMessageResponse>(response);

      if (!response.ok) {
        throw this.createApiError(
          responseData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          { serverResponse: responseData }
        );
      }

      return responseData;
    } catch (error) {
      if (error && typeof error === "object" && "status" in error) {
        throw error;
      }
      throw this.createApiError(
        `Unexpected message sending error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        0,
        { originalError: error }
      );
    }
  }

  /**
   * Check API health status
   *
   * @returns {Promise<HealthCheckResponse>} Promise resolving to health status
   * @throws {ApiError} Enhanced error with detailed information
   */
  async checkHealth(): Promise<HealthCheckResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: this.getStandardHeaders(false), // No auth needed for health check
        signal: AbortSignal.timeout(10000), // Shorter timeout for health checks
      });

      const responseData = await this.safeParseResponse<HealthCheckResponse>(
        response
      );

      if (!response.ok) {
        throw this.createApiError(
          responseData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          { serverResponse: responseData }
        );
      }

      return responseData;
    } catch (error) {
      if (error && typeof error === "object" && "status" in error) {
        throw error;
      }
      throw this.createApiError(
        `Unexpected health check error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        0,
        { originalError: error }
      );
    }
  }

  /**
   * Get family members with authentication
   *
   * @returns {Promise<FamilyMembersResponse>} Promise resolving to family members data
   * @throws {ApiError} Enhanced error with detailed information
   */
  async getFamilyMembers(): Promise<FamilyMembersResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/family/members`, {
        method: "GET",
        headers: this.getStandardHeaders(), // Auth required for family data
        signal: AbortSignal.timeout(30000),
      });

      const responseData = await this.safeParseResponse<FamilyMembersResponse>(
        response
      );

      if (!response.ok) {
        const errorDetails: Record<string, unknown> = {
          status: response.status,
          serverResponse: responseData,
        };

        if (response.status === 401) {
          errorDetails.context = "Authentication required - please login first";
        } else if (response.status === 403) {
          errorDetails.context =
            "Access denied - insufficient permissions to view family members";
        }

        throw this.createApiError(
          responseData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorDetails
        );
      }

      return responseData;
    } catch (error) {
      if (error && typeof error === "object" && "status" in error) {
        throw error;
      }
      throw this.createApiError(
        `Unexpected family members fetch error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        0,
        { originalError: error }
      );
    }
  }

  /**
   * Get Lightning Network status with authentication
   *
   * @returns {Promise<LightningStatusResponse>} Promise resolving to Lightning status
   * @throws {ApiError} Enhanced error with detailed information
   */
  async getLightningStatus(): Promise<LightningStatusResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/lightning/status`, {
        method: "GET",
        headers: this.getStandardHeaders(), // Auth required for Lightning data
        signal: AbortSignal.timeout(30000),
      });

      const responseData =
        await this.safeParseResponse<LightningStatusResponse>(response);

      if (!response.ok) {
        const errorDetails: Record<string, unknown> = {
          status: response.status,
          serverResponse: responseData,
        };

        if (response.status === 401) {
          errorDetails.context = "Authentication required - please login first";
        } else if (response.status === 503) {
          errorDetails.context =
            "Lightning Network service temporarily unavailable";
        }

        throw this.createApiError(
          responseData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorDetails
        );
      }

      return responseData;
    } catch (error) {
      if (error && typeof error === "object" && "status" in error) {
        throw error;
      }
      throw this.createApiError(
        `Unexpected Lightning status fetch error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        0,
        { originalError: error }
      );
    }
  }

  /**
   * Validate payment data
   *
   * @private
   * @param {PaymentData} data - The payment data to validate
   * @returns {{ isValid: boolean; errors: string[] }} Validation result with detailed error messages
   */
  private validatePaymentData(data: PaymentData): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data || typeof data !== "object") {
      errors.push("Payment data must be a valid object");
      return { isValid: false, errors };
    }

    // Amount validation
    if (typeof data.amountSats !== "number" || data.amountSats <= 0) {
      errors.push("Amount must be a positive number in satoshis");
    } else if (data.amountSats > 100000000) {
      // 1 BTC limit
      errors.push(
        "Amount exceeds maximum limit of 100,000,000 satoshis (1 BTC)"
      );
    } else if (!Number.isInteger(data.amountSats)) {
      errors.push("Amount must be a whole number of satoshis");
    }

    // Recipient validation - at least one must be provided
    const hasRecipient =
      data.invoice || data.lightningAddress || data.recipientPubkey;
    if (!hasRecipient) {
      errors.push(
        "At least one recipient method is required: invoice, lightningAddress, or recipientPubkey"
      );
    }

    // Invoice validation
    if (data.invoice) {
      if (typeof data.invoice !== "string") {
        errors.push("Invoice must be a string");
      } else if (!data.invoice.toLowerCase().startsWith("ln")) {
        errors.push('Invalid Lightning invoice format - must start with "ln"');
      }
    }

    // Lightning address validation
    if (data.lightningAddress) {
      if (typeof data.lightningAddress !== "string") {
        errors.push("Lightning address must be a string");
      } else if (!data.lightningAddress.includes("@")) {
        errors.push(
          "Invalid Lightning address format - must be in email-like format"
        );
      }
    }

    // Recipient pubkey validation
    if (data.recipientPubkey) {
      if (typeof data.recipientPubkey !== "string") {
        errors.push("Recipient pubkey must be a string");
      } else if (!/^[0-9a-fA-F]{64}$/.test(data.recipientPubkey)) {
        errors.push(
          "Invalid recipient pubkey format - must be 64 character hex string"
        );
      }
    }

    // Optional field validation
    if (data.maxFeeSats !== undefined) {
      if (typeof data.maxFeeSats !== "number" || data.maxFeeSats < 0) {
        errors.push("Maximum fee must be a non-negative number");
      } else if (data.maxFeeSats > data.amountSats) {
        errors.push("Maximum fee cannot exceed payment amount");
      }
    }

    if (data.timeoutSeconds !== undefined) {
      if (typeof data.timeoutSeconds !== "number" || data.timeoutSeconds <= 0) {
        errors.push("Timeout must be a positive number of seconds");
      } else if (data.timeoutSeconds > 3600) {
        // 1 hour max
        errors.push("Timeout cannot exceed 3600 seconds (1 hour)");
      }
    }

    if (data.description && typeof data.description !== "string") {
      errors.push("Description must be a string");
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Send Lightning Network payment with comprehensive validation and error handling
   *
   * @param {PaymentData} paymentData - Payment data including recipient and amount
   * @returns {Promise<PaymentResponse>} Promise resolving to payment response
   * @throws {ApiError} Enhanced error with detailed information
   *
   * @example
   * ```typescript
   * // Pay Lightning invoice
   * const response = await apiClient.sendPayment({
   *   invoice: "lnbc1000n1...",
   *   maxFeeSats: 10,
   *   timeoutSeconds: 60
   * });
   *
   * // Send keysend payment
   * const keysendResponse = await apiClient.sendPayment({
   *   recipientPubkey: "03...",
   *   amountSats: 1000,
   *   description: "Keysend payment",
   *   keysend: true
   * });
   * ```
   */
  async sendPayment(paymentData: PaymentData): Promise<PaymentResponse> {
    // Input validation
    const validation = this.validatePaymentData(paymentData);
    if (!validation.isValid) {
      throw this.createApiError(
        `Invalid payment data: ${validation.errors.join(", ")}`,
        400,
        { validationErrors: validation.errors }
      );
    }

    try {
      const response = await fetch(`${this.baseUrl}/payments/send`, {
        method: "POST",
        headers: this.getStandardHeaders(), // Include auth headers for payments
        body: JSON.stringify(paymentData),
        signal: AbortSignal.timeout(60000), // 60 second timeout for payments
      });

      // Parse response safely
      let responseData: PaymentResponse;
      try {
        responseData = await this.safeParseResponse<PaymentResponse>(response);
      } catch (parseError) {
        throw this.createApiError(
          `Failed to parse payment response: ${
            parseError instanceof Error
              ? parseError.message
              : "Unknown parsing error"
          }`,
          response.status,
          {
            originalError: parseError,
            responseStatus: response.status,
            responseStatusText: response.statusText,
          }
        );
      }

      // Handle non-OK responses
      if (!response.ok) {
        const errorMessage =
          responseData.error ||
          responseData.details ||
          `HTTP ${response.status}: ${response.statusText}`;

        const errorDetails: Record<string, unknown> = {
          status: response.status,
          statusText: response.statusText,
          endpoint: "/payments/send",
          serverResponse: responseData,
        };

        // Add specific error context for payment failures
        if (response.status === 402) {
          errorDetails.context = "Insufficient funds - check wallet balance";
        } else if (response.status === 400) {
          errorDetails.context =
            "Invalid payment data - check invoice or recipient details";
        } else if (response.status === 401) {
          errorDetails.context = "Authentication required - please login first";
        } else if (response.status === 429) {
          errorDetails.context =
            "Rate limit exceeded - too many payment attempts";
        } else if (response.status === 503) {
          errorDetails.context = "Lightning Network temporarily unavailable";
        }

        throw this.createApiError(errorMessage, response.status, errorDetails);
      }

      // Validate response structure
      if (!responseData.success) {
        throw this.createApiError(
          responseData.error || "Payment failed with unknown error",
          response.status,
          { serverResponse: responseData }
        );
      }

      return responseData;
    } catch (error) {
      // Handle network errors and timeouts
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw this.createApiError(
          "Payment request timed out. The payment may still be processing.",
          0,
          { errorType: "timeout", originalError: error }
        );
      }

      // Re-throw ApiError instances
      if (error && typeof error === "object" && "status" in error) {
        throw error;
      }

      // Handle unexpected errors
      throw this.createApiError(
        `Unexpected payment error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        0,
        { errorType: "unexpected", originalError: error }
      );
    }
  }
}
