import { describe, it, expect } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  NTAG424ProductionManager,
  type NTAG424SpendOperation,
  type NTAG424SignOperation,
} from "../ntag424-production";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim();
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.substring(i, i + 2), 16);
  }
  return bytes;
}

const TEST_PRIVATE_KEY = "1".repeat(64);

function createManager(): NTAG424ProductionManager {
  // Manager dependencies are not used by the methods under test, so we can
  // safely pass minimal placeholders here.
  return new NTAG424ProductionManager({} as any, {} as any, {} as any);
}

describe("NTAG424ProductionManager operation hashing and signature verification", () => {
  it("computeOperationHash is deterministic and sensitive to field changes", async () => {
    const manager = createManager();

    const baseOperation: NTAG424SpendOperation = {
      uid: "0123456789ABCDEF",
      amount: 1000,
      recipient: "lnbc1...",
      memo: "Test payment",
      paymentType: "lightning",
      requiresGuardianApproval: false,
      guardianThreshold: 0,
      privacyLevel: "standard",
      timestamp: 1700000000000,
      signature: "",
    };

    const op1: NTAG424SpendOperation = { ...baseOperation };
    const op2: NTAG424SpendOperation = { ...baseOperation };

    const hash1 = await (manager as any).computeOperationHash(op1);
    const hash2 = await (manager as any).computeOperationHash(op2);

    expect(hash1).toBe(hash2);

    const op3: NTAG424SpendOperation = { ...baseOperation, amount: 2000 };
    const hash3 = await (manager as any).computeOperationHash(op3);

    expect(hash3).not.toBe(hash1);
  });

  it("verifyOperationSignature accepts a valid secp256k1 signature envelope", async () => {
    const manager = createManager();

    const operation: NTAG424SignOperation = {
      uid: "FEDCBA9876543210",
      message: "Authorize nostr event",
      purpose: "nostr",
      requiresGuardianApproval: false,
      guardianThreshold: 0,
      timestamp: 1700000001000,
      signature: "",
    };

    const messageHashHex = await (manager as any).computeOperationHash(
      operation
    );

    const privateKey = hexToBytes(TEST_PRIVATE_KEY);
    const publicKey = secp256k1.getPublicKey(privateKey, true);
    const msgBytes = hexToBytes(messageHashHex);
    const sigBytes = secp256k1.sign(msgBytes, privateKey);

    const envelope = {
      curve: "secp256k1" as const,
      publicKey: bytesToHex(publicKey),
      signature: bytesToHex(sigBytes),
    };

    const signedOperation: NTAG424SignOperation = {
      ...operation,
      signature: JSON.stringify(envelope),
    };

    const result = await (manager as any).verifyOperationSignature(
      signedOperation
    );
    expect(result).toBe(true);
  });

  it("verifyOperationSignature rejects an invalid secp256k1 signature", async () => {
    const manager = createManager();

    const operation: NTAG424SignOperation = {
      uid: "0011223344556677",
      message: "Authorize nostr event - invalid",
      purpose: "nostr",
      requiresGuardianApproval: false,
      guardianThreshold: 0,
      timestamp: 1700000002000,
      signature: "",
    };

    const messageHashHex = await (manager as any).computeOperationHash(
      operation
    );

    const privateKey = hexToBytes(TEST_PRIVATE_KEY);
    const publicKey = secp256k1.getPublicKey(privateKey, true);
    const msgBytes = hexToBytes(messageHashHex);
    const sigBytes = secp256k1.sign(msgBytes, privateKey);

    // Corrupt the signature by flipping the last nibble
    const sigHex = bytesToHex(sigBytes);
    const lastChar = sigHex[sigHex.length - 1];
    const flippedLastChar = lastChar === "0" ? "1" : "0";
    const invalidSigHex = sigHex.slice(0, -1) + flippedLastChar;

    const envelope = {
      curve: "secp256k1" as const,
      publicKey: bytesToHex(publicKey),
      signature: invalidSigHex,
    };

    const signedOperation: NTAG424SignOperation = {
      ...operation,
      signature: JSON.stringify(envelope),
    };

    const result = await (manager as any).verifyOperationSignature(
      signedOperation
    );
    expect(result).toBe(false);
  });
});
