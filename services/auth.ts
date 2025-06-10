/**
 * Nostr-Native Authentication Service
 *
 * This service handles sovereign identity authentication using Nostr protocol.
 */

import * as jwt from "jsonwebtoken";
import { config } from "../config";
import { db } from "../lib";
// These imports will be used in future implementations
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  pool,
  relays,
  getKeys,
  encodePublicKey,
  encodePrivateKey,
} from "../lib/nostr";
/* eslint-enable @typescript-eslint/no-unused-vars */
import {
  generatePrivateKey,
  getPublicKey,
  nip19,
  verifySignature,
  getEventHash,
} from "nostr-tools";
import { randomBytes, createCipheriv } from "crypto";
// createDecipheriv will be used in future implementations for key recovery
/* eslint-disable @typescript-eslint/no-unused-vars */
import { createDecipheriv } from "crypto";
/* eslint-enable @typescript-eslint/no-unused-vars */
import {
  User,
  NostrEvent,
  // These types will be used in future implementations
  /* eslint-disable @typescript-eslint/no-unused-vars */
  NostrAuthPayload,
  OTPAuthPayload,
  /* eslint-enable @typescript-eslint/no-unused-vars */
} from "../types/user";
import { generateRandomHex, sha256 } from "../utils/crypto";

// Note: Client-side authentication functions have been moved to client/auth.ts

// Server-side authentication functions

interface TokenPayload {
  id: string;
  npub: string;
  role: string;
}

/**
 * Create a new Nostr identity
 * @param username Username for the new identity
 * @param recovery_password Optional recovery password
 * @returns User object, encrypted backup, and recovery code
 */
export async function createNostrIdentity(
  username: string,
  recovery_password: string,
): Promise<{
  user: User;
  encrypted_backup: string;
  recovery_code: string;
}> {
  // Check if username already exists
  const existingUser = await db.query(
    "SELECT * FROM users WHERE username = $1",
    [username],
  );

  if (existingUser.rows.length > 0) {
    throw new Error("Username already exists");
  }

  // Generate Nostr keypair
  const privateKey = generatePrivateKey();
  const publicKey = getPublicKey(privateKey);
  const npub = nip19.npubEncode(publicKey);

  // Create NIP-05 identifier and lightning address
  const nip05 = `${username}@${config.nip05.domain}`;
  const lightning_address = nip05;

  // Generate recovery code
  const recovery_code = generateRandomHex(16);

  // Encrypt private key with recovery password
  const iv = randomBytes(16);
  const key = Buffer.from(
    sha256(recovery_password + recovery_code).slice(0, 32),
    "hex",
  );
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  let encrypted_backup = cipher.update(privateKey, "hex", "hex");
  encrypted_backup += cipher.final("hex");
  encrypted_backup = iv.toString("hex") + ":" + encrypted_backup;

  // Insert new user
  const result = await db.query(
    `INSERT INTO users (
      username, 
      npub, 
      nip05, 
      lightning_address, 
      role, 
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6) 
    RETURNING id, username, npub, nip05, lightning_address, role, created_at`,
    [
      username,
      npub,
      nip05,
      lightning_address,
      "user",
      Math.floor(Date.now() / 1000),
    ],
  );

  const user = result.rows[0];

  // Store recovery code hash (not the code itself)
  await db.query(
    "INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)",
    [user.id, sha256(recovery_code)],
  );

  return {
    user,
    encrypted_backup,
    recovery_code,
  };
}

/**
 * Generate a challenge for Nostr authentication
 * @param npub User's Nostr public key (npub)
 * @returns Challenge ID and challenge string
 */
export async function generateAuthChallenge(
  npub: string,
): Promise<{ id: string; challenge: string }> {
  // Generate a random challenge
  const challenge = generateRandomHex(32);
  const id = generateRandomHex(16);

  // Store the challenge with expiration (5 minutes)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5);

  // Create auth_challenges table if it doesn't exist
  await db.query(`
    CREATE TABLE IF NOT EXISTS auth_challenges (
      id TEXT PRIMARY KEY,
      npub TEXT NOT NULL,
      challenge TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  // Insert the challenge
  await db.query(
    "INSERT INTO auth_challenges (id, npub, challenge, expires_at) VALUES ($1, $2, $3, $4)",
    [id, npub, challenge, expiresAt.toISOString()],
  );

  return { id, challenge };
}

/**
 * Authenticate with Nostr Wallet Connect
 * @param signed_event Signed Nostr event for authentication
 * @returns User object and JWT token
 */
export async function authenticateWithNWC(
  signed_event: NostrEvent,
): Promise<{ user: User; token: string }> {
  // Verify the event signature
  const isValid = verifySignature(signed_event);
  if (!isValid) {
    throw new Error("Invalid signature");
  }

  // Verify event hash
  const computedHash = getEventHash(signed_event);
  if (computedHash !== signed_event.id) {
    throw new Error("Invalid event hash");
  }

  // Check if event is recent (within last 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (now - signed_event.created_at > 300) {
    throw new Error("Event too old");
  }

  // Ensure event.content equals the expected one-time challenge
  const challengeId = signed_event.tags.find((t) => t[0] === "challenge")?.[1];
  if (!challengeId) {
    throw new Error("Missing challenge tag");
  }

  const expected = await db.query(
    "SELECT challenge, npub, used, expires_at FROM auth_challenges WHERE id = $1",
    [challengeId],
  );

  if (
    expected.rows.length === 0 ||
    expected.rows[0].challenge !== signed_event.content ||
    expected.rows[0].used ||
    new Date(expected.rows[0].expires_at) < new Date()
  ) {
    throw new Error("Invalid or expired challenge");
  }

  // Mark challenge as used to prevent replay attacks
  await db.query("UPDATE auth_challenges SET used = TRUE WHERE id = $1", [
    challengeId,
  ]);

  // Get the npub from the pubkey
  const npub = nip19.npubEncode(signed_event.pubkey);

  // Verify that the npub matches the one associated with the challenge
  if (expected.rows[0].npub !== npub) {
    throw new Error("Challenge was not issued for this public key");
  }

  // Find user by npub
  const result = await db.query("SELECT * FROM users WHERE npub = $1", [npub]);

  // If user doesn't exist, create a new one with a generated username
  let user: User;
  if (result.rows.length === 0) {
    // Generate a username based on npub
    const username = `user_${signed_event.pubkey.substring(0, 8)}`;

    // Create NIP-05 identifier and lightning address
    const nip05 = `${username}@${config.nip05.domain}`;
    const lightning_address = nip05;

    // Insert new user
    const newUserResult = await db.query(
      `INSERT INTO users (
        username, 
        npub, 
        nip05, 
        lightning_address, 
        role, 
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING id, username, npub, nip05, lightning_address, role, created_at`,
      [
        username,
        npub,
        nip05,
        lightning_address,
        "user",
        Math.floor(Date.now() / 1000),
      ],
    );

    user = newUserResult.rows[0];
  } else {
    user = result.rows[0];

    // Update last login time
    await db.query("UPDATE users SET last_login = $1 WHERE id = $2", [
      Math.floor(Date.now() / 1000),
      user.id,
    ]);
  }

  // Generate JWT token
  const token = generateToken({
    id: user.id,
    npub: user.npub,
    role: user.role,
  });

  return { user, token };
}

/**
 * Generate a one-time password for a user
 * @param npub User's Nostr public key
 * @returns Session token for OTP verification
 */
export async function generateOTPForUser(npub: string): Promise<string> {
  // Find user by npub
  const result = await db.query("SELECT id FROM users WHERE npub = $1", [npub]);

  if (result.rows.length === 0) {
    throw new Error("User not found");
  }

  const userId = result.rows[0].id;

  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Generate a session token
  const sessionToken = generateRandomHex(32);

  // Store OTP with expiration (10 minutes)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  await db.query(
    "INSERT INTO otp_codes (user_id, otp_hash, session_token, expires_at) VALUES ($1, $2, $3, $4)",
    [userId, sha256(otp), sessionToken, expiresAt],
  );

  /*
   * OTP delivery mechanism
   * In production, this would send the OTP via a secure Nostr DM
   * using the user's public key for encryption
   */

  return sessionToken;
}

/**
 * Authenticate with a one-time password
 * @param npub User's Nostr public key
 * @param otp_code The OTP code
 * @param session_token The session token from generateOTPForUser
 * @returns User object and JWT token
 */
export async function authenticateWithOTP(
  npub: string,
  otp_code: string,
  session_token: string,
): Promise<{ user: User; token: string }> {
  // Find user by npub
  const userResult = await db.query("SELECT * FROM users WHERE npub = $1", [
    npub,
  ]);

  if (userResult.rows.length === 0) {
    throw new Error("User not found");
  }

  const user = userResult.rows[0];

  // Find OTP record
  const otpResult = await db.query(
    "SELECT * FROM otp_codes WHERE user_id = $1 AND session_token = $2 AND expires_at > NOW()",
    [user.id, session_token],
  );

  if (otpResult.rows.length === 0) {
    throw new Error("Invalid or expired session");
  }

  const otpRecord = otpResult.rows[0];

  // Verify OTP
  if (sha256(otp_code) !== otpRecord.otp_hash) {
    // Increment failed attempts
    await db.query(
      "UPDATE otp_codes SET failed_attempts = failed_attempts + 1 WHERE id = $1",
      [otpRecord.id],
    );

    // If too many failed attempts, invalidate the OTP
    if (otpRecord.failed_attempts >= 3) {
      await db.query("UPDATE otp_codes SET expires_at = NOW() WHERE id = $1", [
        otpRecord.id,
      ]);
    }

    throw new Error("Invalid OTP code");
  }

  // OTP is valid, invalidate it to prevent reuse
  await db.query("UPDATE otp_codes SET expires_at = NOW() WHERE id = $1", [
    otpRecord.id,
  ]);

  // Update last login time
  await db.query("UPDATE users SET last_login = $1 WHERE id = $2", [
    Math.floor(Date.now() / 1000),
    user.id,
  ]);

  // Generate JWT token
  const token = generateToken({
    id: user.id,
    npub: user.npub,
    role: user.role,
  });

  return { user, token };
}

/**
 * Generate a JWT token
 */
export function generateToken(payload: TokenPayload): string {
  // Convert the secret to a Buffer which is one of the accepted types
  const secretBuffer = Buffer.from(config.auth.jwtSecret, "utf8");

  // Define options with the correct type
  const options: jwt.SignOptions = {
    expiresIn: config.auth.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  };

  return jwt.sign(payload, secretBuffer, options);
}

/**
 * Verify a JWT token
 */
export function verifyToken(token: string): TokenPayload {
  try {
    // Convert the secret to a Buffer which is one of the accepted types
    const secretBuffer = Buffer.from(config.auth.jwtSecret, "utf8");

    return jwt.verify(token, secretBuffer) as TokenPayload;
  } catch {
    throw new Error("Invalid token");
  }
}
