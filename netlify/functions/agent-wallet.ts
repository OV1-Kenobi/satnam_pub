import type { Handler } from "@netlify/functions";
import {
  createValidationErrorResponse,
  generateRequestId,
} from "../functions_active/utils/error-handler.js";
import {
  errorResponse,
  jsonResponse,
  preflightResponse,
} from "../functions_active/utils/security-headers.js";
import { parseAgentWalletRoute } from "./agents/agent-wallet-helpers.js";
import { UnifiedWalletService } from "./agents/unified-wallet-service.js";
import { SecureSessionManager } from "./security/session-manager.js";

const parseJsonBody = (body: string | null): Record<string, unknown> => {
  if (!body) return {};
  const parsed = JSON.parse(body) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
};

export const handler: Handler = async (event) => {
  const origin = event.headers.origin;
  const requestId = generateRequestId();

  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(origin);
  }

  const route = parseAgentWalletRoute(event.path);
  if (!route) {
    return errorResponse(404, "Unknown agent wallet route", origin);
  }

  const authHeader =
    event.headers.authorization ?? event.headers.Authorization ?? undefined;
  const session = await SecureSessionManager.validateSessionFromHeader(authHeader);
  if (!session?.isAuthenticated || !session.userId) {
    return errorResponse(401, "Agent wallet requires Bearer JWT authentication", origin);
  }

  const walletService = new UnifiedWalletService(`Bearer ${authHeader?.replace(/^Bearer\s+/i, "") ?? ""}`);

  try {
    if (route === "balance") {
      if (event.httpMethod !== "GET") {
        return errorResponse(405, "Use GET for /v1/agent-wallet", origin);
      }
      const response = await walletService.getBalance(session.userId);
      return jsonResponse(200, response, origin);
    }

    if (route === "history") {
      if (event.httpMethod !== "GET") {
        return errorResponse(405, "Use GET for /v1/agent-wallet/history", origin);
      }
      const response = await walletService.getHistory(
        session.userId,
        event.queryStringParameters?.limit,
        event.queryStringParameters?.offset,
      );
      return jsonResponse(200, response, origin);
    }

    if (event.httpMethod !== "POST") {
      return errorResponse(405, "This agent wallet route requires POST", origin);
    }

    const body = parseJsonBody(event.body ?? null);

    if (route === "pay") {
      const response = await walletService.pay(session.userId, body);
      return jsonResponse(200, response, origin);
    }

    if (route === "send") {
      const response = await walletService.send(session.userId, body);
      return jsonResponse(200, response, origin);
    }

    if (route === "receive") {
      const amountSats = Number(body.amount_sats ?? 0);
      if (!Number.isFinite(amountSats) || amountSats <= 0) {
        return jsonResponse(
          400,
          createValidationErrorResponse(
            "amount_sats must be a positive integer",
            requestId,
          ),
          origin,
        );
      }
      const response = await walletService.receive(session.userId, {
        amount_sats: amountSats,
        rail: typeof body.rail === "string" ? body.rail : undefined,
        memo: typeof body.memo === "string" ? body.memo : undefined,
      });
      return jsonResponse(200, response, origin);
    }

    return errorResponse(404, "Unsupported agent wallet route", origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /requires Bearer|not an agent/i.test(message)
      ? 403
      : /amount_|invoice|Cashu|credit_envelope|max_single_spend|daily_limit/i.test(message)
        ? 400
        : 500;
    return jsonResponse(
      status,
      {
        success: false,
        request_id: requestId,
        error: message,
      },
      origin,
    );
  }
};
