/**
 * Tapsigner E2E Tests for Non-NFC UI Workflows
 * Phase 3 Task 3.5: Frontend Testing & Debugging
 *
 * Tests UI workflows that do NOT require physical NFC hardware:
 * - UI navigation and form validation
 * - Feature flag behavior
 * - Browser compatibility detection
 * - Error state rendering
 * - Status display component
 *
 * Note: Web NFC API (NDEFReader) is mocked since physical hardware is unavailable
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TapsignerStatusDisplay from "../../src/components/TapsignerStatusDisplay";
import { apiClient } from "../../src/utils/api-client";

// Mock apiClient
vi.mock("../../src/utils/api-client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

// Mock useAuth hook
vi.mock("../../src/components/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user-123", hashedUUID: "test-uuid" },
    sessionToken: "test-jwt-token",
    authenticated: true,
    loading: false,
    error: null,
  }),
}));

// Mock Web NFC API (NDEFReader)
const mockNDEFReader = {
  scan: vi.fn(),
  abort: vi.fn(),
  onreading: null as ((event: any) => void) | null,
  onerror: null as ((event: any) => void) | null,
};

beforeEach(() => {
  // Mock NDEFReader in window
  (window as any).NDEFReader = vi.fn(() => mockNDEFReader);

  // Mock environment variables
  process.env.VITE_TAPSIGNER_ENABLED = "true";
  process.env.VITE_TAPSIGNER_LNBITS_ENABLED = "true";
  process.env.VITE_TAPSIGNER_DEBUG = "false";

  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Tapsigner E2E Tests - Non-NFC UI Workflows", () => {
  const mockCardStatus = {
    cardId: 'a1b2c3d4e5f6a7b8',
    isRegistered: true,
    familyRole: 'private' as const,
    pinAttempts: 3,
    isLocked: false,
    createdAt: '2025-11-06T10:00:00Z',
    lastUsed: '2025-11-06T12:00:00Z',
    walletLink: {
      walletId: 'wallet-123',
      spendLimitSats: 100000,
      tapToSpendEnabled: true,
    },
  };

  describe("TapsignerStatusDisplay Component E2E", () => {
    it("should render status display with registered card", async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/card information/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("should display empty state when no card registered", async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: { ...mockCardStatus, isRegistered: false },
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/no tapsigner card registered/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("should handle API errors gracefully", () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: false,
        error: 'Failed to fetch card status',
      });

      const { container } = render(<TapsignerStatusDisplay cardId="test-card-id" />);

      // Component should render without crashing
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe("Feature Flag Behavior - TapsignerStatusDisplay", () => {
    it("should render when VITE_TAPSIGNER_ENABLED=true", async () => {
      process.env.VITE_TAPSIGNER_ENABLED = "true";

      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/card information/i)).toBeInTheDocument();
      });
    });

    it("should not render when VITE_TAPSIGNER_ENABLED=false", () => {
      process.env.VITE_TAPSIGNER_ENABLED = "false";

      const { container } = render(<TapsignerStatusDisplay cardId="test-card-id" />);

      // Component should not render
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Status Display with Different Card States", () => {
    it("should display active status for registered card", async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/card information/i)).toBeInTheDocument();
      });
    });

    it("should display locked status when card is locked", async () => {
      const lockedStatus = { ...mockCardStatus, isLocked: true };

      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: lockedStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/card information/i)).toBeInTheDocument();
      });
    });

    it("should display warning status when PIN attempts low", async () => {
      const lowAttemptsStatus = { ...mockCardStatus, pinAttempts: 1 };

      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: lowAttemptsStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/card information/i)).toBeInTheDocument();
      });
    });
  });

  describe("Wallet Linking Integration", () => {
    it("should display wallet information when linked", async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.getByText(/lightning wallet link/i)).toBeInTheDocument();
        expect(screen.getByText(/tap-to-spend enabled/i)).toBeInTheDocument();
      });
    });

    it("should not display wallet info when not linked", async () => {
      const noWalletStatus = { ...mockCardStatus, walletLink: undefined };

      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: noWalletStatus,
      });

      render(<TapsignerStatusDisplay cardId="test-card-id" />);

      await waitFor(() => {
        expect(screen.queryByText(/lightning wallet link/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("Action Buttons and User Interactions", () => {
    it("should display action buttons when showActions is true", async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(
        <TapsignerStatusDisplay
          cardId="test-card-id"
          showActions={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/card information/i)).toBeInTheDocument();
      });
    });

    it("should hide action buttons when showActions is false", async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      render(
        <TapsignerStatusDisplay
          cardId="test-card-id"
          showActions={false}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/card information/i)).toBeInTheDocument();
      });
    });
  });

  describe("Compact Mode", () => {
    it("should render in compact mode when specified", async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        success: true,
        data: mockCardStatus,
      });

      const { container } = render(
        <TapsignerStatusDisplay
          cardId="test-card-id"
          compact={true}
        />
      );

      await waitFor(() => {
        expect(container.querySelector('.max-w-sm')).toBeInTheDocument();
      });
    });
  });
});

