/**
 * Dual-Mode Nostr Events API
 *
 * Handles both individual and family Nostr event operations with
 * context switching, approval workflows, and federated coordination
 */

import type { Request, Response } from "../../types/netlify-functions";
import {
  EnhancedNostrManager,
  NostrOperationContext,
  OperationMode,
} from "../../lib/enhanced-nostr-manager";

interface NostrEventRequest {
  mode: OperationMode;
  userId: string;
  familyId?: string;
  eventType: number;
  content: string;
  tags?: string[][];
}

interface NostrEventResponse {
  success: boolean;
  eventId?: string;
  operationId?: string;
  requiresApproval?: boolean;
  message: string;
  context: NostrOperationContext;
}

interface AccountInitRequest {
  mode: OperationMode;
  userId: string;
  username: string;
  privateKey?: string;
  familyId?: string;
  familyName?: string;
  parentUserId?: string;
  members?: Array<{
    userId: string;
    username: string;
    publicKey: string;
    role: "parent" | "teen" | "child";
    permissions?: {
      canPublishEvents?: boolean;
      canManageRelays?: boolean;
      canModerate?: boolean;
      requiresApproval?: boolean;
    };
    restrictions?: {
      contentFilter?: "none" | "basic" | "strict";
      timeRestrictions?: {
        allowedHours: { start: number; end: number };
        allowedDays: number[];
      };
      interactionLimits?: {
        maxFollows: number;
        maxDMsPerDay: number;
      };
    };
  }>;
}

interface ApprovalRequest {
  familyId: string;
  operationId: string;
  approverId: string;
}

const nostrManager = new EnhancedNostrManager();

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
  req: NostrEventRequest | AccountInitRequest
): NostrOperationContext {
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
 * Validate Nostr event request
 */
function validateEventRequest(req: any): NostrEventRequest {
  const { eventType, content, tags } = req;

  if (typeof eventType !== "number" || eventType < 0) {
    throw new Error("eventType is required and must be a non-negative number");
  }

  if (!content || typeof content !== "string") {
    throw new Error("content is required and must be a string");
  }

  if (tags !== undefined && !Array.isArray(tags)) {
    throw new Error("tags must be an array of arrays");
  }

  if (
    tags &&
    !tags.every(
      (tag) => Array.isArray(tag) && tag.every((t) => typeof t === "string")
    )
  ) {
    throw new Error("tags must be an array of string arrays");
  }

  return req as NostrEventRequest;
}

export default async function handler(
  req: Request,
  res: Response
) {
  if (req.method === "POST") {
    return handleEventPublish(req, res);
  } else if (req.method === "PUT") {
    if (req.body.operationId) {
      return handleEventApproval(req, res);
    } else {
      return handleAccountInit(req, res);
    }
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
 * Handle Nostr event publishing with dual-mode support
 */
async function handleEventPublish(req: NextApiRequest, res: NextApiResponse) {
  try {
    const eventReq = validateEventRequest(req.body);
    const context = validateContext(eventReq);

    console.log(
      `Publishing ${context.mode} Nostr event for user ${context.userId}`,
      {
        familyId: context.familyId,
        eventType: eventReq.eventType,
        contentLength: eventReq.content.length,
        tagCount: eventReq.tags?.length || 0,
      }
    );

    // Publish event with automatic approval workflow
    const result = await nostrManager.publishEvent(
      context,
      eventReq.eventType,
      eventReq.content,
      eventReq.tags || []
    );

    const response: NostrEventResponse = {
      success: result.success,
      eventId: result.eventId,
      operationId: result.operationId,
      requiresApproval: !!result.operationId && !result.eventId,
      message: result.message,
      context,
    };

    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(response);
  } catch (error) {
    console.error("Event publishing error:", error);
    return res.status(400).json({
      success: false,
      errorMessage:
        error instanceof Error ? error.message : "Event publishing failed",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handle Nostr account initialization
 */
async function handleAccountInit(req: NextApiRequest, res: NextApiResponse) {
  try {
    const initReq = req.body as AccountInitRequest;
    const context = validateContext(initReq);

    console.log(
      `Initializing ${context.mode} Nostr account for user ${context.userId}`
    );

    let accountInfo;

    if (context.mode === "individual") {
      accountInfo = await nostrManager.initializeIndividualAccount(
        initReq.userId,
        initReq.username,
        initReq.privateKey
      );
    } else {
      if (!initReq.familyName || !initReq.parentUserId || !initReq.members) {
        throw new Error(
          "familyName, parentUserId, and members are required for family account initialization"
        );
      }

      accountInfo = await nostrManager.initializeFamilyFederation(
        initReq.familyId!,
        initReq.familyName,
        initReq.parentUserId,
        initReq.members
      );
    }

    return res.status(201).json({
      success: true,
      message: `${context.mode} Nostr account initialized successfully`,
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
 * Handle event approval (family mode only)
 */
async function handleEventApproval(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { familyId, operationId, approverId } = req.body as ApprovalRequest;

    if (!familyId || !operationId || !approverId) {
      throw new Error("familyId, operationId, and approverId are required");
    }

    console.log(
      `Approving event operation ${operationId} in family ${familyId} by ${approverId}`
    );

    const result = await nostrManager.approveEvent(
      familyId,
      operationId,
      approverId
    );

    const response = {
      success: result.success,
      eventId: result.eventId,
      message: result.message,
      operationId,
      approvedBy: approverId,
    };

    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(response);
  } catch (error) {
    console.error("Event approval error:", error);
    return res.status(400).json({
      success: false,
      errorMessage:
        error instanceof Error ? error.message : "Event approval failed",
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

    const accountInfo = nostrManager.getAccountInfo(context);

    if (!accountInfo) {
      return res.status(404).json({
        success: false,
        errorMessage: "Account not found",
        timestamp: new Date().toISOString(),
      });
    }

    // Get recent event operations
    const eventOps = nostrManager.getEventOperations(context);

    // Get pending events (family mode only)
    const pendingEvents =
      context.mode === "family"
        ? nostrManager.getPendingEvents(context.familyId!)
        : [];

    return res.status(200).json({
      success: true,
      account: accountInfo,
      eventOperations: eventOps.slice(-10), // Last 10 operations
      pendingEvents: pendingEvents,
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

export type {
  AccountInitRequest,
  ApprovalRequest,
  NostrEventRequest,
  NostrEventResponse,
};
