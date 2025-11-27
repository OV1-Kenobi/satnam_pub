/**
 * Recalculate Trust Scores (secured, owner-scoped)
 * POST /api/communications/recalculate-trust
 * Computes a simple v1 trust score and stores it in contact_trust_metrics.trust_score_encrypted
 *
 * Phase 3 additions:
 * - Accepts optional actionType, weight, and metadata for geo-room contact events
 * - Supports geo_contact_added and contact_verified_via_physical_mfa action types
 * - Applies GEOCHAT_TRUST_WEIGHT (1.5x) and GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT (3.0x) multipliers
 */

import { allowRequest } from "../../netlify/functions/utils/rate-limiter.js";

let supabaseMod;
let SecureSessionManager;

// Phase 3: Trust weight multipliers (matching env.client.ts defaults)
const GEOCHAT_TRUST_WEIGHT = parseFloat(process.env.VITE_GEOCHAT_TRUST_WEIGHT ?? "1.5");
const GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT = parseFloat(process.env.VITE_GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT ?? "3.0");

// Phase 3: Base weights for geo-room actions
const GEO_ACTION_WEIGHTS = {
  geo_contact_added: 3,  // matches ACTION_WEIGHTS in action-reputation.ts
  contact_verified_via_physical_mfa: 15,  // matches ACTION_WEIGHTS
};

async function getSupabase() {
  if (!supabaseMod) supabaseMod = await import("../../netlify/functions/supabase.js");
  return supabaseMod.supabase;
}

async function setRlsContext(client, ownerHash) {
  try { await client.rpc("set_app_current_user_hash", { val: ownerHash }); }
  catch { try { await client.rpc("set_app_config", { setting_name: "app.current_user_hash", setting_value: ownerHash, is_local: true }); } catch { try { await client.rpc("app_set_config", { setting_name: "app.current_user_hash", setting_value: ownerHash, is_local: true }); } catch {} } }
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

/**
 * Phase 3: Handle geo-room action-based trust updates
 * Records actions and updates contact verification status for Physical MFA
 */
async function handleGeoAction(supabase, ownerHash, { actionType, contactId, npub, weight, metadata }) {
  try {
    // Determine weight with appropriate multiplier
    let baseWeight = GEO_ACTION_WEIGHTS[actionType] || 0;
    let multiplier = 1.0;

    if (actionType === "geo_contact_added") {
      multiplier = GEOCHAT_TRUST_WEIGHT;
    } else if (actionType === "contact_verified_via_physical_mfa") {
      multiplier = GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT;
    }

    // Use provided weight or calculate from base
    const finalWeight = typeof weight === "number" ? weight : Math.round(baseWeight * multiplier);

    // Log reputation action if we have a valid action type
    if (baseWeight > 0) {
      await supabase.from("reputation_actions").insert({
        user_id: ownerHash,
        action_type: actionType,
        weight: finalWeight,
        category: "social",
        metadata: metadata || {},
        recorded_at: new Date().toISOString(),
      }).catch(err => {
        // Non-critical: log but don't fail
        console.warn("[recalculate-trust] Failed to record reputation action:", err?.message);
      });
    }

    // Phase 3: Update contact verification status for Physical MFA
    if (actionType === "contact_verified_via_physical_mfa" && (contactId || npub)) {
      // Find contact by id or npub
      let targetContactId = contactId;

      if (!targetContactId && npub) {
        // Look up contact by npub (stored in encrypted_contacts)
        const { data: contact } = await supabase
          .from("encrypted_contacts")
          .select("id")
          .eq("owner_hash", ownerHash)
          .eq("nostr_npub", npub)
          .single();
        targetContactId = contact?.id;
      }

      if (targetContactId) {
        // Upsert verification status
        await supabase.from("contact_verification_status").upsert({
          contact_id: targetContactId,
          owner_hash: ownerHash,
          physical_mfa_verified: true,
          physical_mfa_verified_at: new Date().toISOString(),
        }, { onConflict: "contact_id,owner_hash" }).catch(err => {
          console.warn("[recalculate-trust] Failed to update verification status:", err?.message);
        });
      }
    }

    return { success: true };
  } catch (err) {
    console.error("[recalculate-trust] handleGeoAction error:", err?.message);
    return { error: err?.message || "Failed to process geo action", status: 500 };
  }
}

export default async function recalcTrust(req, res) {
  const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  if (!allowRequest(String(clientIP), 15, 60_000)) { res.status(429).json({ success: false, error: "Rate limit exceeded" }); return; }
  if (req.method !== "POST") { res.status(405).json({ success: false, error: "Method not allowed" }); return; }

  const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
  if (!SecureSessionManager) { const sec = await import("../../netlify/functions_active/security/session-manager.js"); SecureSessionManager = sec.SecureSessionManager; }
  const session = await SecureSessionManager.validateSessionFromHeader(String(authHeader));
  if (!session || !session.hashedId) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }

  const supabase = await getSupabase();
  await setRlsContext(supabase, session.hashedId);

  // Phase 3: Extract optional action parameters from request body
  const body = req.body || {};
  const { actionType, contactId, npub, weight: providedWeight, metadata } = body;

  // Phase 3: Handle targeted action-based trust update
  if (actionType && (contactId || npub)) {
    const result = await handleGeoAction(supabase, session.hashedId, { actionType, contactId, npub, weight: providedWeight, metadata });
    if (result.error) {
      res.status(result.status || 500).json({ success: false, error: result.error });
      return;
    }
    // After handling the specific action, continue to recalculate all trust scores
  }

  // Load contacts + verification flags
  const { data: contacts, error: cErr } = await supabase
    .from("encrypted_contacts")
    .select("id, trust_level, origin_geohash_truncated")
    .eq("owner_hash", session.hashedId)
    .limit(500);
  if (cErr) { res.status(500).json({ success: false, error: "Failed to load contacts" }); return; }

  let updated = 0;
  // Batch fetch verification data
  const contactIds = (contacts || []).map(c => c.id);

  const { data: verifications } = await supabase
    .from("contact_verification_status")
    .select("contact_id, physical_mfa_verified, vp_verified")
    .eq("owner_hash", session.hashedId)
    .in("contact_id", contactIds);

  const { data: attestations } = await supabase
    .from("contact_attestations")
    .select("contact_id")
    .eq("owner_hash", session.hashedId)
    .in("contact_id", contactIds);

  // Create lookup maps
  const verificationMap = new Map(verifications?.map(v => [v.contact_id, v]) || []);
  const attestationCounts = attestations?.reduce((acc, att) => {
    acc[att.contact_id] = (acc[att.contact_id] || 0) + 1;
    return acc;
  }, {}) || {};

  // Batch prepare trust metrics
  const trustMetrics = [];
  const nowIso = new Date().toISOString();
  for (const c of contacts || []) {
    const ver = verificationMap.get(c.id);
    const ownAttestCount = attestationCounts[c.id] || 0;

    // v1 scoring (no transitive from peers yet due to privacy constraints)
    let score = 0;

    // Phase 3: Physical MFA verification with trust weight multiplier
    if (ver?.physical_mfa_verified) {
      score += Math.round(50 * GEOCHAT_PHYSICAL_MFA_TRUST_WEIGHT / 3.0); // Normalize to base 50
    }
    if (ver?.vp_verified) score += 30;
    score += clamp((ownAttestCount || 0) * 5, 0, 20);

    // Trust level baseline
    if (c.trust_level === "family") score += 10;
    else if (c.trust_level === "trusted") score += 5;
    else if (c.trust_level === "verified") score += 8; // Phase 3: Physical MFA verified contacts

    // Phase 3: Geo-origin bonus (contacts added from geo-rooms get trust weight multiplier)
    if (c.origin_geohash_truncated) {
      // Base geo bonus is 3 points (matching geo_contact_added weight)
      const geoBonus = Math.round(GEO_ACTION_WEIGHTS.geo_contact_added * GEOCHAT_TRUST_WEIGHT);
      score += geoBonus;
    }

    score = clamp(score, 0, 100);

    // For privacy, store as an encrypted-like placeholder (app encrypts client-side in future)
    const trust_score_encrypted = `v1:${score}`;

    trustMetrics.push({
      contact_id: c.id,
      owner_hash: session.hashedId,
      trust_score_encrypted,
      updated_at: nowIso,
    });
  }

  if (trustMetrics.length > 0) {
    const { error: upErr } = await supabase
      .from("contact_trust_metrics")
      .upsert(trustMetrics, { onConflict: "contact_id,owner_hash" });
    if (upErr) {
      res.status(500).json({ success: false, error: "Failed to upsert trust metrics batch" });
      return;
    }
    updated = trustMetrics.length;
  }

  res.status(200).json({ success: true, updated });
}

