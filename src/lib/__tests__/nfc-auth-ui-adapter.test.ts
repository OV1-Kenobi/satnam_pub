import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NFCAuthService,
  type TapToSpendRequest,
  type TapToSignRequest,
} from "../nfc-auth";
import {
  stewardApprovalClient,
  type AwaitApprovalsResult,
} from "../steward/approval-client";
import {
  tapToSpendWithUI,
  tapToSignWithUI,
  type NfcUIResult,
} from "../nfc-auth-ui-adapter";

describe("nfc-auth-ui-adapter", () => {
  let service: NFCAuthService;

  const baseSpendRequest: TapToSpendRequest = {
    amount: 1_000,
    recipient: "lnbc1...",
    memo: "test",
    requiresGuardianApproval: false,
    guardianThreshold: 0,
    privacyLevel: "standard",
  };

  const baseSignRequest: TapToSignRequest = {
    message: "hello",
    purpose: "transaction",
    requiresGuardianApproval: false,
    guardianThreshold: 0,
  };

  beforeEach(() => {
    service = new NFCAuthService();
  });

  it("maps steward policy misconfiguration errors to user-facing message", async () => {
    const svcAny = service as unknown as {
      fetchStewardPolicy?: (op: "spend" | "sign") => Promise<unknown>;
    };

    svcAny.fetchStewardPolicy = vi.fn(async () => {
      throw new Error("Steward policy misconfigured for federation");
    });

    const result = (await tapToSpendWithUI(
      service,
      baseSpendRequest
    )) as NfcUIResult<boolean>;

    expect(result.success).toBe(false);
    expect(result.reason).toBe("policy_misconfigured");
    expect(result.error).toContain("Account approval settings need attention");
  });

  it("maps steward policy fetch failures to connectivity message", async () => {
    const svcAny = service as unknown as {
      fetchStewardPolicy?: (op: "spend" | "sign") => Promise<unknown>;
    };

    svcAny.fetchStewardPolicy = vi.fn(async () => {
      throw new Error("Steward policy service is temporarily unavailable");
    });

    const result = await tapToSpendWithUI(service, baseSpendRequest);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("policy_fetch_failed");
    expect(result.error).toContain("Unable to verify approval requirements");
  });

  it("maps steward approvals rejected to decline message", async () => {
    const svcAny = service as unknown as {
      fetchStewardPolicy?: (op: "spend" | "sign") => Promise<unknown>;
    };

    svcAny.fetchStewardPolicy = vi.fn(async () => ({
      requiresStewardApproval: true,
      stewardThreshold: 1,
      eligibleApproverPubkeys: ["01"],
      eligibleCount: 1,
      federationDuid: "fed",
    }));

    const awaitSpy = vi
      .spyOn(stewardApprovalClient, "awaitApprovals")
      .mockResolvedValue({
        status: "rejected",
        approvals: [],
      } as AwaitApprovalsResult);

    vi.spyOn(service, "tapToSpend").mockImplementation(async () => {
      await stewardApprovalClient.awaitApprovals("hash", {
        required: 1,
        timeoutMs: 1_000,
      } as any);
      return false;
    });

    const result = await tapToSpendWithUI(service, baseSpendRequest);

    expect(awaitSpy).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.reason).toBe("approvals_rejected");
    expect(result.error).toContain(
      "Operation was declined by required approvers."
    );
  });

  it("maps steward approvals expired to timeout message", async () => {
    const svcAny = service as unknown as {
      fetchStewardPolicy?: (op: "spend" | "sign") => Promise<unknown>;
    };

    svcAny.fetchStewardPolicy = vi.fn(async () => ({
      requiresStewardApproval: true,
      stewardThreshold: 1,
      eligibleApproverPubkeys: ["01"],
      eligibleCount: 1,
      federationDuid: "fed",
    }));

    vi.spyOn(stewardApprovalClient, "awaitApprovals").mockResolvedValue({
      status: "expired",
      approvals: [],
    } as AwaitApprovalsResult);

    vi.spyOn(service, "tapToSign").mockImplementation(async () => {
      await stewardApprovalClient.awaitApprovals("hash", {
        required: 1,
        timeoutMs: 1_000,
      } as any);
      return null;
    });

    const result = await tapToSignWithUI(service, baseSignRequest);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("approvals_expired");
    expect(result.error).toContain("Approval request timed out");
  });

  it("maps generic NFC failure to timeout-or-cancelled message", async () => {
    const svcAny = service as unknown as {
      fetchStewardPolicy?: (op: "spend" | "sign") => Promise<unknown>;
    };

    svcAny.fetchStewardPolicy = vi.fn(async () => ({
      requiresStewardApproval: false,
      stewardThreshold: 0,
      eligibleApproverPubkeys: [],
      eligibleCount: 0,
      federationDuid: null,
    }));

    vi.spyOn(service, "tapToSpend").mockResolvedValue(false);

    const result = await tapToSpendWithUI(service, baseSpendRequest);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("nfc_timeout_or_cancelled");
    expect(result.error).toContain("NFC card tap timed out");
  });

  it("returns success when underlying NFC call succeeds", async () => {
    const svcAny = service as unknown as {
      fetchStewardPolicy?: (op: "spend" | "sign") => Promise<unknown>;
    };

    svcAny.fetchStewardPolicy = vi.fn(async () => ({
      requiresStewardApproval: false,
      stewardThreshold: 0,
      eligibleApproverPubkeys: [],
      eligibleCount: 0,
      federationDuid: null,
    }));

    vi.spyOn(service, "tapToSign").mockResolvedValue("signature");

    const result = await tapToSignWithUI(service, baseSignRequest);

    expect(result.success).toBe(true);
    expect(result.data).toBe("signature");
    expect(result.error).toBeUndefined();
  });

  it("correctly isolates approval status between sequential operations", async () => {
    const svcAny = service as unknown as {
      fetchStewardPolicy?: (op: "spend" | "sign") => Promise<unknown>;
    };

    svcAny.fetchStewardPolicy = vi.fn(async () => ({
      requiresStewardApproval: true,
      stewardThreshold: 1,
      eligibleApproverPubkeys: ["01"],
      eligibleCount: 1,
      federationDuid: "fed",
    }));

    // Track sequential calls
    let callCount = 0;
    vi.spyOn(stewardApprovalClient, "awaitApprovals").mockImplementation(
      async () => {
        callCount++;
        // First call: rejected
        if (callCount === 1) {
          return {
            status: "rejected",
            approvals: [],
          } as AwaitApprovalsResult;
        }
        // Second call: approved
        return {
          status: "approved",
          approvals: [],
        } as AwaitApprovalsResult;
      }
    );

    let tapCount = 0;
    vi.spyOn(service, "tapToSpend").mockImplementation(async () => {
      tapCount++;
      await stewardApprovalClient.awaitApprovals("hash", {
        required: 1,
        timeoutMs: 1_000,
      } as any);
      // First call returns false (failure), second returns true (success)
      return tapCount === 1 ? false : true;
    });

    // First operation should report rejection
    const result1 = await tapToSpendWithUI(service, baseSpendRequest);
    expect(result1.success).toBe(false);
    expect(result1.reason).toBe("approvals_rejected");

    // Second operation should report success (not affected by first operation's status)
    const result2 = await tapToSpendWithUI(service, baseSpendRequest);
    expect(result2.success).toBe(true);
  });
});
