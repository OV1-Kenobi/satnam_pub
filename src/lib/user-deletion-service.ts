/**
 * User Deletion Service
 * Handles user-initiated account deletion requests with NIP-07 signing
 * and 7-day cooling-off period enforcement
 * @module user-deletion-service
 */

import { central_event_publishing_service as CEPS } from "../../lib/central_event_publishing_service";

// Constants
export const COOLING_OFF_DAYS = 7;
export const DELETION_EVENT_KIND = 30078; // Application-specific data (NIP-78)

// Types
export interface DeletionRequest {
  id: string;
  user_duid: string;
  signed_event: SignedDeletionEvent;
  reason: string;
  requested_at: string;
  cooling_off_ends_at: string;
  cancelled_at: string | null;
  approved_by_admin: string | null;
  approved_at: string | null;
  executed_at: string | null;
  status: DeletionStatus;
}

export type DeletionStatus =
  | "pending" // In cooling-off period
  | "ready" // Cooling-off complete, awaiting admin
  | "approved" // Admin approved, pending execution
  | "executed" // Deletion complete
  | "cancelled"; // User cancelled

export interface SignedDeletionEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface AccountSummary {
  nip05_identifier: string | null;
  federation_membership: string | null;
  wallet_balance_sats: number;
  contacts_count: number;
  messages_count: number;
  attestations_count: number;
  created_at: string;
}

export interface DeletionServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Check if NIP-07 extension is available
export function isNIP07Available(): boolean {
  return typeof window !== "undefined" && !!window.nostr;
}

// Get user's public key from NIP-07
export async function getNIP07PublicKey(): Promise<string | null> {
  if (!isNIP07Available()) return null;
  try {
    return await window.nostr!.getPublicKey();
  } catch {
    return null;
  }
}

// Create unsigned deletion request event
export function createDeletionEventContent(
  userDuid: string,
  nip05: string | null,
  reason: string
): { kind: number; tags: string[][]; content: string } {
  return {
    kind: DELETION_EVENT_KIND,
    tags: [
      ["d", `account-deletion-${userDuid}`],
      ["t", "account-deletion"],
      ["reason", reason],
      ...(nip05 ? [["nip05", nip05]] : []),
    ],
    content: JSON.stringify({
      action: "delete_account",
      user_duid: userDuid,
      nip05: nip05 || undefined,
      reason,
      requested_at: new Date().toISOString(),
      cooling_off_days: COOLING_OFF_DAYS,
    }),
  };
}

// Sign deletion request with NIP-07
export async function signDeletionRequest(
  userDuid: string,
  nip05: string | null,
  reason: string
): Promise<DeletionServiceResult<SignedDeletionEvent>> {
  if (!isNIP07Available()) {
    return {
      success: false,
      error:
        "NIP-07 browser extension not available. Please install Alby, nos2x, or similar.",
    };
  }

  try {
    const pubkey = await window.nostr!.getPublicKey();
    const eventContent = createDeletionEventContent(userDuid, nip05, reason);

    const unsignedEvent = {
      ...eventContent,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
    };

    const signedEvent = await window.nostr!.signEvent(unsignedEvent);

    // Verify signature if CEPS has verification
    try {
      const valid = (
        CEPS as { verifyEvent?: (e: unknown) => boolean }
      ).verifyEvent?.(signedEvent);
      if (valid === false) {
        return {
          success: false,
          error: "Invalid signature from browser extension",
        };
      }
    } catch {
      // Verification not available, proceed
    }

    return { success: true, data: signedEvent as SignedDeletionEvent };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to sign deletion request",
    };
  }
}

// Submit deletion request to backend
export async function submitDeletionRequest(
  signedEvent: SignedDeletionEvent,
  sessionToken: string,
  reason: string = "user_requested"
): Promise<DeletionServiceResult<DeletionRequest>> {
  try {
    const response = await fetch("/api/user/account-deletion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        action: "request_deletion",
        signed_event: signedEvent,
        reason,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || "Failed to submit deletion request",
      };
    }

    return { success: true, data: result.data as DeletionRequest };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error submitting deletion request",
    };
  }
}

// Cancel deletion request during cooling-off period
export async function cancelDeletionRequest(
  requestId: string,
  sessionToken: string
): Promise<DeletionServiceResult<void>> {
  try {
    const response = await fetch("/api/user/account-deletion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        action: "cancel_deletion",
        request_id: requestId,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || "Failed to cancel deletion request",
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error cancelling deletion request",
    };
  }
}

// Get user's pending deletion request (if any)
export async function getPendingDeletionRequest(
  sessionToken: string
): Promise<DeletionServiceResult<DeletionRequest | null>> {
  try {
    const response = await fetch(
      "/api/user/account-deletion?action=get_pending",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || "Failed to get deletion status",
      };
    }

    return { success: true, data: result.data as DeletionRequest | null };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error getting deletion status",
    };
  }
}

// Get user's account summary for deletion preview
export async function getAccountSummary(
  sessionToken: string
): Promise<DeletionServiceResult<AccountSummary>> {
  try {
    const response = await fetch(
      "/api/user/account-deletion?action=get_summary",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || "Failed to get account summary",
      };
    }

    return { success: true, data: result.data as AccountSummary };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error getting account summary",
    };
  }
}

// Calculate time remaining in cooling-off period
export function getCoolingOffTimeRemaining(coolingOffEndsAt: string): {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  totalMs: number;
} {
  const endsAt = new Date(coolingOffEndsAt);
  const now = new Date();
  const totalMs = endsAt.getTime() - now.getTime();

  if (totalMs <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, totalMs: 0 };
  }

  const days = Math.floor(totalMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor(
    (totalMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
  );
  const minutes = Math.floor((totalMs % (60 * 60 * 1000)) / (60 * 1000));

  return { expired: false, days, hours, minutes, totalMs };
}

// Format cooling-off time for display
export function formatCoolingOffTime(coolingOffEndsAt: string): string {
  const { expired, days, hours, minutes } =
    getCoolingOffTimeRemaining(coolingOffEndsAt);

  if (expired) return "Cooling-off period complete";

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
  if (minutes > 0 && days === 0)
    parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);

  return parts.length > 0
    ? parts.join(", ") + " remaining"
    : "Less than a minute";
}
