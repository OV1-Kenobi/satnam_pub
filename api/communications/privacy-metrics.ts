import { ApiRequest, ApiResponse } from "../../types/api";
import { setCorsHeaders } from "../../utils/cors";

/**
 * Privacy Metrics API Endpoint
 * GET /api/communications/privacy-metrics - Get user privacy statistics
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { npub } = req.query;

    if (!npub) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: npub",
      });
    }

    // In production, this would query the database for user's privacy metrics
    // For now, return mock data
    const mockMetrics = {
      messagesEncrypted: Math.floor(Math.random() * 100) + 50,
      metadataProtected: Math.floor(Math.random() * 80) + 30,
      zeroKnowledgeProofs: Math.floor(Math.random() * 20) + 5,
      privacyScore: 0.85,
      lastUpdated: new Date().toISOString(),
    };

    return res.status(200).json({
      success: true,
      metrics: mockMetrics,
      // Return individual values for backward compatibility
      messagesEncrypted: mockMetrics.messagesEncrypted,
      metadataProtected: mockMetrics.metadataProtected,
      zeroKnowledgeProofs: mockMetrics.zeroKnowledgeProofs,
    });
  } catch (error) {
    console.error("Error fetching privacy metrics:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch privacy metrics",
    });
  }
}
