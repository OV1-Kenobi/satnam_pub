import { describe, it, expect, vi, afterEach } from "vitest";
import {
  NFCAuthService,
  type NTAG424DNAAuth,
  type TapToSpendRequest,
  type TapToSignRequest,
} from "../nfc-auth";
import {
  ntag424Manager,
  type NTAG424SpendOperation,
  type NTAG424SignOperation,
} from "../ntag424-production";
import { stewardApprovalClient } from "../steward/approval-client";

describe("NFCAuthService NTAG424 operation producers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseAuth: NTAG424DNAAuth = {
    uid: "0123456789ABCDEF",
    familyId: "satnam.pub",
    applicationId: "nfc-auth-v1",
    keyId: 0,
    keyVersion: 1,
    signature: "test-signature",
    timestamp: 1700000000000,
    nonce: "nonce",
  };

  const baseSpendRequest: TapToSpendRequest = {
    amount: 1000,
    recipient: "lnbc1...",
    memo: "Test payment",
    requiresGuardianApproval: false,
    guardianThreshold: 0,
    privacyLevel: "standard",
  };

  const baseSignRequest: TapToSignRequest = {
    message: "Sign this message",
    purpose: "transaction",
    requiresGuardianApproval: false,
    guardianThreshold: 0,
  };

  it("createSignedSpendOperation builds a P-256 signed spend operation envelope", async () => {
    const service = new NFCAuthService();

    const getHashMock = vi
      .spyOn(ntag424Manager, "getOperationHashForClient")
      .mockResolvedValue("aa".repeat(32));

    const publicKeyHex = "11".repeat(33);
    const signatureHex = "22".repeat(64);

    (service as any).signOperationHashWithP256 = vi
      .fn()
      .mockResolvedValue({ publicKeyHex, signatureHex });

    const operation = await (service as any).createSignedSpendOperation(
      baseSpendRequest,
      baseAuth
    );

    expect(getHashMock).toHaveBeenCalledTimes(1);
    expect(operation.uid).toBe(baseAuth.uid);
    expect(operation.amount).toBe(baseSpendRequest.amount);
    expect(typeof operation.signature).toBe("string");

    const envelope = JSON.parse(operation.signature) as {
      curve: string;
      publicKey: string;
      signature: string;
    };

    expect(envelope.curve).toBe("P-256");
    expect(envelope.publicKey).toBe(publicKeyHex);
    expect(envelope.signature).toBe(signatureHex);
  });

  it("createSignedSignOperation uses secp256k1 envelope for nostr purpose", async () => {
    const service = new NFCAuthService();

    const getHashMock = vi
      .spyOn(ntag424Manager, "getOperationHashForClient")
      .mockResolvedValue("bb".repeat(32));

    const publicKeyHex = "33".repeat(33);
    const signatureHex = "44".repeat(64);

    (service as any).signOperationHashWithSecp256k1 = vi
      .fn()
      .mockResolvedValue({ publicKeyHex, signatureHex });

    const nostrRequest: TapToSignRequest = {
      ...baseSignRequest,
      purpose: "nostr",
      signingSessionId: "session-123",
    };

    const operation = await (service as any).createSignedSignOperation(
      nostrRequest,
      baseAuth
    );

    expect(getHashMock).toHaveBeenCalledTimes(1);
    expect(operation.purpose).toBe("nostr");

    const envelope = JSON.parse(operation.signature) as {
      curve: string;
      publicKey: string;
      signature: string;
    };

    expect(envelope.curve).toBe("secp256k1");
    expect(envelope.publicKey).toBe(publicKeyHex);
    expect(envelope.signature).toBe(signatureHex);
  });

  it("createSignedSignOperation uses P-256 envelope for non-nostr purposes", async () => {
    const service = new NFCAuthService();

    const getHashMock = vi
      .spyOn(ntag424Manager, "getOperationHashForClient")
      .mockResolvedValue("cc".repeat(32));

    const publicKeyHex = "55".repeat(33);
    const signatureHex = "66".repeat(64);

    (service as any).signOperationHashWithP256 = vi
      .fn()
      .mockResolvedValue({ publicKeyHex, signatureHex });

    const operation = await (service as any).createSignedSignOperation(
      baseSignRequest,
      baseAuth
    );

    expect(getHashMock).toHaveBeenCalledTimes(1);
    expect(operation.purpose).toBe("transaction");

    const envelope = JSON.parse(operation.signature) as {
      curve: string;
      publicKey: string;
      signature: string;
    };

    expect(envelope.curve).toBe("P-256");
    expect(envelope.publicKey).toBe(publicKeyHex);
    expect(envelope.signature).toBe(signatureHex);
  });

  it("tapToSpend wires through to ntag424Manager.executeTapToSpend with signed operation", async () => {
    const service = new NFCAuthService();

    // No steward approvals required for this wiring test
    (service as any).fetchStewardPolicy = vi.fn().mockResolvedValue({
      requiresStewardApproval: false,
      stewardThreshold: 0,
      eligibleApproverPubkeys: [],
      eligibleCount: 0,
      federationDuid: null,
    });

    const fakeAuth: NTAG424DNAAuth = {
      ...baseAuth,
      uid: "A1B2C3D4E5F60708",
    };

    const signedOperation: NTAG424SpendOperation = {
      uid: fakeAuth.uid,
      amount: baseSpendRequest.amount,
      recipient: baseSpendRequest.recipient,
      memo: baseSpendRequest.memo,
      paymentType: "lightning",
      requiresGuardianApproval: false,
      guardianThreshold: 0,
      privacyLevel: "standard",
      timestamp: 1700000000001,
      signature: JSON.stringify({
        curve: "P-256",
        publicKey: "77".repeat(33),
        signature: "88".repeat(64),
      }),
    };

    (service as any).startListening = vi.fn().mockResolvedValue(undefined);
    (service as any).stopListening = vi.fn().mockResolvedValue(undefined);
    (service as any).registerAuthCallback = vi
      .fn()
      .mockImplementation(
        (_uid: string, cb: (auth: NTAG424DNAAuth) => void) => {
          cb(fakeAuth);
        }
      );

    (service as any).createSignedSpendOperation = vi
      .fn()
      .mockResolvedValue(signedOperation);

    const executeMock = vi
      .spyOn(ntag424Manager, "executeTapToSpend")
      .mockResolvedValue(true);

    const result = await service.tapToSpend(baseSpendRequest);

    expect(result).toBe(true);
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith(signedOperation);
  });

  it("tapToSign wires through to ntag424Manager.executeTapToSign with signed operation", async () => {
    const service = new NFCAuthService();

    // No steward approvals required for this wiring test
    (service as any).fetchStewardPolicy = vi.fn().mockResolvedValue({
      requiresStewardApproval: false,
      stewardThreshold: 0,
      eligibleApproverPubkeys: [],
      eligibleCount: 0,
      federationDuid: null,
    });

    const fakeAuth: NTAG424DNAAuth = {
      ...baseAuth,
      uid: "0F1E2D3C4B5A6978",
    };

    const signedOperation: NTAG424SignOperation = {
      uid: fakeAuth.uid,
      message: baseSignRequest.message,
      purpose: "nostr",
      requiresGuardianApproval: false,
      guardianThreshold: 0,
      timestamp: 1700000000002,
      signature: JSON.stringify({
        curve: "secp256k1",
        publicKey: "99".repeat(33),
        signature: "AA".repeat(64),
      }),
    };

    (service as any).startListening = vi.fn().mockResolvedValue(undefined);
    (service as any).stopListening = vi.fn().mockResolvedValue(undefined);
    (service as any).registerAuthCallback = vi
      .fn()
      .mockImplementation(
        (_uid: string, cb: (auth: NTAG424DNAAuth) => void) => {
          cb(fakeAuth);
        }
      );

    (service as any).createSignedSignOperation = vi
      .fn()
      .mockResolvedValue(signedOperation);

    const executeMock = vi
      .spyOn(ntag424Manager, "executeTapToSign")
      .mockResolvedValue("signed-value");

    const result = await service.tapToSign({
      ...baseSignRequest,
      purpose: "nostr",
      signingSessionId: "session-456",
    });

    expect(result).toBe("signed-value");
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith(signedOperation);
  });

  it("tapToSpend enforces steward approvals when required and proceeds on approval", async () => {
    const service = new NFCAuthService();

    const fakeAuth: NTAG424DNAAuth = {
      ...baseAuth,
      uid: "CAFEBABECAFEBABE",
    };

    // Require steward approval
    (service as any).fetchStewardPolicy = vi.fn().mockResolvedValue({
      requiresStewardApproval: true,
      stewardThreshold: 1,
      eligibleApproverPubkeys: ["ab".repeat(32)],
      eligibleCount: 1,
      federationDuid: "fed-duid-1",
    });

    (service as any).startListening = vi.fn().mockResolvedValue(undefined);
    (service as any).stopListening = vi.fn().mockResolvedValue(undefined);
    (service as any).registerAuthCallback = vi
      .fn()
      .mockImplementation(
        (_uid: string, cb: (auth: NTAG424DNAAuth) => void) => {
          cb(fakeAuth);
        }
      );

    // Operation hashing for both unsigned + signed operations
    vi.spyOn(ntag424Manager, "getOperationHashForClient").mockResolvedValue(
      "hash".repeat(16)
    );

    (stewardApprovalClient as any).publishApprovalRequests = vi
      .fn()
      .mockResolvedValue({ sent: 1, failed: 0 });
    (stewardApprovalClient as any).awaitApprovals = vi
      .fn()
      .mockResolvedValue({ status: "approved", approvals: [] });

    const signedOperation: NTAG424SpendOperation = {
      uid: fakeAuth.uid,
      amount: baseSpendRequest.amount,
      recipient: baseSpendRequest.recipient,
      memo: baseSpendRequest.memo,
      paymentType: "lightning",
      requiresGuardianApproval: false,
      guardianThreshold: 0,
      privacyLevel: "standard",
      timestamp: 1700000000003,
      signature: JSON.stringify({
        curve: "P-256",
        publicKey: "11".repeat(33),
        signature: "22".repeat(64),
      }),
    };

    (service as any).createSignedSpendOperation = vi
      .fn()
      .mockResolvedValue(signedOperation);

    const executeMock = vi
      .spyOn(ntag424Manager, "executeTapToSpend")
      .mockResolvedValue(true);

    const result = await service.tapToSpend(baseSpendRequest);

    expect(result).toBe(true);
    expect(stewardApprovalClient.publishApprovalRequests).toHaveBeenCalled();
    expect(stewardApprovalClient.awaitApprovals).toHaveBeenCalled();
    expect(executeMock).toHaveBeenCalledWith(signedOperation);
  });

  it("tapToSpend aborts when steward approvals are rejected", async () => {
    const service = new NFCAuthService();

    const fakeAuth: NTAG424DNAAuth = {
      ...baseAuth,
      uid: "DEADBEEFDEADBEEF",
    };

    (service as any).fetchStewardPolicy = vi.fn().mockResolvedValue({
      requiresStewardApproval: true,
      stewardThreshold: 1,
      eligibleApproverPubkeys: ["cd".repeat(32)],
      eligibleCount: 1,
      federationDuid: "fed-duid-2",
    });

    (service as any).startListening = vi.fn().mockResolvedValue(undefined);
    (service as any).stopListening = vi.fn().mockResolvedValue(undefined);
    (service as any).registerAuthCallback = vi
      .fn()
      .mockImplementation(
        (_uid: string, cb: (auth: NTAG424DNAAuth) => void) => {
          cb(fakeAuth);
        }
      );

    vi.spyOn(ntag424Manager, "getOperationHashForClient").mockResolvedValue(
      "hash".repeat(16)
    );

    (stewardApprovalClient as any).publishApprovalRequests = vi
      .fn()
      .mockResolvedValue({ sent: 1, failed: 0 });
    (stewardApprovalClient as any).awaitApprovals = vi
      .fn()
      .mockResolvedValue({ status: "rejected", approvals: [] });

    const executeMock = vi
      .spyOn(ntag424Manager, "executeTapToSpend")
      .mockResolvedValue(true);

    const result = await service.tapToSpend(baseSpendRequest);

    expect(result).toBe(false);
    expect(stewardApprovalClient.publishApprovalRequests).toHaveBeenCalled();
    expect(stewardApprovalClient.awaitApprovals).toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("tapToSpend aborts cleanly when steward policy fetch fails", async () => {
    const service = new NFCAuthService();

    (service as any).fetchStewardPolicy = vi
      .fn()
      .mockRejectedValue(new Error("policy error"));

    const startSpy = vi.spyOn(service as any, "startListening");
    const executeSpy = vi.spyOn(ntag424Manager, "executeTapToSpend");

    const result = await service.tapToSpend(baseSpendRequest);

    expect(result).toBe(false);
    expect(startSpy).not.toHaveBeenCalled();
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("tapToSign enforces steward approvals when required and proceeds on approval", async () => {
    const service = new NFCAuthService();

    const fakeAuth: NTAG424DNAAuth = {
      ...baseAuth,
      uid: "FEEDFACEFEEDFACE",
    };

    (service as any).fetchStewardPolicy = vi.fn().mockResolvedValue({
      requiresStewardApproval: true,
      stewardThreshold: 1,
      eligibleApproverPubkeys: ["ef".repeat(32)],
      eligibleCount: 1,
      federationDuid: "fed-duid-3",
    });

    (service as any).startListening = vi.fn().mockResolvedValue(undefined);
    (service as any).stopListening = vi.fn().mockResolvedValue(undefined);
    (service as any).registerAuthCallback = vi
      .fn()
      .mockImplementation(
        (_uid: string, cb: (auth: NTAG424DNAAuth) => void) => {
          cb(fakeAuth);
        }
      );

    vi.spyOn(ntag424Manager, "getOperationHashForClient").mockResolvedValue(
      "hash".repeat(16)
    );

    (stewardApprovalClient as any).publishApprovalRequests = vi
      .fn()
      .mockResolvedValue({ sent: 1, failed: 0 });
    (stewardApprovalClient as any).awaitApprovals = vi
      .fn()
      .mockResolvedValue({ status: "approved", approvals: [] });

    const signedOperation: NTAG424SignOperation = {
      uid: fakeAuth.uid,
      message: baseSignRequest.message,
      purpose: "nostr",
      requiresGuardianApproval: false,
      guardianThreshold: 0,
      timestamp: 1700000000004,
      signature: JSON.stringify({
        curve: "secp256k1",
        publicKey: "33".repeat(33),
        signature: "44".repeat(64),
      }),
    };

    (service as any).createSignedSignOperation = vi
      .fn()
      .mockResolvedValue(signedOperation);

    const executeMock = vi
      .spyOn(ntag424Manager, "executeTapToSign")
      .mockResolvedValue("signed-value-steward");

    const result = await service.tapToSign({
      ...baseSignRequest,
      purpose: "nostr",
      signingSessionId: "session-789",
    });

    expect(result).toBe("signed-value-steward");
    expect(stewardApprovalClient.publishApprovalRequests).toHaveBeenCalled();
    expect(stewardApprovalClient.awaitApprovals).toHaveBeenCalled();
    expect(executeMock).toHaveBeenCalledWith(signedOperation);
  });

  it("tapToSign aborts cleanly when steward policy fetch fails", async () => {
    const service = new NFCAuthService();

    (service as any).fetchStewardPolicy = vi
      .fn()
      .mockRejectedValue(new Error("policy error"));

    const startSpy = vi.spyOn(service as any, "startListening");
    const executeSpy = vi.spyOn(ntag424Manager, "executeTapToSign");

    const result = await service.tapToSign({
      ...baseSignRequest,
      purpose: "nostr",
      signingSessionId: "session-000",
    });

    expect(result).toBeNull();
    expect(startSpy).not.toHaveBeenCalled();
    expect(executeSpy).not.toHaveBeenCalled();
  });
});
