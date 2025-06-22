/**
 * PhoenixD Family Payment API
 * Smart payment routing with PhoenixD optimization
 */

import {
  AppError,
  ErrorAnalyzer,
  ErrorCode,
  ErrorResponseHelper,
} from "../../lib/error-handler";
import { getFamilyMember } from "../../lib/family-api";
import { PhoenixdClient } from "../../src/lib/phoenixd-client";

interface PaymentRequest {
  fromMember: string;
  toMember: string;
  amountSat: number;
  description?: string;
  maxFeeSat?: number;
  preferredMethod?: "phoenixd" | "lightning" | "auto";
  isEmergency?: boolean;
}

interface PaymentResponse {
  success: boolean;
  paymentId: string;
  amountSat: number;
  feeSat: number;
  routeUsed: string;
  processingTimeMs: number;
  transactionHash?: string;
  errorMessage?: string;
}

// Helper function for consistent error responses
function jsonBadRequest(message: string): Response {
  return new Response(
    JSON.stringify({
      success: false,
      errorMessage: message,
    }),
    { status: 400, headers: { "Content-Type": "application/json" } }
  );
}

export default async function handler(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();

  if (req.method !== "POST") {
    const error = new AppError(
      ErrorCode.VALIDATION_INVALID_FORMAT,
      `Method ${req.method} not allowed for payment processing`,
      "Only POST requests are allowed for payment processing.",
      { method: req.method, allowedMethods: ["POST"] },
      requestId
    );
    return ErrorResponseHelper.createErrorResponse(
      error,
      405,
      "PhoenixD Payment",
      requestId
    );
  }

  try {
    const phoenixdClient = new PhoenixdClient();
    let paymentRequest: PaymentRequest;

    try {
      paymentRequest = await req.json();
    } catch (parseError) {
      throw new AppError(
        ErrorCode.VALIDATION_INVALID_FORMAT,
        "Invalid JSON in request body",
        "Please provide a valid JSON request body.",
        {
          parseError:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
        },
        requestId
      );
    }

    // Validate required fields
    const missingFields = [];
    if (!paymentRequest.fromMember) missingFields.push("fromMember");
    if (!paymentRequest.toMember) missingFields.push("toMember");
    if (paymentRequest.amountSat === undefined) missingFields.push("amountSat");

    if (missingFields.length > 0) {
      throw new AppError(
        ErrorCode.VALIDATION_REQUIRED_FIELD_MISSING,
        `Missing required fields: ${missingFields.join(", ")}`,
        "Please provide all required payment information.",
        { missingFields, providedFields: Object.keys(paymentRequest) },
        requestId
      );
    }

    // Strong validation for amountSat - must be positive integer
    if (
      !Number.isInteger(paymentRequest.amountSat) ||
      paymentRequest.amountSat <= 0
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_VALUE_OUT_OF_RANGE,
        `Invalid amount: ${paymentRequest.amountSat}. Amount must be a positive integer representing satoshis`,
        "Payment amount must be a positive whole number of satoshis.",
        {
          providedAmount: paymentRequest.amountSat,
          amountType: typeof paymentRequest.amountSat,
          isInteger: Number.isInteger(paymentRequest.amountSat),
        },
        requestId
      );
    }

    // Validate family members exist
    const [fromMember, toMember] = await Promise.all([
      getFamilyMember(paymentRequest.fromMember),
      getFamilyMember(paymentRequest.toMember),
    ]);

    if (!fromMember && !toMember) {
      throw new AppError(
        ErrorCode.FAMILY_MEMBER_NOT_FOUND,
        `Both family members not found: ${paymentRequest.fromMember}, ${paymentRequest.toMember}`,
        "Neither the sender nor recipient family member was found.",
        {
          fromMember: paymentRequest.fromMember,
          toMember: paymentRequest.toMember,
        },
        requestId
      );
    } else if (!fromMember) {
      throw new AppError(
        ErrorCode.FAMILY_MEMBER_NOT_FOUND,
        `Sender family member not found: ${paymentRequest.fromMember}`,
        "The payment sender was not found in the family.",
        { fromMember: paymentRequest.fromMember },
        requestId
      );
    } else if (!toMember) {
      throw new AppError(
        ErrorCode.FAMILY_MEMBER_NOT_FOUND,
        `Recipient family member not found: ${paymentRequest.toMember}`,
        "The payment recipient was not found in the family.",
        { toMember: paymentRequest.toMember },
        requestId
      );
    }

    const startTime = Date.now();

    try {
      // Create invoice for recipient
      const invoice = await phoenixdClient.createFamilyInvoice(
        paymentRequest.toMember,
        paymentRequest.amountSat,
        paymentRequest.description || "Family payment"
      );

      // Pay the invoice
      const payment = await phoenixdClient.payInvoice(invoice.serialized);

      const response: PaymentResponse = {
        success: true,
        paymentId: payment.paymentId,
        amountSat: payment.sent,
        feeSat: payment.fees,
        routeUsed: "phoenixd_direct",
        processingTimeMs: Date.now() - startTime,
        transactionHash: payment.preimage,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
        },
      });
    } catch (lightningError) {
      // Handle Lightning-specific errors
      const analyzedError = ErrorAnalyzer.analyzeError(
        lightningError,
        "PhoenixD Payment Processing",
        requestId
      );

      const errorResponse: PaymentResponse = {
        success: false,
        paymentId: "",
        amountSat: paymentRequest.amountSat,
        feeSat: 0,
        routeUsed: "failed",
        processingTimeMs: Date.now() - startTime,
        errorMessage: analyzedError.userMessage || analyzedError.message,
      };

      const statusCode =
        analyzedError.code === ErrorCode.LIGHTNING_INSUFFICIENT_BALANCE
          ? 402
          : analyzedError.code === ErrorCode.LIGHTNING_NODE_OFFLINE
            ? 503
            : analyzedError.code === ErrorCode.LIGHTNING_INVOICE_EXPIRED
              ? 410
              : 500;

      return new Response(JSON.stringify(errorResponse), {
        status: statusCode,
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
          "X-Error-Code": analyzedError.code,
        },
      });
    }
  } catch (error) {
    console.error("PhoenixD payment error:", error);

    // Handle validation and other errors
    if (error instanceof AppError) {
      const statusCode =
        error.code === ErrorCode.FAMILY_MEMBER_NOT_FOUND
          ? 404
          : error.code.startsWith("VALIDATION_")
            ? 400
            : 500;

      return ErrorResponseHelper.createErrorResponse(
        error,
        statusCode,
        "PhoenixD Payment",
        requestId
      );
    }

    // Handle unexpected errors
    const analyzedError = ErrorAnalyzer.analyzeError(
      error,
      "PhoenixD Payment",
      requestId
    );
    const errorResponse: PaymentResponse = {
      success: false,
      paymentId: "",
      amountSat: 0,
      feeSat: 0,
      routeUsed: "failed",
      processingTimeMs: 0,
      errorMessage: analyzedError.userMessage || "Payment processing failed",
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
        "X-Error-Code": analyzedError.code,
      },
    });
  }
}
