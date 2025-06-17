/**
 * PhoenixD Family Payment API
 * Smart payment routing with PhoenixD optimization
 */

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
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, errorMessage: "Method not allowed" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  try {
    const phoenixdClient = new PhoenixdClient();
    const paymentRequest: PaymentRequest = await req.json();

    // Validate required fields
    if (
      !paymentRequest.fromMember ||
      !paymentRequest.toMember ||
      paymentRequest.amountSat === undefined
    ) {
      return jsonBadRequest(
        "Missing required fields: fromMember, toMember, amountSat"
      );
    }

    // Strong validation for amountSat - must be positive integer
    if (
      !Number.isInteger(paymentRequest.amountSat) ||
      paymentRequest.amountSat <= 0
    ) {
      return jsonBadRequest("amountSat must be a positive integer");
    }

    // Validate family members exist
    const fromMember = await getFamilyMember(paymentRequest.fromMember);
    const toMember = await getFamilyMember(paymentRequest.toMember);

    if (!fromMember || !toMember) {
      return new Response(
        JSON.stringify({
          success: false,
          errorMessage: "One or both family members not found",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const startTime = Date.now();

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
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("PhoenixD payment error:", error);

    const errorResponse: PaymentResponse = {
      success: false,
      paymentId: "",
      amountSat: 0,
      feeSat: 0,
      routeUsed: "failed",
      processingTimeMs: 0,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
