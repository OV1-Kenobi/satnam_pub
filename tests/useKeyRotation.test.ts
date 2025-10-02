import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---
// Supabase mock with configurable table handlers
const tableHandlers: Record<string, any> = {};
const makeChain = (rows: any[] | null, error: any = null) => {
  const chain: any = {
    _rows: rows,
    _error: error,
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => ({ data: chain._rows, error: chain._error })),
    maybeSingle: vi.fn(() => ({
      data: (chain._rows || [])[0] || null,
      error: chain._error,
    })),
    then: vi.fn((resolve: any) =>
      resolve({ data: chain._rows, error: chain._error })
    ),
  };
  return chain;
};

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "tok123" } },
      })),
      getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })),
    },
    from: vi.fn((table: string) => {
      const h = tableHandlers[table] || makeChain([], null);
      return h;
    }),
  },
}));

// CEPS and PrivacyUtils mocks (match dynamic import specifiers used in hook)
const mockCEPS = {
  loadAndDecryptContacts: vi.fn(async () => []),
  sendStandardDirectMessage: vi.fn(
    async (_npub: string, _content: string) =>
      `ev-${Math.random().toString(36).slice(2)}`
  ),
  sendGiftWrappedDirectMessage: vi.fn(
    async (_contact: any, _content: any) =>
      `gev-${Math.random().toString(36).slice(2)}`
  ),
};
const mockPrivacyUtils = {
  hashIdentifier: vi.fn(async (s: string) => `h:${s}`),
  decryptWithSessionKey: vi.fn(async (enc: string, _key: string) =>
    enc.startsWith("fail:") ? Promise.reject(new Error("dec fail")) : enc
  ),
};
vi.mock("../lib/central_event_publishing_service", () => ({
  central_event_publishing_service: mockCEPS,
  PrivacyUtils: mockPrivacyUtils,
}));
vi.mock("../../lib/central_event_publishing_service", () => ({
  central_event_publishing_service: mockCEPS,
  PrivacyUtils: mockPrivacyUtils,
}));

// Secure session manager mock
vi.mock("../src/lib/secure-nsec-manager", () => ({
  secureNsecManager: {
    getActiveSessionId: vi.fn(() => "sess1"),
    useTemporaryNsec: vi.fn(
      async (_sid: string, op: (hex: string) => Promise<any>) => op("hex")
    ),
  },
}));

// Mock fetch for unified function calls
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch as any;

import { useKeyRotation } from "../src/hooks/useKeyRotation";

function setupDefaultTables() {
  tableHandlers["family_members"] = makeChain([], null);
  tableHandlers["user_identities"] = makeChain([], null);
  tableHandlers["encrypted_contacts"] = makeChain([], null);
  tableHandlers["messaging_sessions"] = makeChain([], null);
  tableHandlers["key_rotation_events"] = {
    _rows: [{ ceps_event_ids: { notifications: ["existing"] } }],
    select: vi.fn(() => tableHandlers["key_rotation_events"]),
    eq: vi.fn(() => tableHandlers["key_rotation_events"]),
    maybeSingle: vi.fn(() => ({
      data: tableHandlers["key_rotation_events"]._rows[0],
    })),
    update: vi.fn((_val: any) => ({
      eq: vi.fn(() => ({ data: {}, error: null })),
    })),
  };
}

describe("useKeyRotation notifications", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setupDefaultTables();
    mockCEPS.sendStandardDirectMessage.mockClear();
    mockCEPS.sendGiftWrappedDirectMessage.mockClear();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves family members and sends notifications", async () => {
    // Memberships and members
    tableHandlers["family_members"] = makeChain([
      { family_federation_id: "f1", user_duid: "u1", is_active: true },
    ]);
    tableHandlers["family_members"].in = vi.fn(() =>
      makeChain([
        { user_duid: "u2", is_active: true },
        { user_duid: "u3", is_active: true },
      ])
    );
    tableHandlers["user_identities"] = makeChain([
      { id: "u2", npub: "npub2" },
      { id: "u3", npub: "npub3" },
    ]);
    // messaging session
    tableHandlers["messaging_sessions"] = makeChain([
      { session_key: "sk", expires_at: new Date().toISOString() },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useKeyRotation());
    await act(async () => {
      const res = await result.current.complete({
        rotationId: "rid",
        oldNpub: "old",
        newNpub: "new",
      });
      expect(res.success).toBe(true);
      expect(res.notifications?.sent).toBe(2);
    });

    expect(mockCEPS.sendStandardDirectMessage).toHaveBeenCalledTimes(2);
  });

  it("decrypts encrypted contacts via CEPS helper", async () => {
    mockCEPS.loadAndDecryptContacts.mockResolvedValueOnce([{ npub: "npubX" }]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useKeyRotation());
    await act(async () => {
      const res = await result.current.complete({
        rotationId: "rid2",
        oldNpub: "old",
        newNpub: "new",
      });
      expect(res.success).toBe(true);
    });

    expect(mockCEPS.loadAndDecryptContacts).toHaveBeenCalled();
    expect(mockCEPS.sendStandardDirectMessage).toHaveBeenCalledTimes(1);
    expect(mockCEPS.sendGiftWrappedDirectMessage).not.toHaveBeenCalled();
  });

  it("falls back to gift-wrapped when CEPS helper fails", async () => {
    mockCEPS.loadAndDecryptContacts.mockRejectedValueOnce(new Error("no key"));
    tableHandlers["encrypted_contacts"] = makeChain([
      { encrypted_npub: "encA", supports_gift_wrap: true },
      { encrypted_npub: "encB", supports_gift_wrap: true },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useKeyRotation());
    await act(async () => {
      const res = await result.current.complete({
        rotationId: "rid2b",
        oldNpub: "old",
        newNpub: "new",
      });
      expect(res.success).toBe(true);
    });

    expect(mockCEPS.sendGiftWrappedDirectMessage).toHaveBeenCalledTimes(2);
  });

  it("merges ceps_event_ids and tolerates failures", async () => {
    // preset existing notifications and capture update payload
    let mergedPayload: any = null;
    tableHandlers["key_rotation_events"].update = vi.fn((val: any) => {
      mergedPayload = val;
      return { eq: vi.fn(() => ({ data: {}, error: null })) };
    });
    // no recipients to force only merge path
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useKeyRotation());
    await act(async () => {
      const res = await result.current.complete({
        rotationId: "rid3",
        oldNpub: "old",
        newNpub: "new",
      });
      expect(res.success).toBe(true);
      expect(mergedPayload).toBeTruthy();
      expect(Array.isArray(mergedPayload.ceps_event_ids.notifications)).toBe(
        true
      );
    });
  });
});
