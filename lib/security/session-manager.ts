/**
 * Secure Session Management with HTTP-only Cookies
 *
 * This module provides secure session management using HTTP-only cookies
 * with appropriate security flags for better protection against XSS attacks.
 */

import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { FamilyFederationUser } from "../../src/types/auth";
import { defaultLogger as logger } from "../../utils/logger";
import { UserService } from "../services/user-service";

export interface SessionData {
  userId: string;
  npub: string;
  nip05?: string;
  federationRole: "parent" | "child" | "guardian";
  authMethod: "otp" | "nwc";
  isWhitelisted: boolean;
  votingPower: number;
  guardianApproved: boolean;
  iat?: number;
  exp?: number;
}

export interface SessionCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  maxAge: number;
  path: string;
}

export class SecureSessionManager {
  private static readonly SESSION_COOKIE_NAME = "family_session";
  private static readonly REFRESH_COOKIE_NAME = "family_refresh";

  private static get JWT_SECRET(): string {
    return (
      process.env.JWT_SECRET ||
      (() => {
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            "JWT_SECRET environment variable is required in production"
          );
        }
        return "dev-only-jwt-secret";
      })()
    );
  }

  private static get REFRESH_SECRET(): string {
    return (
      process.env.JWT_REFRESH_SECRET ||
      (() => {
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            "JWT_REFRESH_SECRET environment variable is required in production"
          );
        }
        return "dev-only-refresh-secret";
      })()
    );
  }

  // Session expires in 1 hour
  private static readonly SESSION_EXPIRY = 60 * 60; // 1 hour in seconds
  // Refresh token expires in 7 days
  private static readonly REFRESH_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

  /**
   * Get secure cookie options based on environment
   */
  private static getCookieOptions(maxAge: number): SessionCookieOptions {
    const isProduction = process.env.NODE_ENV === "production";

    return {
      httpOnly: true,
      secure: isProduction, // Only use secure cookies in production (HTTPS)
      sameSite: "strict",
      maxAge: maxAge * 1000, // Convert to milliseconds
      path: "/",
    };
  }

  /**
   * Create a new session for a user
   */
  static createSession(res: Response, userData: FamilyFederationUser): void {
    const sessionData: SessionData = {
      userId: userData.npub, // Using npub as userId for now
      npub: userData.npub,
      nip05: userData.nip05,
      federationRole: userData.federationRole,
      authMethod: userData.authMethod,
      isWhitelisted: userData.isWhitelisted,
      votingPower: userData.votingPower,
      guardianApproved: userData.guardianApproved,
    };

    // Create session token (short-lived)
    const sessionToken = jwt.sign(sessionData, this.JWT_SECRET, {
      expiresIn: this.SESSION_EXPIRY,
    });

    // Create refresh token (long-lived)
    const refreshToken = jwt.sign(
      { userId: sessionData.userId, npub: sessionData.npub },
      this.REFRESH_SECRET,
      { expiresIn: this.REFRESH_EXPIRY }
    );

    // Set session cookie
    res.cookie(
      this.SESSION_COOKIE_NAME,
      sessionToken,
      this.getCookieOptions(this.SESSION_EXPIRY)
    );

    // Set refresh cookie
    res.cookie(
      this.REFRESH_COOKIE_NAME,
      refreshToken,
      this.getCookieOptions(this.REFRESH_EXPIRY)
    );
  }

  /**
   * Create a new session for a user with optional database storage
   * This method allows storing user data for future session refreshes
   */
  static async createSessionWithStorage(
    res: Response,
    userData: FamilyFederationUser
  ): Promise<void> {
    // Store user data in database for future session refreshes (privacy-preserving)
    await UserService.storeUserFromFederationData(userData);

    // Create session normally
    this.createSession(res, userData);
  }

  /**
   * Validate and extract session data from request
   */
  static validateSession(req: Request): SessionData | null {
    const sessionToken = req.cookies?.[this.SESSION_COOKIE_NAME];

    if (!sessionToken) {
      return null;
    }

    try {
      const decoded = jwt.verify(sessionToken, this.JWT_SECRET) as SessionData;
      return decoded;
    } catch (error) {
      // Token is invalid or expired
      return null;
    }
  }

  /**
   * Refresh session using refresh token with enhanced security logging
   */
  static async refreshSession(
    req: Request,
    res: Response
  ): Promise<SessionData | null> {
    const refreshToken = req.cookies?.[this.REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      this.logRefreshAttempt(req, false, "No refresh token provided");
      return null;
    }

    try {
      const decoded = jwt.verify(refreshToken, this.REFRESH_SECRET) as {
        userId: string;
        npub: string;
      };

      // Fetch the latest user data from database
      const federationData = await UserService.getFederationDataForRefresh(
        decoded.npub
      );

      if (!federationData) {
        this.logRefreshAttempt(req, false, "User not found in database");
        return null;
      }

      // Update user's last login timestamp
      await UserService.updateLastLoginByNpub(decoded.npub);

      // Get the original session data to preserve nip05 (since we can't retrieve it from hash)
      const originalSessionToken = req.cookies?.[this.SESSION_COOKIE_NAME];
      let originalNip05: string | undefined;

      if (originalSessionToken) {
        try {
          const originalSession = jwt.verify(
            originalSessionToken,
            this.JWT_SECRET
          ) as SessionData;
          originalNip05 = originalSession.nip05;
        } catch {
          // Original session token might be expired, that's okay
        }
      }

      const sessionData: SessionData = {
        userId: decoded.userId,
        npub: decoded.npub,
        nip05: originalNip05, // Preserve original nip05 from session
        federationRole: federationData.federationRole,
        authMethod: federationData.authMethod,
        isWhitelisted: federationData.isWhitelisted,
        votingPower: federationData.votingPower,
        guardianApproved: federationData.guardianApproved,
      };

      // Create new session token
      const newSessionToken = jwt.sign(sessionData, this.JWT_SECRET, {
        expiresIn: this.SESSION_EXPIRY,
      });

      // Create new refresh token (rotation)
      const newRefreshToken = jwt.sign(
        { userId: decoded.userId, npub: decoded.npub },
        this.REFRESH_SECRET,
        { expiresIn: this.REFRESH_EXPIRY }
      );

      // Update session cookie
      res.cookie(
        this.SESSION_COOKIE_NAME,
        newSessionToken,
        this.getCookieOptions(this.SESSION_EXPIRY)
      );

      // Update refresh cookie with new token
      res.cookie(
        this.REFRESH_COOKIE_NAME,
        newRefreshToken,
        this.getCookieOptions(this.REFRESH_EXPIRY)
      );

      this.logRefreshAttempt(req, true, "Session refreshed successfully");
      return sessionData;
    } catch (error) {
      // Refresh token is invalid or expired, or database error
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logRefreshAttempt(
        req,
        false,
        `Refresh token validation failed: ${errorMessage}`
      );
      return null;
    }
  }

  /**
   * Log refresh attempts for security monitoring
   */
  private static logRefreshAttempt(
    req: Request,
    success: boolean,
    reason: string
  ): void {
    const logData = {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      path: req.path,
      success,
      reason,
      timestamp: new Date().toISOString(),
    };

    if (success) {
      logger.info("Session refresh successful", logData);
    } else {
      logger.warn("Session refresh failed", logData);
    }
  }

  /**
   * Clear session cookies (logout)
   */
  static clearSession(res: Response): void {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/",
    };

    res.clearCookie(this.SESSION_COOKIE_NAME, cookieOptions);
    res.clearCookie(this.REFRESH_COOKIE_NAME, cookieOptions);
  }

  /**
   * Check if session exists (for client-side checks)
   */
  static hasSession(req: Request): boolean {
    return !!req.cookies?.[this.SESSION_COOKIE_NAME];
  }

  /**
   * Get session info for client (without sensitive data)
   */
  static getSessionInfo(req: Request): {
    isAuthenticated: boolean;
    user?: Partial<SessionData>;
  } {
    const sessionData = this.validateSession(req);

    if (!sessionData) {
      return { isAuthenticated: false };
    }

    // Return safe user data (no sensitive tokens)
    return {
      isAuthenticated: true,
      user: {
        npub: sessionData.npub,
        nip05: sessionData.nip05,
        federationRole: sessionData.federationRole,
        authMethod: sessionData.authMethod,
        isWhitelisted: sessionData.isWhitelisted,
        votingPower: sessionData.votingPower,
        guardianApproved: sessionData.guardianApproved,
      },
    };
  }
}
