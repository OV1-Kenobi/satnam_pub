/**
 * Attest Contact (secured)
 * POST /api/communications/attest-contact
 * Body: { contact_hash, attestation_type, vp_hash?, metadata? }
 * RLS: owner_hash via session.hashedId
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

const ALLOWED_TYPES = new Set(["physical_nfc","vp_jwt","inbox_relays","group_peer"]);

export default async function attestContact(req, res) {
  const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  if (!allowRequest(String(clientIP), 60, 60_000)) { res.status(429).json({ success: false, error: "Rate limit exceeded" }); return; }
  if (req.method !== "POST") { res.status(405).json({ success: false, error: "Method not allowed" }); return; }

  const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
  if (!SecureSessionManager) { const sec = await import("../../netlify/functions_active/security/session-manager.js"); SecureSessionManager = sec.SecureSessionManager; }
  const session = await SecureSessionManager.validateSessionFromHeader(String(authHeader));
  if (!session || !session.hashedId) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const { contact_hash, attestation_type, vp_hash, metadata } = body;
  if (!contact_hash || !ALLOWED_TYPES.has(String(attestation_type))) { res.status(400).json({ success: false, error: "Invalid payload" }); return; }

  const supabase = await getSupabase();
  await setRlsContext(supabase, session.hashedId);

  // Resolve contact id for this owner
  const { data: contact, error: findErr } = await supabase
    .from("encrypted_contacts")
    .select("id")
    .eq("owner_hash", session.hashedId)
    .eq("contact_hash", contact_hash)
    .limit(1)
    .maybeSingle();
  if (findErr || !contact) { res.status(404).json({ success: false, error: "Contact not found" }); return; }

  const row = {
    owner_hash: session.hashedId,
    contact_id: contact.id,
    vp_hash: vp_hash || null,
    attestation_type: attestation_type,
    metadata_encrypted: typeof metadata === "string" ? metadata : null,
  };

  const { error: insErr } = await supabase.from("contact_attestations").insert(row);
  if (insErr) {
    // Treat conflict (duplicate) as success
    const msg = String(insErr?.message || "");
    if (!/duplicate key|unique constraint/i.test(msg)) {
      res.status(500).json({ success: false, error: "Failed to save attestation" });
      return;
    }
  }

  res.status(200).json({ success: true });
}

