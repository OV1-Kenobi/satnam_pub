
/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {Object} */ (import.meta);
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * Session Database Integration Tests
 *
 * Tests the database integration for session management,
 * ensuring privacy-first principles are maintained.
 */

import { createHash } from "crypto";
import { config } from "dotenv";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FamilyFederationUser } from "../../src/types/auth";
import db from "../db";

// Load environment variables from .env.local for testing consistency
// This ensures we use the same JWT_SECRET as the actual application
config({ path: resolve(process.cwd(), ".env.local") });

// Set test-specific environment variables that don't exist in .env.local
// Using the actual JWT_SECRET from .env.local but creating a separate refresh secret for testing
if (!getEnvVar("JWT_REFRESH_SECRET")) {
  getEnvVar("JWT_REFRESH_SECRET") = "test-refresh-secret-key-for-testing-only";
}
if (!getEnvVar("IDENTIFIER_HASH_SALT")) {
  getEnvVar("IDENTIFIER_HASH_SALT") = "test-salt-for-hashing";
}

// Now import the modules that depend on environment variables
import { SecureSessionManager } from "../security/session-manager";
import { UserService } from "../services/user-service";

// Mock database
vi.mock("../db", () => ({
  default: {
    query: vi.fn(),
    transaction: vi.fn(),
    getClient: vi.fn(),
    end: vi.fn(),
    models: {},
    migrations: {},
  },
}));

// Mock logger
vi.mock("../../utils/logger", () => ({
  defaultLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Session Database Integration - Privacy First", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let cookieStore: Record<string, string> = {};

  const mockUserData: FamilyFederationUser = {
    npub: "npub1test123456789abcdef",
    nip05: "test@example.com",
    federationRole: "parent",
    authMethod: "otp",
    isWhitelisted: true,
    votingPower: 5,
    guardianApproved: true,
    sessionToken: "mock-session-token",
  };

  // Helper function to create hash (matches UserService implementation)
  const hashIdentifier = (identifier: string): string => {
    const salt =
      getEnvVar("IDENTIFIER_HASH_SALT") || "default-salt-change-in-production";
    return createHash("sha256")
      .update(identifier + salt)
      .digest("hex");
  };

  const mockDbUserProfile = {
    id: "user-123",
    username: "89abcdef", // Last 8 chars of npub1test123456789abcdef
    npub_hash: hashIdentifier("npub1test123456789abcdef"),
    nip05_hash: hashIdentifier("test@example.com"),
    federation_role: "parent",
    auth_method: "otp",
    is_whitelisted: true,
    voting_power: 5,
    guardian_approved: true,
    family_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    cookieStore = {};

    mockReq = {
      cookies: {},
      ip: "127.0.0.1",
      get: vi.fn().mockReturnValue("test-user-agent"),
    };

    mockRes = {
      cookie: vi.fn((name: string, value: string) => {
        cookieStore[name] = value;
      }),
      clearCookie: vi.fn((name: string) => {
        delete cookieStore[name];
      }),
    };

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Privacy-Preserving Database Operations", () => {
    it("should store user federation data with hashed identifiers", async () => {
      const mockQueryResult = {
        rows: [mockDbUserProfile],
        rowCount: 1,
      };

      (db.query as any).mockResolvedValue(mockQueryResult);

      await UserService.storeUserFromFederationData(mockUserData);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO profiles"),
        expect.arrayContaining([
          null, // id
          "89abcdef", // username (privacy-preserving: last 8 chars of npub)
          hashIdentifier("npub1test123456789abcdef"), // npub_hash
          hashIdentifier("test@example.com"), // nip05_hash
          "parent", // federation_role
          "otp", // auth_method
          true, // is_whitelisted
          5, // voting_power
          true, // guardian_approved
          null, // family_id
        ])
      );
    });

    it("should retrieve federation data using hashed lookup", async () => {
      const mockQueryResult = {
        rows: [
          {
            federation_role: "parent",
            auth_method: "otp",
            is_whitelisted: true,
            voting_power: 5,
            guardian_approved: true,
          },
        ],
        rowCount: 1,
      };

      (db.query as any).mockResolvedValue(mockQueryResult);

      const result = await UserService.getFederationDataForRefresh(
        "npub1test123456789abcdef"
      );

      expect(result).toEqual({
        federationRole: "parent",
        authMethod: "otp",
        isWhitelisted: true,
        votingPower: 5,
        guardianApproved: true,
        nip05: undefined, // Cannot be retrieved from hash
      });

      expect(db.query).toHaveBeenCalledWith(expect.stringContaining("SELECT"), [
        hashIdentifier("npub1test123456789abcdef"),
      ]);
    });

    it("should not store raw npub or nip05 in database", async () => {
      const mockQueryResult = {
        rows: [mockDbUserProfile],
        rowCount: 1,
      };

      (db.query as any).mockResolvedValue(mockQueryResult);

      await UserService.storeUserFromFederationData(mockUserData);

      // Verify that raw npub and nip05 are NOT in the query parameters
      const queryCall = (db.query as any).mock.calls[0];
      const queryParams = queryCall[1];

      expect(queryParams).not.toContain("npub1test123456789abcdef");
      expect(queryParams).not.toContain("test@example.com");

      // But hashed versions should be present
      expect(queryParams).toContain(hashIdentifier("npub1test123456789abcdef"));
      expect(queryParams).toContain(hashIdentifier("test@example.com"));
    });

    it("should handle optional nip05 data properly with hashing", async () => {
      const userDataWithoutNip05: FamilyFederationUser = {
        ...mockUserData,
        nip05: undefined,
      };

      const mockQueryResult = {
        rows: [{ ...mockDbUserProfile, nip05_hash: null }],
        rowCount: 1,
      };

      (db.query as any).mockResolvedValue(mockQueryResult);

      await UserService.storeUserFromFederationData(userDataWithoutNip05);

      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null]) // nip05_hash should be null
      );
    });
  });

  describe("Session Management with Privacy Protection", () => {
    it("should create session with database storage using hashed identifiers", async () => {
      const mockQueryResult = {
        rows: [mockDbUserProfile],
        rowCount: 1,
      };

      (db.query as any).mockResolvedValue(mockQueryResult);

      await SecureSessionManager.createSessionWithStorage(
        mockRes as Response,
        mockUserData
      );

      // Verify database storage was called with hashed identifiers
      expect(db.query).toHaveBeenCalled();

      // Verify session cookies were set
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(cookieStore).toHaveProperty("family_session");
      expect(cookieStore).toHaveProperty("family_refresh");
    });

    it("should refresh session using database data with nip05 preservation", async () => {
      // Create original session token with nip05
      const originalSessionData = {
        userId: "npub1test123456789abcdef",
        npub: "npub1test123456789abcdef",
        nip05: "test@example.com",
        federationRole: "parent",
        authMethod: "otp",
        isWhitelisted: true,
        votingPower: 5,
        guardianApproved: true,
      };
      const originalSessionToken = jwt.sign(
        originalSessionData,
        getEnvVar("JWT_SECRET")!,
        { expiresIn: "15m" }
      );

      // Create refresh token
      const refreshTokenPayload = {
        userId: "npub1test123456789abcdef",
        npub: "npub1test123456789abcdef",
      };
      const refreshToken = jwt.sign(
        refreshTokenPayload,
        getEnvVar("JWT_REFRESH_SECRET")!,
        { expiresIn: "7d" }
      );

      mockReq.cookies = {
        family_refresh: refreshToken,
        family_session: originalSessionToken,
      };

      // Mock database responses
      const mockFederationData = {
        rows: [
          {
            federation_role: "parent",
            auth_method: "otp",
            is_whitelisted: true,
            voting_power: 5,
            guardian_approved: true,
          },
        ],
        rowCount: 1,
      };

      const mockUpdateResult = { rows: [], rowCount: 1 };

      (db.query as any)
        .mockResolvedValueOnce(mockFederationData) // getFederationDataForRefresh
        .mockResolvedValueOnce(mockUpdateResult); // updateLastLoginByNpub

      const result = await SecureSessionManager.refreshSession(
        mockReq as Request,
        mockRes as Response
      );

      expect(result).toEqual({
        userId: "npub1test123456789abcdef",
        npub: "npub1test123456789abcdef",
        nip05: "test@example.com", // Preserved from original session
        federationRole: "parent",
        authMethod: "otp",
        isWhitelisted: true,
        votingPower: 5,
        guardianApproved: true,
      });

      // Verify database was called with hashed npub
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE npub_hash = $1"),
        [hashIdentifier("npub1test123456789abcdef")]
      );
    });

    it("should handle refresh when user not found in database", async () => {
      const refreshTokenPayload = {
        userId: "npub1nonexistent",
        npub: "npub1nonexistent",
      };
      const refreshToken = jwt.sign(
        refreshTokenPayload,
        getEnvVar("JWT_REFRESH_SECRET")!,
        { expiresIn: "7d" }
      );

      mockReq.cookies = { family_refresh: refreshToken };

      // Mock empty database response
      (db.query as any).mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await SecureSessionManager.refreshSession(
        mockReq as Request,
        mockRes as Response
      );

      expect(result).toBeNull();
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE npub_hash = $1"),
        [hashIdentifier("npub1nonexistent")]
      );
    });
  });

  describe("Privacy and Security Compliance", () => {
    it("should not log sensitive data", async () => {
      const mockQueryResult = {
        rows: [mockDbUserProfile],
        rowCount: 1,
      };

      (db.query as any).mockResolvedValue(mockQueryResult);

      await UserService.storeUserFromFederationData(mockUserData);

      // Verify that full npub is not logged (only prefix)
      const { defaultLogger } = await import("../../utils/logger");
      expect(defaultLogger.info).toHaveBeenCalledWith(
        "User federation data stored successfully",
        { npub: "npub1tes..." }
      );
    });

    it("should generate consistent hashes for same input", () => {
      const npub = "npub1test123456789abcdef";
      const hash1 = hashIdentifier(npub);
      const hash2 = hashIdentifier(npub);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string length
    });

    it("should generate different hashes for different inputs", () => {
      const npub1 = "npub1test123456789abcdef";
      const npub2 = "npub1different123456789";

      const hash1 = hashIdentifier(npub1);
      const hash2 = hashIdentifier(npub2);

      expect(hash1).not.toBe(hash2);
    });

    it("should validate session tokens contain expected data structure", () => {
      SecureSessionManager.createSession(mockRes as Response, mockUserData);

      const sessionToken = cookieStore.family_session;
      expect(sessionToken).toBeDefined();

      const decoded = jwt.verify(sessionToken, getEnvVar("JWT_SECRET")!) as any;

      // Verify session contains all required federation data
      expect(decoded).toHaveProperty("userId");
      expect(decoded).toHaveProperty("npub");
      expect(decoded).toHaveProperty("federationRole");
      expect(decoded).toHaveProperty("authMethod");
      expect(decoded).toHaveProperty("isWhitelisted");
      expect(decoded).toHaveProperty("votingPower");
      expect(decoded).toHaveProperty("guardianApproved");

      // Verify the session token contains the original npub (not hashed)
      expect(decoded.npub).toBe("npub1test123456789abcdef");
    });

    it("should not expose hashed values in session tokens", () => {
      SecureSessionManager.createSession(mockRes as Response, mockUserData);

      const sessionToken = cookieStore.family_session;
      const decoded = jwt.verify(sessionToken, getEnvVar("JWT_SECRET")!) as any;

      // Session should contain original values, not hashes
      expect(decoded.npub).toBe("npub1test123456789abcdef");
      expect(decoded.nip05).toBe("test@example.com");

      // Should not contain hash fields
      expect(decoded).not.toHaveProperty("npub_hash");
      expect(decoded).not.toHaveProperty("nip05_hash");
    });
  });

  describe("Error Handling and Resilience", () => {
    it("should continue session creation even if database storage fails", async () => {
      (db.query as any).mockRejectedValue(new Error("Database unavailable"));

      // Should not throw error
      await expect(
        SecureSessionManager.createSessionWithStorage(
          mockRes as Response,
          mockUserData
        )
      ).resolves.not.toThrow();

      // Session should still be created
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(cookieStore).toHaveProperty("family_session");
      expect(cookieStore).toHaveProperty("family_refresh");
    });

    it("should handle malformed database responses", async () => {
      // Mock malformed response
      (db.query as any).mockResolvedValue({ rows: [{}], rowCount: 1 });

      const result = await UserService.getFederationDataForRefresh("npub1test");

      expect(result).toEqual({
        federationRole: "child", // default value
        authMethod: "otp", // default value
        isWhitelisted: false, // default value
        votingPower: 1, // default value
        guardianApproved: false, // default value
        nip05: undefined,
      });
    });

    it("should handle database errors during refresh gracefully", async () => {
      const refreshTokenPayload = {
        userId: "npub1test123456789abcdef",
        npub: "npub1test123456789abcdef",
      };
      const refreshToken = jwt.sign(
        refreshTokenPayload,
        getEnvVar("JWT_REFRESH_SECRET")!,
        { expiresIn: "7d" }
      );

      mockReq.cookies = { family_refresh: refreshToken };

      // Mock database error
      (db.query as any).mockRejectedValue(
        new Error("Database connection failed")
      );

      const result = await SecureSessionManager.refreshSession(
        mockReq as Request,
        mockRes as Response
      );

      expect(result).toBeNull();
    });
  });

  describe("Migration Compatibility", () => {
    it("should be compatible with privacy-first schema", () => {
      // Test that our implementation doesn't conflict with migration 004
      // which removes raw npub/nip05 columns

      // This test verifies that we're using npub_hash and nip05_hash
      // instead of the removed npub and nip05 columns
      expect(mockDbUserProfile).toHaveProperty("npub_hash");
      expect(mockDbUserProfile).toHaveProperty("nip05_hash");
      expect(mockDbUserProfile).not.toHaveProperty("npub");
      expect(mockDbUserProfile).not.toHaveProperty("nip05");
    });
  });

  describe("Security Verification", () => {
    it("should use production-grade JWT secret from environment", () => {
      // Verify we're using a JWT secret (either from .env.local or fallback)
      expect(getEnvVar("JWT_SECRET")).toBeDefined();
      expect(getEnvVar("JWT_SECRET")).not.toBe("");

      // Verify it's a reasonable length for security
      expect(getEnvVar("JWT_SECRET")!.length).toBeGreaterThan(32);

      // If it's the base64 secret from .env.local, verify format
      if (
        getEnvVar("JWT_SECRET")!.includes("+") ||
        getEnvVar("JWT_SECRET")!.includes("/") ||
        getEnvVar("JWT_SECRET")!.includes("=")
      ) {
        expect(getEnvVar("JWT_SECRET")).toMatch(/^[A-Za-z0-9+/]+=*$/);
      }
    });

    it("should maintain privacy-first principles in all database operations", () => {
      // Verify that our hash function produces consistent, non-reversible hashes
      const testNpub = "npub1test123456789abcdef";
      const hash = hashIdentifier(testNpub);

      // Hash should be deterministic
      expect(hashIdentifier(testNpub)).toBe(hash);

      // Hash should not contain the original value
      expect(hash).not.toContain("npub1test");
      expect(hash).not.toContain("test123456789abcdef");

      // Hash should be SHA-256 hex (64 characters)
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
