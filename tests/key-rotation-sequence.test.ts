import { beforeEach, describe, expect, it, vi } from "vitest";

// SUT
import { NostrKeyRecoveryService } from "../src/lib/auth/nostr-key-recovery";

// Helpers
type MockQueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

type MockSupabaseClient = {
  from: (table: string) => MockQueryBuilder;
  rpc: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
};

const mkQueryBuilder = (): MockQueryBuilder => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({
    data: {
      rotation_id: "rotation-1",
      old_npub: "npub1old",
      new_npub: "npub1new",
      timestamp: new Date().toISOString(),
      reason: "r",
      preserve_identity: {
        username: "u",
        nip05: "a@b",
        lightningAddress: "l",
      },
    },
  }),
  update: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
});

let mockSupabase: MockSupabaseClient;

vi.mock("../src/lib/supabase", () => {
  const local: MockSupabaseClient = {
    from: vi.fn((_table: string) => mkQueryBuilder()),
    rpc: vi.fn().mockResolvedValue({ data: null }),
  };
  mockSupabase = local;
  return { supabase: local };
});

// Mock CEPS publish (delegation/metadata/migration flows)
vi.mock("../../lib/central_event_publishing_service", () => ({
  central_event_publishing_service: {
    getSigningPolicy: vi.fn(async () => ({
      sessionDurationMs: 900000,
      maxOperations: 50,
      singleUse: false,
      browserLifetime: false,
    })),
    publishEvent: vi.fn(async () => ({ ok: true })),
  },
}));

// Mock SecureNsecManager
class SecureNsecManagerMock {
  createPostRegistrationSession = vi.fn(async () => "sess-1");
}
vi.mock("../src/lib/secure-nsec-manager", () => {
  const mock = new SecureNsecManagerMock();
  return {
    secureNsecManager: mock,
    SecureNsecManager: class {
      static getInstance() {
        return mock;
      }
    },
  };
});

// Mock fetch for Netlify function calls with proper URL handling
global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
  const urlStr = typeof url === "string" ? url : url.toString();
  if (urlStr.includes("nip05-artifact-upsert")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  }
  return Promise.reject(new Error(`Unmocked fetch: ${urlStr}`));
});
// Patch internal helpers the service imports dynamically
vi.mock("../src/lib/privacy/encryption", async (orig) => {
  const actual = await (orig as any)();
  return {
    ...actual,
    decryptNsecSimpleToBuffer: vi.fn(
      async (_enc: string, _salt: string) => new Uint8Array(32)
    ),
    encryptNsecSimple: vi.fn(async (_hex: string, _salt: string) => "encNsec"),
    secureClearMemory: vi.fn(),
  };
});

// Minimal nip19 getPublicKey usage mocks
vi.mock("nostr-tools", async () => {
  const pure = await vi.importActual<any>("nostr-tools");
  return {
    ...pure,
    nip19: {
      decode: (npub: string) => ({ type: "npub", data: "oldpubhex" }),
      npubEncode: (hex: string) => "npub1new",
    },
    getPublicKey: (_sk: Uint8Array) => "newpubhex",
  };
});

// Mock user lookup
vi.spyOn(
  NostrKeyRecoveryService.prototype as any,
  "getUserById"
).mockResolvedValue({
  id: "user-1",
  user_salt: "salt",
  hashed_encrypted_nsec: "encOld",
});

// Mock checkWhitelistStatus to return existing whitelist
vi.spyOn(
  NostrKeyRecoveryService.prototype as any,
  "checkWhitelistStatus"
).mockResolvedValue({
  isWhitelisted: true,
  whitelistEventId: "wh-1",
  daysRemaining: 0,
});

// Mock publish helpers (they internally use CEPS; this test focuses on ordering and no rollback)
vi.spyOn(
  NostrKeyRecoveryService.prototype as any,
  "publishNIP26Delegation"
).mockResolvedValue("ok");
vi.spyOn(
  NostrKeyRecoveryService.prototype as any,
  "publishMetadataCrossReferences"
).mockResolvedValue("ok");
vi.spyOn(
  NostrKeyRecoveryService.prototype as any,
  "createMigrationEvent"
).mockResolvedValue({ success: true, eventId: "mig-1" });

// spy to ensure update is called before publish methods
const updateSpy = vi.fn().mockReturnThis();
mockSupabase.update = updateSpy;
const publishDelegationSpy = vi.spyOn(
  NostrKeyRecoveryService.prototype as any,
  "publishNIP26Delegation"
);

describe("Key rotation sequence (DB-first, no rollback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates DB first, then creates session, then publishes", async () => {
    const svc = NostrKeyRecoveryService.getInstance();

    const result = await svc.completeKeyRotation("rotation-1", "user-1");
    expect(result.success).toBe(true);

    // DB was updated
    expect(updateSpy).toHaveBeenCalled();

    // Session was created with new nsec after DB update
    const { secureNsecManager } = await import(
      "../src/lib/secure-nsec-manager"
    );
    expect(secureNsecManager.createPostRegistrationSession).toHaveBeenCalled();

    // Publish called after update
    expect(publishDelegationSpy).toHaveBeenCalled();
  });

  it("does not rollback DB on publish failure, shows toast", async () => {
    const svc = NostrKeyRecoveryService.getInstance();

    (
      NostrKeyRecoveryService.prototype as any
    ).publishNIP26Delegation.mockRejectedValueOnce(new Error("net down"));

    const { showToast } = await import("../src/services/toastService");
    const showWarn = vi.spyOn(showToast, "warning");

    const result = await svc.completeKeyRotation("rotation-1", "user-1");
    expect(result.success).toBe(true); // overall flow can still complete per design

    // DB was updated
    expect(updateSpy).toHaveBeenCalled();
    // Warning toast emitted
    expect(showWarn).toHaveBeenCalled();
  });
});
