import crypto from "crypto";
import { ApiRequest, ApiResponse } from "../../types/api";
import { setCorsHeadersForCustomAPI } from "../../utils/cors";

/**
 * NIP-07 Challenge Generation Endpoint
 * GET /api/auth/nip07-challenge - Generate authentication challenge
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeadersForCustomAPI(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Generate a cryptographically secure random challenge
    const challenge = crypto.randomBytes(32).toString("hex");
    const domain = req.headers.host || "localhost:3000";
    const timestamp = Date.now();

    // Return challenge data compatible with NIP-07
    return res.status(200).json({
      success: true,
      data: {
        challenge,
        domain,
        timestamp,
        // Challenge expires in 5 minutes
        expiresAt: timestamp + 5 * 60 * 1000,
      },
    });
  } catch (error) {
    console.error("Error generating NIP-07 challenge:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to generate challenge",
    });
  }
}
