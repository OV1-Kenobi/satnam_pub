import { z } from "zod";

// Validation schema for query parameters
const QuerySchema = z.object({
  from: z.string().min(1, "From parameter is required"),
  to: z.string().min(1, "To parameter is required"),
  amount: z.string().regex(/^\d+$/, "Amount must be a positive integer"),
});

import { ApiRequest, ApiResponse } from "../../types/api";
import { setCorsHeaders } from "../../utils/cors";

// Note: CORS handling is now managed by the shared utility

/**
 * Mock family member validation
 */
async function isFamilyMember(memberId: string): Promise<boolean> {
  // Mock implementation - in production this would check the database
  const familyMembers = [
    "satnam_dad",
    "satnam_mom",
    "arjun_teen",
    "priya_kid",
    "kiran_child",
  ];
  return familyMembers.includes(memberId);
}

/**
 * Payment Routes API Endpoint
 * GET /api/payments/routes - Get available payment routes
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  // Set CORS headers with appropriate methods for this endpoint
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
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
    // Validate query parameters with Zod
    const validationResult = QuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        details: validationResult.error.errors,
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    const { from, to, amount } = validationResult.data;
    const amountSats = parseInt(amount);

    // Mock route calculation
    const routes = [
      {
        type: "lightning",
        estimatedFee: Math.max(1, Math.floor(amountSats * 0.001)),
        estimatedTime: 3000 + Math.random() * 2000, // 3-5 seconds
        privacy: "high",
        reliability: 0.95 + Math.random() * 0.04, // 95-99%
        description: "Lightning Network routing with LNProxy privacy",
      },
      {
        type: "ecash",
        estimatedFee: 0,
        estimatedTime: 5000 + Math.random() * 3000, // 5-8 seconds
        privacy: "high",
        reliability: 0.92 + Math.random() * 0.06, // 92-98%
        description: "Fedimint ecash transfer with perfect privacy",
      },
      {
        type: "internal",
        estimatedFee: 0,
        estimatedTime: 1000 + Math.random() * 1000, // 1-2 seconds
        privacy: "high",
        reliability: 0.99,
        description: "Internal family transfer (instant)",
      },
    ];

    // Filter routes based on amount and availability
    const availableRoutes = [];

    for (const route of routes) {
      // Internal transfers only available for family members
      if (route.type === "internal") {
        // Use configurable family member validation service
        const isFamily = await isFamilyMember(to as string);
        if (isFamily) {
          availableRoutes.push(route);
        }
      } else {
        availableRoutes.push(route);
      }
    }

    res.status(200).json({
      success: true,
      data: availableRoutes,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
        amount: amountSats,
        from: from as string,
        to: to as string,
      },
    });
  } catch (error) {
    console.error("Route calculation error:", error);

    res.status(500).json({
      success: false,
      error: "Internal server error during route calculation",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}
