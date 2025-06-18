// hooks/__tests__/useFedimint.test.ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useFederationClient, useFedimint } from "../useFedimint";

// Mock the FederationManager
const mockFederationManager = {
  listFederations: vi.fn(),
  createFederation: vi.fn(),
  joinFederation: vi.fn(),
  connectToFederation: vi.fn(),
  deleteFederation: vi.fn(),
  getClient: vi.fn(),
  getFederation: vi.fn(),
};

const mockClient = {
  isConnected: vi.fn(),
  connect: vi.fn(),
  getBalance: vi.fn(),
  createInvoice: vi.fn(),
  payInvoice: vi.fn(),
  issueECash: vi.fn(),
};

const mockECashNotes = [
  { note: "note1", amount: 500 },
  { note: "note2", amount: 500 },
];

vi.mock("@/lib/fedimint/federation-manager", () => ({
  FederationManager: vi.fn().mockImplementation(() => mockFederationManager),
}));

vi.mock("@/lib/fedimint/client", () => ({
  FedimintClient: vi.fn(),
}));

const mockFederations = [
  {
    id: "test-federation-1",
    name: "Test Federation",
    description: "A test federation",
    guardians: [
      {
        id: "guardian-1",
        url: "http://test.com",
        publicKey: "key1",
        status: "online" as const,
        lastSeen: new Date(),
      },
    ],
    threshold: 1,
    currency: "BTC" as const,
    epochHeight: 100,
    createdAt: new Date(),
  },
];

describe("useFedimint Hook", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock implementations
    mockFederationManager.listFederations.mockReturnValue(mockFederations);
    mockFederationManager.createFederation.mockResolvedValue(
      "new-federation-id",
    );
    mockFederationManager.joinFederation.mockResolvedValue(
      "joined-federation-id",
    );
    mockFederationManager.connectToFederation.mockResolvedValue(true);
    mockFederationManager.deleteFederation.mockResolvedValue(undefined);
  });

  test("should load federations on mount", async () => {
    const { result } = renderHook(() => useFedimint());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.federations).toHaveLength(1);
    expect(result.current.federations[0].name).toBe("Test Federation");
    expect(result.current.error).toBeNull();
    expect(mockFederationManager.listFederations).toHaveBeenCalled();
  });

  test("should create federation successfully", async () => {
    const { result } = renderHook(() => useFedimint());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let federationId: string = "";
    await act(async () => {
      federationId = await result.current.createFederation(
        "New Federation",
        "Description",
        ["http://guardian1.com"],
        1,
      );
    });

    expect(federationId).toBe("new-federation-id");
    expect(result.current.error).toBeNull();
    expect(mockFederationManager.createFederation).toHaveBeenCalledWith(
      "New Federation",
      "Description",
      ["http://guardian1.com"],
      1,
    );
  });

  test("should join federation successfully", async () => {
    const { result } = renderHook(() => useFedimint());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let federationId: string = "";
    await act(async () => {
      federationId = await result.current.joinFederation("invite-code-123");
    });

    expect(federationId).toBe("joined-federation-id");
    expect(result.current.error).toBeNull();
    expect(mockFederationManager.joinFederation).toHaveBeenCalledWith(
      "invite-code-123",
    );
  });

  test("should connect to federation successfully", async () => {
    const { result } = renderHook(() => useFedimint());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let connected: boolean = false;
    await act(async () => {
      connected = await result.current.connectToFederation("test-federation-1");
    });

    expect(connected).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockFederationManager.connectToFederation).toHaveBeenCalledWith(
      "test-federation-1",
    );
  });

  test("should delete federation successfully", async () => {
    const { result } = renderHook(() => useFedimint());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteFederation("test-federation-1");
    });

    expect(result.current.error).toBeNull();
    expect(mockFederationManager.deleteFederation).toHaveBeenCalledWith(
      "test-federation-1",
    );
  });

  test("should handle errors gracefully", async () => {
    // Mock an error scenario
    mockFederationManager.listFederations.mockImplementation(() => {
      throw new Error("Connection failed");
    });

    const { result } = renderHook(() => useFedimint());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Connection failed");
    expect(result.current.federations).toHaveLength(0);
  });

  test("should refresh federations", async () => {
    const { result } = renderHook(() => useFedimint());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.refreshFederations();
    });

    expect(result.current.error).toBeNull();
    expect(mockFederationManager.listFederations).toHaveBeenCalledTimes(2); // Once on mount, once on refresh
  });

  test("should handle async errors in operations", async () => {
    mockFederationManager.createFederation.mockRejectedValue(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useFedimint());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      try {
        await result.current.createFederation(
          "Test",
          "Desc",
          ["http://test.com"],
          1,
        );
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    });

    expect(result.current.error).toBe("Network error");
  });
});

describe("useFederationClient Hook", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock implementations
    mockFederationManager.getClient.mockReturnValue(mockClient);
    mockClient.isConnected.mockReturnValue(true);
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.getBalance.mockResolvedValue(1000);
    mockClient.createInvoice.mockResolvedValue("invoice-123");
    mockClient.payInvoice.mockResolvedValue("payment-hash-123");
    mockClient.issueECash.mockResolvedValue(mockECashNotes);
  });

  test("should return null client when no federationId provided", () => {
    const { result } = renderHook(() => useFederationClient(null));

    expect(result.current.client).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.balance).toBe(0);
  });

  test("should load client and connect when federationId provided", async () => {
    const { result } = renderHook(() =>
      useFederationClient("test-federation-1"),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.client).toBeTruthy();
    expect(result.current.connected).toBe(true);
    expect(result.current.balance).toBe(1000);
    expect(result.current.error).toBeNull();
    expect(mockFederationManager.getClient).toHaveBeenCalledWith(
      "test-federation-1",
    );
  });

  test("should refresh balance", async () => {
    const { result } = renderHook(() =>
      useFederationClient("test-federation-1"),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockClient.getBalance.mockResolvedValue(2000);

    await act(async () => {
      await result.current.refreshBalance();
    });

    expect(result.current.balance).toBe(2000);
  });

  test("should create invoice", async () => {
    const { result } = renderHook(() =>
      useFederationClient("test-federation-1"),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let invoice: string = "";
    await act(async () => {
      invoice = await result.current.createInvoice(500, "Test invoice");
    });

    expect(invoice).toBe("invoice-123");
    expect(mockClient.createInvoice).toHaveBeenCalledWith(500, "Test invoice");
  });

  test("should pay invoice", async () => {
    const { result } = renderHook(() =>
      useFederationClient("test-federation-1"),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let paymentHash: string = "";
    await act(async () => {
      paymentHash = await result.current.payInvoice("invoice-abc");
    });

    expect(paymentHash).toBe("payment-hash-123");
    expect(mockClient.payInvoice).toHaveBeenCalledWith("invoice-abc");
  });

  test("should issue e-cash", async () => {
    const { result } = renderHook(() =>
      useFederationClient("test-federation-1"),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let notes: any[] = [];
    await act(async () => {
      notes = await result.current.issueECash(1000);
    });

    expect(notes).toEqual(mockECashNotes);
    expect(mockClient.issueECash).toHaveBeenCalledWith(1000);
  });

  test("should handle client errors", async () => {
    // Mock an error scenario
    mockFederationManager.getClient.mockImplementation(() => {
      throw new Error("Client initialization failed");
    });

    const { result } = renderHook(() =>
      useFederationClient("test-federation-1"),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Client initialization failed");
    expect(result.current.connected).toBe(false);
  });

  test("should handle federation change", async () => {
    const { result, rerender } = renderHook(
      ({ federationId }: { federationId: string | null }) =>
        useFederationClient(federationId),
      { initialProps: { federationId: "test-federation-1" as string | null } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.client).toBeTruthy();
    expect(result.current.connected).toBe(true);

    // Change to null
    rerender({ federationId: null });

    await waitFor(() => {
      expect(result.current.client).toBeNull();
      expect(result.current.connected).toBe(false);
    });
  });

  test("should handle client operations without connection", async () => {
    const { result } = renderHook(() => useFederationClient(null));

    await act(async () => {
      try {
        await result.current.createInvoice(100);
      } catch (err) {
        expect((err as Error).message).toBe("Client not connected");
      }
    });

    await act(async () => {
      try {
        await result.current.payInvoice("invoice-123");
      } catch (err) {
        expect((err as Error).message).toBe("Client not connected");
      }
    });

    await act(async () => {
      try {
        await result.current.issueECash(100);
      } catch (err) {
        expect((err as Error).message).toBe("Client not connected");
      }
    });
  });

  test("should cleanup on unmount", () => {
    const { unmount } = renderHook(() =>
      useFederationClient("test-federation-1"),
    );

    // Should not throw any errors
    expect(() => unmount()).not.toThrow();
  });
});
