import { setCorsHeaders } from "../../utils/cors";

// Note: CORS handling is now managed by the shared utility

/**
 * Mock swap status lookup (in production, this would query the database)
 */
async function getSwapStatus(swapId: string) {
  // Simulate database lookup delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Mock swap record
  const mockSwapRecord = {
    swap_id: swapId,
    from_context: "lightning",
    to_context: "fedimint",
    from_member_id: "satnam_dad",
    to_member_id: "arjun_teen",
    amount: 50000,
    status: "completed",
    created_at: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
    completed_at: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
    fees: {
      networkFee: 50,
      bridgeFee: 100,
      total: 150,
    },
    swap_type: "standard",
    purpose: "payment_transfer",
  };

  // Mock swap logs
  const mockSwapLogs = [
    {
      step_number: 1,
      step_name: "validation",
      status: "completed",
      message: "Swap request validated",
      timestamp: new Date(Date.now() - 300000).toISOString(),
    },
    {
      step_number: 2,
      step_name: "source_lock",
      status: "completed",
      message: "Source funds locked",
      timestamp: new Date(Date.now() - 240000).toISOString(),
    },
    {
      step_number: 3,
      step_name: "destination_prepare",
      status: "completed",
      message: "Destination prepared",
      timestamp: new Date(Date.now() - 180000).toISOString(),
    },
    {
      step_number: 4,
      step_name: "atomic_execution",
      status: "completed",
      message: "Atomic swap executed",
      timestamp: new Date(Date.now() - 120000).toISOString(),
    },
    {
      step_number: 5,
      step_name: "confirmation",
      status: "completed",
      message: "Swap confirmed and finalized",
      timestamp: new Date(Date.now() - 60000).toISOString(),
    },
  ];

  return {
    swap: mockSwapRecord,
    logs: mockSwapLogs,
  };
}

/**
 * Swap Status API Endpoint
 * GET /api/bridge/swap-status - Get atomic swap status
 */
export default async function handler(req: any, res: any) {
  // Set CORS headers with appropriate methods for this endpoint
  setCorsHeaders(req, res, { methods: "GET, POST, PUT, DELETE, OPTIONS" });

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
    const { swapId } = req.query;

    if (!swapId || typeof swapId !== "string") {
      res.status(400).json({
        success: false,
        error: "Swap ID is required",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { swap, logs } = await getSwapStatus(swapId);

    if (!swap) {
      res.status(404).json({
        success: false,
        error: "Swap not found",
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        swap,
        logs,
      },
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  } catch (error) {
    console.error("Error fetching swap status:", error);

    res.status(500).json({
      success: false,
      error: "Failed to fetch swap status",
      meta: {
        timestamp: new Date().toISOString(),
        demo: true,
      },
    });
  }
}
