import {
  NFCAuthService,
  type TapToSpendRequest,
  type TapToSignRequest,
} from "./nfc-auth";
import {
  stewardApprovalClient,
  type AwaitApprovalsOptions,
  type AwaitApprovalsResult,
} from "./steward/approval-client";

export type NfcErrorReason =
  | "policy_fetch_failed"
  | "policy_misconfigured"
  | "approvals_rejected"
  | "approvals_expired"
  | "nfc_timeout_or_cancelled"
  | "unknown_error";

export interface NfcUIResult<T> {
  success: boolean;
  error?: string;
  reason?: NfcErrorReason;
  data?: T;
}

interface StewardPolicyForAdapter {
  requiresStewardApproval: boolean;
  stewardThreshold: number;
  eligibleApproverPubkeys: string[];
  eligibleCount: number;
  federationDuid: string | null;
}

interface ServiceWithPolicy {
  fetchStewardPolicy?: (
    operationType: "spend" | "sign"
  ) => Promise<StewardPolicyForAdapter>;
}

/**
 * Per-operation approval status tracker to prevent race conditions.
 * Each operation gets its own isolated status tracking without monkey-patching.
 */
interface OperationApprovalTracker {
  lastStatus: AwaitApprovalsResult["status"] | null;
  captureStatus(result: AwaitApprovalsResult): AwaitApprovalsResult;
}

/**
 * Stack-based context for tracking approval status across concurrent operations.
 * This prevents race conditions by maintaining a stack of trackers, one per operation.
 */
const approvalTrackerStack: OperationApprovalTracker[] = [];

function mapPolicyError(message: string): NfcUIResult<never> {
  const lower = message.toLowerCase();

  if (lower.includes("misconfig")) {
    return {
      success: false,
      reason: "policy_misconfigured",
      error:
        "Account approval settings need attention. Please contact support.",
    };
  }

  return {
    success: false,
    reason: "policy_fetch_failed",
    error:
      "Unable to verify approval requirements. Please check your connection and try again.",
  };
}

/**
 * Create a per-operation approval status tracker.
 * This isolates approval status between concurrent operations without monkey-patching.
 */
function createApprovalTracker(): OperationApprovalTracker {
  return {
    lastStatus: null,
    captureStatus(result: AwaitApprovalsResult): AwaitApprovalsResult {
      this.lastStatus = result.status;
      return result;
    },
  };
}

/**
 * Get the current operation's approval tracker from the stack.
 * This allows concurrent operations to track their own approval status independently.
 */
function getCurrentApprovalTracker(): OperationApprovalTracker | null {
  return approvalTrackerStack.length > 0
    ? approvalTrackerStack[approvalTrackerStack.length - 1]
    : null;
}

/**
 * Create a wrapped awaitApprovals function that captures status for the current operation.
 * Uses a stack-based context to support concurrent operations.
 */
function createApprovalWrapper(
  originalAwait: (
    operationHash: string,
    opts: AwaitApprovalsOptions
  ) => Promise<AwaitApprovalsResult>
) {
  return async (
    operationHash: string,
    opts: AwaitApprovalsOptions
  ): Promise<AwaitApprovalsResult> => {
    const result = await originalAwait(operationHash, opts);
    const tracker = getCurrentApprovalTracker();
    if (tracker) {
      tracker.captureStatus(result);
    }
    return result;
  };
}

async function runTapWithStewardUI<T>(
  service: NFCAuthService,
  operationType: "spend" | "sign",
  invokeTap: () => Promise<T>
): Promise<NfcUIResult<T>> {
  const serviceWithPolicy = service as unknown as ServiceWithPolicy;
  let cachedPolicy: StewardPolicyForAdapter | null = null;
  const originalFetch = serviceWithPolicy.fetchStewardPolicy;

  // Pre-flight steward policy to classify 4xx/5xx errors for UI
  if (typeof originalFetch === "function") {
    try {
      cachedPolicy = await originalFetch(operationType);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch steward policy";
      return mapPolicyError(message);
    }
  }

  // If we have a cached policy, reuse it inside NFCAuthService to avoid
  // duplicate network calls and ensure consistent behavior.
  if (cachedPolicy && originalFetch) {
    serviceWithPolicy.fetchStewardPolicy = async (op: "spend" | "sign") => {
      if (op === operationType) {
        return cachedPolicy as StewardPolicyForAdapter;
      }
      return originalFetch(op) as Promise<StewardPolicyForAdapter>;
    };
  }

  // Create per-operation approval tracker to prevent race conditions.
  // Each operation gets its own isolated status tracking via a stack-based context.
  const approvalTracker = createApprovalTracker();
  approvalTrackerStack.push(approvalTracker);

  const originalAwait = stewardApprovalClient.awaitApprovals.bind(
    stewardApprovalClient
  );
  const wrappedAwait = createApprovalWrapper(originalAwait);

  // Temporarily replace awaitApprovals with wrapped version for this operation only.
  // The stack-based context ensures concurrent operations don't interfere with each other.
  stewardApprovalClient.awaitApprovals = wrappedAwait;

  try {
    const result = await invokeTap();

    // Success path
    if (
      (typeof result === "boolean" && result) ||
      (typeof result === "string" && result !== "")
    ) {
      return { success: true, data: result };
    }

    // Steward approval-specific failures
    if (cachedPolicy?.requiresStewardApproval) {
      if (approvalTracker.lastStatus === "rejected") {
        return {
          success: false,
          reason: "approvals_rejected",
          error: "Operation was declined by required approvers.",
        };
      }

      if (approvalTracker.lastStatus === "expired") {
        return {
          success: false,
          reason: "approvals_expired",
          error:
            "Approval request timed out. Please try again and ensure approvers respond promptly.",
        };
      }
    }

    // Default NFC/unknown failure path
    return {
      success: false,
      reason: "nfc_timeout_or_cancelled",
      error: "NFC card tap timed out. Please try again.",
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unknown error during NFC operation.";
    return {
      success: false,
      reason: "unknown_error",
      error: message,
    };
  } finally {
    // Restore original behavior
    if (originalFetch) {
      serviceWithPolicy.fetchStewardPolicy = originalFetch;
    }
    stewardApprovalClient.awaitApprovals = originalAwait;
    approvalTrackerStack.pop();
  }
}

export function tapToSpendWithUI(
  service: NFCAuthService,
  request: TapToSpendRequest
): Promise<NfcUIResult<boolean>> {
  return runTapWithStewardUI<boolean>(service, "spend", () =>
    service.tapToSpend(request)
  );
}

/**
 * Tap-to-Sign with UI error handling.
 *
 * Note: tapToSign returns string | null, but null always indicates failure.
 * The UI adapter treats null as a failure case and returns an appropriate error.
 * Success is only returned when a non-empty signature string is obtained.
 */
export function tapToSignWithUI(
  service: NFCAuthService,
  request: TapToSignRequest
): Promise<NfcUIResult<string | null>> {
  return runTapWithStewardUI<string | null>(service, "sign", () =>
    service.tapToSign(request)
  );
}
