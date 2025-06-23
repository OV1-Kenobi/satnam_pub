/**
 * Lightning Payments API
 * POST /api/payments/send - Send Lightning payment
 */

// Handle CORS
function setCorsHeaders(req, res) {
  const allowedOrigins = process.env.NODE_ENV === "production"
    ? [process.env.FRONTEND_URL || "https://satnam.pub"]
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:3002"];

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

// Mock payment processing
async function processLightningPayment(paymentRequest) {
  // Simulate payment processing delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock payment result
  return {
    paymentId: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: "completed",
    amount: paymentRequest.amount,
    fees: Math.floor(paymentRequest.amount * 0.001), // 0.1% fee
    recipient: paymentRequest.recipient,
    memo: paymentRequest.memo,
    timestamp: new Date().toISOString(),
    preimage: "a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789ab",
    route: {
      hops: 3,
      totalTimeLock: 144,
    },
  };
}

export default async function handler(req, res) {
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
    const { memberId, amount, recipient, memo, paymentType } = req.body;

    // Validate required fields
    if (!memberId || !amount || !recipient) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: memberId, amount, and recipient are required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate amount
    if (typeof amount !== "number" || amount <= 0) {
      res.status(400).json({
        success: false,
        error: "Amount must be a positive number",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate payment limits (demo limits)
    if (amount > 1000000) { // 1M sats max
      res.status(400).json({
        success: false,
        error: "Payment amount exceeds maximum limit (1,000,000 sats)",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Process the payment
    const paymentRequest = {
      memberId,
      amount,
      recipient,
      memo: memo || "",
      paymentType: paymentType || "standard",
    };

    const paymentResult = await processLightningPayment(paymentRequest);

    res.status(200).json({
      success: true,
      data: paymentResult,
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Payment processing error:", error);

    res.status(500).json({
      success: false,
      error: "Payment processing failed",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}