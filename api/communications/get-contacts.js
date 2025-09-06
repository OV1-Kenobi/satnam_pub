/**
 * Get Contacts Endpoint (secured)
 * GET /api/communications/get-contacts?memberId=...
 *
 * Returns the user's contacts list with privacy-first schema
 */

import { allowRequest } from "../../netlify/functions/utils/rate-limiter.js";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ success: false, error: "Method not allowed" }); return; }

  // Rate limiting
  const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  if (!allowRequest(String(clientIP))) { res.status(429).json({ success: false, error: "Rate limit exceeded" }); return; }

  try {
    // Validate Authorization using SecureSessionManager (custom JWT)
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    try {
      const { SecureSessionManager } = await import(
        "../../netlify/functions/security/session-manager.js"
      );
      console.log("🔐 DEBUG: SecureSessionManager imported successfully (get-contacts)");
      const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
      console.log("🔐 DEBUG: Session validation result (get-contacts):", session ? "valid" : "invalid");
      if (!session || !session.hashedId) {
        console.log("🔐 DEBUG: Session missing or no hashedId (get-contacts):", { hasSession: !!session, hasHashedId: session?.hashedId });
        res.status(401).json({ success: false, error: "Invalid token" });
        return;
      }
      console.log("🔐 DEBUG: Session hashedId (get-contacts):", session.hashedId);

      // Use server-side Supabase client (no per-request Authorization)
      const { supabase } = await import("../../netlify/functions/supabase.js");
      const client = supabase;

      // App-layer authorization: use session.hashedId as the owner filter
      const memberId = String(req.query?.memberId || "").trim();

      // Reject client-provided memberId that doesn't match session
      if (memberId && memberId !== "current-user" && memberId !== session.hashedId) {
        res.status(403).json({ success: false, error: "Forbidden: memberId mismatch" });
        return;
      }

      // Use session.hashedId as the authoritative owner identifier
      const ownerHash = session.hashedId;

      // Fetch contacts for the authenticated user
      console.log("🔐 DEBUG: get-contacts - querying encrypted_contacts table with ownerHash:", ownerHash);

      // First, test if the table exists with a simple query
      const { data, error } = await client
        .from("encrypted_contacts")
        .select("*")
        .eq("owner_hash", ownerHash)
        .order("added_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("🔐 DEBUG: get-contacts - database error:", error);
        res.status(500).json({ success: false, error: "Failed to load contacts" });
        return;
      }

      console.log("🔐 DEBUG: get-contacts - query successful, contacts found:", data?.length || 0);
      res.status(200).json({ success: true, contacts: data || [] });
    } catch (importError) {
      console.error("🔐 DEBUG: SecureSessionManager import failed (get-contacts):", importError);
      res.status(500).json({ success: false, error: "Session validation failed" });
    }
  } catch (e) {
    const code = e && typeof e === "object" && "statusCode" in e ? e.statusCode : 500;
    console.error("get-contacts error:", e);
    res.status(code).json({ success: false, error: e?.message || "Failed to load contacts" });
  }
}
