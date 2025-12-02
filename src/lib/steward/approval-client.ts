// Steward Approval Client for NFC Auth (Task 5.3)
// NOTE: This file is intentionally kept below 150 lines on initial creation.

import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";
import type { Event } from "nostr-tools";
import {
  shouldRequireNfcMfaForApproval,
  type ApprovalRequestWithNfcMfa,
} from "./approval-nfc-mfa-integration";

// Decisions made by stewards for a given operation
export type StewardApprovalDecision = "approved" | "rejected";

export interface StewardApproval {
  operationHash: string;
  approverFingerprint: string; // hashed/truncated; safe for logs
  approverPubkeyHex: string; // raw pubkey in memory only
  approverNpub: string; // derived from pubkey for UI display
  decision: StewardApprovalDecision;
  receivedAt: string; // ISO timestamp
  protocol: "nip17" | "nip04" | "nip44";
}

export interface ApprovalRecipient {
  pubkeyHex: string; // 64-char hex
}

export interface PublishApprovalRequestsInput {
  operationHash: string;
  operationKind: "ntag424_spend" | "ntag424_sign";
  uidHint: string;
  stewardThreshold: number;
  federationDuid?: string;
  expiresAt: number; // unix seconds
  recipients: ApprovalRecipient[];
  operationAmount?: number; // NEW: for NFC MFA high-value detection
  familyId?: string; // NEW: for NFC MFA policy lookup
}

export interface AwaitApprovalsOptions {
  required: number; // stewardThreshold
  timeoutMs: number;
  federationDuid?: string;
  eligibleApproverPubkeys?: string[]; // hex pubkeys
}

export interface AwaitApprovalsResult {
  status: "approved" | "rejected" | "expired";
  approvals: StewardApproval[];
}

const te = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const data = te.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fingerprintForPubkey(
  pubkeyHex: string,
  federationDuid?: string
): Promise<string> {
  const base = `${pubkeyHex}|${federationDuid || ""}`;
  const full = await sha256Hex(base);
  return full.slice(0, 32); // 128-bit truncated fingerprint
}

export class StewardApprovalClient {
  async publishApprovalRequests(
    input: PublishApprovalRequestsInput
  ): Promise<{ sent: number; failed: number }> {
    const { operationHash, operationKind, uidHint, stewardThreshold } = input;
    const { federationDuid, expiresAt, recipients, operationAmount, familyId } =
      input;
    const opPrefix = operationHash.slice(0, 8);

    let sent = 0;
    let failed = 0;

    // Determine if NFC MFA should be required for this approval
    let nfcMfaRequired = false;
    if (familyId) {
      try {
        nfcMfaRequired = await shouldRequireNfcMfaForApproval(
          familyId,
          operationAmount
        );
      } catch (error) {
        console.warn(
          "[StewardApproval] NFC MFA check failed, defaulting to safe",
          {
            op: opPrefix,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        nfcMfaRequired = true; // Safe default
      }
    }

    await Promise.all(
      recipients.map(async (recipient) => {
        const fingerprint = await fingerprintForPubkey(
          recipient.pubkeyHex,
          federationDuid
        );
        const nonce = crypto
          .getRandomValues(new Uint32Array(1))[0]
          .toString(16);
        const payload: ApprovalRequestWithNfcMfa = {
          type: "steward_approval_request",
          version: 1,
          operationHash,
          operationKind,
          operationAmount, // NEW: for NFC MFA high-value detection
          nfcMfaRequired, // NEW: policy enforcement flag
          nfcMfaPolicy: nfcMfaRequired ? "required" : "disabled", // NEW: policy type
          uidHint,
          stewardThreshold,
          federationDuid,
          expiresAt,
          nonce,
        };
        const plaintext = JSON.stringify(payload);

        try {
          const recipientNpub = CEPS.encodeNpub(recipient.pubkeyHex);
          // Primary path: NIP-17 sealed DM (kind 13) wrapped in kind 1059
          try {
            const inner = CEPS.buildUnsignedKind14DirectMessage(
              plaintext,
              recipient.pubkeyHex
            );
            const sealed = await CEPS.sealKind13WithActiveSession(
              inner,
              recipient.pubkeyHex
            );
            const wrapped = await CEPS.giftWrap1059(
              sealed,
              recipient.pubkeyHex
            );
            const cepsWithPublish = CEPS as unknown as {
              publishOptimized?: (
                event: unknown,
                options?: {
                  recipientPubHex?: string;
                  includeFallback?: boolean;
                }
              ) => Promise<unknown>;
            };
            await cepsWithPublish.publishOptimized?.(wrapped, {
              recipientPubHex: recipient.pubkeyHex,
              includeFallback: true,
            });
            sent++;
            console.log("[StewardApproval] request sent (nip17)", {
              op: opPrefix,
              fp: fingerprint.slice(0, 8),
            });
            return;
          } catch (e) {
            console.warn("[StewardApproval] NIP-17 send failed; falling back", {
              op: opPrefix,
              fp: fingerprint.slice(0, 8),
            });
          }

          // Fallback: NIP-04 / NIP-44 DM
          try {
            await CEPS.sendStandardDirectMessage(recipientNpub, plaintext);
            sent++;
            console.log("[StewardApproval] request sent (nip04/nip44)", {
              op: opPrefix,
              fp: fingerprint.slice(0, 8),
            });
          } catch (e2) {
            failed++;
            console.error("[StewardApproval] request send failed", {
              op: opPrefix,
              fp: fingerprint.slice(0, 8),
              error: e2 instanceof Error ? e2.message : String(e2),
            });
          }
        } catch (outerErr) {
          failed++;
          console.error("[StewardApproval] error preparing request", {
            op: opPrefix,
            error:
              outerErr instanceof Error ? outerErr.message : String(outerErr),
          });
        }
      })
    );

    return { sent, failed };
  }

  async awaitApprovals(
    operationHash: string,
    opts: AwaitApprovalsOptions
  ): Promise<AwaitApprovalsResult> {
    const opPrefix = operationHash.slice(0, 8);
    const required = opts.required;
    const timeoutMs = opts.timeoutMs > 0 ? opts.timeoutMs : 30000;
    const federationDuid = opts.federationDuid;
    const eligibleAuthors =
      opts.eligibleApproverPubkeys && opts.eligibleApproverPubkeys.length
        ? opts.eligibleApproverPubkeys
        : undefined;

    if (required <= 0) {
      return { status: "approved", approvals: [] };
    }

    interface NostrFilter {
      kinds?: number[];
      authors?: string[];
      since?: number;
    }

    const since = Math.floor(Date.now() / 1000);
    const filters: NostrFilter[] = [
      {
        kinds: [1059, 13, 4, 14],
        authors: eligibleAuthors,
        since,
      },
    ];

    const approvalsByFingerprint = new Map<string, StewardApproval>();

    return await new Promise<AwaitApprovalsResult>((resolve) => {
      let subscription: { close?: () => void } | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;

      let settled = false;
      const finish = (status: AwaitApprovalsResult["status"]) => {
        if (settled) return;
        settled = true;
        try {
          if (subscription && typeof subscription.close === "function") {
            subscription.close();
          }
        } catch {}
        if (timer) {
          clearTimeout(timer);
        }
        resolve({
          status,
          approvals: Array.from(approvalsByFingerprint.values()),
        });
      };

      const handleEvent = async (ev: Event) => {
        try {
          let payloadJson: string | null = null;
          let senderPubHex = ev.pubkey;
          let protocol: "nip17" | "nip04" | "nip44" | null = null;

          if (ev.kind === 1059 || ev.kind === 13) {
            const opened = await CEPS.openNip17DmWithActiveSession(ev);
            if (!opened) return;
            senderPubHex = opened.senderPubHex;
            payloadJson = opened.content;
            protocol = "nip17";
          } else if (ev.kind === 4 || ev.kind === 14) {
            const dec =
              await CEPS.decryptStandardDirectMessageWithActiveSession(
                senderPubHex,
                ev.content
              );
            payloadJson = dec.plaintext;
            protocol = dec.protocol;
          } else {
            return;
          }

          if (!payloadJson) return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(payloadJson);
          } catch {
            return;
          }
          if (!parsed || typeof parsed !== "object") return;

          const obj = parsed as {
            type?: string;
            operationHash?: string;
            federationDuid?: string;
            decision?: string;
          };

          if (obj.type !== "steward_approval_response") return;
          if (!obj.operationHash || obj.operationHash !== operationHash) {
            return;
          }
          if (
            federationDuid &&
            obj.federationDuid &&
            obj.federationDuid !== federationDuid
          ) {
            return;
          }
          if (eligibleAuthors && !eligibleAuthors.includes(senderPubHex)) {
            return;
          }

          const decisionValue: StewardApprovalDecision =
            obj.decision === "rejected" ? "rejected" : "approved";
          const fingerprint = await fingerprintForPubkey(
            senderPubHex,
            federationDuid
          );
          const approverNpub = CEPS.encodeNpub(senderPubHex);
          const approval: StewardApproval = {
            operationHash,
            approverFingerprint: fingerprint,
            approverPubkeyHex: senderPubHex,
            approverNpub,
            decision: decisionValue,
            receivedAt: new Date().toISOString(),
            protocol: protocol || "nip17",
          };
          approvalsByFingerprint.set(fingerprint, approval);

          const all = Array.from(approvalsByFingerprint.values());
          const approvedCount = all.filter(
            (a) => a.decision === "approved"
          ).length;
          const rejectedCount = all.filter(
            (a) => a.decision === "rejected"
          ).length;

          console.log("[StewardApproval] decision", {
            op: opPrefix,
            fp: fingerprint.slice(0, 8),
            decision: decisionValue,
            protocol: approval.protocol,
          });

          if (rejectedCount > 0) {
            finish("rejected");
            return;
          }
          if (approvedCount >= required) {
            finish("approved");
          }
        } catch (err) {
          console.warn("[StewardApproval] decision handling failed", {
            op: opPrefix,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      };

      subscription = CEPS.subscribeMany([], filters, {
        onevent: (e: Event) => {
          void handleEvent(e);
        },
        oneose: () => {
          // We keep the subscription open until timeout or threshold/veto
        },
      });

      timer = setTimeout(() => {
        console.log("[StewardApproval] approvals expired", {
          op: opPrefix,
        });
        finish("expired");
      }, timeoutMs);
    });
  }
}

export const stewardApprovalClient = new StewardApprovalClient();
