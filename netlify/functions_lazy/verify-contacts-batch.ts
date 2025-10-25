/**
 * PKARR Batch Contact Verification Endpoint
 * POST /.netlify/functions/verify-contacts-batch
 *
 * Verifies multiple contacts' identities via PKARR resolution in parallel.
 * Updates pkarr_verified flags for all contacts. The auto_update_verification_level()
 * trigger automatically recalculates verification_level for each contact.
 *
 * Request Body:
 * {
 *   contacts: Array<{
 *     contact_hash: string,    // Privacy-preserving contact identifier
 *     nip05: string,           // NIP-05 identifier (e.g., alice@satnam.pub)
 *     pubkey: string           // Nostr public key (npub or hex)
 *   }>
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   results: Array<{
 *     contact_hash: string,
 *     verified: boolean,
 *     verification_level: string,  // 'unverified' | 'basic' | 'verified' | 'trusted'
 *     error?: string
 *   }>,
 *   total_processed: number,
 *   total_verified: number,
 *   total_failed: number,
 *   response_time_ms: number
 * }
 *
 * Features:
 * - Rate limiting: 10 batch requests/hour per IP
 * - Max 50 contacts per batch request
 * - Parallel verification using Promise.allSettled()
 * - Partial failures don't block successful verifications
 * - Authentication via SecureSessionManager (JWT)
 * - RLS context setup with owner_hash
 * - Privacy-safe error logging (no PII)
 */

import type { Handler } from "@netlify/functions";
import { getRequestClient } from "./supabase.js";
import { allowRequest } from "./utils/rate-limiter.js";

const CORS_ORIGIN = process.env.FRONTEND_URL || "https://www.satnam.pub";
const MAX_BATCH_SIZE = 50;

/**
 * Set RLS context for Supabase queries
 * Tries multiple RPC function names for compatibility
 */
async function setRlsContext(client: any, ownerHash: string): Promise<boolean> {
  let ok = false;
  try {
    await client.rpc("set_app_current_user_hash", { val: ownerHash });
    ok = true;
  } catch (e1) {
    console.error(
      "RLS set_app_current_user_hash failed:",
      e1 instanceof Error ? e1.message : e1
    );
  }
  if (!ok) {
    try {
      await client.rpc("set_app_config", {
        setting_name: "app.current_user_hash",
        setting_value: ownerHash,
        is_local: true,
      });
      ok = true;
    } catch (e2) {
      console.error(
        "RLS set_app_config failed:",
        e2 instanceof Error ? e2.message : e2
      );
    }
  }
  if (!ok) {
    try {
      await client.rpc("app_set_config", {
        setting_name: "app.current_user_hash",
        setting_value: ownerHash,
        is_local: true,
      });
      ok = true;
    } catch (e3) {
      console.error(
        "RLS app_set_config failed:",
        e3 instanceof Error ? e3.message : e3
      );
    }
  }
  return ok;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
    "Content-Security-Policy": "default-src 'none'",
  } as const;
}

function json(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

interface ContactToVerify {
  contact_hash: string;
  nip05: string;
  pubkey: string;
}

interface VerificationResult {
  contact_hash: string;
  verified: boolean;
  verification_level: string;
  error?: string;
}

interface BatchVerifyRequest {
  contacts: ContactToVerify[];
}

interface BatchVerifyResponse {
  success: boolean;
  results: VerificationResult[];
  total_processed: number;
  total_verified: number;
  total_failed: number;
  response_time_ms: number;
  error?: string;
}

/**
 * Verify a single contact via PKARR
 */
async function verifySingleContact(
  client: any,
  ownerHash: string,
  contact: ContactToVerify
): Promise<VerificationResult> {
  try {
    // Find contact by owner_hash + contact_hash
    const { data: contactRecord, error: findErr } = await client
      .from("encrypted_contacts")
      .select("id, pkarr_verified, verification_level")
      .eq("owner_hash", ownerHash)
      .eq("contact_hash", contact.contact_hash)
      .limit(1)
      .maybeSingle();

    if (findErr) {
      return {
        contact_hash: contact.contact_hash,
        verified: false,
        verification_level: "unverified",
        error: "Database error",
      };
    }

    if (!contactRecord) {
      return {
        contact_hash: contact.contact_hash,
        verified: false,
        verification_level: "unverified",
        error: "Contact not found",
      };
    }

    // If already verified, return current status
    if (contactRecord.pkarr_verified) {
      return {
        contact_hash: contact.contact_hash,
        verified: true,
        verification_level: contactRecord.verification_level || "basic",
      };
    }

    // Perform PKARR verification using HybridNIP05Verifier
    const { HybridNIP05Verifier } = await import(
      "../../src/lib/nip05-verification.js"
    );

    const verifier = new HybridNIP05Verifier({
      pkarrTimeout: 5000, // 5 second timeout
      dnsTimeout: 3000,
      kind0Timeout: 3000,
    });

    const verificationResult = await verifier.tryPkarrResolution(
      contact.pubkey,
      contact.nip05
    );

    // Update pkarr_verified flag if verification succeeded
    if (verificationResult.verified) {
      const { data: updatedContact, error: updateErr } = await client
        .from("encrypted_contacts")
        .update({
          pkarr_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contactRecord.id)
        .eq("owner_hash", ownerHash)
        .select("verification_level")
        .single();

      if (updateErr) {
        return {
          contact_hash: contact.contact_hash,
          verified: false,
          verification_level: contactRecord.verification_level || "unverified",
          error: "Failed to update verification status",
        };
      }

      return {
        contact_hash: contact.contact_hash,
        verified: true,
        verification_level: updatedContact.verification_level || "basic",
      };
    } else {
      // Verification failed
      return {
        contact_hash: contact.contact_hash,
        verified: false,
        verification_level: contactRecord.verification_level || "unverified",
        error: verificationResult.error || "PKARR verification failed",
      };
    }
  } catch (error) {
    return {
      contact_hash: contact.contact_hash,
      verified: false,
      verification_level: "unverified",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export const handler: Handler = async (event) => {
  const startTime = Date.now();

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: "",
    };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "Method not allowed" });
  }

  // Rate limiting: 10 batch requests/hour per IP
  const clientIP =
    event.headers["x-forwarded-for"] ||
    event.headers["x-real-ip"] ||
    "unknown";
  if (!allowRequest(String(clientIP), 10, 3600_000)) {
    return json(429, { success: false, error: "Rate limit exceeded" });
  }

  try {
    // Parse request body
    let body: BatchVerifyRequest;
    try {
      body =
        typeof event.body === "string"
          ? JSON.parse(event.body)
          : (event.body as BatchVerifyRequest);
    } catch (e) {
      return json(400, { success: false, error: "Invalid JSON payload" });
    }

    const { contacts } = body;

    // Validate contacts array
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return json(400, {
        success: false,
        error: "contacts must be a non-empty array",
      });
    }

    // Enforce max batch size
    if (contacts.length > MAX_BATCH_SIZE) {
      return json(400, {
        success: false,
        error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} contacts`,
      });
    }

    // Validate each contact has required fields
    for (const contact of contacts) {
      if (!contact.contact_hash || !contact.nip05 || !contact.pubkey) {
        return json(400, {
          success: false,
          error: "Each contact must have contact_hash, nip05, and pubkey",
        });
      }
      if (!contact.nip05.includes("@")) {
        return json(400, {
          success: false,
          error: `Invalid NIP-05 format for ${contact.contact_hash} (must contain @)`,
        });
      }
    }

    // Authenticate user via SecureSessionManager
    const { SecureSessionManager } = await import(
      "./security/session-manager.js"
    );
    const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
    const session = await SecureSessionManager.validateSessionFromHeader(
      String(authHeader)
    );

    if (!session || !session.hashedId) {
      return json(401, { success: false, error: "Unauthorized" });
    }

    // Get Supabase client with RLS context
    const client = await getRequestClient(event);
    const rlsOk = await setRlsContext(client, session.hashedId);
    if (!rlsOk) {
      console.error("RLS context setup failed for verify-contacts-batch", {
        ownerHash: session.hashedId,
      });
      return json(500, {
        success: false,
        error: "RLS context setup failed",
      });
    }

    // Verify all contacts in parallel using Promise.allSettled
    const verificationPromises = contacts.map((contact) =>
      verifySingleContact(client, session.hashedId, contact)
    );

    const settledResults = await Promise.allSettled(verificationPromises);

    // Process results
    const results: VerificationResult[] = settledResults.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        // Promise rejected
        return {
          contact_hash: contacts[index].contact_hash,
          verified: false,
          verification_level: "unverified",
          error: result.reason instanceof Error ? result.reason.message : "Verification failed",
        };
      }
    });

    // Calculate statistics
    const totalProcessed = results.length;
    const totalVerified = results.filter((r) => r.verified).length;
    const totalFailed = results.filter((r) => !r.verified).length;

    return json(200, {
      success: true,
      results,
      total_processed: totalProcessed,
      total_verified: totalVerified,
      total_failed: totalFailed,
      response_time_ms: Date.now() - startTime,
    } as BatchVerifyResponse);
  } catch (error) {
    console.error("verify-contacts-batch error:", error);
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

