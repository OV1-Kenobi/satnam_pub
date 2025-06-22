import { Request, Response } from "express";
import { z } from "zod";
import {
  authenticateRequest,
  checkFamilyAccess,
} from "../../../lib/middleware/auth";
import { FamilyPaymentRouting } from "../../../types/family";

/**
 * Unified Family Payment Routing API
 * Smart routing between Lightning and Fedimint protocols
 * POST /api/family/payments/unified
 */
export async function routeUnifiedFamilyPayment(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const paymentSchema = z.object({
      familyId: z.string(),
      fromMember: z.string(),
      toMember: z.string().optional(),
      toAddress: z.string().optional(),
      amount: z.number().min(1).max(100000000), // 1 sat to 1 BTC
      description: z.string().optional(),
      paymentType: z
        .enum(["external", "zap", "internal_governance", "allowance"])
        .optional(),
      preferredProtocol: z.enum(["lightning", "fedimint", "auto"]).optional(),
      enablePrivacy: z.boolean().default(true),
    });

    const {
      familyId,
      fromMember,
      toMember,
      toAddress,
      amount,
      description,
      paymentType,
      preferredProtocol = "auto",
      enablePrivacy,
    } = paymentSchema.parse(req.body);

    // Authenticate the request
    const authResult = await authenticateRequest(req);
    if (!authResult.success) {
      res.status(401).json({
        success: false,
        error: "Unauthorized",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    // Verify family membership
    const accessCheck = await checkFamilyAccess(authResult.user!, familyId);
    if (!accessCheck.allowed) {
      res.status(403).json({
        success: false,
        error: "Access denied",
        details: accessCheck.error,
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    // Determine payment routing based on context
    const routing = await determinePaymentRouting({
      paymentType: paymentType || inferPaymentType(toMember, toAddress),
      amount,
      fromMember,
      toMember,
      toAddress,
      preferredProtocol,
      enablePrivacy,
    });

    // Execute payment based on routing decision
    const paymentResult = await executeRoutedPayment({
      routing,
      familyId,
      fromMember,
      toMember,
      toAddress,
      amount,
      description: description || `Payment from ${fromMember}`,
      enablePrivacy,
    });

    res.status(200).json({
      success: true,
      data: {
        paymentId: paymentResult.paymentId,
        routing,
        status: paymentResult.status,
        executionTime: paymentResult.executionTime,
        actualFee: paymentResult.actualFee,
        protocolUsed: paymentResult.protocolUsed,
        privacyEnabled: paymentResult.privacyEnabled,
        transactionHash: paymentResult.transactionHash,
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
        familyId,
        userRole: accessCheck.role,
      },
    });
  } catch (error) {
    console.error("Unified family payment error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to process unified family payment",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

/**
 * Get Payment Routing Recommendations
 * GET /api/family/payments/unified/routing
 */
export async function getPaymentRoutingRecommendations(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { familyId, paymentType, amount, fromMember, toMember, toAddress } =
      req.query;

    // Authenticate the request
    const authResult = await authenticateRequest(req);
    if (!authResult.success) {
      res.status(401).json({
        success: false,
        error: "Unauthorized",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    // Verify family membership
    const accessCheck = await checkFamilyAccess(
      authResult.user!,
      familyId as string
    );
    if (!accessCheck.allowed) {
      res.status(403).json({
        success: false,
        error: "Access denied",
        details: accessCheck.error,
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    // Generate routing recommendations for all protocols
    const routingOptions = await generateRoutingOptions({
      paymentType: (paymentType as string) || "external",
      amount: parseInt(amount as string),
      fromMember: fromMember as string,
      toMember: toMember as string,
      toAddress: toAddress as string,
    });

    res.status(200).json({
      success: true,
      data: {
        recommendedRoute: routingOptions[0], // Best option first
        alternativeRoutes: routingOptions.slice(1),
        routingAnalysis: {
          totalOptions: routingOptions.length,
          bestProtocol: routingOptions[0].recommendedProtocol,
          estimatedSavings:
            routingOptions.length > 1
              ? routingOptions[1].estimatedFee - routingOptions[0].estimatedFee
              : 0,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
        familyId: familyId as string,
      },
    });
  } catch (error) {
    console.error("Payment routing recommendations error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to get payment routing recommendations",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

// Helper functions

async function determinePaymentRouting(params: {
  paymentType: string;
  amount: number;
  fromMember: string;
  toMember?: string;
  toAddress?: string;
  preferredProtocol: string;
  enablePrivacy: boolean;
}): Promise<FamilyPaymentRouting> {
  const { paymentType, amount, preferredProtocol, enablePrivacy } = params;

  // Smart routing logic
  if (preferredProtocol !== "auto") {
    return createRoutingForProtocol(
      preferredProtocol as "lightning" | "fedimint",
      paymentType,
      amount,
      enablePrivacy
    );
  }

  // Auto-routing based on payment type and context
  switch (paymentType) {
    case "external":
    case "zap":
      // External payments and zaps always use Lightning
      return createRoutingForProtocol(
        "lightning",
        paymentType,
        amount,
        enablePrivacy
      );

    case "internal_governance":
    case "allowance":
      // Internal governance and allowances use Fedimint for consensus
      return createRoutingForProtocol(
        "fedimint",
        paymentType,
        amount,
        enablePrivacy
      );

    default:
      // Default to Lightning for unknown types
      return createRoutingForProtocol(
        "lightning",
        paymentType,
        amount,
        enablePrivacy
      );
  }
}

function createRoutingForProtocol(
  protocol: "lightning" | "fedimint",
  paymentType: string,
  amount: number,
  enablePrivacy: boolean
): FamilyPaymentRouting {
  if (protocol === "lightning") {
    return {
      paymentType: paymentType as any,
      recommendedProtocol: "lightning",
      reason:
        paymentType === "zap"
          ? "Nostr zaps require Lightning Network"
          : paymentType === "external"
            ? "External payments require Lightning Network"
            : "Lightning provides fast settlement for this payment type",
      estimatedFee: Math.max(1, Math.ceil(amount * 0.001)), // 0.1% fee, minimum 1 sat
      estimatedTime: 3000, // 3 seconds
      privacyLevel: enablePrivacy ? "high" : "medium",
    };
  } else {
    return {
      paymentType: paymentType as any,
      recommendedProtocol: "fedimint",
      reason:
        paymentType === "allowance"
          ? "Allowance distribution requires guardian consensus"
          : paymentType === "internal_governance"
            ? "Governance operations require Fedimint consensus"
            : "Fedimint provides zero fees and enhanced privacy for internal transfers",
      estimatedFee: 0, // Fedimint has no fees
      estimatedTime: 5000, // 5 seconds for consensus
      privacyLevel: "high", // Fedimint always provides high privacy
    };
  }
}

async function generateRoutingOptions(params: {
  paymentType: string;
  amount: number;
  fromMember: string;
  toMember?: string;
  toAddress?: string;
}): Promise<FamilyPaymentRouting[]> {
  const { paymentType, amount } = params;
  const options: FamilyPaymentRouting[] = [];

  // Always generate Lightning option
  options.push(
    createRoutingForProtocol("lightning", paymentType, amount, true)
  );

  // Generate Fedimint option if applicable
  if (
    paymentType === "internal_governance" ||
    paymentType === "allowance" ||
    !params.toAddress
  ) {
    options.push(
      createRoutingForProtocol("fedimint", paymentType, amount, true)
    );
  }

  // Sort by estimated cost and time
  return options.sort((a, b) => {
    const aCost = a.estimatedFee + a.estimatedTime / 1000; // Factor in time cost
    const bCost = b.estimatedFee + b.estimatedTime / 1000;
    return aCost - bCost;
  });
}

async function executeRoutedPayment(params: {
  routing: FamilyPaymentRouting;
  familyId: string;
  fromMember: string;
  toMember?: string;
  toAddress?: string;
  amount: number;
  description: string;
  enablePrivacy: boolean;
}) {
  const { routing, amount, description } = params;

  // Simulate payment execution
  await new Promise((resolve) => setTimeout(resolve, routing.estimatedTime));

  // Mock payment result
  return {
    paymentId: `${routing.recommendedProtocol}_${Date.now()}`,
    status: "completed",
    executionTime: routing.estimatedTime + Math.random() * 1000, // Add some variance
    actualFee: routing.estimatedFee + Math.floor(Math.random() * 3), // Small variance in fees
    protocolUsed: routing.recommendedProtocol,
    privacyEnabled: params.enablePrivacy && routing.privacyLevel === "high",
    transactionHash:
      routing.recommendedProtocol === "lightning"
        ? `ln_${Math.random().toString(36).substr(2, 9)}`
        : `fed_${Math.random().toString(36).substr(2, 9)}`,
  };
}

function inferPaymentType(toMember?: string, toAddress?: string): string {
  if (toAddress && (toAddress.includes("@") || toAddress.startsWith("ln"))) {
    return "external";
  }
  if (toMember) {
    return "internal_governance";
  }
  return "external";
}
