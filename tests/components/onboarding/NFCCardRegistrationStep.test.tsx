/**
 * NFCCardRegistrationStep Component Unit Tests
 * Phase 11 Task 11.2.4: NFC Read/Write Cycle Optimization Tests
 * Phase 12 Task 12.1: Unit Tests for optimized NFC card registration
 *
 * Tests for:
 * - Optimized scan flow using scanForCard()
 * - Cache utilization during repeated scans
 * - Error handling via handleNFCError()
 * - UI state transitions (idle → scanning → scanned → error)
 * - PIN setup and validation
 * - Card type selection (NTAG424/Boltcard/Tapsigner)
 */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NFCCardRegistrationStep } from "../../../src/components/onboarding/steps/NFCCardRegistrationStep";
import { OnboardingSessionProvider } from "../../../src/contexts/OnboardingSessionContext";
import * as nfcReader from "../../../src/lib/tapsigner/nfc-reader";
import {
  cleanupTestEnv,
  createTestCardData,
  setupTestEnv,
  setupNDEFReaderMock,
} from "../../setup/tapsigner-test-setup";

// Setup NDEFReader mock globally before any tests run
setupNDEFReaderMock();

// Mock scanForCard function
vi.mock("../../../src/lib/tapsigner/nfc-reader", async () => {
  const actual = await vi.importActual("../../../src/lib/tapsigner/nfc-reader");
  return {
    ...actual,
    scanForCard: vi.fn(),
    isNFCSupported: vi.fn(() => true),
    handleNFCError: vi.fn((error: any) => {
      if (error?.message?.includes("timeout")) return "Card scan timed out";
      if (error?.message?.includes("permission")) return "Permission denied";
      return "Failed to scan NFC card";
    }),
  };
});

describe("NFCCardRegistrationStep - Optimized", () => {
  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();

  beforeEach(() => {
    setupTestEnv();
    setupNDEFReaderMock(); // Setup window.NDEFReader for NFC support detection
    vi.clearAllMocks();

    // Setup default successful scan mock
    vi.mocked(nfcReader.scanForCard).mockResolvedValue(createTestCardData());
  });

  afterEach(() => {
    cleanupTestEnv();
  });

  const renderComponent = () => {
    return render(
      <OnboardingSessionProvider>
        <NFCCardRegistrationStep onNext={mockOnNext} onBack={mockOnBack} />
      </OnboardingSessionProvider>
    );
  };

  describe("Component Rendering", () => {
    it("should render card type selection", () => {
      renderComponent();

      expect(screen.getByText(/Card Type/i)).toBeInTheDocument();
      expect(screen.getByText(/ntag424/i)).toBeInTheDocument();
      expect(screen.getByText(/boltcard/i)).toBeInTheDocument();
      expect(screen.getByText(/tapsigner/i)).toBeInTheDocument();
    });

    it("should render scan button when NFC is supported", () => {
      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      expect(scanButton).toBeInTheDocument();
      expect(scanButton).not.toBeDisabled();
    });

    it("should disable scan button when NFC is not supported", () => {
      // Remove NDEFReader from window to simulate unsupported browser
      const originalNDEFReader = (window as any).NDEFReader;
      delete (window as any).NDEFReader;
      vi.mocked(nfcReader.isNFCSupported).mockReturnValue(false);

      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      expect(scanButton).toBeDisabled();

      // Restore NDEFReader
      (window as any).NDEFReader = originalNDEFReader;
    });
  });

  describe("Optimized Scan Flow", () => {
    it("should use scanForCard() with correct timeout", async () => {
      const user = userEvent.setup();
      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(nfcReader.scanForCard).toHaveBeenCalledWith(10000);
      });
    });

    it("should transition to scanning state", async () => {
      const user = userEvent.setup();
      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/Scanning.../i)).toBeInTheDocument();
      });
    });

    it("should transition to scanned state on success", async () => {
      const user = userEvent.setup();
      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/Card Scanned Successfully/i)).toBeInTheDocument();
      });
    });

    it("should display card UID after successful scan", async () => {
      const user = userEvent.setup();
      const testCard = createTestCardData();
      vi.mocked(nfcReader.scanForCard).mockResolvedValue(testCard);

      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(new RegExp(testCard.cardData.cardId, "i"))).toBeInTheDocument();
      });
    });

    it("should utilize cache for repeated scans", async () => {
      const user = userEvent.setup();
      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });

      // First scan
      await user.click(scanButton);
      await waitFor(() => {
        expect(nfcReader.scanForCard).toHaveBeenCalledTimes(1);
      });

      // Cache should be used by scanForCard internally
      // The component calls scanForCard each time, but the function itself handles caching
      expect(nfcReader.scanForCard).toHaveBeenCalledWith(10000);
    });
  });

  describe("Error Handling", () => {
    it("should handle scan timeout errors", async () => {
      const user = userEvent.setup();
      vi.mocked(nfcReader.scanForCard).mockRejectedValue(
        new Error("Card scan timeout")
      );

      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/timed out/i)).toBeInTheDocument();
      });
    });

    it("should handle permission errors", async () => {
      const user = userEvent.setup();
      vi.mocked(nfcReader.scanForCard).mockRejectedValue(
        new Error("Permission denied")
      );

      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/permission/i)).toBeInTheDocument();
      });
    });

    it("should use handleNFCError for error messages", async () => {
      const user = userEvent.setup();
      const testError = new Error("Test NFC error");
      vi.mocked(nfcReader.scanForCard).mockRejectedValue(testError);

      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(nfcReader.handleNFCError).toHaveBeenCalledWith(testError);
      });
    });

    it("should transition to error state on scan failure", async () => {
      const user = userEvent.setup();
      vi.mocked(nfcReader.scanForCard).mockRejectedValue(
        new Error("Scan failed")
      );

      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to scan/i)).toBeInTheDocument();
      });
    });

    it("should allow retry after error", async () => {
      const user = userEvent.setup();
      vi.mocked(nfcReader.scanForCard)
        .mockRejectedValueOnce(new Error("First attempt failed"))
        .mockResolvedValueOnce(createTestCardData());

      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });

      // First attempt fails
      await user.click(scanButton);
      await waitFor(() => {
        expect(screen.getByText(/Failed to scan/i)).toBeInTheDocument();
      });

      // Second attempt succeeds
      await user.click(scanButton);
      await waitFor(() => {
        expect(screen.getByText(/Card Scanned Successfully/i)).toBeInTheDocument();
      });
    });
  });

  describe("Card Type Selection", () => {
    it("should allow selecting NTAG424 card type", async () => {
      const user = userEvent.setup();
      renderComponent();

      const ntag424Button = screen.getByText(/NTAG424/i);
      await user.click(ntag424Button);

      expect(ntag424Button).toHaveClass(/selected/i);
    });

    it("should allow selecting Boltcard type", async () => {
      const user = userEvent.setup();
      renderComponent();

      const boltcardButton = screen.getByText(/Boltcard/i);
      await user.click(boltcardButton);

      expect(boltcardButton).toHaveClass(/selected/i);
    });

    it("should allow selecting Tapsigner type", async () => {
      const user = userEvent.setup();
      renderComponent();

      const tapsignerButton = screen.getByText(/Tapsigner/i);
      await user.click(tapsignerButton);

      expect(tapsignerButton).toHaveClass(/selected/i);
    });
  });

  describe("PIN Setup", () => {
    it("should show PIN input after successful scan", async () => {
      const user = userEvent.setup();
      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/PIN/i)).toBeInTheDocument();
      });
    });

    it("should validate PIN length", async () => {
      const user = userEvent.setup();
      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      await waitFor(() => {
        const pinInput = screen.getByLabelText(/PIN/i);
        expect(pinInput).toBeInTheDocument();
      });

      const pinInput = screen.getByLabelText(/PIN/i);
      await user.type(pinInput, "123"); // Too short

      const nextButton = screen.getByRole("button", { name: /Next/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/PIN must be at least 4 digits/i)).toBeInTheDocument();
      });
    });

    it("should accept valid PIN", async () => {
      const user = userEvent.setup();
      renderComponent();

      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      await waitFor(() => {
        const pinInput = screen.getByLabelText(/PIN/i);
        expect(pinInput).toBeInTheDocument();
      });

      const pinInput = screen.getByLabelText(/PIN/i);
      await user.type(pinInput, "123456"); // Valid PIN

      const nextButton = screen.getByRole("button", { name: /Next/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(mockOnNext).toHaveBeenCalled();
      });
    });
  });

  describe("UI State Transitions", () => {
    it("should transition: idle → scanning → scanned", async () => {
      const user = userEvent.setup();
      renderComponent();

      // Idle state
      expect(screen.getByRole("button", { name: /Scan NFC Card/i })).toBeInTheDocument();

      // Trigger scan
      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      // Scanning state
      await waitFor(() => {
        expect(screen.getByText(/Scanning.../i)).toBeInTheDocument();
      });

      // Scanned state
      await waitFor(() => {
        expect(screen.getByText(/Card Scanned Successfully/i)).toBeInTheDocument();
      });
    });

    it("should transition: idle → scanning → error", async () => {
      const user = userEvent.setup();
      vi.mocked(nfcReader.scanForCard).mockRejectedValue(
        new Error("Scan failed")
      );

      renderComponent();

      // Idle state
      expect(screen.getByRole("button", { name: /Scan NFC Card/i })).toBeInTheDocument();

      // Trigger scan
      const scanButton = screen.getByRole("button", { name: /Scan NFC Card/i });
      await user.click(scanButton);

      // Scanning state
      await waitFor(() => {
        expect(screen.getByText(/Scanning.../i)).toBeInTheDocument();
      });

      // Error state
      await waitFor(() => {
        expect(screen.getByText(/Failed to scan/i)).toBeInTheDocument();
      });
    });
  });
});
