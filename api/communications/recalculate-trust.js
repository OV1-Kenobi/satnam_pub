/**
 * Recalculate Trust Scores (secured, owner-scoped)
 * POST /api/communications/recalculate-trust
 * Computes a simple v1 trust score and stores it in contact_trust_metrics.trust_score_encrypted
 */

import { allowRequest } from "../../netlify/functions/utils/rate-limiter.js";

let supabaseMod;
let SecureSessionManager;

async function getSupabase() {
  if (!supabaseMod) supabaseMod = await import("../../netlify/functions/supabase.js");
  return supabaseMod.supabase;
}

async function setRlsContext(client, ownerHash) {
  try { await client.rpc("set_app_current_user_hash", { val: ownerHash }); }
  catch { try { await client.rpc("set_app_config", { setting_name: "app.current_user_hash", setting_value: ownerHash, is_local: true }); } catch { try { await client.rpc("app_set_config", { setting_name: "app.current_user_hash", setting_value: ownerHash, is_local: true }); } catch {} } }
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

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

  // Load contacts + verification flags
  const { data: contacts, error: cErr } = await supabase
    .from("encrypted_contacts")
    .select("id, trust_level")
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
    if (ver?.physical_mfa_verified) score += 50;
    if (ver?.vp_verified) score += 30;
    score += clamp((ownAttestCount || 0) * 5, 0, 20);

    // Trust level baseline
    if (c.trust_level === "family") score += 10;
    else if (c.trust_level === "trusted") score += 5;

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

