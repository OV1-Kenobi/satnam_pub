/**
 * @fileoverview Control Board Service Tests
 * @description Comprehensive tests for the Control Board Service using Vitest
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ControlBoardService from "../../services/control-board";

// Mock dependencies
vi.mock("../lightning-client");
vi.mock("../lightning-address");
vi.mock("../privacy/lnproxy-privacy");
vi.mock("../supabase");
vi.mock("../privacy");
vi.mock("../family-api");

// Mock data
const mockFamilyId = "test_family_123";
const mockFamilyMembers = [
  {
    id: "1",
    username: "dad",
    name: "David",
    role: "parent",
    balance: 1000000,
    dailyLimit: 0,
    nostrPubkey: "npub1abc123",
    lightningAddress: "dad@satnam.pub",
    privacyLevel: "enhanced",
    lastActivity: new Date().toISOString(),
    status: "active",
  },
  {
    id: "2",
    username: "daughter",
    name: "Emma",
    role: "child",
    balance: 50000,
    dailyLimit: 100000,
    nostrPubkey: "npub1def456",
    lightningAddress: "daughter@satnam.pub",
    privacyLevel: "standard",
    lastActivity: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    status: "active",
  },
];

const mockTransactionData = [
  {
    id: "tx1",
    type: "received",
    amount: 50000,
    from_address: "alice@getalby.com",
    to_address: "dad@satnam.pub",
    description: "Payment for services",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    status: "confirmed",
    privacy_enabled: true,
    privacy_fee: 2.5,
    payment_hash: "hash123",
  },
  {
    id: "tx2",
    type: "sent",
    amount: 25000,
    from_address: "dad@satnam.pub",
    to_address: "daughter@satnam.pub",
    description: "Weekly allowance",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    status: "confirmed",
    privacy_enabled: false,
    privacy_fee: 0,
    payment_hash: "hash456",
  },
];

const mockNostrEventData = [
  {
    id: "evt1",
    kind: 1,
    pubkey: "npub1abc123",
    content: "Hello family!",
    created_at: new Date().toISOString(),
    tags: [["p", "npub1def456"]],
    relays: ["wss://relay.damus.io"],
    status: "published",
  },
];

const mockRelayData = [
  {
    url: "wss://relay.damus.io",
    status: "connected",
    last_connected: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    message_count: 1247,
    read_access: true,
    write_access: true,
  },
  {
    url: "wss://nos.lol",
    status: "connected",
    last_connected: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    message_count: 892,
    read_access: true,
    write_access: true,
  },
];

// Mock implementations
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        gte: vi.fn(() => Promise.resolve({ data: [], error: null })),
        single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
    })),
    insert: vi.fn(() => Promise.resolve({ error: null })),
    upsert: vi.fn(() => Promise.resolve({ error: null })),
  })),
};

const mockGetFamilyMembers = vi.fn();
const mockGetFamilyMember = vi.fn();
const mockLogPrivacyOperation = vi.fn();
const mockLightningAddressService = {
  generatePaymentInvoice: vi.fn(),
};

describe("ControlBoardService", () => {
  let service: ControlBoardService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock implementations
    const supabase = require("../supabase");
    supabase.supabase = mockSupabase;

    const familyApi = require("../family-api");
    familyApi.getFamilyMembers = mockGetFamilyMembers;
    familyApi.getFamilyMember = mockGetFamilyMember;

    const privacy = require("../privacy");
    privacy.logPrivacyOperation = mockLogPrivacyOperation;

    // Setup default mock responses
    mockGetFamilyMembers.mockResolvedValue(mockFamilyMembers);

    service = new ControlBoardService(mockFamilyId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getControlBoardStats", () => {
    it("should return comprehensive statistics", async () => {
      // Mock database responses
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "transactions") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({ data: mockTransactionData, error: null }),
                }),
                gte: () =>
                  Promise.resolve({ data: mockTransactionData, error: null }),
              }),
            }),
          };
        }
        if (table === "nostr_relays") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: mockRelayData, error: null }),
            }),
          };
        }
        if (table === "nostr_events") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({ data: mockNostrEventData, error: null }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      });

      const stats = await service.getControlBoardStats();

      expect(stats).toBeDefined();
      expect(stats.lightning).toBeDefined();
      expect(stats.nostr).toBeDefined();
      expect(stats.family).toBeDefined();
      expect(stats.privacy).toBeDefined();

      // Lightning stats
      expect(stats.lightning.totalBalance).toBe(1050000); // Sum of family member balances
      expect(stats.lightning.recentTransactions).toHaveLength(2);

      // Family stats
      expect(stats.family.totalMembers).toBe(2);
      expect(stats.family.verifiedMembers).toBe(2); // Both have nostr pubkeys

      // Privacy stats
      expect(stats.privacy.privacyRate).toBe(50); // 1 out of 2 transactions
      expect(stats.privacy.totalPrivacyTransactions).toBe(1);
    });

    it("should handle database errors gracefully", async () => {
      mockSupabase.from.mockReturnValue({
        select: () => ({
          eq: () =>
            Promise.resolve({ data: null, error: new Error("Database error") }),
        }),
      });

      mockGetFamilyMembers.mockRejectedValue(new Error("Family API error"));

      await expect(service.getControlBoardStats()).rejects.toThrow(
        "Failed to fetch control board statistics",
      );
    });
  });

  describe("getRecentTransactions", () => {
    it("should return formatted transactions", async () => {
      mockSupabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({ data: mockTransactionData, error: null }),
            }),
          }),
        }),
      });

      const transactions = await service.getRecentTransactions(10);

      expect(transactions).toHaveLength(2);
      expect(transactions[0]).toMatchObject({
        id: "tx1",
        type: "received",
        amount: 50000,
        from: "alice@getalby.com",
        to: "dad@satnam.pub",
        status: "confirmed",
        privacyEnabled: true,
      });
      expect(transactions[0].timestamp).toBeInstanceOf(Date);
    });

    it("should return mock data when database is unavailable", async () => {
      mockSupabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({ data: null, error: new Error("DB error") }),
            }),
          }),
        }),
      });

      const transactions = await service.getRecentTransactions(5);

      expect(transactions).toHaveLength(2); // Mock data
      expect(transactions[0].type).toBe("received");
    });
  });

  describe("getNostrRelays", () => {
    it("should return formatted relay data", async () => {
      mockSupabase.from.mockReturnValue({
        select: () => ({
          eq: () => Promise.resolve({ data: mockRelayData, error: null }),
        }),
      });

      const relays = await service.getNostrRelays();

      expect(relays).toHaveLength(2);
      expect(relays[0]).toMatchObject({
        url: "wss://relay.damus.io",
        status: "connected",
        messageCount: 1247,
        readAccess: true,
        writeAccess: true,
      });
      expect(relays[0].lastConnected).toBeInstanceOf(Date);
    });

    it("should return mock data when database fails", async () => {
      mockSupabase.from.mockReturnValue({
        select: () => ({
          eq: () =>
            Promise.resolve({ data: null, error: new Error("DB error") }),
        }),
      });

      const relays = await service.getNostrRelays();

      expect(relays).toHaveLength(3); // Mock data includes 3 relays
      expect(relays[0].url).toBe("wss://relay.damus.io");
    });
  });

  describe("getFamilyMembersExtended", () => {
    it("should return extended family member data", async () => {
      const members = await service.getFamilyMembersExtended();

      expect(members).toHaveLength(2);
      expect(members[0]).toMatchObject({
        id: "1",
        username: "dad",
        displayName: "David",
        role: "parent",
        nostrPubkey: "npub1abc123",
        lightningAddress: "dad@satnam.pub",
        balance: 1000000,
        nostrEnabled: true,
        lightningEnabled: true,
        privacyLevel: "enhanced",
      });
    });

    it("should handle missing optional fields", async () => {
      const minimalMember = {
        id: "3",
        username: "son",
        role: "child",
      };

      mockGetFamilyMembers.mockResolvedValue([minimalMember]);

      const members = await service.getFamilyMembersExtended();

      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({
        id: "3",
        username: "son",
        displayName: "son", // Falls back to username
        role: "child",
        nostrPubkey: "",
        lightningAddress: "son@satnam.pub",
        balance: 0,
        dailyLimit: 0,
        nostrEnabled: false,
        lightningEnabled: false,
        privacyLevel: "standard",
        status: "active",
      });
    });
  });

  describe("sendLightningPayment", () => {
    it("should send payment and log operation", async () => {
      const mockInvoiceResult = {
        invoice: "lnbc1000n1...",
        paymentHash: "hash123",
        address: "daughter@satnam.pub",
        amount: 25000,
        privacyEnabled: true,
      };

      mockLightningAddressService.generatePaymentInvoice.mockResolvedValue(
        mockInvoiceResult,
      );

      // Mock the service's lightning address service
      const originalService = service as any;
      originalService.lightningAddressService = mockLightningAddressService;

      const result = await service.sendLightningPayment({
        from: "dad@satnam.pub",
        to: "daughter@satnam.pub",
        amount: 25000,
        description: "Allowance",
        enablePrivacy: true,
      });

      expect(result).toEqual(mockInvoiceResult);
      expect(mockLogPrivacyOperation).toHaveBeenCalledWith({
        operation: "lightning_payment",
        details: {
          from: "dad@satnam.pub",
          to: "daughter@satnam.pub",
          amount: 25000,
          privacyEnabled: true,
        },
        timestamp: expect.any(Date),
      });

      expect(mockSupabase.from).toHaveBeenCalledWith("transactions");
    });

    it("should handle payment errors", async () => {
      mockLightningAddressService.generatePaymentInvoice.mockRejectedValue(
        new Error("Payment failed"),
      );

      const originalService = service as any;
      originalService.lightningAddressService = mockLightningAddressService;

      await expect(
        service.sendLightningPayment({
          from: "dad@satnam.pub",
          to: "daughter@satnam.pub",
          amount: 25000,
        }),
      ).rejects.toThrow("Payment failed");
    });
  });

  describe("addNostrRelay", () => {
    it("should add relay with default options", async () => {
      await service.addNostrRelay("wss://new-relay.example.com");

      expect(mockSupabase.from).toHaveBeenCalledWith("nostr_relays");
    });

    it("should add relay with custom options", async () => {
      await service.addNostrRelay("wss://read-only.example.com", {
        readAccess: true,
        writeAccess: false,
      });

      expect(mockSupabase.from).toHaveBeenCalledWith("nostr_relays");
    });

    it("should handle database errors", async () => {
      mockSupabase.from.mockReturnValue({
        insert: () => Promise.resolve({ error: new Error("Insert failed") }),
      });

      await expect(
        service.addNostrRelay("wss://failing.example.com"),
      ).rejects.toThrow("Insert failed");
    });
  });

  describe("updatePrivacySettings", () => {
    it("should update privacy settings and log operation", async () => {
      const settings = {
        mode: "enhanced" as const,
        enableLnproxy: true,
        maxPrivacyFeePercent: 3,
      };

      await service.updatePrivacySettings(settings);

      expect(mockSupabase.from).toHaveBeenCalledWith("family_privacy_settings");
      expect(mockLogPrivacyOperation).toHaveBeenCalledWith({
        operation: "privacy_settings_update",
        details: settings,
        timestamp: expect.any(Date),
      });
    });
  });

  describe("getPrivacySettings", () => {
    it("should return existing privacy settings", async () => {
      const mockSettings = {
        mode: "enhanced",
        enableLnproxy: true,
        enableTorRouting: false,
        enableEventEncryption: true,
        relayRotation: true,
        autoPrivacyFees: false,
        maxPrivacyFeePercent: 3,
      };

      mockSupabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: mockSettings, error: null }),
          }),
        }),
      });

      const settings = await service.getPrivacySettings();

      expect(settings).toEqual(mockSettings);
    });

    it("should return default settings when none exist", async () => {
      mockSupabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: null, error: { code: "PGRST116" } }),
          }),
        }),
      });

      const settings = await service.getPrivacySettings();

      expect(settings).toEqual({
        mode: "standard",
        enableLnproxy: false,
        enableTorRouting: false,
        enableEventEncryption: false,
        relayRotation: false,
        autoPrivacyFees: false,
        maxPrivacyFeePercent: 5,
      });
    });
  });

  describe("healthCheck", () => {
    it("should return healthy status when all systems are up", async () => {
      // Mock successful relay check
      mockSupabase.from.mockReturnValue({
        select: () => ({
          eq: () => Promise.resolve({ data: mockRelayData, error: null }),
          limit: () => Promise.resolve({ data: [{ id: "test" }], error: null }),
        }),
      });

      const health = await service.healthCheck();

      expect(health.overall).toBe("healthy");
      expect(health.lightning).toBe(true);
      expect(health.nostr).toBe(true);
      expect(health.database).toBe(true);
    });

    it("should return degraded status when some systems fail", async () => {
      // Mock failed database check
      mockSupabase.from.mockReturnValue({
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }), // No connected relays
          limit: () =>
            Promise.resolve({ data: null, error: new Error("DB error") }),
        }),
      });

      const health = await service.healthCheck();

      expect(health.overall).toBe("degraded");
      expect(health.nostr).toBe(false); // No connected relays
      expect(health.database).toBe(false); // DB error
    });

    it("should handle health check errors", async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error("Supabase unavailable");
      });

      const health = await service.healthCheck();

      expect(health.overall).toBe("error");
      expect(health.lightning).toBe(false);
      expect(health.nostr).toBe(false);
      expect(health.database).toBe(false);
    });
  });
});
