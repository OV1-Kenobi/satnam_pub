// @vitest-environment jsdom
import { render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock nostr-tools methods used by the hook
vi.mock("nostr-tools", () => ({
  getPublicKey: vi.fn(() => "pubkey-from-bytes"),
  finalizeEvent: vi.fn((event: any) => ({ ...event, id: "id", sig: "sig" })),
}));

// Mock privacy encryption to return a stable byte array and to track wipes
const wipeSpy = vi.fn();
vi.mock("../../privacy/encryption", async () => {
  return {
    decryptNsecBytes: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
    secureClearMemory: vi.fn(async (_items: any) => wipeSpy()),
  };
});

// Mock user-identities-auth to return a record with hashed_encrypted_nsec
vi.mock("../../auth/user-identities-auth", () => ({
  userIdentitiesAuth: {
    getUserById: vi.fn(async (_id: string) => ({
      hashed_encrypted_nsec: "base64cipher",
    })),
  },
}));

// Minimal mock of useAuth to satisfy the hook
vi.mock("../../../components/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "uid", user_salt: "salt" },
    authenticated: true,
  }),
}));

import { useSecureMessageSigning } from "../secure-message-signing";

type HookRef = { current: any };
function TestComponent({ hookRef }: { hookRef: HookRef }) {
  const hook = useSecureMessageSigning();
  React.useEffect(() => {
    hookRef.current = hook;
  }, [hook, hookRef]);
  return null;
}

function setupHook() {
  const hookRef: HookRef = { current: null };
  render(React.createElement(TestComponent, { hookRef }));
  return hookRef;
}

describe("useSecureMessageSigning - encrypted nsec bytes path", () => {
  beforeEach(() => {
    wipeSpy.mockClear();
  });

  it("retrieves bytes, signs using bytes, and wipes the buffer", async () => {
    const hookRef = setupHook();

    // Wait a microtask for effect to run
    await Promise.resolve();

    const event = { kind: 1, content: "hello", tags: [] } as any;
    const consent = {
      granted: true,
      warningAcknowledged: true,
      sessionId: "s",
      expiresAt: Date.now() + 60_000,
      timestamp: Date.now(),
    } as any;

    const result = await hookRef.current.signWithEncryptedNsec(event, consent);

    expect(result.success).toBe(true);
    expect(wipeSpy).toHaveBeenCalled();
  });
});
