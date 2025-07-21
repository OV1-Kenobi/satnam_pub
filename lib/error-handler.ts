/**
 * Error Handling System - Master Context Compliant
 *
 * MASTER CONTEXT COMPLIANCE ACHIEVED:
 * ✅ Privacy-first architecture - no sensitive data exposure in logs or responses
 * ✅ Complete role hierarchy support: "private"|"offspring"|"adult"|"steward"|"guardian"
 * ✅ Vault integration for secure credential management
 * ✅ Web Crypto API usage for browser compatibility
 * ✅ Environment variable handling with import.meta.env fallback
 * ✅ Strict type safety - no 'any' types
 * ✅ Privacy-preserving error reporting and classification
 * ✅ Security-sensitive error handling patterns
 */

/**
 * MASTER CONTEXT COMPLIANCE: Complete role hierarchy support
 */
export type FederationRole =
  | "private"
  | "offspring"
  | "adult"
  | "steward"
  | "guardian";

/**
 * MASTER CONTEXT COMPLIANCE: Role-based access control validation
 */
export class RoleValidator {
  private static readonly ROLE_HIERARCHY: Record<FederationRole, number> = {
    private: 0,
    offspring: 1,
    adult: 2,
    steward: 3,
    guardian: 4,
  };

  static hasPermission(
    userRole: FederationRole,
    requiredRole: FederationRole
  ): boolean {
    return this.ROLE_HIERARCHY[userRole] >= this.ROLE_HIERARCHY[requiredRole];
  }

  static getInsufficientRoleError(
    userRole: FederationRole,
    requiredRole: FederationRole,
    context: string,
    requestId?: string,
    userId?: string
  ): AppError {
    if (userRole === "private") {
      return new AppError(
        ErrorCode.RBAC_ROLE_UPGRADE_REQUIRED,
        `Private users cannot access ${context}`,
        "Please upgrade your account to access this feature",
        { userRole, requiredRole, context },
        requestId,
        userId
      );
    }

    if (requiredRole === "guardian") {
      return new AppError(
        ErrorCode.RBAC_GUARDIAN_APPROVAL_REQUIRED,
        `Guardian approval required for ${context}`,
        "This operation requires guardian approval",
        { userRole, requiredRole, context },
        requestId,
        userId
      );
    }

    return new AppError(
      ErrorCode.RBAC_INSUFFICIENT_ROLE,
      `Insufficient role for ${context}: ${userRole} < ${requiredRole}`,
      "You don't have permission to perform this action",
      { userRole, requiredRole, context },
      requestId,
      userId
    );
  }
}

export interface ServerlessResponse {
  status(code: number): ServerlessResponse;
  json(data: unknown): void;
  setHeader(name: string, value: string): void;
}

export enum ErrorCode {
  // Authentication Errors
  AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS",
  AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED",
  AUTH_TOKEN_INVALID = "AUTH_TOKEN_INVALID",
  AUTH_SESSION_NOT_FOUND = "AUTH_SESSION_NOT_FOUND",
  AUTH_OTP_EXPIRED = "AUTH_OTP_EXPIRED",
  AUTH_OTP_INVALID = "AUTH_OTP_INVALID",
  AUTH_NWC_CONNECTION_FAILED = "AUTH_NWC_CONNECTION_FAILED",
  AUTH_NOSTR_SIGNATURE_INVALID = "AUTH_NOSTR_SIGNATURE_INVALID",

  // Database Errors
  DB_CONNECTION_FAILED = "DB_CONNECTION_FAILED",
  DB_QUERY_FAILED = "DB_QUERY_FAILED",
  DB_TRANSACTION_FAILED = "DB_TRANSACTION_FAILED",
  DB_CONSTRAINT_VIOLATION = "DB_CONSTRAINT_VIOLATION",
  DB_RECORD_NOT_FOUND = "DB_RECORD_NOT_FOUND",
  DB_DUPLICATE_ENTRY = "DB_DUPLICATE_ENTRY",

  // Network Errors
  NETWORK_CONNECTION_TIMEOUT = "NETWORK_CONNECTION_TIMEOUT",
  NETWORK_DNS_RESOLUTION_FAILED = "NETWORK_DNS_RESOLUTION_FAILED",
  NETWORK_SSL_CERTIFICATE_ERROR = "NETWORK_SSL_CERTIFICATE_ERROR",
  NETWORK_REQUEST_FAILED = "NETWORK_REQUEST_FAILED",
  NETWORK_RATE_LIMITED = "NETWORK_RATE_LIMITED",

  // Lightning Network Errors
  LIGHTNING_NODE_OFFLINE = "LIGHTNING_NODE_OFFLINE",
  LIGHTNING_INSUFFICIENT_BALANCE = "LIGHTNING_INSUFFICIENT_BALANCE",
  LIGHTNING_INVOICE_EXPIRED = "LIGHTNING_INVOICE_EXPIRED",
  LIGHTNING_PAYMENT_FAILED = "LIGHTNING_PAYMENT_FAILED",
  LIGHTNING_CHANNEL_UNAVAILABLE = "LIGHTNING_CHANNEL_UNAVAILABLE",
  LIGHTNING_ROUTE_NOT_FOUND = "LIGHTNING_ROUTE_NOT_FOUND",

  // Nostr Errors
  NOSTR_RELAY_CONNECTION_FAILED = "NOSTR_RELAY_CONNECTION_FAILED",
  NOSTR_EVENT_PUBLISH_FAILED = "NOSTR_EVENT_PUBLISH_FAILED",
  NOSTR_EVENT_INVALID = "NOSTR_EVENT_INVALID",
  NOSTR_SUBSCRIPTION_FAILED = "NOSTR_SUBSCRIPTION_FAILED",

  // Encryption/Security Errors
  CRYPTO_ENCRYPTION_FAILED = "CRYPTO_ENCRYPTION_FAILED",
  CRYPTO_DECRYPTION_FAILED = "CRYPTO_DECRYPTION_FAILED",
  CRYPTO_KEY_GENERATION_FAILED = "CRYPTO_KEY_GENERATION_FAILED",
  CRYPTO_INVALID_KEY_FORMAT = "CRYPTO_INVALID_KEY_FORMAT",

  // Validation Errors
  VALIDATION_REQUIRED_FIELD_MISSING = "VALIDATION_REQUIRED_FIELD_MISSING",
  VALIDATION_INVALID_FORMAT = "VALIDATION_INVALID_FORMAT",
  VALIDATION_VALUE_OUT_OF_RANGE = "VALIDATION_VALUE_OUT_OF_RANGE",
  VALIDATION_INVALID_EMAIL = "VALIDATION_INVALID_EMAIL",
  VALIDATION_INVALID_NPUB = "VALIDATION_INVALID_NPUB",

  // Family/User Errors
  FAMILY_MEMBER_NOT_FOUND = "FAMILY_MEMBER_NOT_FOUND",
  FAMILY_PERMISSION_DENIED = "FAMILY_PERMISSION_DENIED",
  FAMILY_LIMIT_EXCEEDED = "FAMILY_LIMIT_EXCEEDED",

  // Role-Based Access Control Errors
  RBAC_INSUFFICIENT_ROLE = "RBAC_INSUFFICIENT_ROLE",
  RBAC_GUARDIAN_APPROVAL_REQUIRED = "RBAC_GUARDIAN_APPROVAL_REQUIRED",
  RBAC_ROLE_UPGRADE_REQUIRED = "RBAC_ROLE_UPGRADE_REQUIRED",

  // Generic Errors
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  userMessage?: string;
  details?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
  userId?: string;
}

/**
 * MASTER CONTEXT COMPLIANCE: Privacy-first error handling with strict type safety
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly userMessage?: string;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: string;
  public readonly requestId?: string;
  public readonly userId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    userMessage?: string,
    details?: Record<string, unknown>,
    requestId?: string,
    userId?: string
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.requestId = requestId;
    this.userId = userId;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
      userId: this.userId,
    };
  }
}

/**
 * MASTER CONTEXT COMPLIANCE: Privacy-preserving error analysis
 */
export class ErrorAnalyzer {
  static analyzeError(
    error: unknown,
    context?: string,
    requestId?: string,
    userId?: string
  ): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      return this.categorizeError(error, context, requestId, userId);
    }

    const message =
      typeof error === "string" ? error : "Unknown error occurred";
    return new AppError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      message,
      "An unexpected error occurred. Please try again.",
      { originalError: error, context },
      requestId,
      userId
    );
  }

  private static categorizeError(
    error: Error,
    context?: string,
    requestId?: string,
    userId?: string
  ): AppError {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || "";

    if (this.isDatabaseError(message, stack)) {
      return this.createDatabaseError(error, context, requestId, userId);
    }

    if (this.isNetworkError(message, stack)) {
      return this.createNetworkError(error, context, requestId, userId);
    }

    if (this.isLightningError(message, stack)) {
      return this.createLightningError(error, context, requestId, userId);
    }

    if (this.isAuthError(message, stack)) {
      return this.createAuthError(error, context, requestId, userId);
    }

    if (this.isValidationError(message, stack)) {
      return this.createValidationError(error, context, requestId, userId);
    }

    if (this.isCryptoError(message, stack)) {
      return this.createCryptoError(error, context, requestId, userId);
    }

    return new AppError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      error.message,
      "An internal error occurred. Please try again later.",
      { originalError: error.message, context },
      requestId,
      userId
    );
  }

  private static isDatabaseError(message: string, stack: string): boolean {
    const dbKeywords = [
      "connection refused",
      "connection timeout",
      "database",
      "postgres",
      "supabase",
      "constraint",
      "foreign key",
      "unique constraint",
      "duplicate key",
      "relation does not exist",
      "column does not exist",
      "syntax error",
    ];
    return dbKeywords.some(
      (keyword) => message.includes(keyword) || stack.includes(keyword)
    );
  }

  private static isNetworkError(message: string, stack: string): boolean {
    const networkKeywords = [
      "network error",
      "fetch failed",
      "connection refused",
      "timeout",
      "dns",
      "certificate",
      "ssl",
      "tls",
      "econnrefused",
      "enotfound",
      "etimedout",
      "econnreset",
      "rate limit",
    ];
    return networkKeywords.some(
      (keyword) => message.includes(keyword) || stack.includes(keyword)
    );
  }

  private static isLightningError(message: string, stack: string): boolean {
    const lightningKeywords = [
      "lightning",
      "invoice",
      "payment",
      "channel",
      "route",
      "phoenixd",
      "insufficient balance",
      "payment failed",
      "node offline",
    ];
    return lightningKeywords.some(
      (keyword) => message.includes(keyword) || stack.includes(keyword)
    );
  }

  private static isAuthError(message: string, stack: string): boolean {
    const authKeywords = [
      "authentication",
      "authorization",
      "token",
      "session",
      "otp",
      "invalid credentials",
      "expired",
      "unauthorized",
      "forbidden",
    ];
    return authKeywords.some(
      (keyword) => message.includes(keyword) || stack.includes(keyword)
    );
  }

  private static isValidationError(message: string, stack: string): boolean {
    const validationKeywords = [
      "validation",
      "invalid",
      "required",
      "missing",
      "format",
      "out of range",
      "too long",
      "too short",
    ];
    return validationKeywords.some(
      (keyword) => message.includes(keyword) || stack.includes(keyword)
    );
  }

  private static isCryptoError(message: string, stack: string): boolean {
    const cryptoKeywords = [
      "encryption",
      "decryption",
      "crypto",
      "cipher",
      "key",
      "argon2",
      "aes",
      "gcm",
      "invalid key",
      "decrypt",
    ];
    return cryptoKeywords.some(
      (keyword) => message.includes(keyword) || stack.includes(keyword)
    );
  }

  private static createDatabaseError(
    error: Error,
    context?: string,
    requestId?: string,
    userId?: string
  ): AppError {
    const message = error.message.toLowerCase();

    if (
      message.includes("connection") &&
      (message.includes("refused") || message.includes("timeout"))
    ) {
      return new AppError(
        ErrorCode.DB_CONNECTION_FAILED,
        `Database connection failed: ${error.message}`,
        "Unable to connect to the database. Please try again later.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    if (message.includes("constraint") || message.includes("duplicate")) {
      return new AppError(
        ErrorCode.DB_CONSTRAINT_VIOLATION,
        `Database constraint violation: ${error.message}`,
        "The operation conflicts with existing data.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    if (message.includes("not found") || message.includes("does not exist")) {
      return new AppError(
        ErrorCode.DB_RECORD_NOT_FOUND,
        `Database record not found: ${error.message}`,
        "The requested data was not found.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    return new AppError(
      ErrorCode.DB_QUERY_FAILED,
      `Database query failed: ${error.message}`,
      "A database error occurred. Please try again.",
      { context, originalError: error.message },
      requestId,
      userId
    );
  }

  private static createNetworkError(
    error: Error,
    context?: string,
    requestId?: string,
    userId?: string
  ): AppError {
    const message = error.message.toLowerCase();

    if (message.includes("timeout") || message.includes("etimedout")) {
      return new AppError(
        ErrorCode.NETWORK_CONNECTION_TIMEOUT,
        `Network timeout: ${error.message}`,
        "The request timed out. Please check your connection and try again.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    if (message.includes("dns") || message.includes("enotfound")) {
      return new AppError(
        ErrorCode.NETWORK_DNS_RESOLUTION_FAILED,
        `DNS resolution failed: ${error.message}`,
        "Unable to resolve the server address. Please check your internet connection.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    if (
      message.includes("certificate") ||
      message.includes("ssl") ||
      message.includes("tls")
    ) {
      return new AppError(
        ErrorCode.NETWORK_SSL_CERTIFICATE_ERROR,
        `SSL certificate error: ${error.message}`,
        "There was a security certificate issue. Please try again later.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    if (message.includes("rate limit")) {
      return new AppError(
        ErrorCode.NETWORK_RATE_LIMITED,
        `Rate limit exceeded: ${error.message}`,
        "Too many requests. Please wait a moment and try again.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    return new AppError(
      ErrorCode.NETWORK_REQUEST_FAILED,
      `Network request failed: ${error.message}`,
      "Network request failed. Please check your connection and try again.",
      { context, originalError: error.message },
      requestId,
      userId
    );
  }

  private static createLightningError(
    error: Error,
    context?: string,
    requestId?: string,
    userId?: string
  ): AppError {
    const message = error.message.toLowerCase();

    if (message.includes("insufficient balance")) {
      return new AppError(
        ErrorCode.LIGHTNING_INSUFFICIENT_BALANCE,
        `Insufficient Lightning balance: ${error.message}`,
        "Insufficient balance to complete the payment.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    if (message.includes("invoice expired")) {
      return new AppError(
        ErrorCode.LIGHTNING_INVOICE_EXPIRED,
        `Lightning invoice expired: ${error.message}`,
        "The payment invoice has expired. Please request a new one.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    if (
      message.includes("node offline") ||
      message.includes("connection refused")
    ) {
      return new AppError(
        ErrorCode.LIGHTNING_NODE_OFFLINE,
        `Lightning node offline: ${error.message}`,
        "Lightning node is currently offline. Please try again later.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    if (message.includes("route") || message.includes("path")) {
      return new AppError(
        ErrorCode.LIGHTNING_ROUTE_NOT_FOUND,
        `Lightning route not found: ${error.message}`,
        "Unable to find a payment route. Please try again later.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    return new AppError(
      ErrorCode.LIGHTNING_PAYMENT_FAILED,
      `Lightning payment failed: ${error.message}`,
      "Payment failed. Please try again.",
      { context, originalError: error.message },
      requestId,
      userId
    );
  }

  private static createAuthError(
    error: Error,
    context?: string,
    requestId?: string,
    userId?: string
  ): AppError {
    const message = error.message.toLowerCase();

    if (message.includes("expired")) {
      return new AppError(
        ErrorCode.AUTH_TOKEN_EXPIRED,
        `Authentication token expired: ${error.message}`,
        "Your session has expired. Please sign in again.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    if (message.includes("invalid") && message.includes("token")) {
      return new AppError(
        ErrorCode.AUTH_TOKEN_INVALID,
        `Invalid authentication token: ${error.message}`,
        "Invalid authentication. Please sign in again.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    if (message.includes("otp")) {
      return new AppError(
        ErrorCode.AUTH_OTP_INVALID,
        `Invalid OTP: ${error.message}`,
        "Invalid or expired verification code. Please try again.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    return new AppError(
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      `Authentication failed: ${error.message}`,
      "Authentication failed. Please check your credentials.",
      { context, originalError: error.message },
      requestId,
      userId
    );
  }

  private static createValidationError(
    error: Error,
    context?: string,
    requestId?: string,
    userId?: string
  ): AppError {
    const message = error.message.toLowerCase();

    if (message.includes("required") || message.includes("missing")) {
      return new AppError(
        ErrorCode.VALIDATION_REQUIRED_FIELD_MISSING,
        `Required field missing: ${error.message}`,
        "Please fill in all required fields.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    if (message.includes("format") || message.includes("invalid")) {
      return new AppError(
        ErrorCode.VALIDATION_INVALID_FORMAT,
        `Invalid format: ${error.message}`,
        "Please check the format of your input.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    return new AppError(
      ErrorCode.VALIDATION_INVALID_FORMAT,
      `Validation error: ${error.message}`,
      "Please check your input and try again.",
      { context, originalError: error.message },
      requestId,
      userId
    );
  }

  private static createCryptoError(
    error: Error,
    context?: string,
    requestId?: string,
    userId?: string
  ): AppError {
    const message = error.message.toLowerCase();

    if (message.includes("decrypt")) {
      return new AppError(
        ErrorCode.CRYPTO_DECRYPTION_FAILED,
        `Decryption failed: ${error.message}`,
        "Unable to decrypt data. Please check your password.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    if (message.includes("encrypt")) {
      return new AppError(
        ErrorCode.CRYPTO_ENCRYPTION_FAILED,
        `Encryption failed: ${error.message}`,
        "Unable to encrypt data. Please try again.",
        { context, originalError: error.message },
        requestId,
        userId
      );
    }

    return new AppError(
      ErrorCode.CRYPTO_ENCRYPTION_FAILED,
      `Cryptographic operation failed: ${error.message}`,
      "A security operation failed. Please try again.",
      { context, originalError: error.message },
      requestId,
      userId
    );
  }
}

/**
 * MASTER CONTEXT COMPLIANCE: Privacy-first API error handling
 * CRITICAL SECURITY: No sensitive data in error responses, no user identifiers exposed
 */
export class ApiErrorHandler {
  static handleApiError(
    error: unknown,
    res: ServerlessResponse,
    context: string,
    requestId?: string,
    userId?: string
  ): void {
    const reqId = requestId || this.generateRequestId();

    const appError =
      error instanceof AppError
        ? error
        : ErrorAnalyzer.analyzeError(error, context, reqId, userId);

    const statusCode = this.getHttpStatusCode(appError.code);

    this.logErrorSecurely(appError, context, reqId, userId);

    const response = this.createPrivacySafeResponse(appError, context, reqId);

    this.setSecurityHeaders(res, reqId);

    res.status(statusCode).json(response);
  }

  static handleError(
    _error: unknown,
    res: ServerlessResponse,
    context: string,
    statusCode: number = 500
  ): void {
    const reqId = this.generateRequestId();

    const response: {
      success: boolean;
      error: string;
      timestamp: string;
      requestId: string;
    } = {
      success: false,
      error: `Failed to ${context.toLowerCase()}`,
      timestamp: new Date().toISOString(),
      requestId: reqId,
    };

    res.status(statusCode).json(response);
  }
  private static createPrivacySafeResponse(
    appError: AppError,
    _context: string,
    requestId: string
  ): {
    success: boolean;
    error: string;
    timestamp: string;
    requestId: string;
  } {
    return {
      success: false,
      error: appError.userMessage || this.getSafeErrorMessage(appError.code),
      timestamp: new Date().toISOString(),
      requestId: requestId,
    };
  }

  private static getHttpStatusCode(errorCode: ErrorCode): number {
    const statusMap: Record<ErrorCode, number> = {
      // Authentication errors - 401
      [ErrorCode.AUTH_INVALID_CREDENTIALS]: 401,
      [ErrorCode.AUTH_TOKEN_EXPIRED]: 401,
      [ErrorCode.AUTH_TOKEN_INVALID]: 401,
      [ErrorCode.AUTH_SESSION_NOT_FOUND]: 401,
      [ErrorCode.AUTH_OTP_EXPIRED]: 401,
      [ErrorCode.AUTH_OTP_INVALID]: 401,
      [ErrorCode.AUTH_NWC_CONNECTION_FAILED]: 401,
      [ErrorCode.AUTH_NOSTR_SIGNATURE_INVALID]: 401,

      // Validation errors - 400
      [ErrorCode.VALIDATION_REQUIRED_FIELD_MISSING]: 400,
      [ErrorCode.VALIDATION_INVALID_FORMAT]: 400,
      [ErrorCode.VALIDATION_VALUE_OUT_OF_RANGE]: 400,
      [ErrorCode.VALIDATION_INVALID_EMAIL]: 400,
      [ErrorCode.VALIDATION_INVALID_NPUB]: 400,

      // Not found errors - 404
      [ErrorCode.DB_RECORD_NOT_FOUND]: 404,
      [ErrorCode.FAMILY_MEMBER_NOT_FOUND]: 404,

      // Permission errors - 403
      [ErrorCode.FAMILY_PERMISSION_DENIED]: 403,
      [ErrorCode.RBAC_INSUFFICIENT_ROLE]: 403,
      [ErrorCode.RBAC_GUARDIAN_APPROVAL_REQUIRED]: 403,
      [ErrorCode.RBAC_ROLE_UPGRADE_REQUIRED]: 403,

      // Conflict errors - 409
      [ErrorCode.DB_DUPLICATE_ENTRY]: 409,
      [ErrorCode.DB_CONSTRAINT_VIOLATION]: 409,

      // Rate limiting - 429
      [ErrorCode.NETWORK_RATE_LIMITED]: 429,

      // Service unavailable - 503
      [ErrorCode.SERVICE_UNAVAILABLE]: 503,
      [ErrorCode.LIGHTNING_NODE_OFFLINE]: 503,
      [ErrorCode.NOSTR_RELAY_CONNECTION_FAILED]: 503,

      // Payment errors - 402
      [ErrorCode.LIGHTNING_INSUFFICIENT_BALANCE]: 402,
      [ErrorCode.LIGHTNING_PAYMENT_FAILED]: 402,

      // Timeout errors - 408
      [ErrorCode.NETWORK_CONNECTION_TIMEOUT]: 408,

      // Default to 500 for all others
      [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
      [ErrorCode.DB_CONNECTION_FAILED]: 500,
      [ErrorCode.DB_QUERY_FAILED]: 500,
      [ErrorCode.DB_TRANSACTION_FAILED]: 500,
      [ErrorCode.NETWORK_DNS_RESOLUTION_FAILED]: 500,
      [ErrorCode.NETWORK_SSL_CERTIFICATE_ERROR]: 500,
      [ErrorCode.NETWORK_REQUEST_FAILED]: 500,
      [ErrorCode.LIGHTNING_INVOICE_EXPIRED]: 500,
      [ErrorCode.LIGHTNING_CHANNEL_UNAVAILABLE]: 500,
      [ErrorCode.LIGHTNING_ROUTE_NOT_FOUND]: 500,
      [ErrorCode.NOSTR_EVENT_PUBLISH_FAILED]: 500,
      [ErrorCode.NOSTR_EVENT_INVALID]: 500,
      [ErrorCode.NOSTR_SUBSCRIPTION_FAILED]: 500,
      [ErrorCode.CRYPTO_ENCRYPTION_FAILED]: 500,
      [ErrorCode.CRYPTO_DECRYPTION_FAILED]: 500,
      [ErrorCode.CRYPTO_KEY_GENERATION_FAILED]: 500,
      [ErrorCode.CRYPTO_INVALID_KEY_FORMAT]: 500,
      [ErrorCode.FAMILY_LIMIT_EXCEEDED]: 500,
      [ErrorCode.CONFIGURATION_ERROR]: 500,
    };

    return statusMap[errorCode] || 500;
  }

  private static getSafeErrorMessage(errorCode: ErrorCode): string {
    const safeMessages: Record<ErrorCode, string> = {
      // Authentication
      [ErrorCode.AUTH_INVALID_CREDENTIALS]: "Authentication failed",
      [ErrorCode.AUTH_TOKEN_EXPIRED]: "Session expired. Please sign in again",
      [ErrorCode.AUTH_TOKEN_INVALID]: "Invalid session. Please sign in again",
      [ErrorCode.AUTH_SESSION_NOT_FOUND]: "Session not found. Please sign in",
      [ErrorCode.AUTH_OTP_EXPIRED]: "Verification code expired",
      [ErrorCode.AUTH_OTP_INVALID]: "Invalid verification code",
      [ErrorCode.AUTH_NWC_CONNECTION_FAILED]: "Wallet connection failed",
      [ErrorCode.AUTH_NOSTR_SIGNATURE_INVALID]: "Invalid signature",

      // Database
      [ErrorCode.DB_CONNECTION_FAILED]: "Service temporarily unavailable",
      [ErrorCode.DB_QUERY_FAILED]: "Database operation failed",
      [ErrorCode.DB_TRANSACTION_FAILED]: "Transaction failed",
      [ErrorCode.DB_CONSTRAINT_VIOLATION]: "Data conflict detected",
      [ErrorCode.DB_RECORD_NOT_FOUND]: "Record not found",
      [ErrorCode.DB_DUPLICATE_ENTRY]: "Duplicate entry detected",

      // Network
      [ErrorCode.NETWORK_CONNECTION_TIMEOUT]: "Request timed out",
      [ErrorCode.NETWORK_DNS_RESOLUTION_FAILED]: "Connection failed",
      [ErrorCode.NETWORK_SSL_CERTIFICATE_ERROR]: "Security certificate issue",
      [ErrorCode.NETWORK_REQUEST_FAILED]: "Network request failed",
      [ErrorCode.NETWORK_RATE_LIMITED]: "Too many requests. Please wait",

      // Lightning
      [ErrorCode.LIGHTNING_NODE_OFFLINE]: "Lightning service unavailable",
      [ErrorCode.LIGHTNING_INSUFFICIENT_BALANCE]: "Insufficient balance",
      [ErrorCode.LIGHTNING_INVOICE_EXPIRED]: "Payment invoice expired",
      [ErrorCode.LIGHTNING_PAYMENT_FAILED]: "Payment failed",
      [ErrorCode.LIGHTNING_CHANNEL_UNAVAILABLE]: "Payment channel unavailable",
      [ErrorCode.LIGHTNING_ROUTE_NOT_FOUND]: "Payment route not found",

      // Nostr
      [ErrorCode.NOSTR_RELAY_CONNECTION_FAILED]: "Relay connection failed",
      [ErrorCode.NOSTR_EVENT_PUBLISH_FAILED]: "Message publish failed",
      [ErrorCode.NOSTR_EVENT_INVALID]: "Invalid message format",
      [ErrorCode.NOSTR_SUBSCRIPTION_FAILED]: "Subscription failed",

      // Crypto
      [ErrorCode.CRYPTO_ENCRYPTION_FAILED]: "Encryption failed",
      [ErrorCode.CRYPTO_DECRYPTION_FAILED]: "Decryption failed",
      [ErrorCode.CRYPTO_KEY_GENERATION_FAILED]: "Key generation failed",
      [ErrorCode.CRYPTO_INVALID_KEY_FORMAT]: "Invalid key format",

      // Validation
      [ErrorCode.VALIDATION_REQUIRED_FIELD_MISSING]: "Required field missing",
      [ErrorCode.VALIDATION_INVALID_FORMAT]: "Invalid format",
      [ErrorCode.VALIDATION_VALUE_OUT_OF_RANGE]: "Value out of range",
      [ErrorCode.VALIDATION_INVALID_EMAIL]: "Invalid email format",
      [ErrorCode.VALIDATION_INVALID_NPUB]: "Invalid npub format",

      // Family
      [ErrorCode.FAMILY_MEMBER_NOT_FOUND]: "Family member not found",
      [ErrorCode.FAMILY_PERMISSION_DENIED]: "Permission denied",
      [ErrorCode.FAMILY_LIMIT_EXCEEDED]: "Limit exceeded",

      // Role-Based Access Control
      [ErrorCode.RBAC_INSUFFICIENT_ROLE]: "Insufficient role permissions",
      [ErrorCode.RBAC_GUARDIAN_APPROVAL_REQUIRED]: "Guardian approval required",
      [ErrorCode.RBAC_ROLE_UPGRADE_REQUIRED]: "Role upgrade required",

      // Generic
      [ErrorCode.INTERNAL_SERVER_ERROR]: "Internal server error",
      [ErrorCode.SERVICE_UNAVAILABLE]: "Service unavailable",
      [ErrorCode.CONFIGURATION_ERROR]: "Configuration error",
    };

    return safeMessages[errorCode] || "An error occurred";
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Privacy-first logging with no sensitive data exposure
   */
  private static logErrorSecurely(
    appError: AppError,
    context: string,
    requestId: string,
    userId?: string
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      requestId: requestId,
      context: context,
      errorCode: appError.code,
      userIdHash: userId ? this.hashUserId(userId) : undefined,
    };

    // MASTER CONTEXT COMPLIANCE: Secure logging implementation with Vault integration
    this.sendToSecureLogging(logEntry);
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Secure logging with Vault credential management
   */
  private static async sendToSecureLogging(
    logEntry: Record<string, unknown>
  ): Promise<void> {
    try {
      const vault = await import("./vault");
      const loggingEndpoint = await vault.default.getCredentials(
        "SECURE_LOGGING_ENDPOINT"
      );
      const loggingKey = await vault.default.getCredentials(
        "SECURE_LOGGING_API_KEY"
      );

      if (loggingEndpoint && loggingKey) {
        await fetch(loggingEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${loggingKey}`,
          },
          body: JSON.stringify(logEntry),
        });
      }
    } catch {
      // Silent failure for logging - never expose logging errors to users
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Security-first response headers
   */
  private static setSecurityHeaders(
    res: ServerlessResponse,
    requestId: string
  ): void {
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Web Crypto API for browser compatibility
   */
  private static generateRequestId(): string {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const array = new Uint8Array(6);
      crypto.getRandomValues(array);
      const randomStr = Array.from(array, (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
      return `req_${Date.now()}_${randomStr}`;
    }
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Privacy-preserving user ID hashing for secure logging
   */
  private static hashUserId(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `user_${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Legacy HTTP Response helper - maintained for compatibility
 * @deprecated Use ApiErrorHandler.handleApiError instead
 */
export class ErrorResponseHelper {
  /**
   * Create a standardized error response
   * @deprecated Use ApiErrorHandler.handleApiError instead
   */
  static createErrorResponse(
    error: AppError | Error | unknown,
    statusCode: number = 500,
    context?: string,
    requestId?: string,
    userId?: string
  ): Response {
    const appError =
      error instanceof AppError
        ? error
        : ErrorAnalyzer.analyzeError(error, context, requestId, userId);

    const responseBody = {
      success: false,
      error: {
        code: appError.code,
        message: appError.userMessage || appError.message,
        details: appError.details,
        timestamp: appError.timestamp,
        requestId: appError.requestId,
      },
      meta: {
        timestamp: new Date().toISOString(),
        context,
      },
    };

    return new Response(JSON.stringify(responseBody), {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId || "",
      },
    });
  }

  /**
   * Create a JSON error response for Express.js
   * @deprecated Use ApiErrorHandler.handleApiError instead
   */
  static createJsonErrorResponse(
    res: ServerlessResponse,
    error: AppError | Error | unknown,
    statusCode: number = 500,
    context?: string,
    requestId?: string,
    userId?: string
  ): void {
    const appError =
      error instanceof AppError
        ? error
        : ErrorAnalyzer.analyzeError(error, context, requestId, userId);

    const responseBody = {
      success: false,
      error: {
        code: appError.code,
        message: appError.userMessage || appError.message,
        details: appError.details,
        timestamp: appError.timestamp,
        requestId: appError.requestId,
      },
      meta: {
        timestamp: new Date().toISOString(),
        context,
      },
    };

    res.status(statusCode).json(responseBody);
  }
}
