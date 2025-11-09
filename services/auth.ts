/**
 * Nostr-Native Authentication Service
 *
 * This service handles sovereign identity authentication using Nostr protocol.
 * Browser-compatible version without Node.js dependencies.
 */

import { db } from "../lib";
import { central_event_publishing_service as CEPS } from "../lib/central_event_publishing_service";
import { authConfig, nip05Config } from "../src/lib/browser-config";
import { asNip05, NostrEvent, User } from "../types/user";
import {
  constantTimeEquals,
  generateRandomHex,
  sha256,
} from "../utils/crypto-factory";

// Note: Client-side authentication functions have been moved to client/auth.ts

// Server-side authentication functions

interface TokenPayload {
  id: string;
  npub: string;
  role: string;
}

/**
 * Browser-compatible JWT signing using Web Crypto API
 */
async function signJWT(payload: TokenPayload, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const encodedSignature = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${data}.${encodedSignature}`;
}

/**
 * Helper: Decode base64url string with proper padding
 * @param base64url - Base64url encoded string
 * @returns Decoded string
 */
function decodeBase64Url(base64url: string): string {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  return atob(base64);
}

/**
 * Browser-compatible JWT verification using Web Crypto API
 */
async function verifyJWT(token: string, secret: string): Promise<TokenPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signature = Uint8Array.from(decodeBase64Url(encodedSignature), (c) =>
    c.charCodeAt(0)
  );
  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(data)
  );

  if (!isValid) {
    throw new Error("Invalid JWT signature");
  }

  return JSON.parse(decodeBase64Url(encodedPayload));
}

/**
 * Create a new Nostr identity
 * @param username Username for the new identity
 * @param recovery_password Optional recovery password
 * @returns User object, encrypted backup, and recovery code
 */
export async function createNostrIdentity(
  username: string,
  recovery_password: string
): Promise<{
  user: User;
  encrypted_backup: string;
  recovery_code: string;
}> {
  // Check if username already exists
  const existingUser = await db.query(
    "SELECT * FROM users WHERE username = $1",
    [username]
  );

  if (existingUser.rows.length > 0) {
    throw new Error("Username already exists");
  }

  // Generate Nostr keypair (Web Crypto for SK, CEPS for derivations)
  const sk = new Uint8Array(32);
  crypto.getRandomValues(sk);
  const privateKey = Array.from(sk)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const publicKey = CEPS.getPublicKeyHex(privateKey);
  const npub = CEPS.encodeNpub(publicKey);

  // Create NIP-05 identifier and lightning address
  const nip05 = `${username}@${nip05Config.domain}`;
  const lightning_address = nip05;

  // Generate recovery code
  const recovery_code = await generateRandomHex(16);

  // Encrypt private key with recovery password using Web Crypto API
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await sha256(recovery_password + recovery_code);
  // Convert hex string to bytes
  const keyBytes = new Uint8Array(
    keyMaterial.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );
  const cipher = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    cipher,
    new TextEncoder().encode(privateKey)
  );
  const encrypted_backup =
    Array.from(iv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("") +
    ":" +
    Array.from(new Uint8Array(encrypted))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  // Insert new user
  const insertResult = (await db.query(
    `INSERT INTO users (
      username,
      npub,
      nip05,
      lightning_address,
      role,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id`,
    [
      username,
      npub,
      nip05,
      lightning_address,
      "user",
      Math.floor(Date.now() / 1000),
    ]
  )) as { rows: Array<{ id: string }> };

  const createdUserId = insertResult.rows[0]?.id;

  // Store recovery code hash (not the code itself)
  const recoveryCodeHash = await sha256(recovery_code);
  await db.query(
    "INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)",
    [createdUserId, recoveryCodeHash]
  );

  const user: User = {
    id: createdUserId,
    username,
    auth_hash: await sha256(npub),
    encrypted_profile: undefined,
    is_discoverable: false,
    user_status: "active",
    onboarding_completed: true,
    invited_by: undefined,
    encryption_hint: undefined,
    relay_url: undefined,
    role: "user",
    familyId: undefined,
    avatar: undefined,
    created_at: Math.floor(Date.now() / 1000),
    last_login: undefined,
    npub,
    nip05: asNip05(nip05)!,
  };

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
  npub: string
): Promise<{ id: string; challenge: string }> {
  // Generate a random challenge
  const challenge = await generateRandomHex(32);
  const id = await generateRandomHex(16);

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
    [id, npub, challenge, expiresAt.toISOString()]
  );

  return { id, challenge };
}

/**
 * Authenticate with Nostr Wallet Connect
 * @param signed_event Signed Nostr event for authentication
 * @returns User object and JWT token
 */
export async function authenticateWithNWC(
  signed_event: NostrEvent
): Promise<{ user: User; token: string }> {
  // Verify the event signature and hash via CEPS
  const isValid = CEPS.verifyEvent(signed_event);
  if (!isValid) {
    throw new Error("Invalid signature or event");
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

  const expectedRes = (await db.query(
    "SELECT challenge, npub, used, expires_at FROM auth_challenges WHERE id = $1",
    [challengeId]
  )) as {
    rows: Array<{
      challenge: string;
      npub: string;
      used: boolean;
      expires_at: string;
    }>;
  };
  const expectedRow = expectedRes.rows[0];

  if (
    expectedRes.rows.length === 0 ||
    !(await constantTimeEquals(expectedRow.challenge, signed_event.content)) ||
    expectedRow.used ||
    new Date(expectedRow.expires_at) < new Date()
  ) {
    throw new Error("Invalid or expired challenge");
  }

  // Mark challenge as used
  await db.query("UPDATE auth_challenges SET used = TRUE WHERE id = $1", [
    challengeId,
  ]);

  // Find or create user
  let userRes = (await db.query(
    "SELECT id, npub, role, username, created_at, nip05 FROM users WHERE npub = $1",
    [expectedRow.npub]
  )) as {
    rows: Array<{
      id: string;
      npub: string;
      role: "user" | "admin";
      username?: string;
      created_at?: number;
      nip05?: string;
    }>;
  };

  if (userRes.rows.length === 0) {
    // Create new user with default values
    const username = `user_${Math.random().toString(36).substr(2, 9)}`;
    const nip05 = `${username}@${nip05Config.domain}`;

    const insertRes = (await db.query(
      `INSERT INTO users (
        username,
        npub,
        nip05,
        lightning_address,
        role,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, npub, role, username, created_at, nip05`,
      [
        username,
        expectedRow.npub,
        nip05,
        nip05,
        "user",
        Math.floor(Date.now() / 1000),
      ]
    )) as {
      rows: Array<{
        id: string;
        npub: string;
        role: "user" | "admin";
        username?: string;
        created_at?: number;
        nip05?: string;
      }>;
    };
    userRes = insertRes;
  }

  const userRow = userRes.rows[0];

  // Generate JWT token
  const token = await signJWT(
    {
      id: userRow.id,
      npub: userRow.npub,
      role: userRow.role,
    },
    authConfig.jwtSecret
  );

  const user: User = {
    id: userRow.id,
    username: userRow.username ?? "user",
    auth_hash: await sha256(userRow.npub),
    encrypted_profile: undefined,
    is_discoverable: false,
    user_status: "active",
    onboarding_completed: true,
    invited_by: undefined,
    encryption_hint: undefined,
    relay_url: undefined,
    role: userRow.role,
    familyId: undefined,
    avatar: undefined,
    created_at: (userRow.created_at as number) ?? Math.floor(Date.now() / 1000),
    last_login: undefined,
    npub: userRow.npub,
    nip05: userRow.nip05 ? asNip05(userRow.nip05) : undefined,
  };

  return {
    user,
    token,
  };
}

/**
 * Generate OTP for user authentication
 * @param npub User's Nostr public key (npub)
 * @returns OTP code
 */
export async function generateOTPForUser(npub: string): Promise<string> {
  // Generate a random OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const id = await generateRandomHex(16);

  // Store the OTP with expiration (10 minutes)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  // Create otp_codes table if it doesn't exist
  await db.query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      npub TEXT NOT NULL,
      otp TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  // Insert the OTP
  await db.query(
    "INSERT INTO otp_codes (id, npub, otp, expires_at) VALUES ($1, $2, $3, $4)",
    [id, npub, otp, expiresAt.toISOString()]
  );

  return otp;
}

/**
 * Authenticate with OTP
 * @param npub User's Nostr public key (npub)
 * @param otp_code OTP code
 * @param session_token Session token
 * @returns User object and JWT token
 */
export async function authenticateWithOTP(
  npub: string,
  otp_code: string,
  session_token: string
): Promise<{ user: User; token: string }> {
  // Verify OTP
  const otpResult = (await db.query(
    "SELECT otp, used, expires_at FROM otp_codes WHERE npub = $1 ORDER BY created_at DESC LIMIT 1",
    [npub]
  )) as { rows: Array<{ otp: string; used: boolean; expires_at: string }> };

  if (
    otpResult.rows.length === 0 ||
    otpResult.rows[0].otp !== otp_code ||
    otpResult.rows[0].used ||
    new Date(otpResult.rows[0].expires_at) < new Date()
  ) {
    throw new Error("Invalid or expired OTP");
  }

  // Mark OTP as used
  await db.query(
    "UPDATE otp_codes SET used = TRUE WHERE npub = $1 AND otp = $2",
    [npub, otp_code]
  );

  // Find or create user
  let userRes = (await db.query(
    "SELECT id, npub, role, username, created_at, nip05 FROM users WHERE npub = $1",
    [npub]
  )) as {
    rows: Array<{
      id: string;
      npub: string;
      role: "user" | "admin";
      username?: string;
      created_at?: number;
      nip05?: string;
    }>;
  };

  if (userRes.rows.length === 0) {
    // Create new user with default values
    const username = `user_${Math.random().toString(36).substr(2, 9)}`;
    const nip05 = `${username}@${nip05Config.domain}`;

    const insertRes = (await db.query(
      `INSERT INTO users (
        username,
        npub,
        nip05,
        lightning_address,
        role,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, npub, role, username, created_at, nip05`,
      [username, npub, nip05, nip05, "user", Math.floor(Date.now() / 1000)]
    )) as {
      rows: Array<{
        id: string;
        npub: string;
        role: "user" | "admin";
        username?: string;
        created_at?: number;
        nip05?: string;
      }>;
    };
    userRes = insertRes;
  }

  const userRow = userRes.rows[0];

  // Generate JWT token
  const token = await signJWT(
    {
      id: userRow.id,
      npub: userRow.npub,
      role: userRow.role,
    },
    authConfig.jwtSecret
  );

  const user: User = {
    id: userRow.id,
    username: userRow.username ?? "user",
    auth_hash: await sha256(userRow.npub),
    encrypted_profile: undefined,
    is_discoverable: false,
    user_status: "active",
    onboarding_completed: true,
    invited_by: undefined,
    encryption_hint: undefined,
    relay_url: undefined,
    role: userRow.role,
    familyId: undefined,
    avatar: undefined,
    created_at: (userRow.created_at as number) ?? Math.floor(Date.now() / 1000),
    last_login: undefined,
    npub: userRow.npub,
    nip05: userRow.nip05 ? asNip05(userRow.nip05) : undefined,
  };

  return {
    user,
    token,
  };
}

/**
 * Generate JWT token
 * @param payload Token payload
 * @returns JWT token
 */
export async function generateToken(payload: TokenPayload): Promise<string> {
  return await signJWT(payload, authConfig.jwtSecret);
}

/**
 * Verify JWT token
 * @param token JWT token
 * @returns Token payload
 */
export async function verifyToken(token: string): Promise<TokenPayload> {
  try {
    return await verifyJWT(token, authConfig.jwtSecret);
  } catch (error) {
    throw new Error("Invalid token");
  }
}
