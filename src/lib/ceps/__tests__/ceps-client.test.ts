/**
 * CEPS Client Interface Layer Tests
 *
 * Verifies that src/lib/ceps/ceps-client.ts exposes a correct, type-safe
 * wrapper around lib/central_event_publishing_service.ts using Vitest.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type {
  CepsClient,
  CepsSessionStatus,
  OTPDeliveryResult,
  RelayHealthReport,
} from "../ceps-client";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCeps: Partial<CepsClient> = {
  publishEvent: vi.fn(),
  publishOptimized: vi.fn(),
  signEventWithActiveSession: vi.fn(),
  list: vi.fn(),
  sendStandardDirectMessage: vi.fn(),
  sendOTPDM: vi.fn(),
  initializeSession: vi.fn(),
  getSessionStatus: vi.fn(),
  destroySession: vi.fn(),
  getRelays: vi.fn(),
  setRelays: vi.fn(),
  npubToHex: vi.fn(),
  encodeNpub: vi.fn(),
  decodeNpub: vi.fn(),
  deriveNpubFromNsec: vi.fn(),
  derivePubkeyHexFromNsec: vi.fn(),
  publishProfile: vi.fn(),
  publishInboxRelaysKind10050: vi.fn(),
  loadAndDecryptContacts: vi.fn(),
  verifyEvent: vi.fn(),
};

// Mock env helper used at module scope in ceps-client
vi.mock("../../../config/env.client", () => ({
  getEnvVar: vi.fn((key: string) =>
    key === "VITE_NOSTR_RELAYS"
      ? "wss://relay1.test,wss://relay2.test"
      : undefined
  ),
}));

// Mock underlying CEPS singleton module
vi.mock("../../../lib/central_event_publishing_service", () => ({
  central_event_publishing_service: mockCeps as CepsClient,
}));

// Import the functions under test *after* mocks
import {
  decodeNpubWithCeps,
  deriveNpubFromNsecWithCeps,
  derivePubkeyHexFromNsecWithCeps,
  encodeNpubWithCeps,
  endSessionWithCeps,
  getCepsClient,
  getDefaultRelays,
  getRelayHealthWithCeps,
  getRelaysWithCeps,
  getSessionStatusWithCeps,
  initializeSessionWithCeps,
  listEventsWithCeps,
  loadContactsWithCeps,
  npubToHexWithCeps,
  publishInboxRelaysWithCeps,
  publishOptimizedWithCeps,
  publishProfileWithCeps,
  sendDirectMessageWithCeps,
  sendGiftwrappedMessageWithCeps,
  sendOTPWithCeps,
  setRelaysWithCeps,
  signEventWithCeps,
  verifyEventWithCeps,
} from "../ceps-client";

describe("CEPS Client Interface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockCeps.getRelays as Mock).mockReturnValue([
      "wss://relay1.test",
      "wss://relay2.test",
    ]);
  });

  it("lazy-loads CEPS singleton and reuses the same instance", async () => {
    const client1 = await getCepsClient();
    const client2 = await getCepsClient();
    expect(client1).toBe(client2);
  });

  it("derives default relays from env helper", () => {
    const relays = getDefaultRelays();
    expect(relays).toEqual(["wss://relay1.test", "wss://relay2.test"]);
  });

  it("forwards event publishing calls and returns IDs", async () => {
    (mockCeps.publishOptimized as Mock).mockResolvedValue("event-id-1");
    const ev = { kind: 1, content: "test" } as unknown as Parameters<
      CepsClient["publishOptimized"]
    >[0];
    const id = await publishOptimizedWithCeps(ev, {
      recipientPubHex: "abc",
      senderPubHex: "def",
      includeFallback: true,
    });
    expect(mockCeps.publishOptimized).toHaveBeenCalledWith(ev, {
      recipientPubHex: "abc",
      senderPubHex: "def",
      includeFallback: true,
    });
    expect(id).toBe("event-id-1");
  });

  it("wraps signing and profile publishing helpers", async () => {
    const unsigned: Record<string, unknown> = { kind: 0 };
    const signedEv = { id: "signed" } as unknown as Parameters<
      CepsClient["verifyEvent"]
    >[0];
    (mockCeps.signEventWithActiveSession as Mock).mockResolvedValue(signedEv);
    const result = await signEventWithCeps(unsigned);
    expect(result).toBe(signedEv);

    (mockCeps.publishProfile as Mock).mockResolvedValue("profile-id");
    const pid = await publishProfileWithCeps("nsec-test", { name: "Alice" });
    expect(mockCeps.publishProfile).toHaveBeenCalled();
    expect(pid).toBe("profile-id");

    (mockCeps.publishInboxRelaysKind10050 as Mock).mockResolvedValue({
      success: true,
      eventId: "inbox-id",
    });
    const inbox = await publishInboxRelaysWithCeps([
      "wss://relay1.test",
      "wss://relay2.test",
    ]);
    expect(inbox.success).toBe(true);
    expect(inbox.eventId).toBe("inbox-id");
  });

  it("sends messages and OTP via CEPS", async () => {
    (mockCeps.sendStandardDirectMessage as Mock).mockResolvedValue("dm-id");
    const id1 = await sendGiftwrappedMessageWithCeps("npub1alice", "hi");
    const id2 = await sendDirectMessageWithCeps("npub1bob", "hello");
    expect(id1).toBe("dm-id");
    expect(id2).toBe("dm-id");

    const otpResult: OTPDeliveryResult = {
      success: true,
      otp: "123456",
      messageId: "otp-id",
      expiresAt: new Date(),
      messageType: "gift-wrap",
    };
    (mockCeps.sendOTPDM as Mock).mockResolvedValue(otpResult);
    const res = await sendOTPWithCeps("npub1alice", "user@test", {
      preferGiftWrap: true,
    });
    expect(res.success).toBe(true);
    expect(res.messageId).toBe("otp-id");
  });

  it("manages sessions via CEPS", async () => {
    (mockCeps.initializeSession as Mock).mockResolvedValue("sess-1");
    const sid = await initializeSessionWithCeps("nip07", {
      ipAddress: "127.0.0.1",
      userAgent: "test",
      ttlHours: 1,
      authMethod: "nip07",
      npub: "npub1alice",
    });
    expect(sid).toBe("sess-1");

    const status: CepsSessionStatus = {
      active: true,
      sessionId: "sess-1",
      contactCount: 0,
      groupCount: 0,
      authMethod: "nip07",
    };
    (mockCeps.getSessionStatus as Mock).mockResolvedValue(status);
    const got = await getSessionStatusWithCeps();
    expect(got.active).toBe(true);

    (mockCeps.destroySession as Mock).mockResolvedValue(undefined);
    await endSessionWithCeps();
    expect(mockCeps.destroySession).toHaveBeenCalled();
  });

  it("reports relay health and forwards relay config", async () => {
    (mockCeps.list as Mock).mockResolvedValue([]);
    const report: RelayHealthReport = await getRelayHealthWithCeps([
      "wss://relay1.test",
    ]);
    expect(report.totalCount).toBe(1);
    expect(report.relays[0].connected).toBe(true);

    (mockCeps.list as Mock).mockRejectedValueOnce(new Error("fail"));
    const errorReport = await getRelayHealthWithCeps(["wss://bad.example"]);
    expect(errorReport.relays[0].connected).toBe(false);
    expect(errorReport.relays[0].error).toContain("fail");

    await setRelaysWithCeps(["wss://relay3.test"]);
    expect(mockCeps.setRelays).toHaveBeenCalledWith(["wss://relay3.test"]);

    const relays = await getRelaysWithCeps();
    expect(mockCeps.getRelays).toHaveBeenCalled();
    expect(Array.isArray(relays)).toBe(true);
  });

  it("wraps key conversion utilities", async () => {
    (mockCeps.npubToHex as Mock).mockReturnValue("hexpub");
    (mockCeps.encodeNpub as Mock).mockReturnValue("npub1xyz");
    (mockCeps.decodeNpub as Mock).mockReturnValue("hexpub2");
    (mockCeps.deriveNpubFromNsec as Mock).mockReturnValue("npub1abc");
    (mockCeps.derivePubkeyHexFromNsec as Mock).mockReturnValue("hex-from-nsec");

    expect(await npubToHexWithCeps("npub1abc")).toBe("hexpub");
    expect(await encodeNpubWithCeps("hexpub")).toBe("npub1xyz");
    expect(await decodeNpubWithCeps("npub1foo")).toBe("hexpub2");
    expect(await deriveNpubFromNsecWithCeps("nsec1...")).toBe("npub1abc");
    expect(await derivePubkeyHexFromNsecWithCeps("nsec1...")).toBe(
      "hex-from-nsec"
    );
  });

  it("wraps event operations and contact loading", async () => {
    const events = [{ id: "e1" }] as unknown as Awaited<
      ReturnType<CepsClient["list"]>
    >;
    (mockCeps.list as Mock).mockResolvedValue(events);
    const listed = await listEventsWithCeps(
      [{ kinds: [1] }],
      ["wss://relay1.test"]
    );
    expect(listed).toEqual(events);

    const contacts = [{ npub: "npub1alice", supportsGiftWrap: true }];
    (mockCeps.loadAndDecryptContacts as Mock).mockResolvedValue(contacts);
    const gotContacts = await loadContactsWithCeps();
    expect(gotContacts[0].npub).toBe("npub1alice");

    (mockCeps.verifyEvent as Mock).mockReturnValue(true);
    const ok = await verifyEventWithCeps(events[0]);
    expect(ok).toBe(true);
  });
});
