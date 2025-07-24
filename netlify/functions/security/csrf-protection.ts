import { getEnvVar } from "../utils/env.js";

/**
 * @fileoverview CSRF Protection for Satnam.pub Family Banking
 * @description Prevents Cross-Site Request Forgery attacks on sensitive operations
 */

import { createHmac, randomBytes } from "crypto";
import { NextFunction, Request, Response } from "express";

interface CSRFToken {
  token: string;
  timestamp: number;
  ip: string;
}

class CSRFProtection {
  private secret: string;
  private tokenExpiry: number;

  constructor() {
    // Generate a secure secret for CSRF token signing
    this.secret = getEnvVar("CSRF_SECRET") || randomBytes(32).toString("hex");
    this.tokenExpiry = 30 * 60 * 1000; // 30 minutes

    if (!getEnvVar("CSRF_SECRET")) {
      console.warn(
        "⚠️  CSRF_SECRET not set. Using generated secret (will invalidate tokens on restart)"
      );
    }
  }

  /**
   * Generate a new CSRF token
   */
  generateToken(req: Request): string {
    const timestamp = Date.now();
    const ip = req.ip || "unknown";
    const sessionId = req.session?.id || req.sessionID || "anonymous";

    // Create token payload
    const payload = `${timestamp}:${ip}:${sessionId}`;

    // Create HMAC signature
    const signature = createHmac("sha256", this.secret)
      .update(payload)
      .digest("hex");

    // Combine payload and signature
    const token = Buffer.from(`${payload}:${signature}`).toString("base64");

    return token;
  }

  /**
   * Validate CSRF token
   */
  validateToken(token: string, req: Request): boolean {
    try {
      // Decode token
      const decoded = Buffer.from(token, "base64").toString();
      const parts = decoded.split(":");

      if (parts.length !== 4) {
        return false;
      }

      const [timestampStr, tokenIp, sessionId, signature] = parts;
      const timestamp = parseInt(timestampStr, 10);

      // Check if token has expired
      if (Date.now() - timestamp > this.tokenExpiry) {
        return false;
      }

      // Verify IP address (optional strict mode)
      const currentIp = req.ip || "unknown";
      if (getEnvVar("CSRF_STRICT_IP") === "true" && tokenIp !== currentIp) {
        return false;
      }

      // Verify session ID
      const currentSessionId = req.session?.id || req.sessionID || "anonymous";
      if (sessionId !== currentSessionId) {
        return false;
      }

      // Verify HMAC signature
      const payload = `${timestamp}:${tokenIp}:${sessionId}`;
      const expectedSignature = createHmac("sha256", this.secret)
        .update(payload)
        .digest("hex");

      return signature === expectedSignature;
    } catch (error) {
      return false;
    }
  }
}

// Global CSRF protection instance
const csrfProtection = new CSRFProtection();

/**
 * Middleware to generate and attach CSRF token to requests
 */
export function generateCSRFToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate new token for each request
  const token = csrfProtection.generateToken(req);

  // Attach to response locals for use in templates
  res.locals.csrfToken = token;

  // Add to response headers
  res.setHeader("X-CSRF-Token", token);

  // Attach to request for convenience
  (req as any).csrfToken = token;

  next();
}

/**
 * Middleware to validate CSRF token on state-changing operations
 */
export function validateCSRFToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip CSRF validation for GET, HEAD, OPTIONS requests
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Extract token from headers or body
  const token =
    req.get("X-CSRF-Token") || req.get("X-Requested-With") === "XMLHttpRequest"
      ? req.get("X-CSRF-Token")
      : null || req.body?.csrfToken || req.query?.csrfToken;

  if (!token) {
    console.warn("🚨 CSRF token missing", {
      ip: req.ip,
      method: req.method,
      path: req.path,
      userAgent: req.get("User-Agent"),
    });

    return res.status(403).json({
      success: false,
      error: "CSRF token required",
      code: "CSRF_TOKEN_MISSING",
    });
  }

  if (!csrfProtection.validateToken(token, req)) {
    console.warn("🚨 Invalid CSRF token", {
      ip: req.ip,
      method: req.method,
      path: req.path,
      userAgent: req.get("User-Agent"),
    });

    return res.status(403).json({
      success: false,
      error: "Invalid CSRF token",
      code: "CSRF_TOKEN_INVALID",
    });
  }

  next();
}

/**
 * Double-submit cookie pattern for additional CSRF protection
 */
export function doubleSubmitCookie(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = csrfProtection.generateToken(req);

  // Set secure HTTP-only cookie
  res.cookie("csrf-token", token, {
    httpOnly: true,
    secure: getEnvVar("NODE_ENV") === "production",
    sameSite: "strict",
    maxAge: 30 * 60 * 1000, // 30 minutes
  });

  // Also set non-HTTP-only cookie for client-side access
  res.cookie("csrf-token-client", token, {
    httpOnly: false,
    secure: getEnvVar("NODE_ENV") === "production",
    sameSite: "strict",
    maxAge: 30 * 60 * 1000, // 30 minutes
  });

  next();
}

/**
 * Validate double-submit cookie
 */
export function validateDoubleSubmitCookie(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip for safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.["csrf-token"];
  const headerToken = req.get("X-CSRF-Token");

  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      success: false,
      error: "CSRF protection required",
      code: "CSRF_MISSING",
    });
  }

  if (cookieToken !== headerToken) {
    return res.status(403).json({
      success: false,
      error: "CSRF token mismatch",
      code: "CSRF_MISMATCH",
    });
  }

  // Validate the token itself
  if (!csrfProtection.validateToken(cookieToken, req)) {
    return res.status(403).json({
      success: false,
      error: "Invalid CSRF token",
      code: "CSRF_INVALID",
    });
  }

  next();
}

/**
 * CSRF protection specifically for Lightning operations
 */
export function lightningCSRFProtection(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Enhanced CSRF protection for Lightning payments
  const token = req.get("X-Lightning-CSRF") || req.body?.lightningCSRF;

  if (!token) {
    return res.status(403).json({
      success: false,
      error: "Lightning CSRF token required for payment operations",
      code: "LIGHTNING_CSRF_REQUIRED",
    });
  }

  // Validate with stricter requirements for Lightning operations
  if (!csrfProtection.validateToken(token, req)) {
    console.error("🚨 Invalid Lightning CSRF token", {
      ip: req.ip,
      method: req.method,
      path: req.path,
      amount: req.body?.amount,
      userAgent: req.get("User-Agent"),
    });

    return res.status(403).json({
      success: false,
      error: "Invalid Lightning CSRF token",
      code: "LIGHTNING_CSRF_INVALID",
    });
  }

  next();
}

/**
 * Enhanced CORS configuration for API security
 */
export function configureCORS(allowedOrigins: string[] = []) {
  const defaultAllowedOrigins = [
    "https://satnam.pub",
    "https://www.satnam.pub",
    "https://app.satnam.pub",
  ];

  const origins = [...defaultAllowedOrigins, ...allowedOrigins];

  if (getEnvVar("NODE_ENV") === "development") {
    origins.push(
      "http://localhost:3000",
      "http://localhost:5173",
      "http://127.0.0.1:3000"
    );
  }

  return {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      if (origins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("🚨 CORS blocked origin:", origin);
        callback(new Error("Not allowed by CORS"), false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "X-Lightning-CSRF",
      "X-Requested-With",
    ],
    exposedHeaders: ["X-CSRF-Token"],
    maxAge: 86400, // 24 hours
  };
}

export { csrfProtection };
