import NDK from "@nostr-dev-kit/ndk";
import { Request, Response } from "express";
import { nip19 } from "nostr-tools";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { generateSecureToken } from "../../utils/crypto-factory";
import { createLogger } from "../../utils/logger";
import { validateNWCUri } from "../../utils/nwc-validation";

// Create logger instance for this module
const logger = createLogger("nwc-signin");

/**
 * Sanitize npub for logging by truncating to prevent information leakage
 * @deprecated Use structured logger instead - it handles sanitization automatically
 */
function sanitizeNpubForLogging(npub: string): string {
  return npub.substring(0, 8) + "...";
}

/**
 * Sanitize relay URL for logging by extracting only the hostname
 * @deprecated Use structured logger instead - it handles sanitization automatically
 */
function sanitizeRelayForLogging(relayUrl: string): string {
  try {
    return new URL(relayUrl).hostname;
  } catch {
    // If URL parsing fails, return a generic placeholder
    return "invalid-url";
  }
}

/**
 * Sanitize pubkey for logging by truncating to prevent information leakage
 * @deprecated Use structured logger instead - it handles sanitization automatically
 */
function sanitizePubkeyForLogging(pubkey: string): string {
  return pubkey.substring(0, 8) + "...";
}

/**
 * NWC Authentication Endpoint
 * POST /api/auth/nwc-signin
 */
export async function nwcSignIn(req: Request, res: Response): Promise<void> {
  try {
    const requestSchema = z.object({
      nwcUrl: z.string().min(1, "NWC URL is required"),
      npub: z.string().optional(),
    });

    const validationResult = requestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Invalid request data",
        details: validationResult.error.errors,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { nwcUrl, npub } = validationResult.data;

    // Validate NWC URI format
    const nwcValidation = validateNWCUri(nwcUrl);
    if (!nwcValidation.isValid || !nwcValidation.data) {
      res.status(400).json({
        success: false,
        error: `Invalid NWC URI: ${nwcValidation.error}`,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { pubkey: nwcPubkey, relay } = nwcValidation.data;

    // Verify NWC connection by attempting to connect
    let verifiedNpub: string;
    let nip05Address: string | null = null;

    try {
      // Initialize NDK with the relay
      const ndk = new NDK({
        explicitRelayUrls: [relay],
      });

      await ndk.connect();

      // If npub is provided, verify it matches the NWC pubkey
      if (npub) {
        const { type } = nip19.decode(npub);
        if (type !== "npub") {
          throw new Error("Invalid npub format");
        }

        // Convert hex pubkey to npub for comparison
        const nwcNpub = nip19.npubEncode(nwcPubkey);
        if (npub !== nwcNpub) {
          throw new Error("Provided npub does not match NWC pubkey");
        }
        verifiedNpub = npub;
      } else {
        // Convert NWC pubkey to npub
        verifiedNpub = nip19.npubEncode(nwcPubkey);
      }

      // Try to fetch user profile to get NIP-05
      const userFilter = { kinds: [0], authors: [nwcPubkey] };
      const profileEvent = await ndk.fetchEvent(userFilter);

      if (profileEvent) {
        try {
          const profileContent = JSON.parse(profileEvent.content);
          nip05Address = profileContent.nip05 || null;
        } catch (e) {
          logger.warn("Failed to parse profile content", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // Log successful NWC connection attempt
      await supabase.rpc("log_nwc_connection_attempt", {
        p_npub: sanitizeNpubForLogging(verifiedNpub), // Truncate for privacy
        p_nwc_pubkey: sanitizePubkeyForLogging(nwcPubkey), // Truncate for privacy
        p_relay_url: sanitizeRelayForLogging(relay), // Only log hostname
        p_success: true,
        p_ip_address: req.ip || null,
        p_user_agent: req.get("User-Agent") || null,
      });
    } catch (error) {
      logger.error(
        "NWC connection verification failed",
        {
          error: error instanceof Error ? error.message : String(error),
          npub: npub || nip19.npubEncode(nwcPubkey),
          relay,
          nwcPubkey,
        },
        error instanceof Error ? error : undefined
      );

      // Log failed NWC connection attempt
      await supabase.rpc("log_nwc_connection_attempt", {
        p_npub: sanitizeNpubForLogging(npub || nip19.npubEncode(nwcPubkey)), // Truncate for privacy
        p_nwc_pubkey: sanitizePubkeyForLogging(nwcPubkey), // Truncate for privacy
        p_relay_url: sanitizeRelayForLogging(relay), // Only log hostname
        p_success: false,
        p_error_message: error instanceof Error ? error.message : String(error),
        p_ip_address: req.ip || null,
        p_user_agent: req.get("User-Agent") || null,
      });

      res.status(401).json({
        success: false,
        error: "Failed to verify NWC connection",
        details: error instanceof Error ? error.message : String(error),
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // If no NIP-05 found, we can't proceed with federation whitelist check
    if (!nip05Address) {
      res.status(400).json({
        success: false,
        error:
          "No NIP-05 address found in user profile. NIP-05 is required for Family Federation access.",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check federation whitelist
    const { data: whitelistResult, error: whitelistError } = await supabase.rpc(
      "check_federation_whitelist",
      {
        p_nip05_address: nip05Address,
      }
    );

    if (whitelistError) {
      logger.error("Whitelist check error", {
        error: whitelistError.message || String(whitelistError),
        nip05Address,
      });
      res.status(500).json({
        success: false,
        error: "Failed to verify federation whitelist status",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const whitelistEntry = whitelistResult?.[0];
    const isWhitelisted = whitelistEntry?.is_whitelisted || false;

    if (!isWhitelisted) {
      res.status(403).json({
        success: false,
        error:
          "Access denied: NIP-05 not authorized for Family Federation access",
        whitelisted: false,
        nip05: nip05Address,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Generate session token
    const sessionToken = await generateSecureToken(64);

    // Create authentication session
    const { error: sessionError } = await supabase.rpc("create_auth_session", {
      p_npub: verifiedNpub,
      p_nip05_address: nip05Address,
      p_session_token: sessionToken,
      p_auth_method: "nwc",
      p_federation_role: whitelistEntry.family_role,
      p_is_whitelisted: true,
      p_nwc_pubkey: nwcPubkey,
      p_nwc_relay: relay,
    });

    if (sessionError) {
      logger.error("Session creation error", {
        error: sessionError.message || String(sessionError),
        npub: verifiedNpub,
        nip05Address,
        sessionToken: sessionToken.substring(0, 8) + "...", // Truncate for privacy
      });
      res.status(500).json({
        success: false,
        error: "Failed to create authentication session",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        authenticated: true,
        sessionToken,
        userAuth: {
          npub: verifiedNpub,
          nip05: nip05Address,
          federationRole: whitelistEntry.family_role,
          authMethod: "nwc",
          isWhitelisted: true,
          votingPower: whitelistEntry.voting_power,
          guardianApproved: whitelistEntry.guardian_approved,
        },
        message: "NWC authentication successful",
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(
      "NWC authentication error",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      error instanceof Error ? error : undefined
    );
    res.status(500).json({
      success: false,
      error: "Internal server error during NWC authentication",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Verify NWC Connection (without full authentication)
 * POST /api/auth/nwc-verify
 */
export async function verifyNWCConnection(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const requestSchema = z.object({
      nwcUrl: z.string().min(1, "NWC URL is required"),
    });

    const validationResult = requestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Invalid request data",
        details: validationResult.error.errors,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { nwcUrl } = validationResult.data;

    // Validate NWC URI format
    const nwcValidation = validateNWCUri(nwcUrl);
    if (!nwcValidation.isValid || !nwcValidation.data) {
      res.status(400).json({
        success: false,
        error: `Invalid NWC URI: ${nwcValidation.error}`,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { pubkey: nwcPubkey, relay } = nwcValidation.data;

    try {
      // Initialize NDK with the relay
      const ndk = new NDK({
        explicitRelayUrls: [relay],
      });

      await ndk.connect();

      // Convert NWC pubkey to npub
      const npub = nip19.npubEncode(nwcPubkey);

      res.status(200).json({
        success: true,
        data: {
          valid: true,
          npub,
          nwcPubkey,
          relay,
          message: "NWC connection verified successfully",
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error(
        "NWC connection verification failed",
        {
          error: error instanceof Error ? error.message : String(error),
          relay,
          nwcPubkey,
        },
        error instanceof Error ? error : undefined
      );
      res.status(400).json({
        success: false,
        error: "Failed to verify NWC connection",
        details: error instanceof Error ? error.message : String(error),
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    logger.error(
      "NWC verification error",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      error instanceof Error ? error : undefined
    );
    res.status(500).json({
      success: false,
      error: "Internal server error during NWC verification",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}
