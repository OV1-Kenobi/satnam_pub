import crypto from "crypto";
import { verifyEvent } from "nostr-tools";
import { ApiRequest, ApiResponse } from "../../types/api";
import { setCorsHeadersForCustomAPI } from "../../utils/cors";

/**
 * NIP-07 Sign-In Verification Endpoint
 * POST /api/auth/nip07-signin - Verify signed authentication event
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeadersForCustomAPI(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { signedEvent, challenge, domain } = req.body;

    if (!signedEvent || !challenge || !domain) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: signedEvent, challenge, domain",
      });
    }

    // Verify the event signature
    const isValidSignature = verifyEvent(signedEvent);
    if (!isValidSignature) {
      return res.status(401).json({
        success: false,
        error: "Invalid event signature",
      });
    }

    // Verify the challenge in the event content matches what we sent
    if (signedEvent.content !== challenge) {
      return res.status(401).json({
        success: false,
        error: "Challenge mismatch",
      });
    }

    // Verify the event is recent (within 5 minutes)
    const eventTime = signedEvent.created_at * 1000;
    const now = Date.now();
    if (now - eventTime > 5 * 60 * 1000) {
      return res.status(401).json({
        success: false,
        error: "Event too old",
      });
    }

    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // In production, store session in database
    // For now, return the session token

    return res.status(200).json({
      success: true,
      data: {
        sessionToken,
        npub: signedEvent.pubkey,
        expiresAt: expiresAt.toISOString(),
        user: {
          npub: signedEvent.pubkey,
          authenticated: true,
          authMethod: "nip07",
          permissions: ["read", "write", "transfer"],
        },
      },
    });
  } catch (error) {
    console.error("Error verifying NIP-07 authentication:", error);
    return res.status(500).json({
      success: false,
      error: "Authentication verification failed",
    });
  }
}
