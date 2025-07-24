/**
 * Session-based Authentication Middleware
 *
 * This middleware handles authentication using secure HTTP-only cookies
 * instead of localStorage tokens for better security.
 *
 * Security Features:
 * - Rate limiting for session refresh attempts to prevent brute force attacks
 * - Enhanced logging of refresh attempts for security monitoring
 * - Proper error handling and response codes
 * - Standard Express middleware pattern for composability
 */

import { NextFunction, Request, Response } from "express";
import { defaultLogger as logger } from '../../utils/logger.js';
import { sessionRefreshRateLimit } from "../security/rate-limiter";
import { SecureSessionManager, SessionData } from "../security/session-manager";

// Extend Express Request to include session data
export interface AuthenticatedRequest extends Request {
  session?: SessionData;
  user?: SessionData;
}

/**
 * Middleware to validate session and attach user data to request
 */
export function sessionAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const sessionData = SecureSessionManager.validateSession(req);

  if (sessionData) {
    req.session = sessionData;
    req.user = sessionData; // For compatibility with existing code
  }

  next();
}

/**
 * Internal middleware to handle rate-limited session refresh
 */
function handleSessionRefresh(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Apply rate limiting first
  sessionRefreshRateLimit(req, res, () => {
    // If rate limiting passes, attempt refresh
    const refreshedSession = SecureSessionManager.refreshSession(req, res);

    if (refreshedSession) {
      req.session = refreshedSession;
      req.user = refreshedSession;
      next();
    } else {
      logger.warn("Authentication failed - session refresh failed", {
        ip: req.ip,
        userAgent: req.get("user-agent"),
        path: req.path,
      });
      res.status(401).json({
        success: false,
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }
  });
}

/**
 * Middleware to require authentication with rate-limited session refresh
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const sessionData = SecureSessionManager.validateSession(req);

  if (!sessionData) {
    // Try to refresh session with rate limiting
    handleSessionRefresh(req, res, next);
  } else {
    req.session = sessionData;
    req.user = sessionData;
    next();
  }
}

/**
 * Standalone middleware for rate limiting session refresh attempts
 * Can be applied to specific routes that might trigger session refresh
 */
export function rateLimitSessionRefresh(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  sessionRefreshRateLimit(req, res, next);
}

/**
 * Middleware to require specific roles
 */
export function requireRole(allowedRoles: ("parent" | "child" | "guardian")[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.session) {
      logger.warn("Authentication failed - no session", {
        ip: req.ip,
        userAgent: req.get("user-agent"),
        path: req.path,
        requiredRoles: allowedRoles,
      });
      res.status(401).json({
        success: false,
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (!allowedRoles.includes(req.session.federationRole)) {
      logger.warn("Access denied - insufficient role", {
        userRole: req.session.federationRole,
        requiredRoles: allowedRoles,
        path: req.path,
      });
      res.status(403).json({
        success: false,
        error: `Access denied. Required roles: ${allowedRoles.join(", ")}`,
        code: "INSUFFICIENT_PERMISSIONS",
        userRole: req.session.federationRole,
        requiredRoles: allowedRoles,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to require whitelist status
 */
export function requireWhitelist(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.session) {
    logger.warn("Authentication failed - no session", {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      path: req.path,
    });
    res.status(401).json({
      success: false,
      error: "Authentication required",
      code: "AUTH_REQUIRED",
    });
    return;
  }

  if (!req.session.isWhitelisted) {
    logger.warn("Access denied - not whitelisted", {
      userRole: req.session.federationRole,
      path: req.path,
    });
    res.status(403).json({
      success: false,
      error: "Access denied. Whitelist approval required.",
      code: "NOT_WHITELISTED",
    });
    return;
  }

  next();
}

/**
 * Middleware to require guardian approval for child accounts
 */
export function requireGuardianApproval(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.session) {
    logger.warn("Authentication failed - no session", {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      path: req.path,
    });
    res.status(401).json({
      success: false,
      error: "Authentication required",
      code: "AUTH_REQUIRED",
    });
    return;
  }

  // Only children need guardian approval
  if (req.session.federationRole === "child" && !req.session.guardianApproved) {
    logger.warn("Access denied - guardian approval required", {
      userRole: req.session.federationRole,
      path: req.path,
    });
    res.status(403).json({
      success: false,
      error: "Access denied. Guardian approval required.",
      code: "GUARDIAN_APPROVAL_REQUIRED",
    });
    return;
  }

  next();
}
