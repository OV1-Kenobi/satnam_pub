/**
 * Onboarding Lightning Setup Function
 *
 * Provisions Lightning wallet for physical peer onboarding participants.
 *
 * Features:
 * - Auto-provision LNbits wallet with Lightning Address
 * - Connect external wallet via NWC
 * - Scrub forwarding configuration
 * - NWC connection string encryption
 * - Database persistence to lightning_links table
 *
 * Security:
 * - JWT authentication with Supabase
 * - NWC connection strings encrypted with AES-256-GCM
 * - Lightning Address validation
 * - Authorization checks (coordinator owns session)
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import {
  randomUUID,
  createCipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

// ============================================================================
// Environment Variables
// ============================================================================

function getEnvVar(key: string): string | undefined {
  return process.env[key];
}

const supabaseUrl = getEnvVar("SUPABASE_URL");
const supabaseKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");
const lnbitsBaseUrl = getEnvVar("LNBITS_BASE_URL");
const lnbitsAdminKey =
  getEnvVar("LNBITS_ADMIN_KEY") || getEnvVar("LNBITS_BOOTSTRAP_ADMIN_KEY");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing required Supabase environment variables");
}

if (!lnbitsBaseUrl || !lnbitsAdminKey) {
  throw new Error("Missing required LNbits environment variables");
}

// ============================================================================
// CORS Headers
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================================================
// Encryption Utilities
// ============================================================================

// Get encryption key from Supabase Vault
let ENC_KEY_CACHE: Buffer | null = null;

async function getEncKeyBuf(supabase: any): Promise<Buffer> {
  if (ENC_KEY_CACHE) return ENC_KEY_CACHE;

  const { data, error } = await supabase
    .from("vault.decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", "lnbits_key_enc_secret")
    .single();

  if (error || !data?.decrypted_secret) {
    throw new Error("LNBITS_KEY_ENC_SECRET not found in Supabase Vault");
  }

  ENC_KEY_CACHE = createHash("sha256")
    .update(String(data.decrypted_secret))
    .digest();

  return ENC_KEY_CACHE;
}

// Encrypt string using AES-256-GCM
async function encryptB64(plain: string, supabase: any): Promise<string> {
  const key = await getEncKeyBuf(supabase);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

// ============================================================================
// LNbits API Utilities
// ============================================================================

async function lnbitsFetch(path: string, apiKey: string, init?: RequestInit) {
  if (!lnbitsBaseUrl) {
    throw new Error("LNBITS_BASE_URL is not configured");
  }
  const res = await fetch(`${lnbitsBaseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  let jsonBody: any;

  try {
    jsonBody = text ? JSON.parse(text) : {};
  } catch {
    jsonBody = { raw: text };
  }

  if (!res.ok) {
    const msg =
      jsonBody?.detail || jsonBody?.message || `LNbits error ${res.status}`;
    throw new Error(msg);
  }

  return jsonBody;
}

// ============================================================================
// Validation
// ============================================================================

function validateLightningAddress(address: string): boolean {
  const laRegex = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  return laRegex.test(address);
}

function validateNWCConnectionString(nwc: string): boolean {
  try {
    const url = new URL(nwc);
    if (url.protocol !== "nostr+walletconnect:") return false;
    // Pubkey is 64 hex chars
    if (!/^[a-f0-9]{64}$/i.test(url.pathname.replace(/^\/\//, "")))
      return false;
    // Must have at least one relay and a secret
    if (!url.searchParams.get("relay")?.startsWith("wss://")) return false;
    if (!/^[a-f0-9]{64}$/i.test(url.searchParams.get("secret") || ""))
      return false;
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Request Body Interface
// ============================================================================

interface LightningSetupRequest {
  participantId: string;
  setupMode: "auto" | "external";
  lightningAddress?: string;
  nwcConnectionString?: string;
  externalLightningAddress?: string;
  scrubEnabled?: boolean;
  scrubPercent?: number;
}

// ============================================================================
// Handler
// ============================================================================

export const handler: Handler = async (
  event: HandlerEvent,
  _context: HandlerContext,
) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // ============================================================================
    // Authentication
    // ============================================================================

    const authHeader = event.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Missing or invalid authorization header",
        }),
      };
    }

    const token = authHeader.substring(7);

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Invalid authentication token" }),
      };
    }

    // ============================================================================
    // Parse and Validate Request
    // ============================================================================

    let body: LightningSetupRequest;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
    }

    if (!body.participantId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing participantId" }),
      };
    }

    if (!body.setupMode || !["auto", "external"].includes(body.setupMode)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Invalid setupMode. Must be 'auto' or 'external'",
        }),
      };
    }

    // Validate mode-specific requirements
    if (body.setupMode === "auto" && !body.lightningAddress) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Missing lightningAddress for auto mode",
        }),
      };
    }

    if (body.setupMode === "external" && !body.nwcConnectionString) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Missing nwcConnectionString for external mode",
        }),
      };
    }

    // Validate Lightning Address format
    if (
      body.lightningAddress &&
      !validateLightningAddress(body.lightningAddress)
    ) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Invalid Lightning Address format" }),
      };
    }

    // Validate NWC connection string format
    if (
      body.nwcConnectionString &&
      !validateNWCConnectionString(body.nwcConnectionString)
    ) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Invalid NWC connection string format" }),
      };
    }

    // Validate external Lightning Address if Scrub forwarding is enabled
    if (
      body.scrubEnabled &&
      body.externalLightningAddress &&
      !validateLightningAddress(body.externalLightningAddress)
    ) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Invalid external Lightning Address format",
        }),
      };
    }

    // ============================================================================
    // Authorization: Verify participant exists and belongs to user's session
    // ============================================================================

    const { data: participant, error: participantError } = await supabase
      .from("onboarded_identities")
      .select("participant_id, session_id, user_id, display_name, nip05")
      .eq("participant_id", body.participantId)
      .single();

    if (participantError || !participant) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Participant not found" }),
      };
    }

    // Verify session ownership (coordinator must own the session)
    const { data: session, error: sessionError } = await supabase
      .from("onboarding_sessions")
      .select("session_id, coordinator_id")
      .eq("session_id", participant.session_id)
      .single();

    if (sessionError || !session) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Session not found" }),
      };
    }

    if (session.coordinator_id !== user.id) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Unauthorized: You do not own this session",
        }),
      };
    }

    // ============================================================================
    // Auto-Provision LNbits Wallet
    // ============================================================================

    let walletId: string | undefined;
    let adminKeyEncrypted: string | undefined;
    let lightningAddress: string | undefined;
    let nwcConnectionStringEncrypted: string | undefined;

    if (body.setupMode === "auto") {
      // Extract username from Lightning Address
      const username = body.lightningAddress!.split("@")[0];

      // Create LNbits user + wallet via User Manager
      const lnUser = await lnbitsFetch(
        "/usermanager/api/v1/users",
        lnbitsAdminKey,
        {
          method: "POST",
          body: JSON.stringify({
            username: `onboarding_${username}_${Date.now()}`,
            password: randomUUID(),
          }),
        },
      );

      const userId = lnUser?.id || lnUser?.data?.id;

      const lnWallet = await lnbitsFetch(
        "/usermanager/api/v1/wallets",
        lnbitsAdminKey,
        {
          method: "POST",
          body: JSON.stringify({
            user_id: userId,
            wallet_name: `${username} Onboarding Wallet`,
          }),
        },
      );

      // Extract wallet data
      const rawWalletId =
        lnWallet?.id ||
        lnWallet?.wallet_id ||
        lnWallet?.data?.id ||
        lnWallet?.data?.wallet_id;
      walletId = rawWalletId ? String(rawWalletId) : undefined;

      const adminKey: string | undefined =
        lnWallet?.adminkey ||
        lnWallet?.admin_key ||
        lnWallet?.data?.adminkey ||
        lnWallet?.data?.admin_key;

      if (!walletId || !adminKey) {
        return {
          statusCode: 502,
          headers: corsHeaders,
          body: JSON.stringify({ error: "LNbits did not return wallet keys" }),
        };
      }

      // Encrypt admin key
      adminKeyEncrypted = await encryptB64(adminKey, supabase);

      lightningAddress = body.lightningAddress;

      // Configure Scrub forwarding if enabled
      if (body.scrubEnabled && body.externalLightningAddress) {
        try {
          await lnbitsFetch("/scrub/api/v1/forward", adminKey, {
            method: "POST",
            body: JSON.stringify({
              wallet_id: walletId,
              percent: body.scrubPercent || 100,
              address: body.externalLightningAddress,
            }),
          });
        } catch (scrubError) {
          console.warn("Scrub configuration failed (non-fatal):", scrubError);
        }
      }
    }

    // ============================================================================
    // External Wallet Connection (NWC)
    // ============================================================================

    if (body.setupMode === "external") {
      // Encrypt NWC connection string
      nwcConnectionStringEncrypted = await encryptB64(
        body.nwcConnectionString!,
        supabase,
      );

      // Note: For external wallets, we don't provision an LNbits wallet
      // The user's external wallet is accessed via NWC
    }

    // ============================================================================
    // Database Persistence
    // ============================================================================

    const linkData: any = {
      participant_id: body.participantId,
      user_id: participant.user_id || user.id,
      lightning_address: lightningAddress || null,
      external_lightning_address: body.scrubEnabled
        ? body.externalLightningAddress
        : null,
      lnbits_wallet_id: walletId || null,
      lnbits_admin_key_encrypted: adminKeyEncrypted || null,
      nwc_connection_string_encrypted: nwcConnectionStringEncrypted || null,
      nwc_permissions:
        body.setupMode === "external"
          ? ["get_balance", "make_invoice", "pay_invoice"]
          : null,
    };

    const { data: link, error: insertError } = await supabase
      .from("lightning_links")
      .insert(linkData)
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert lightning_links:", insertError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Failed to save Lightning wallet configuration",
        }),
      };
    }

    // ============================================================================
    // Success Response
    // ============================================================================

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        linkId: link.link_id,
        lightningAddress: lightningAddress || null,
        walletId: walletId || null,
        setupMode: body.setupMode,
        scrubEnabled: body.scrubEnabled || false,
      }),
    };
  } catch (error) {
    console.error("Lightning setup error:", error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
    };
  }
};
