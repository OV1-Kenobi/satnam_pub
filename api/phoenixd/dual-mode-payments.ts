/**
 * Dual-Mode PhoenixD Payment API
 *
 * Handles both individual and family Lightning payments with automatic
 * liquidity management and context switching
 */

import type { Request, Response } from "../../types/netlify-functions";
import {
  EnhancedPhoenixdManager,
  OperationContext,
  OperationMode,
} from "../../src/lib/enhanced-phoenixd-manager";

interface PaymentRequest {
  mode: OperationMode;
  userId: string;
  familyId?: string;
  invoice: string;
  amountSat?: number;
  description?: string;
}

interface PaymentResponse {
  success: boolean;
  paymentId?: string;
  liquidityOperationId?: string;
  feeSat: number;
  message: string;
  context: OperationContext;
  accountBalance?: number;
}

interface AccountInitRequest {
  mode: OperationMode;
  userId: string;
  username: string;
  familyId?: string;
  familyName?: string;
  parentUserId?: string;
  members?: Array<{
    userId: string;
    username: string;
    role: "parent" | "teen" | "child";
    limits?: {
      dailyLimit?: number;
      weeklyLimit?: number;
      transactionLimit?: number;
    };
    allowance?: {
      enabled: boolean;
      amount: number;
      frequency: "daily" | "weekly" | "monthly";
    };
  }>;
}

const phoenixdManager = new EnhancedPhoenixdManager();

/**
 * Standardized error response format
 */
function jsonError(message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({
      success: false,
      errorMessage: message,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Validate operation context
 */
function validateContext(
  req: PaymentRequest | AccountInitRequest
): OperationContext {
  const { mode, userId, familyId } = req;

  if (!mode || !["individual", "family"].includes(mode)) {
    throw new Error("Invalid operation mode. Must be 'individual' or 'family'");
  }

  if (!userId || typeof userId !== "string") {
    throw new Error("userId is required and must be a string");
  }

  if (mode === "family") {
    if (!familyId || typeof familyId !== "string") {
      throw new Error("familyId is required for family mode operations");
    }
  }

  return {
    mode,
    userId,
    familyId: mode === "family" ? familyId : undefined,
    parentUserId:
      mode === "family" ? (req as AccountInitRequest).parentUserId : undefined,
  };
}

/**
 * Validate payment request
 */
function validatePaymentRequest(req: any): PaymentRequest {
  const { invoice, amountSat, description } = req;

  if (!invoice || typeof invoice !== "string") {
    throw new Error("invoice is required and must be a string");
  }

  if (
    amountSat !== undefined &&
    (typeof amountSat !== "number" || amountSat <= 0)
  ) {
    throw new Error("amountSat must be a positive number");
  }

  if (description !== undefined && typeof description !== "string") {
    throw new Error("description must be a string");
  }

  return req as PaymentRequest;
}

export default async function handler(
  req: Request,
  res: Response
) {
  if (req.method === "POST") {
    return handlePayment(req, res);
  } else if (req.method === "PUT") {
    return handleAccountInit(req, res);
  } else if (req.method === "GET") {
    return handleAccountInfo(req, res);
  } else {
    return res.status(405).json({
      success: false,
      errorMessage: "Method not allowed",
    });
  }
}

/**
 * Handle Lightning payment with dual-mode support
 */
async function handlePayment(req: NextApiRequest, res: NextApiResponse) {
  try {
    const paymentReq = validatePaymentRequest(req.body);
    const context = validateContext(paymentReq);

    console.log(
      `Processing ${context.mode} payment for user ${context.userId}`,
      {
        familyId: context.familyId,
        invoice: paymentReq.invoice.substring(0, 20) + "...",
        amountSat: paymentReq.amountSat,
      }
    );

    // Execute payment with automatic liquidity management
    const result = await phoenixdManager.executePayment(
      context,
      paymentReq.invoice,
      paymentReq.amountSat
    );

    // Get updated account info
    const accountInfo = await phoenixdManager.getAccountInfo(context);
    const accountBalance = accountInfo
      ? "balanceSat" in accountInfo
        ? accountInfo.balanceSat
        : accountInfo.totalBalanceSat
      : undefined;

    const response: PaymentResponse = {
      success: result.success,
      paymentId: result.paymentId,
      liquidityOperationId: result.liquidityOpId,
      feeSat: result.feeSat,
      message: result.message,
      context,
      accountBalance,
    };

    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(response);
  } catch (error) {
    console.error("Payment processing error:", error);
    return res.status(400).json({
      success: false,
      errorMessage:
        error instanceof Error ? error.message : "Payment processing failed",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handle account initialization
 */
async function handleAccountInit(req: NextApiRequest, res: NextApiResponse) {
  try {
    const initReq = req.body as AccountInitRequest;
    const context = validateContext(initReq);

    console.log(
      `Initializing ${context.mode} account for user ${context.userId}`
    );

    let accountInfo;

    if (context.mode === "individual") {
      accountInfo = await phoenixdManager.initializeIndividualAccount(
        initReq.userId,
        initReq.username
      );
    } else {
      if (!initReq.familyName || !initReq.parentUserId || !initReq.members) {
        throw new Error(
          "familyName, parentUserId, and members are required for family account initialization"
        );
      }

      accountInfo = await phoenixdManager.initializeFamilyAccount(
        initReq.familyId!,
        initReq.familyName,
        initReq.parentUserId,
        initReq.members.map((member) => ({
          ...member,
          allowance: member.allowance
            ? {
                ...member.allowance,
                nextPayment: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
              }
            : undefined,
        }))
      );
    }

    return res.status(201).json({
      success: true,
      message: `${context.mode} account initialized successfully`,
      account: accountInfo,
      context,
    });
  } catch (error) {
    console.error("Account initialization error:", error);
    return res.status(400).json({
      success: false,
      errorMessage:
        error instanceof Error
          ? error.message
          : "Account initialization failed",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handle account info retrieval
 */
async function handleAccountInfo(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { mode, userId, familyId } = req.query;

    const context = validateContext({
      mode: mode as OperationMode,
      userId: userId as string,
      familyId: familyId as string,
    } as any);

    const accountInfo = await phoenixdManager.getAccountInfo(context);

    if (!accountInfo) {
      return res.status(404).json({
        success: false,
        errorMessage: "Account not found",
        timestamp: new Date().toISOString(),
      });
    }

    // Get recent liquidity operations
    const liquidityOps = phoenixdManager.getLiquidityOperations(context);

    return res.status(200).json({
      success: true,
      account: accountInfo,
      liquidityOperations: liquidityOps.slice(-10), // Last 10 operations
      context,
    });
  } catch (error) {
    console.error("Account info retrieval error:", error);
    return res.status(400).json({
      success: false,
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to retrieve account info",
      timestamp: new Date().toISOString(),
    });
  }
}

export type { AccountInitRequest, PaymentRequest, PaymentResponse };
