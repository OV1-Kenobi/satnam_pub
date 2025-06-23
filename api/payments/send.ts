import { z } from "zod";

// Validation schema for payment requests
const PaymentRequestSchema = z.object({
  fromMember: z.string().min(1, "From member is required"),
  toMember: z.string().min(1, "To member or address is required"),
  amount: z.number().positive("Amount must be positive"),
  memo: z.string().optional(),
  privacyRouting: z.boolean().default(true),
  routeType: z.enum(["lightning", "ecash", "internal"]).default("lightning"),
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
 * Handle CORS for the API endpoint
 */
function setCorsHeaders(req: any, res: any) {
  const allowedOrigins =
    process.env.NODE_ENV === "production"
      ? [process.env.FRONTEND_URL || "https://satnam.pub"]
      : [
          "http://localhost:3000",
          "http://localhost:5173",
          "http://localhost:3002",
        ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

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
 * Lightning Payments API Endpoint
 * POST /api/payments/send - Send a Lightning payment
 */
export default async function handler(req: any, res: any) {
  // Set CORS headers
  setCorsHeaders(req, res);

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
