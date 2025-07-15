import { z } from "zod";
import { vault } from "../../lib/vault.js";
import {
    SecureSessionManager,
} from "../../netlify/functions/security/session-manager.js";
import { supabase } from "../../netlify/functions/supabase.js";

function getEnvVar(key) {
  return process.env[key];
}

async function getApiBaseUrl() {
  try {
    const vaultUrl = await vault.getCredentials("api_base_url");
    if (vaultUrl) {
      return vaultUrl;
    }
  } catch (error) {
    // Vault not available, fall back to environment variables
  }

  const envUrl = getEnvVar("API_BASE_URL") || getEnvVar("VITE_API_BASE_URL");
  if (envUrl) {
    return envUrl;
  }

  return "https://api.satnam.pub";
}

/**
 * @typedef {Object} WhitelistEntry
 * @property {string} nip05_address
 * @property {"private"|"offspring"|"adult"|"steward"|"guardian"} family_role
 * @property {number} voting_power
 * @property {string[]} emergency_contacts
 * @property {string|null} expires_at
 * @property {boolean} guardian_approved
 * @property {boolean} is_active
 * @property {string} created_at
 * @property {string|null} last_activity
 */

/**
 * @typedef {Object} WhitelistCheckResult
 * @property {boolean} is_whitelisted
 * @property {"private"|"offspring"|"adult"|"steward"|"guardian"} family_role
 * @property {boolean} guardian_approved
 * @property {number} voting_power
 * @property {string} federation_id
 */

/**
 * Check Federation Whitelist Status
 * POST /api/auth/federation-whitelist
 */
export async function checkFederationWhitelist(req, res) {
  try {
    const requestSchema = z.object({
      nip05: z.string().email("Invalid NIP-05 format"),
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

    const { nip05 } = validationResult.data;

    const { data: whitelistResult, error: whitelistError } = await supabase.rpc(
      "check_federation_whitelist",
      {
        p_nip05_address: nip05,
      }
    );

    if (whitelistError) {
      res.status(500).json({
        success: false,
        error: "Failed to check whitelist status",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const whitelistEntry = whitelistResult?.[0];

    if (!whitelistEntry?.is_whitelisted) {
      res.status(403).json({
        success: false,
        error: "NIP-05 not whitelisted for Family Federation access",
        whitelisted: false,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        whitelisted: true,
        federationRole: whitelistEntry.family_role,
        guardianApproved: whitelistEntry.guardian_approved,
        votingPower: whitelistEntry.voting_power,
        federationId: whitelistEntry.federation_id,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Internal server error during whitelist verification",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Get Federation Whitelist (for guardians)
 * GET /api/auth/federation-whitelist
 */
export async function getFederationWhitelist(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const sessionData = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (!sessionData?.isAuthenticated || !sessionData.sessionToken) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    if (sessionData.federationRole !== "guardian") {
      res.status(403).json({
        success: false,
        error: "Guardian privileges required",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data: whitelistEntries, error } = await supabase
      .from("family_federation_whitelist")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({
        success: false,
        error: "Failed to fetch federation whitelist",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        whitelist: whitelistEntries,
        totalEntries: whitelistEntries?.length || 0,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Internal server error",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Add to Federation Whitelist (for guardians)
 * POST /api/auth/federation-whitelist/add
 */
export async function addToFederationWhitelist(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const sessionData = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (!sessionData?.isAuthenticated || !sessionData.sessionToken) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    if (sessionData.federationRole !== "guardian") {
      res.status(403).json({
        success: false,
        error: "Guardian privileges required",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    const requestSchema = z.object({
      nip05: z.string().email("Invalid NIP-05 format"),
      familyRole: z.enum(["private", "offspring", "adult", "steward", "guardian"]),
      votingPower: z.number().int().min(0).max(5).default(1),
      emergencyContacts: z.array(z.string()).default([]),
      expiresAt: z.string().datetime().optional(),
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

    const { nip05, familyRole, votingPower, emergencyContacts, expiresAt } =
      validationResult.data;

    const { data: newEntry, error } = await supabase
      .from("family_federation_whitelist")
      .insert({
        nip05_address: nip05,
        family_role: familyRole,
        voting_power: votingPower,
        emergency_contacts: emergencyContacts,
        expires_at: expiresAt || null,
        guardian_approved: familyRole === "guardian" ? false : true,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        res.status(409).json({
          success: false,
          error: "NIP-05 already exists in whitelist",
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to add to federation whitelist",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        entry: newEntry,
        message: "Successfully added to federation whitelist",
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Internal server error",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Remove from Federation Whitelist (for guardians)
 * DELETE /api/auth/federation-whitelist/:nip05
 */
export async function removeFromFederationWhitelist(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const sessionData = await SecureSessionManager.validateSessionFromHeader(authHeader);

    if (!sessionData?.isAuthenticated || !sessionData.sessionToken) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    if (sessionData.federationRole !== "guardian") {
      res.status(403).json({
        success: false,
        error: "Guardian privileges required",
        meta: { timestamp: new Date().toISOString() },
      });
      return;
    }

    const { nip05 } = req.params;

    if (!nip05) {
      res.status(400).json({
        success: false,
        error: "NIP-05 parameter is required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { data: updatedEntry, error } = await supabase
      .from("family_federation_whitelist")
      .update({
        is_active: false,
        last_activity: new Date().toISOString(),
      })
      .eq("nip05_address", decodeURIComponent(nip05))
      .select()
      .single();

    if (error) {
      res.status(500).json({
        success: false,
        error: "Failed to remove from federation whitelist",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    if (!updatedEntry) {
      res.status(404).json({
        success: false,
        error: "NIP-05 not found in whitelist",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        message: "Successfully removed from federation whitelist",
        entry: updatedEntry,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Internal server error",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}
