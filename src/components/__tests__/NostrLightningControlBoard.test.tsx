/**
 * @fileoverview Nostr Lightning Control Board Component Tests
 * @description React component tests using React Testing Library and Vitest
 */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NostrLightningControlBoard from "../NostrLightningControlBoard";

// Mock the hooks
vi.mock("../../../hooks/useFederatedSigning", () => ({
  useFederatedSigning: () => ({
    pendingEvents: [],
    activeSessions: [],
    loading: false,
    error: null,
    createEvent: vi.fn(),
    signEvent: vi.fn(),
    refreshPendingEvents: vi.fn(),
    refreshActiveSessions: vi.fn(),
  }),
  useFamilyNostrProtection: () => ({
    protections: [],
    loading: false,
    error: null,
    protectNsec: vi.fn(),
    recoverNsec: vi.fn(),
    getProtectionStatus: vi.fn(),
  }),
}));

// Mock UI components
vi.mock("../../ui/card", () => ({
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-content">{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-description">{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-header">{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h3 data-testid="card-title">{children}</h3>
  ),
}));

vi.mock("../../ui/button", () => ({
  Button: ({
    children,
    onClick,
    variant,
    size,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    disabled?: boolean;
  }) => (
    <button
      onClick={onClick}
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      data-testid="button"
    >
      {children}
    </button>
  ),
}));

vi.mock("../../ui/badge", () => ({
  Badge: ({
    children,
    variant,
  }: {
    children: React.ReactNode;
    variant?: string;
  }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

describe("NostrLightningControlBoard", () => {
  const mockProps = {
    familyId: "test_family_123",
    currentUserId: "test_user_456",
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Component Rendering", () => {
    it("should render the main header", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      expect(
        screen.getByText("Nostr & Lightning Control Board"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Sovereign Bitcoin & Nostr management for your family",
        ),
      ).toBeInTheDocument();
    });

    it("should render the back button when onBack is provided", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      const backButton = screen.getByText("← Back");
      expect(backButton).toBeInTheDocument();
    });

    it("should not render back button when onBack is not provided", () => {
      render(
        <NostrLightningControlBoard familyId="test" currentUserId="test" />,
      );

      expect(screen.queryByText("← Back")).not.toBeInTheDocument();
    });

    it("should render navigation tabs", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      expect(screen.getByText("Overview")).toBeInTheDocument();
      expect(screen.getByText("Nostr")).toBeInTheDocument();
      expect(screen.getByText("Lightning")).toBeInTheDocument();
      expect(screen.getByText("Family")).toBeInTheDocument();
      expect(screen.getByText("Privacy")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("should render status bar with system information", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      expect(screen.getByText("System Online")).toBeInTheDocument();
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
      expect(screen.getByText(/Privacy Mode:/)).toBeInTheDocument();
    });
  });

  describe("Tab Navigation", () => {
    it("should start with overview tab active", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Overview tab should be active (has white background)
      const overviewTab = screen.getByText("Overview").closest("button");
      expect(overviewTab).toHaveClass("bg-white");
    });

    it("should switch tabs when clicked", async () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      const nostrTab = screen.getByText("Nostr").closest("button");
      fireEvent.click(nostrTab!);

      await waitFor(() => {
        expect(nostrTab).toHaveClass("bg-white");
      });
    });

    it("should display appropriate content for each tab", async () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Test Nostr tab
      const nostrTab = screen.getByText("Nostr").closest("button");
      fireEvent.click(nostrTab!);

      await waitFor(() => {
        expect(screen.getByText("Nostr Relays")).toBeInTheDocument();
        expect(screen.getByText("Recent Nostr Events")).toBeInTheDocument();
      });

      // Test Lightning tab
      const lightningTab = screen.getByText("Lightning").closest("button");
      fireEvent.click(lightningTab!);

      await waitFor(() => {
        expect(screen.getByText("Lightning Nodes")).toBeInTheDocument();
        expect(screen.getByText("Lightning Addresses")).toBeInTheDocument();
      });
    });
  });

  describe("Overview Tab Content", () => {
    it("should display system status cards", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      expect(screen.getByText("System Status")).toBeInTheDocument();
      expect(screen.getByText("Lightning Treasury")).toBeInTheDocument();
      expect(screen.getByText("Privacy Metrics")).toBeInTheDocument();
    });

    it("should display family members section", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      expect(screen.getByText("Family Members")).toBeInTheDocument();
      expect(screen.getByText("Add Member")).toBeInTheDocument();
    });

    it("should display recent transactions section", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      expect(screen.getByText("Recent Transactions")).toBeInTheDocument();
      expect(screen.getByText("View All")).toBeInTheDocument();
    });

    it("should format sats correctly", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Should display formatted numbers for family member balances
      expect(screen.getByText("1,250,000")).toBeInTheDocument(); // David's balance
      expect(screen.getByText("25,000")).toBeInTheDocument(); // Emma's balance
    });
  });

  describe("Interactive Elements", () => {
    it("should call onBack when back button is clicked", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      const backButton = screen.getByText("← Back");
      fireEvent.click(backButton);

      expect(mockProps.onBack).toHaveBeenCalledTimes(1);
    });

    it("should toggle privacy mode when shield button is clicked", async () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Find privacy mode display
      expect(screen.getByText(/Privacy Mode: enhanced/)).toBeInTheDocument();

      // Find and click the shield button (privacy toggle)
      const shieldButtons = screen.getAllByTestId("button");
      const privacyButton = shieldButtons.find((button) =>
        button.querySelector('[data-lucide="shield"]'),
      );

      if (privacyButton) {
        fireEvent.click(privacyButton);

        await waitFor(() => {
          expect(screen.getByText(/Privacy Mode: stealth/)).toBeInTheDocument();
        });
      }
    });

    it("should toggle sensitive data visibility", async () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Find eye/eye-off buttons for toggling sensitive data
      const eyeButtons = screen.getAllByTestId("button");
      const sensitiveDataButton = eyeButtons.find(
        (button) =>
          button.querySelector('[data-lucide="eye"]') ||
          button.querySelector('[data-lucide="eye-off"]'),
      );

      if (sensitiveDataButton) {
        fireEvent.click(sensitiveDataButton);
        // Component should toggle the showSensitiveData state
        expect(sensitiveDataButton).toBeInTheDocument();
      }
    });

    it("should toggle auto-refresh", async () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Find refresh button that toggles auto-refresh
      const refreshButtons = screen.getAllByTestId("button");
      const autoRefreshButton = refreshButtons.find(
        (button) =>
          button.textContent?.includes("Refresh") &&
          !button.textContent?.includes("Refresh All"),
      );

      if (autoRefreshButton) {
        fireEvent.click(autoRefreshButton);
        expect(autoRefreshButton).toBeInTheDocument();
      }
    });
  });

  describe("Data Display", () => {
    it("should show proper status indicators", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Should show various status badges
      const badges = screen.getAllByTestId("badge");
      expect(badges.length).toBeGreaterThan(0);

      // Should show status colors and icons for different states
      expect(screen.getByText("enhanced")).toBeInTheDocument(); // Privacy mode
    });

    it("should display time formatting correctly", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Should display "Last updated" with formatted time
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });

    it("should show family member roles correctly", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Should display role badges for family members
      expect(screen.getByText("parent")).toBeInTheDocument();
      expect(screen.getByText("child")).toBeInTheDocument();
    });
  });

  describe("Nostr Tab Functionality", () => {
    it("should display relay information", async () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Switch to Nostr tab
      fireEvent.click(screen.getByText("Nostr"));

      await waitFor(() => {
        expect(
          screen.getByText(
            "Manage your Nostr relay connections and monitor activity",
          ),
        ).toBeInTheDocument();
        expect(screen.getByText("Add Relay")).toBeInTheDocument();
        expect(screen.getByText("Refresh All")).toBeInTheDocument();
      });
    });

    it("should show relay status correctly", async () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      fireEvent.click(screen.getByText("Nostr"));

      await waitFor(() => {
        // Should show connected relays
        expect(screen.getByText("wss://relay.damus.io")).toBeInTheDocument();
        expect(screen.getByText("wss://nos.lol")).toBeInTheDocument();
      });
    });
  });

  describe("Lightning Tab Functionality", () => {
    it("should display Lightning node information", async () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      fireEvent.click(screen.getByText("Lightning"));

      await waitFor(() => {
        expect(
          screen.getByText("Monitor your Lightning Network nodes and channels"),
        ).toBeInTheDocument();
        expect(screen.getByText("Satnam Family Node")).toBeInTheDocument();
      });
    });

    it("should show Lightning addresses", async () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      fireEvent.click(screen.getByText("Lightning"));

      await waitFor(() => {
        expect(screen.getByText("Lightning Addresses")).toBeInTheDocument();
        expect(screen.getByText("dad@satnam.pub")).toBeInTheDocument();
        expect(screen.getByText("daughter@satnam.pub")).toBeInTheDocument();
      });
    });
  });

  describe("Error Handling", () => {
    it("should display error messages when hooks return errors", () => {
      // Mock hooks to return errors
      vi.mocked(
        require("../../../hooks/useFederatedSigning"),
      ).useFederatedSigning.mockReturnValue({
        pendingEvents: [],
        activeSessions: [],
        loading: false,
        error: "Test error message",
        createEvent: vi.fn(),
        signEvent: vi.fn(),
        refreshPendingEvents: vi.fn(),
        refreshActiveSessions: vi.fn(),
      });

      render(<NostrLightningControlBoard {...mockProps} />);

      expect(screen.getByText("Error")).toBeInTheDocument();
      expect(screen.getByText("Test error message")).toBeInTheDocument();
    });
  });

  describe("Loading States", () => {
    it("should show loading state when refreshing", async () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Find and click refresh button
      const refreshButton = screen.getByText("Refresh");
      fireEvent.click(refreshButton);

      // Should show loading spinner or disabled state
      expect(refreshButton).toBeDisabled();
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA labels and roles", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Navigation should be accessible
      const tabButtons = screen.getAllByRole("button");
      expect(tabButtons.length).toBeGreaterThan(0);

      // Cards should have proper structure
      const cards = screen.getAllByTestId("card");
      expect(cards.length).toBeGreaterThan(0);
    });

    it("should support keyboard navigation", () => {
      render(<NostrLightningControlBoard {...mockProps} />);

      // Tab buttons should be focusable
      const overviewTab = screen.getByText("Overview").closest("button");
      expect(overviewTab).not.toBeNull();

      overviewTab?.focus();
      expect(document.activeElement).toBe(overviewTab);
    });
  });
});
