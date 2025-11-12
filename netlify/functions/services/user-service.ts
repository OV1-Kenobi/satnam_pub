import { getEnvVar } from "../utils/env.js";

/**
 * User Service for Database Operations
 *
 * This service handles all user-related database operations,
 * particularly for session management and user data retrieval.
 */

import { createHash, createHmac } from "crypto";
import { FamilyFederationUser, FederationRole } from "../../../src/types/auth";
import { defaultLogger as logger } from "../../../utils/logger";
import db from "../db";

export interface UserProfile {
  id: string;
  username: string;
  npub_hash?: string;
  nip05_hash?: string;
  federation_role?: FederationRole;
  auth_method?: "otp" | "nwc" | "nip05-password" | "nip07" | "nsec";
  is_whitelisted?: boolean;
  voting_power?: number;
  guardian_approved?: boolean;
  steward_approved?: boolean;
  family_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class UserService {
  /**
   * Create a privacy-preserving hash of an identifier
   * Uses SHA-256 with a salt for consistent but non-reversible hashing
   */
  private static hashIdentifier(identifier: string): string {
    const salt =
      getEnvVar("IDENTIFIER_HASH_SALT") || "default-salt-change-in-production";
    return createHash("sha256")
      .update(identifier + salt)
      .digest("hex");
  }

  /**
   * Get user profile by npub (using hashed lookup for privacy)
   */
  static async getUserByNpub(npub: string): Promise<UserProfile | null> {
    try {
      const secret = getEnvVar("DUID_SERVER_SECRET");
      if (!secret)
        throw new Error("Server misconfig: missing DUID_SERVER_SECRET");
      const hmac = createHmac("sha256", secret);
      hmac.update(`NPUBv1:${npub}`);
      const pubkey_duid = hmac.digest("hex");
      const recRes = await db.query(
        "SELECT name_duid FROM nip05_records WHERE pubkey_duid = $1 AND is_active = true LIMIT 1",
        [pubkey_duid]
      );
      if (recRes.rows.length === 0) {
        return null;
      }
      const duid = recRes.rows[0].name_duid as string;
      const result = await db.query(
        "SELECT * FROM user_identities WHERE id = $1 AND is_active = true LIMIT 1",
        [duid]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as UserProfile;
    } catch (error) {
      logger.error("Error fetching user by npub hash", {
        npubPrefix: npub.slice(0, 8) + "...",
        error,
      });
      throw new Error("Failed to fetch user data");
    }
  }

  /**
   * Get user profile by user ID
   */
  static async getUserById(userId: string): Promise<UserProfile | null> {
    try {
      const result = await db.query(
        "SELECT * FROM user_identities WHERE id = $1 AND is_active = true LIMIT 1",
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as UserProfile;
    } catch (error) {
      // PRIVACY: Hash userId before logging (never log raw UUIDs)
      const userIdHash = this.hashIdentifier(userId);
      logger.error("Error fetching user by ID", { userIdHash, error });
      throw new Error("Failed to fetch user data");
    }
  }

  /**
   * Convert database user profile to FamilyFederationUser format
   * Note: This method cannot reconstruct the original npub from hash
   * It should only be used when the original npub is available from session context
   */
  static profileToFederationUser(
    profile: UserProfile,
    originalNpub: string,
    originalNip05?: string
  ): FamilyFederationUser | null {
    if (!profile.npub_hash) {
      logger.warn("Profile missing npub_hash", { profileId: profile.id });
      return null;
    }

    return {
      npub: originalNpub, // Use the original npub from session context
      nip05: originalNip05, // Use the original nip05 from session context
      federationRole:
        (profile.federation_role as FederationRole) || "offspring",
      authMethod:
        profile.auth_method === "nip05-password" ||
        profile.auth_method === "nip07"
          ? profile.auth_method
          : "nip05-password",
      isWhitelisted: profile.is_whitelisted || false,
      votingPower: profile.voting_power || 1,
      guardianApproved: profile.guardian_approved || false,
      stewardApproved: profile.steward_approved || false,
      sessionToken: "", // This will be set by the session manager
    };
  }

  /**
   * Update user's last login timestamp
   */
  static async updateLastLogin(userId: string): Promise<void> {
    try {
      await db.query("UPDATE profiles SET last_login = NOW() WHERE id = $1", [
        userId,
      ]);
    } catch (error) {
      logger.error("Error updating last login", { userId, error });
      // Don't throw error for this non-critical operation
    }
  }

  /**
   * Update last login timestamp by npub (privacy-preserving)
   */
  static async updateLastLoginByNpub(npub: string): Promise<void> {
    try {
      const npubHash = this.hashIdentifier(npub);
      await db.query(
        "UPDATE profiles SET last_login = NOW() WHERE npub_hash = $1",
        [npubHash]
      );
    } catch (error) {
      logger.error("Error updating last login by npub", {
        npubPrefix: npub.slice(0, 8) + "...",
        error,
      });
      // Don't throw error for this non-critical operation
    }
  }

  /**
   * Create or update user profile (privacy-preserving with hashed identifiers)
   */
  static async upsertUser(userData: {
    id?: string;
    username: string;
    npub: string;
    nip05?: string;
    federation_role?: FederationRole;
    auth_method?: "otp" | "nwc" | "nip05-password" | "nip07" | "nsec";
    is_whitelisted?: boolean;
    voting_power?: number;
    guardian_approved?: boolean;
    steward_approved?: boolean;
    family_id?: string;
  }): Promise<UserProfile> {
    try {
      const npubHash = this.hashIdentifier(userData.npub);
      const nip05Hash = userData.nip05
        ? this.hashIdentifier(userData.nip05)
        : null;

      const result = await db.query(
        `
        INSERT INTO profiles (
          id, username, npub_hash, nip05_hash, federation_role, auth_method,
          is_whitelisted, voting_power, guardian_approved, family_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (npub_hash) 
        DO UPDATE SET
          username = EXCLUDED.username,
          nip05_hash = EXCLUDED.nip05_hash,
          federation_role = EXCLUDED.federation_role,
          auth_method = EXCLUDED.auth_method,
          is_whitelisted = EXCLUDED.is_whitelisted,
          voting_power = EXCLUDED.voting_power,
          guardian_approved = EXCLUDED.guardian_approved,
          family_id = EXCLUDED.family_id,
          updated_at = NOW()
        RETURNING *
        `,
        [
          userData.id || null,
          userData.username,
          npubHash,
          nip05Hash,
          userData.federation_role || "child",
          userData.auth_method || "otp",
          userData.is_whitelisted || false,
          userData.voting_power || 1,
          userData.guardian_approved || false,
          userData.family_id || null,
        ]
      );

      return result.rows[0] as UserProfile;
    } catch (error) {
      logger.error("Error upserting user", {
        usernamePrefix: userData.username.slice(0, 4) + "...",
        npubPrefix: userData.npub.slice(0, 8) + "...",
        error,
      });
      throw new Error("Failed to create or update user");
    }
  }

  /**
   * Store user data from FamilyFederationUser during session creation
   * This ensures user data is persisted in the database with privacy protections
   * Note: Only stores essential federation data, not sensitive information
   */
  static async storeUserFromFederationData(
    userData: FamilyFederationUser
  ): Promise<void> {
    try {
      // Generate a privacy-preserving username from npub (last 8 chars)
      // This avoids storing potentially identifying information from nip05
      const username = userData.npub.slice(-8);

      await this.upsertUser({
        username,
        npub: userData.npub,
        nip05: userData.nip05, // Optional, user-controlled
        federation_role: userData.federationRole,
        auth_method: userData.authMethod,
        is_whitelisted: userData.isWhitelisted,
        voting_power: userData.votingPower,
        guardian_approved: userData.guardianApproved,
      });

      logger.info("User federation data stored successfully", {
        npub: userData.npub.slice(0, 8) + "...", // Log only prefix for privacy
      });
    } catch (error) {
      logger.error("Error storing user federation data", {
        npubPrefix: userData.npub.slice(0, 8) + "...", // Log only prefix for privacy
        error,
      });
      // Don't throw error to avoid breaking session creation
      // This is a best-effort operation for future session refreshes
    }
  }

  /**
   * Get user's federation data for session refresh (privacy-preserving)
   * This method specifically retrieves the data needed for session tokens
   */
  static async getFederationDataForRefresh(npub: string): Promise<{
    federationRole: "parent" | "child" | "guardian";
    authMethod: "otp" | "nwc";
    isWhitelisted: boolean;
    votingPower: number;
    guardianApproved: boolean;
    nip05?: string;
  } | null> {
    try {
      const npubHash = this.hashIdentifier(npub);
      const result = await db.query(
        `
        SELECT 
          federation_role,
          auth_method,
          is_whitelisted,
          voting_power,
          guardian_approved
        FROM profiles 
        WHERE npub_hash = $1 
        LIMIT 1
        `,
        [npubHash]
      );

      if (result.rows.length === 0) {
        logger.warn("No user found for session refresh", {
          npubPrefix: npub.slice(0, 8) + "...",
        });
        return null;
      }

      const row = result.rows[0];
      return {
        federationRole: row.federation_role || "child",
        authMethod: row.auth_method || "otp",
        isWhitelisted: row.is_whitelisted || false,
        votingPower: row.voting_power || 1,
        guardianApproved: row.guardian_approved || false,
        // Note: We cannot return the original nip05 from hash
        // The session refresh will use the nip05 from the original session token
        nip05: undefined,
      };
    } catch (error) {
      logger.error("Error fetching federation data for refresh", {
        npubPrefix: npub.slice(0, 8) + "...",
        error,
      });
      throw new Error("Failed to fetch user federation data");
    }
  }
}
