/**
 * Authentication Bridge Service
 * Integrates privacy-first auth with existing NWC/OTP authentication
 * Maintains your existing auth.ts functionality while adding privacy protection
 */

import { nip19 } from "../src/lib/nostr-browser";
import { db } from "../lib";
import { PrivacyManager } from "../lib/crypto/privacy-manager";
import { NostrEvent, User } from "../types/user";
import {
  authenticateWithNWC as originalAuthenticateNWC,
  authenticateWithOTP as originalAuthenticateOTP,
  generateAuthChallenge as originalGenerateChallenge,
  generateOTPForUser as originalGenerateOTP,
} from "./auth";
import { authenticatePrivacyFirst, createAuditLog } from "./privacy-auth";

/**
 * Helper function to safely extract error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error occurred";
}

/**
 * Enhanced challenge generation with privacy protection
 * Wraps your existing generateAuthChallenge function
 */
export async function generateAuthChallenge(
  npub: string,
): Promise<{ id: string; challenge: string }> {
  // Extract pubkey from npub for auth hash creation
  let pubkey: string;
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== "npub") {
      throw new Error("Invalid npub format");
    }
    pubkey = decoded.data as string;
  } catch {
    throw new Error("Invalid npub format");
  }

  // Check if user exists in privacy-first system
  const authHash = PrivacyManager.createAuthHash(pubkey);
  const userResult = await db.query(
    "SELECT id FROM profiles WHERE auth_hash = $1",
    [authHash],
  );

  let userId: string | null = null;
  if (userResult.rows.length > 0) {
    userId = userResult.rows[0].id;
    await createAuditLog(userId, "auth_challenge_generated", true);
  }

  // Use original challenge generation (it stores by npub in auth_challenges table)
  return await originalGenerateChallenge(npub);
}

/**
 * Enhanced NWC authentication with privacy protection
 * Wraps your existing authenticateWithNWC function
 */
export async function authenticateWithNWC(
  signed_event: NostrEvent,
  username?: string, // Optional for new users
): Promise<{ user: User; token: string; isNewUser: boolean }> {
  try {
    // Try original authentication first (for existing users in old format)
    const originalResult = await originalAuthenticateNWC(signed_event);

    // If successful, migrate user to privacy-first format
    const migrationResult = await migrateToPrivacyFirst(
      signed_event.pubkey,
      originalResult.user,
    );

    await createAuditLog(migrationResult.user.id, "nwc_auth_migrated", true);

    return {
      user: migrationResult.user,
      token: migrationResult.token,
      isNewUser: false,
    };
  } catch (originalError) {
    // If original auth fails, try privacy-first auth
    try {
      const result = await authenticatePrivacyFirst(
        signed_event.pubkey,
        username,
      );

      await createAuditLog(
        result.user.id,
        result.isNewUser ? "nwc_auth_new_user" : "nwc_auth_existing",
        true,
      );

      return result;
    } catch (privacyError) {
      // If both fail, log and throw original error
      if (username) {
        await createAuditLog(null, "nwc_auth_failed", false, {
          error: getErrorMessage(originalError),
          privacy_error: getErrorMessage(privacyError),
        });
      }
      throw originalError;
    }
  }
}

/**
 * Enhanced OTP authentication with privacy protection
 * Wraps your existing authenticateWithOTP function
 */
export async function authenticateWithOTP(
  npub: string,
  otp_code: string,
  session_token: string,
  username?: string, // Optional for new users
): Promise<{ user: User; token: string; isNewUser: boolean }> {
  // Extract pubkey from npub
  let pubkey: string;
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== "npub") {
      throw new Error("Invalid npub format");
    }
    pubkey = decoded.data as string;
  } catch {
    throw new Error("Invalid npub format");
  }

  try {
    // Try original authentication first
    const originalResult = await originalAuthenticateOTP(
      npub,
      otp_code,
      session_token,
    );

    // Migrate to privacy-first format
    const migrationResult = await migrateToPrivacyFirst(
      pubkey,
      originalResult.user,
    );

    await createAuditLog(migrationResult.user.id, "otp_auth_migrated", true);

    return {
      user: migrationResult.user,
      token: migrationResult.token,
      isNewUser: false,
    };
  } catch (originalError) {
    // Try privacy-first auth
    try {
      const result = await authenticatePrivacyFirst(pubkey, username);

      await createAuditLog(
        result.user.id,
        result.isNewUser ? "otp_auth_new_user" : "otp_auth_existing",
        true,
      );

      return result;
    } catch (privacyError) {
      if (username) {
        await createAuditLog(null, "otp_auth_failed", false, {
          error: getErrorMessage(originalError),
          privacy_error: getErrorMessage(privacyError),
        });
      }
      throw originalError;
    }
  }
}

/**
 * Enhanced OTP generation with privacy protection
 * Wraps your existing generateOTPForUser function
 */
export async function generateOTPForUser(npub: string): Promise<string> {
  // Extract pubkey for privacy tracking
  let pubkey: string;
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== "npub") {
      throw new Error("Invalid npub format");
    }
    pubkey = decoded.data as string;
  } catch {
    throw new Error("Invalid npub format");
  }

  // Check if user exists in privacy-first system for audit logging
  const authHash = PrivacyManager.createAuthHash(pubkey);
  const userResult = await db.query(
    "SELECT id FROM profiles WHERE auth_hash = $1",
    [authHash],
  );

  if (userResult.rows.length > 0) {
    await createAuditLog(userResult.rows[0].id, "otp_generated", true);
  }

  // Use original OTP generation
  return await originalGenerateOTP(npub);
}

/**
 * Migrate existing user to privacy-first format
 * Converts old npub-based user to auth_hash-based user
 */
async function migrateToPrivacyFirst(
  pubkey: string,
  oldUser: any,
): Promise<{ user: User; token: string }> {
  // Check if already migrated
  const authHash = PrivacyManager.createAuthHash(pubkey);
  const existingPrivacyUser = await db.query(
    "SELECT * FROM profiles WHERE auth_hash = $1",
    [authHash],
  );

  if (existingPrivacyUser.rows.length > 0) {
    // Already migrated
    const user = existingPrivacyUser.rows[0];
    const token = require("./auth").generateToken({
      id: user.id,
      npub: "", // Empty in privacy-first mode
      role: user.role,
    });

    return { user, token };
  }

  // Migrate the user
  await db.query(
    `
    UPDATE profiles 
    SET 
      auth_hash = $1,
      user_status = 'active',
      onboarding_completed = true
    WHERE id = $2
  `,
    [authHash, oldUser.id],
  );

  // Get updated user
  const updatedResult = await db.query("SELECT * FROM profiles WHERE id = $1", [
    oldUser.id,
  ]);
  const user = updatedResult.rows[0];

  const token = require("./auth").generateToken({
    id: user.id,
    npub: "", // Empty in privacy-first mode
    role: user.role,
  });

  await createAuditLog(user.id, "user_migrated_to_privacy_first", true);

  return { user, token };
}

/**
 * Check if user exists in either format (old or privacy-first)
 */
export async function findUserByPublicKey(
  pubkey: string,
): Promise<User | null> {
  // Try privacy-first format first
  const authHash = PrivacyManager.createAuthHash(pubkey);
  const privacyResult = await db.query(
    "SELECT * FROM profiles WHERE auth_hash = $1",
    [authHash],
  );

  if (privacyResult.rows.length > 0) {
    return privacyResult.rows[0];
  }

  // Try old format with npub
  const npub = nip19.npubEncode(pubkey);
  const oldResult = await db.query("SELECT * FROM profiles WHERE npub = $1", [
    npub,
  ]);

  if (oldResult.rows.length > 0) {
    // Found in old format - could migrate here if desired
    return oldResult.rows[0];
  }

  return null;
}

/**
 * Get user's authentication status and available methods
 */
export async function getUserAuthStatus(pubkey: string): Promise<{
  exists: boolean;
  isPrivacyFirst: boolean;
  needsMigration: boolean;
  user?: User;
}> {
  const authHash = PrivacyManager.createAuthHash(pubkey);

  // Check privacy-first format
  const privacyResult = await db.query(
    "SELECT * FROM profiles WHERE auth_hash = $1",
    [authHash],
  );

  if (privacyResult.rows.length > 0) {
    return {
      exists: true,
      isPrivacyFirst: true,
      needsMigration: false,
      user: privacyResult.rows[0],
    };
  }

  // Check old format
  const npub = nip19.npubEncode(pubkey);
  const oldResult = await db.query("SELECT * FROM profiles WHERE npub = $1", [
    npub,
  ]);

  if (oldResult.rows.length > 0) {
    return {
      exists: true,
      isPrivacyFirst: false,
      needsMigration: true,
      user: oldResult.rows[0],
    };
  }

  return {
    exists: false,
    isPrivacyFirst: false,
    needsMigration: false,
  };
}
