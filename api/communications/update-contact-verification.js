/**
 * Update Contact Verification (secured)
 * POST /api/communications/update-contact-verification
 * Body: { contact_hash, updates: { physical_mfa_verified?, vp_verified?, verification_proofs_encrypted? } }
 * RLS: owner_hash via session.hashedId
 */

import { allowRequest } from "../../netlify/functions/utils/rate-limiter.js";

let supabaseMod;
let SecureSessionManager;

async function getSupabase() {
  if (!supabaseMod) {
    supabaseMod = await import("../../netlify/functions/supabase.js");
  }
  return supabaseMod.supabase;
}

async function setRlsContext(client, ownerHash) {
  let ok = false;
  try {
    await client.rpc("set_app_current_user_hash", { val: ownerHash });
    ok = true;
  } catch (e1) {
    console.error("RLS set_app_current_user_hash failed:", e1 instanceof Error ? e1.message : e1);
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
      console.error("RLS set_app_config failed:", e2 instanceof Error ? e2.message : e2);
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
      console.error("RLS app_set_config failed:", e3 instanceof Error ? e3.message : e3);
    }
  }
  return ok;
}

export default async function updateContactVerification(req, res) {
  // CORS & rate limit
  const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  if (!allowRequest(String(clientIP), 60, 60_000)) {
    res.status(429).json({ success: false, error: "Rate limit exceeded" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }

  // Auth via SecureSessionManager
  const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
  if (!SecureSessionManager) {
    const sec = await import("../../netlify/functions_active/security/session-manager.js");
    SecureSessionManager = sec.SecureSessionManager;
  }
  const session = await SecureSessionManager.validateSessionFromHeader(String(authHeader));
  if (!session || !session.hashedId) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    res.status(400).json({ success: false, error: "Invalid JSON payload" });
    return;
  }
  const { contact_hash, updates } = body;
  if (!contact_hash || typeof updates !== "object") {
    res.status(400).json({ success: false, error: "Invalid payload" });
    return;
  }

  const supabase = await getSupabase();
  const rlsOk = await setRlsContext(supabase, session.hashedId);
  if (!rlsOk) {
    console.error("RLS context setup failed for update-contact-verification", { ownerHash: session.hashedId });
    res.status(500).json({ success: false, error: "RLS context setup failed" });
    return;
  }

  // Find contact by owner + contact_hash
  const { data: contact, error: findErr } = await supabase
    .from("encrypted_contacts")
    .select("id")
    .eq("owner_hash", session.hashedId)
    .eq("contact_hash", contact_hash)
    .limit(1)
    .maybeSingle();
  if (findErr || !contact) {
    res.status(404).json({ success: false, error: "Contact not found" });
    return;
  }

  const now = new Date().toISOString();
  const payload = { owner_hash: session.hashedId, contact_id: contact.id };

  if (typeof updates.physical_mfa_verified === "boolean") {
    payload.physical_mfa_verified = updates.physical_mfa_verified;
    if (updates.physical_mfa_verified) {
      payload.physical_verification_date = now;
    }
  }

  if (typeof updates.verification_proofs_encrypted === "string") {
    // Validate size (e.g., max 10KB for encrypted data)
    if (updates.verification_proofs_encrypted.length > 10240) {
      res.status(400).json({ success: false, error: "Verification proofs too large" });
      return;
    }
    payload.verification_proofs_encrypted = updates.verification_proofs_encrypted;
  }

  // Upsert (unique on owner_hash + contact_id enforced by index)
  const { error: upsertErr } = await supabase
    .from("contact_verification_status")
    .upsert(payload, { onConflict: "owner_hash,contact_id" });
  if (upsertErr) {
    res.status(500).json({ success: false, error: "Failed to update verification" });
    return;
  }

  res.status(200).json({ success: true });
}

