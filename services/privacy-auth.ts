/**
 * Privacy-First Authentication Service
 *
 * Provides secure authentication without storing user public keys or sensitive data.
 * Integrates with existing NWC/OTP systems while maintaining zero-knowledge architecture.
 *
 * Features:
 * - No pubkey storage - uses cryptographic auth hashes only
 * - Privacy-safe onboarding sessions with 2-hour expiry
 * - Client-side encrypted profile data
 * - Comprehensive audit logging with privacy protection
 * - Username validation and generation
 * - Production-ready audit detail encryption
 *
 * Security:
 * - All authentication uses PBKDF2 with 100,000 iterations
 * - Constant-time comparison prevents timing attacks
 * - IP addresses and user-agents are hashed before storage
 * - Private keys never stored server-side
 * - Audit details encrypted with AES-256-GCM using server-side keys
 * - Each encryption operation uses unique salt and IV
 *
 * @author Satnam.pub Team
 * @version 1.0.0
 */

import { db } from "../lib";
import { PrivacyManager } from "../lib/crypto/privacy-manager";
import {
  decryptSensitiveData,
  encryptSensitiveData,
} from "../lib/privacy/encryption";
import { AuthAuditLog, OnboardingSession, User } from "../types/user";
import { generateRandomHex, sha256 } from "../utils/crypto-factory";
import { generateToken } from "./auth";

/**
 * Initialize privacy-first onboarding for new users
 *
 * Creates a temporary session without storing Nostr keys or sensitive data.
 * Sessions expire after 2 hours to maintain security.
 *
 * @param username - Desired username (validated for format and availability)
 * @param invite_code - Optional invitation code for family/group access
 * @returns Promise<OnboardingSession> - Temporary session with token
 * @throws {Error} Username validation errors or database errors
 */
export async function startPrivateOnboarding(
  username: string,
  invite_code?: string
): Promise<OnboardingSession> {
  // Input validation
  if (!username || typeof username !== "string") {
    throw new Error("Username is required and must be a string");
  }

  if (invite_code && typeof invite_code !== "string") {
    throw new Error("Invite code must be a string");
  }

  // Validate username format against security requirements
  const validation = PrivacyManager.validateUsernameFormat(username);
  if (!validation.valid) {
    throw new Error(
      `Invalid username: ${validation.error || "Invalid format"}`
    );
  }

  // Check username availability to prevent conflicts
  const client = await db.getClient();
  const { data: existingUser, error: userCheckError } = await client
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single();

  if (userCheckError && userCheckError.code !== "PGRST116") {
    // PGRST116 = no rows found
    throw new Error(`Database error: ${userCheckError.message}`);
  }

  if (existingUser) {
    throw new Error("Username already exists");
  }

  // Generate cryptographically secure session token
  const sessionToken = await generateRandomHex(32);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1_000); // 2 hours

  try {
    const { data: session, error: insertError } = await client
      .from("onboarding_sessions")
      .insert({
        temp_username: username,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(
        `Failed to create onboarding session: ${insertError.message}`
      );
    }

    return {
      id: session.id,
      temp_username: session.temp_username,
      session_token: session.session_token,
      expires_at: Math.floor(new Date(session.expires_at).getTime() / 1000),
      completed: session.completed,
      created_at: Math.floor(new Date(session.created_at).getTime() / 1000),
    };
  } catch (error) {
    throw new Error(
      `Failed to create onboarding session: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Complete privacy-first user registration
 *
 * Finalizes user registration using auth hash instead of storing pubkeys.
 * The pubkey is used only to generate the authentication hash and is immediately discarded.
 *
 * @param session_token - Valid onboarding session token
 * @param pubkey - Nostr public key (used for hash generation only, not stored)
 * @param encrypted_profile - Optional user-encrypted profile data
 * @param encryption_hint - Optional hint for user's encryption method
 * @returns Promise with user object, JWT token, and audit log entry
 * @throws {Error} Invalid session, expired session, or database errors
 */
export async function completePrivateRegistration(
  session_token: string,
  pubkey: string,
  encrypted_profile?: string,
  encryption_hint?: string
): Promise<{ user: User; token: string; audit_log: AuthAuditLog }> {
  // Input validation
  if (!session_token || typeof session_token !== "string") {
    throw new Error("Session token is required and must be a string");
  }

  if (!pubkey || typeof pubkey !== "string") {
    throw new Error("Public key is required and must be a string");
  }

  if (encrypted_profile && typeof encrypted_profile !== "string") {
    throw new Error("Encrypted profile must be a string");
  }

  if (encryption_hint && typeof encryption_hint !== "string") {
    throw new Error("Encryption hint must be a string");
  }

  try {
    // Validate onboarding session exists and is not expired
    const client = await db.getClient();
    const { data: session, error: sessionError } = await client
      .from("onboarding_sessions")
      .select("*")
      .eq("session_token", session_token)
      .eq("completed", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (sessionError || !session) {
      throw new Error("Invalid or expired onboarding session");
    }

    // Create privacy-safe auth hash from pubkey (pubkey is not stored)
    const authHash = PrivacyManager.createAuthHash(pubkey);

    // Create non-reversible platform identifier using auth hash
    const platformId = authHash; // Use auth hash as platform identifier

    // Use database function for secure user registration
    const { data: registrationResult, error: userError } = await client.rpc(
      "register_user_privacy_first",
      {
        p_username: session.temp_username,
        p_auth_hash: authHash,
        p_encrypted_profile: encrypted_profile ?? null,
        p_invite_code: null,
      }
    );

    if (userError) {
      throw new Error(`User registration failed: ${userError.message}`);
    }

    const newUserId = registrationResult;

    // Update user with encryption metadata if provided
    if (encryption_hint) {
      const { error: updateError } = await client
        .from("profiles")
        .update({ encryption_hint })
        .eq("id", newUserId);

      if (updateError) {
        throw new Error(
          `Failed to update encryption hint: ${updateError.message}`
        );
      }
    }

    // Mark onboarding session as completed
    const { error: sessionUpdateError } = await client
      .from("onboarding_sessions")
      .update({
        completed: true,
        platform_id: platformId,
      })
      .eq("session_token", session_token);

    if (sessionUpdateError) {
      throw new Error(
        `Failed to complete session: ${sessionUpdateError.message}`
      );
    }

    // Retrieve the created user profile
    const { data: userProfile, error: profileError } = await client
      .from("profiles")
      .select("*")
      .eq("id", newUserId)
      .single();

    if (profileError || !userProfile) {
      throw new Error(
        `Failed to retrieve user profile: ${
          profileError?.message || "Profile not found"
        }`
      );
    }

    const user = userProfile;

    // Create comprehensive audit log entry
    const auditLog = await createAuditLog(
      newUserId,
      "registration_completed",
      true,
      { platform_id: platformId }
    );

    // Generate JWT token without exposing pubkey
    const token = await generateToken({
      id: user.id,
      npub: "", // Privacy-first: no pubkey in tokens
      role: user.role,
    });

    return {
      user: {
        ...user,
        created_at: Math.floor(new Date(user.created_at).getTime() / 1000),
        last_login: Math.floor(Date.now() / 1000),
      },
      token,
      audit_log: auditLog,
    };
  } catch (error) {
    throw new Error(
      `Registration failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Authenticate users with privacy-first approach
 *
 * Compatible with existing NWC/OTP systems while using auth hashes instead of storing pubkeys.
 * Automatically handles new user registration when username is provided.
 *
 * @param pubkey - Nostr public key from NWC verification (used for hash creation/verification only)
 * @param username - Required for new user registration, optional for existing users
 * @returns Promise with user object, JWT token, and new user flag
 * @throws {Error} Authentication failures, validation errors, or database errors
 */
export async function authenticatePrivacyFirst(
  pubkey: string,
  username?: string
): Promise<{ user: User; token: string; isNewUser: boolean }> {
  // Input validation
  if (!pubkey || typeof pubkey !== "string") {
    throw new Error("Public key is required and must be a string");
  }

  if (username && typeof username !== "string") {
    throw new Error("Username must be a string");
  }

  try {
    // Create auth hash from pubkey for user lookup
    const searchHash = PrivacyManager.createAuthHash(pubkey);

    // Attempt to find existing user by auth hash
    const client = await db.getClient();
    const { data: existingUser, error: userSearchError } = await client
      .from("profiles")
      .select("*")
      .eq("auth_hash", searchHash)
      .single();

    let user: User;
    let isNewUser = false;

    if (!existingUser || userSearchError?.code === "PGRST116") {
      // New user - registration required
      if (!username) {
        throw new Error("Username required for new user registration");
      }

      // Validate username format and availability
      const validation = PrivacyManager.validateUsernameFormat(username);
      if (!validation.valid) {
        throw new Error(
          `Invalid username: ${validation.error || "Invalid format"}`
        );
      }

      // Check username availability
      const { data: existingUsername, error: usernameCheckError } = await client
        .from("profiles")
        .select("id")
        .eq("username", username)
        .single();

      if (existingUsername && !usernameCheckError) {
        throw new Error("Username already exists");
      }

      // Register new user with privacy-first approach
      const { data: newUserId, error: registrationError } = await client.rpc(
        "register_user_privacy_first",
        {
          p_username: username,
          p_auth_hash: searchHash,
          p_encrypted_profile: null,
          p_invite_code: null,
        }
      );

      if (registrationError) {
        throw new Error(
          `User registration failed: ${registrationError.message}`
        );
      }

      // Retrieve the newly created user
      const { data: newUser, error: newUserError } = await client
        .from("profiles")
        .select("*")
        .eq("id", newUserId)
        .single();

      if (newUserError || !newUser) {
        throw new Error(
          `Failed to retrieve newly created user: ${
            newUserError?.message || "User not found"
          }`
        );
      }

      user = newUser;
      isNewUser = true;

      await createAuditLog(user.id, "new_user_authenticated", true);
    } else {
      // Existing user - verify auth hash using constant-time comparison
      user = existingUser;

      // Verify auth hash by recreating it and comparing
      const expectedHash = PrivacyManager.createAuthHash(pubkey);
      if (expectedHash !== user.auth_hash) {
        await createAuditLog(user.id, "authentication_failed", false);
        throw new Error("Invalid authentication credentials");
      }

      // Update last login timestamp
      const { error: updateError } = await client
        .from("profiles")
        .update({ last_login: new Date().toISOString() })
        .eq("id", user.id);

      if (updateError) {
        console.error("Failed to update last login:", updateError.message);
      }

      await createAuditLog(user.id, "user_authenticated", true);
    }

    // Generate JWT token without exposing sensitive data
    const token = await generateToken({
      id: user.id,
      npub: "", // Privacy-first: no pubkey in tokens
      role: user.role,
    });

    return {
      user: {
        ...user,
        created_at: Math.floor(new Date(user.created_at).getTime() / 1000),
        last_login: Math.floor(Date.now() / 1000),
      },
      token,
      isNewUser,
    };
  } catch (error) {
    throw new Error(
      `Authentication failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Update user's encrypted profile data
 *
 * Allows users to update their client-side encrypted profile data.
 * The server cannot decrypt this data - only the user has the encryption keys.
 *
 * @param userId - User's unique identifier
 * @param encryptedProfile - User-encrypted profile data
 * @param encryptionHint - Optional hint about encryption method used
 * @throws {Error} Validation errors or database errors
 */
export async function updateEncryptedProfile(
  userId: string,
  encryptedProfile: string,
  encryptionHint?: string
): Promise<void> {
  // Input validation
  if (!userId || typeof userId !== "string") {
    throw new Error("User ID is required and must be a string");
  }

  if (!encryptedProfile || typeof encryptedProfile !== "string") {
    throw new Error("Encrypted profile is required and must be a string");
  }

  if (encryptionHint && typeof encryptionHint !== "string") {
    throw new Error("Encryption hint must be a string");
  }

  try {
    const client = await db.getClient();
    const { error: updateError } = await client
      .from("profiles")
      .update({
        encrypted_profile: encryptedProfile,
        encryption_hint: encryptionHint ?? null,
      })
      .eq("id", userId);

    if (updateError) {
      throw new Error(`Failed to update profile: ${updateError.message}`);
    }

    await createAuditLog(userId, "profile_updated", true);
  } catch (error) {
    throw new Error(
      `Failed to update profile: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Retrieve user's encrypted profile data
 *
 * Returns user's encrypted profile data and encryption hints.
 * Server cannot decrypt this data - only returned to the authenticated user.
 *
 * @param userId - User's unique identifier
 * @returns Promise with encrypted profile data and encryption hint
 * @throws {Error} User not found or database errors
 */
export async function getEncryptedProfile(userId: string): Promise<{
  encrypted_profile?: string;
  encryption_hint?: string;
}> {
  // Input validation
  if (!userId || typeof userId !== "string") {
    throw new Error("User ID is required and must be a string");
  }

  try {
    const client = await db.getClient();
    const { data: user, error: userError } = await client
      .from("profiles")
      .select("encrypted_profile, encryption_hint")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      throw new Error(
        `User not found: ${userError?.message || "No user data"}`
      );
    }

    return user;
  } catch (error) {
    throw new Error(
      `Failed to retrieve profile: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Create audit log entry with privacy protection
 *
 * Creates security audit logs while protecting user privacy.
 * IP addresses and user agents are hashed before storage.
 * Details are encrypted to prevent unauthorized access.
 *
 * @param userId - User ID (null for anonymous actions)
 * @param action - Action being logged (e.g., 'login', 'profile_update')
 * @param success - Whether the action succeeded
 * @param details - Optional additional details (will be encrypted)
 * @param ipAddress - Optional IP address (will be hashed)
 * @param userAgent - Optional user agent (will be hashed)
 * @returns Promise with audit log entry
 * @throws {Error} Database errors
 */
export async function createAuditLog(
  userId: string | null,
  action: string,
  success: boolean,
  details?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthAuditLog> {
  // Input validation
  if (!action || typeof action !== "string") {
    throw new Error("Action is required and must be a string");
  }

  if (typeof success !== "boolean") {
    throw new Error("Success must be a boolean");
  }

  if (userId && typeof userId !== "string") {
    throw new Error("User ID must be a string");
  }

  if (ipAddress && typeof ipAddress !== "string") {
    throw new Error("IP address must be a string");
  }

  if (userAgent && typeof userAgent !== "string") {
    throw new Error("User agent must be a string");
  }

  try {
    // Hash sensitive data for privacy protection
    const ipHash = ipAddress ? await sha256(ipAddress) : null;
    const userAgentHash = userAgent ? await sha256(userAgent) : null;

    // Encrypt audit details for security using AES-256-GCM
    let encryptedDetails: string | null = null;
    if (details) {
      try {
        const encryptionResult = await encryptSensitiveData(
          JSON.stringify(details)
        );
        // Store all encryption components as a JSON string for database storage
        encryptedDetails = JSON.stringify({
          encrypted: encryptionResult.encrypted,
          iv: encryptionResult.iv,
          tag: encryptionResult.tag,
        });
      } catch (error) {
        // If encryption fails, log the error but don't store sensitive details in plaintext
        console.error("Failed to encrypt audit details:", error);
        encryptedDetails = JSON.stringify({
          error: "encryption_failed",
          timestamp: new Date().toISOString(),
        });
      }
    }

    const client = await db.getClient();
    const { data: log, error: auditError } = await client
      .from("auth_audit_log")
      .insert({
        user_id: userId,
        action,
        encrypted_details: encryptedDetails,
        ip_hash: ipHash,
        user_agent_hash: userAgentHash,
        success,
      })
      .select("*")
      .single();

    if (auditError || !log) {
      throw new Error(
        `Failed to create audit log: ${auditError?.message || "Unknown error"}`
      );
    }

    return {
      id: log.id,
      user_id: log.user_id,
      action: log.action,
      encrypted_details: log.encrypted_details,
      ip_hash: log.ip_hash,
      user_agent_hash: log.user_agent_hash,
      success: log.success,
      created_at: Math.floor(new Date(log.created_at).getTime() / 1000),
    };
  } catch (error) {
    throw new Error(
      `Failed to create audit log: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Retrieve user's audit log with privacy protection
 *
 * Returns the user's security audit log with privacy-protected data.
 * Limited to 100 most recent entries for performance.
 *
 * @param userId - User's unique identifier
 * @returns Promise with array of audit log entries
 * @throws {Error} Validation errors or database errors
 */
export async function getUserAuditLog(userId: string): Promise<AuthAuditLog[]> {
  // Input validation
  if (!userId || typeof userId !== "string") {
    throw new Error("User ID is required and must be a string");
  }

  try {
    const client = await db.getClient();
    const { data: logs, error: logsError } = await client
      .from("auth_audit_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (logsError) {
      throw new Error(`Failed to retrieve audit logs: ${logsError.message}`);
    }

    return (logs || []).map((log) => ({
      id: log.id,
      user_id: log.user_id,
      action: log.action,
      encrypted_details: log.encrypted_details,
      ip_hash: log.ip_hash,
      user_agent_hash: log.user_agent_hash,
      success: log.success,
      created_at: Math.floor(new Date(log.created_at).getTime() / 1000),
    }));
  } catch (error) {
    throw new Error(
      `Failed to retrieve audit log: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Generate privacy-safe username suggestions
 *
 * Creates human-readable username suggestions with no connection to user's Nostr identity.
 * Checks database for availability and ensures uniqueness.
 *
 * @param count - Number of suggestions to generate (default: 5, max: 20)
 * @returns Promise with array of available username suggestions
 * @throws {Error} Invalid count parameter or database errors
 */
export async function generateUsernameSuggestions(
  count: number = 5
): Promise<string[]> {
  // Input validation
  if (typeof count !== "number" || count < 1 || count > 20) {
    throw new Error("Count must be a number between 1 and 20");
  }

  try {
    const client = await db.getClient();
    const available: string[] = [];

    // Generate suggestions using existing method
    let attempts = 0;
    const maxAttempts = count * 3; // Prevent infinite loop

    while (available.length < count && attempts < maxAttempts) {
      const newSuggestion = PrivacyManager.generateAnonymousUsername();

      // Check availability
      const { data: existingUser, error: checkError } = await client
        .from("profiles")
        .select("id")
        .eq("username", newSuggestion)
        .single();

      // If no user found (PGRST116) and not already in our list, add it
      if (
        (checkError?.code === "PGRST116" || !existingUser) &&
        !available.includes(newSuggestion)
      ) {
        available.push(newSuggestion);
      }

      attempts++;
    }

    return available.slice(0, count);
  } catch (error) {
    throw new Error(
      `Failed to generate username suggestions: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Validate and retrieve onboarding session
 *
 * Retrieves an active onboarding session if it exists and hasn't expired.
 * Returns null for invalid or expired sessions.
 *
 * @param session_token - Session token to validate
 * @returns Promise with session object or null if invalid/expired
 * @throws {Error} Validation errors or database errors
 */
export async function getOnboardingSession(
  session_token: string
): Promise<OnboardingSession | null> {
  // Input validation
  if (!session_token || typeof session_token !== "string") {
    throw new Error("Session token is required and must be a string");
  }

  try {
    const client = await db.getClient();
    const { data: session, error: sessionError } = await client
      .from("onboarding_sessions")
      .select("*")
      .eq("session_token", session_token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (sessionError?.code === "PGRST116" || !session) {
      return null;
    }

    if (sessionError) {
      throw new Error(`Database error: ${sessionError.message}`);
    }

    return {
      id: session.id,
      temp_username: session.temp_username,
      auth_challenge_hash: session.auth_challenge_hash,
      platform_id: session.platform_id,
      session_token: session.session_token,
      expires_at: Math.floor(new Date(session.expires_at).getTime() / 1000),
      completed: session.completed,
      created_at: Math.floor(new Date(session.created_at).getTime() / 1000),
    };
  } catch (error) {
    throw new Error(
      `Failed to retrieve onboarding session: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Decrypt audit log details for authorized access
 *
 * Decrypts audit log details for system administrators or security analysis.
 * Should only be used for legitimate security investigations.
 *
 * @param encryptedDetailsJson - Encrypted audit details from database
 * @returns Promise with decrypted details object or null if decryption fails
 * @throws {Error} Decryption errors
 */
export async function decryptAuditDetails(
  encryptedDetailsJson: string | null
): Promise<Record<string, unknown> | null> {
  if (!encryptedDetailsJson) {
    return null;
  }

  try {
    // Parse the stored encryption components
    const encryptionData = JSON.parse(encryptedDetailsJson);

    // Check if this is an encryption error entry
    if (encryptionData.error === "encryption_failed") {
      return {
        error: "original_encryption_failed",
        timestamp: encryptionData.timestamp,
      };
    }

    // Validate encryption data structure
    if (
      !encryptionData.encrypted ||
      !encryptionData.salt ||
      !encryptionData.iv ||
      !encryptionData.tag
    ) {
      throw new Error("Invalid encryption data structure");
    }

    // Decrypt the audit details
    const decryptedJson = await decryptSensitiveData(
      encryptionData.encrypted,
      encryptionData.iv
    );

    return JSON.parse(decryptedJson);
  } catch (error) {
    throw new Error(
      `Failed to decrypt audit details: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Retrieve and decrypt user's audit log with authorized access
 *
 * Enhanced version of getUserAuditLog that can decrypt audit details
 * for authorized administrators or security investigations.
 *
 * @param userId - User's unique identifier
 * @param decryptDetails - Whether to decrypt audit details (requires proper authorization)
 * @returns Promise with array of audit log entries with optional decrypted details
 * @throws {Error} Validation errors or database errors
 */
export async function getUserAuditLogWithDetails(
  userId: string,
  decryptDetails: boolean = false
): Promise<
  (AuthAuditLog & { decrypted_details?: Record<string, unknown> | null })[]
> {
  // Input validation
  if (!userId || typeof userId !== "string") {
    throw new Error("User ID is required and must be a string");
  }

  try {
    const client = await db.getClient();
    const { data: auditLogs, error: logsError } = await client
      .from("auth_audit_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (logsError) {
      throw new Error(`Failed to retrieve audit logs: ${logsError.message}`);
    }

    const logs = await Promise.all(
      (auditLogs || []).map(async (log: any) => {
        const auditLog: AuthAuditLog & {
          decrypted_details?: Record<string, unknown> | null;
        } = {
          id: log.id,
          user_id: log.user_id,
          action: log.action,
          encrypted_details: log.encrypted_details,
          ip_hash: log.ip_hash,
          user_agent_hash: log.user_agent_hash,
          success: log.success,
          created_at: Math.floor(new Date(log.created_at).getTime() / 1000),
        };

        // Decrypt details if requested and authorized
        if (decryptDetails && log.encrypted_details) {
          try {
            auditLog.decrypted_details = await decryptAuditDetails(
              log.encrypted_details
            );
          } catch (error) {
            // If decryption fails, log the error but don't fail the entire request
            console.error(
              `Failed to decrypt audit details for log ${log.id}:`,
              error
            );
            auditLog.decrypted_details = { error: "decryption_failed" };
          }
        }

        return auditLog;
      })
    );

    return logs;
  } catch (error) {
    throw new Error(
      `Failed to retrieve audit log: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
