/**
 * Enhanced Error Handling System
 *
 * Provides structured error handling with specific error types and detailed messages
 * for better debugging and user experience.
 */

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

  // Generic Errors
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  userMessage?: string; // User-friendly message
  details?: Record<string, any>;
  timestamp: string;
  requestId?: string;
  userId?: string;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly userMessage?: string;
  public readonly details?: Record<string, any>;
  public readonly timestamp: string;
  public readonly requestId?: string;
  public readonly userId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    userMessage?: string,
    details?: Record<string, any>,
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

    // Maintains proper stack trace for where our error was thrown (only available on V8)
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
 * Enhanced error analyzer that provides specific error information
 */
export class ErrorAnalyzer {
  /**
   * Analyze a generic error and convert it to a specific AppError
   */
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

    // Handle non-Error objects
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

  /**
   * Categorize errors based on their characteristics
   */
  private static categorizeError(
    error: Error,
    context?: string,
    requestId?: string,
    userId?: string
  ): AppError {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || "";

    // Database errors
    if (this.isDatabaseError(message, stack)) {
      return this.createDatabaseError(error, context, requestId, userId);
    }

    // Network errors
    if (this.isNetworkError(message, stack)) {
      return this.createNetworkError(error, context, requestId, userId);
    }

    // Lightning Network errors
    if (this.isLightningError(message, stack)) {
      return this.createLightningError(error, context, requestId, userId);
    }

    // Authentication errors
    if (this.isAuthError(message, stack)) {
      return this.createAuthError(error, context, requestId, userId);
    }

    // Validation errors
    if (this.isValidationError(message, stack)) {
      return this.createValidationError(error, context, requestId, userId);
    }

    // Encryption/Crypto errors
    if (this.isCryptoError(message, stack)) {
      return this.createCryptoError(error, context, requestId, userId);
    }

    // Default to internal server error
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
 * HTTP Response helper for consistent error responses
 */
export class ErrorResponseHelper {
  /**
   * Create a standardized error response
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
   */
  static createJsonErrorResponse(
    res: any,
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
