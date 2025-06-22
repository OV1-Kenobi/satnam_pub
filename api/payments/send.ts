import { Request, Response } from "express";
import { z } from "zod";
import { isFamilyMember } from "../../services/family";

// Validation schema for payment requests
const PaymentRequestSchema = z.object({
  fromMember: z.string().min(1, "From member is required"),
  toMember: z.string().min(1, "To member or address is required"),
  amount: z.number().positive("Amount must be positive"),
  memo: z.string().optional(),
  privacyRouting: z.boolean().default(true),
  routeType: z.enum(["lightning", "ecash", "internal"]).default("lightning"),
});

// Validation schema for query parameters
const QuerySchema = z.object({
  from: z.string().min(1, "From parameter is required"),
  to: z.string().min(1, "To parameter is required"),
  amount: z.string().regex(/^\d+$/, "Amount must be a positive integer"),
});

interface PaymentRequest {
  fromMember: string;
  toMember: string;
  amount: number;
  memo?: string;
  privacyRouting: boolean;
  routeType: "lightning" | "ecash" | "internal";
}

interface PaymentResponse {
  success: boolean;
  data?: {
    paymentId: string;
    status: "pending" | "completed" | "failed";
    fee: number;
    timestamp: string;
    route: string;
  };
  error?: string;
  meta?: {
    timestamp: string;
    demo: boolean;
  };
}

/**
 * Send Lightning Payment
 * POST /api/payments/send
 */
export async function sendPayment(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body
    const validationResult = PaymentRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Invalid payment request",
        details: validationResult.error.errors,
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    const paymentRequest: PaymentRequest = validationResult.data;

    // In a real implementation, this would:
    // 1. Validate family member permissions
    // 2. Check spending limits
    // 3. Verify balances
    // 4. Process the payment through Lightning/Phoenix
    // 5. Update balances and transaction history
    // 6. Send notifications

    // Mock payment processing
    const mockPaymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Simulate processing delay
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 2000)
    );

    // Mock success/failure (95% success rate)
    const isSuccess = Math.random() > 0.05;

    if (!isSuccess) {
      res.status(400).json({
        success: false,
        error: "Payment failed - insufficient liquidity or routing error",
        meta: {
          timestamp: new Date().toISOString(),
          demo: true,
        },
      });
      return;
    }

    // Calculate mock fee based on route type
    let fee = 0;
    switch (paymentRequest.routeType) {
      case "lightning":
        fee = Math.max(1, Math.floor(paymentRequest.amount * 0.001)); // 0.1% fee, min 1 sat
        break;
      case "ecash":
        fee = 0; // No fee for ecash
        break;
      case "internal":
        fee = 0; // No fee for internal transfers
        break;
    }

    const response: PaymentResponse = {
      success: true,
      data: {
        paymentId: mockPaymentId,
        status: "completed",
        fee,
        timestamp: new Date().toISOString(),
        route: paymentRequest.routeType,
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Payment processing error:", error);

    res.status(500).json({
      success: false,
      error: "Internal server error during payment processing",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}

/**
 * Get Payment Routes
 * GET /api/payments/routes
 */
export async function getPaymentRoutes(
  req: Request,
  res: Response
): Promise<void> {
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

export default {
  sendPayment,
  getPaymentRoutes,
};
