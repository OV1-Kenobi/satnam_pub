import { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { setCorsHeaders } from "../../utils/cors";

// Note: CORS handling is now managed by the shared utility

/**
 * Emergency Liquidity API Endpoint
 * POST /api/phoenixd/emergency-liquidity - Trigger emergency liquidity protocol
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Set CORS headers with appropriate methods for this endpoint
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({
      success: false,
      error: "Method not allowed",
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  try {
    const requestSchema = z.object({
      reason: z.string().min(1),
      requestedAmount: z.number().positive().optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    });

    const validationResult = requestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Invalid emergency liquidity request",
        details: validationResult.error.errors,
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    const request = validationResult.data;

    // In a real implementation, this would:
    // 1. Assess current liquidity situation
    // 2. Trigger emergency protocols (channel opening, rebalancing)
    // 3. Notify family guardians for approval
    // 4. Execute approved liquidity operations

    const emergencyResponse = {
      emergencyId: `emrg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: "initiated",
      estimatedResolution: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      actions: [
        "Assessing current channel liquidity",
        "Identifying optimal rebalancing routes",
        "Preparing emergency channel opening",
        "Notifying family guardians for approval",
      ],
      approvalRequired: request.priority === "critical",
    };

    console.log("Emergency liquidity protocol triggered:", request);

    res.status(200).json({
      success: true,
      data: emergencyResponse,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Emergency liquidity error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to trigger emergency liquidity protocol",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}
