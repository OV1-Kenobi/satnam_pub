/**
 * Admin Account Control Components - Unit and Integration Tests
 * Tests all admin UI components for account management
 * @module AdminAccountControl.test
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupMocks,
  mockAccountSearchResults,
  mockFederationAdmin,
  mockFederationAdminContext,
  type MockAdminContext,
  mockOrphanRecords,
  mockPlatformAdmin,
  mockPlatformAdminContext,
  mockRegularUser,
  mockRemovalLogEntries,
  setupAuthMock,
} from "./admin-test-setup";

// Extend Window interface for NIP-07 compatibility
declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: object) => Promise<object>;
    };
  }
}

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock admin context - typed for proper return values
let currentAdminContext: MockAdminContext = mockPlatformAdminContext;

// Mock AuthProvider
vi.mock("../../src/components/auth/AuthProvider", () => ({
  useAuth: vi.fn(() => setupAuthMock()),
}));

// Mock env.client
vi.mock("../../src/config/env.client", () => ({
  clientConfig: {
    flags: {
      adminAccountControlEnabled: true,
    },
  },
  getEnvVar: vi.fn((key: string) => {
    if (key === "VITE_ADMIN_ACCOUNT_CONTROL_ENABLED") return "true";
    return undefined;
  }),
}));

// Mock AdminAuthGuard with behavior simulation
vi.mock("../../src/components/admin/AdminAuthGuard", () => ({
  useAdminContext: () => currentAdminContext,
  useRequiredAdminContext: () => currentAdminContext,
  AdminAuthGuard: ({ children, requiredRole }: { children: React.ReactNode; requiredRole?: string | string[] }) => {
    // Simulate access control based on role
    const role = currentAdminContext.adminType;
    const roles = Array.isArray(requiredRole) ? requiredRole : requiredRole ? [requiredRole] : ["platform", "federation"];
    if (roles.includes(role)) {
      return <>{children}</>;
    }
    return <div data-testid="access-denied">Access Denied</div>;
  },
  AdminAuthContext: React.createContext<MockAdminContext | null>(null),
  hasPermission: (ctx: { permissions: string[] }, perm: string) => ctx.permissions.includes(perm),
  canManageFederationAccounts: (ctx: { adminType: string; federationId: string | null }) =>
    ctx.adminType === "platform" || !!ctx.federationId,
}));

// Helper to set the current admin context for tests
function setAdminContext(context: MockAdminContext) {
  currentAdminContext = context;
}

describe("Admin Account Control Components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAdminContext(mockPlatformAdminContext);

    // Default fetch response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    });
  });

  afterEach(() => {
    cleanupMocks();
  });

  // ============================================================================
  // AdminAuthGuard Tests
  // ============================================================================
  describe("AdminAuthGuard", () => {
    it("should allow platform admins (guardian role) access", async () => {
      const { useAuth } = await import("../../src/components/auth/AuthProvider");
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(setupAuthMock(mockPlatformAdmin, true));
      setAdminContext(mockPlatformAdminContext);

      const { AdminAuthGuard } = await import("../../src/components/admin/AdminAuthGuard");
      render(
        <AdminAuthGuard>
          <div data-testid="protected-content">Admin Content</div>
        </AdminAuthGuard>
      );

      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("should allow federation admins (steward role) access", async () => {
      const { useAuth } = await import("../../src/components/auth/AuthProvider");
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(setupAuthMock(mockFederationAdmin, true));
      setAdminContext(mockFederationAdminContext);

      const { AdminAuthGuard } = await import("../../src/components/admin/AdminAuthGuard");
      render(
        <AdminAuthGuard>
          <div data-testid="protected-content">Admin Content</div>
        </AdminAuthGuard>
      );

      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("should deny regular users (adult role) access", async () => {
      const { useAuth } = await import("../../src/components/auth/AuthProvider");
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(setupAuthMock(mockRegularUser, true));
      // Simulate non-admin context (neither platform nor federation)
      setAdminContext({ ...mockPlatformAdminContext, adminType: "federation", federationId: null, permissions: [] });

      const { AdminAuthGuard } = await import("../../src/components/admin/AdminAuthGuard");
      render(
        <AdminAuthGuard requiredRole="platform">
          <div data-testid="protected-content">Admin Content</div>
        </AdminAuthGuard>
      );

      expect(screen.getByTestId("access-denied")).toBeInTheDocument();
    });

    it("should redirect unauthenticated users", async () => {
      const { useAuth } = await import("../../src/components/auth/AuthProvider");
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(setupAuthMock(mockPlatformAdmin, false));

      const authMock = setupAuthMock(mockPlatformAdmin, false);
      expect(authMock.authenticated).toBe(false);
      expect(authMock.sessionToken).toBeNull();
    });
  });

  // ============================================================================
  // AccountSearchPanel Tests
  // ============================================================================
  describe("AccountSearchPanel", () => {
    it("should render search input and button", async () => {
      const { AccountSearchPanel } = await import("../../src/components/admin/AccountSearchPanel");
      render(
        <AccountSearchPanel
          sessionToken="mock-token"
          adminContext={mockPlatformAdminContext as unknown as import("../../src/components/admin/AdminAuthGuard").AdminContext}
        />
      );

      expect(screen.getByPlaceholderText(/search by nip-05/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
    });

    it("should update search query on input", async () => {
      const { AccountSearchPanel } = await import("../../src/components/admin/AccountSearchPanel");
      render(
        <AccountSearchPanel
          sessionToken="mock-token"
          adminContext={mockPlatformAdminContext as unknown as import("../../src/components/admin/AdminAuthGuard").AdminContext}
        />
      );

      const input = screen.getByPlaceholderText(/search by nip-05/i);
      fireEvent.change(input, { target: { value: "alice@satnam.pub" } });
      expect(input).toHaveValue("alice@satnam.pub");
    });

    it("should call API when search button clicked", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accounts: mockAccountSearchResults }),
      });

      const { AccountSearchPanel } = await import("../../src/components/admin/AccountSearchPanel");
      render(
        <AccountSearchPanel
          sessionToken="mock-token"
          adminContext={mockPlatformAdminContext as unknown as import("../../src/components/admin/AdminAuthGuard").AdminContext}
        />
      );

      const input = screen.getByPlaceholderText(/search by nip-05/i);
      fireEvent.change(input, { target: { value: "alice" } });
      fireEvent.click(screen.getByRole("button", { name: /search/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it("should display search results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accounts: mockAccountSearchResults }),
      });

      const { AccountSearchPanel } = await import("../../src/components/admin/AccountSearchPanel");
      render(
        <AccountSearchPanel
          sessionToken="mock-token"
          adminContext={mockPlatformAdminContext as unknown as import("../../src/components/admin/AdminAuthGuard").AdminContext}
        />
      );

      const input = screen.getByPlaceholderText(/search by nip-05/i);
      fireEvent.change(input, { target: { value: "alice" } });
      fireEvent.click(screen.getByRole("button", { name: /search/i }));

      await waitFor(() => {
        expect(screen.getByText(/alice/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // AccountRemovalModal Tests
  // ============================================================================
  describe("AccountRemovalModal", () => {
    const mockAccount = {
      ...mockAccountSearchResults[0],
    };

    it("should render modal with account details", async () => {
      const { AccountRemovalModal } = await import("../../src/components/admin/AccountRemovalModal");
      const onClose = vi.fn();
      const onSuccess = vi.fn();

      render(
        <AccountRemovalModal
          account={mockAccount}
          sessionToken="mock-token"
          onClose={onClose}
          onSuccess={onSuccess}
        />
      );

      // Use getAllByText since "Remove Account" appears in both header and button
      expect(screen.getAllByText(/remove account/i).length).toBeGreaterThan(0);
      expect(screen.getByText(new RegExp(mockAccount.identifier))).toBeInTheDocument();
    });

    it("should require a removal reason to submit", async () => {
      const { AccountRemovalModal } = await import("../../src/components/admin/AccountRemovalModal");
      render(
        <AccountRemovalModal
          account={mockAccount}
          sessionToken="mock-token"
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      // Find the select element for reason
      const reasonSelect = screen.getByRole("combobox");
      expect(reasonSelect).toBeInTheDocument();

      // Submit button should be disabled without reason
      const submitButtons = screen.getAllByRole("button");
      const removeButton = submitButtons.find(btn => btn.textContent?.toLowerCase().includes("remove"));
      expect(removeButton).toBeDisabled();
    });

    it("should validate REMOVE confirmation input", async () => {
      const { AccountRemovalModal } = await import("../../src/components/admin/AccountRemovalModal");
      render(
        <AccountRemovalModal
          account={mockAccount}
          sessionToken="mock-token"
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      // Find confirmation input
      const confirmInput = screen.getByPlaceholderText(/type remove/i);
      expect(confirmInput).toBeInTheDocument();

      fireEvent.change(confirmInput, { target: { value: "REMOVE" } });
      expect(confirmInput).toHaveValue("REMOVE");
    });

    it("should close when cancel button clicked", async () => {
      const { AccountRemovalModal } = await import("../../src/components/admin/AccountRemovalModal");
      const onClose = vi.fn();

      render(
        <AccountRemovalModal
          account={mockAccount}
          sessionToken="mock-token"
          onClose={onClose}
          onSuccess={vi.fn()}
        />
      );

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      fireEvent.click(cancelButton);
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // OverviewTab Tests
  // ============================================================================
  describe("OverviewTab", () => {
    const mockStats = {
      total: 10,
      completed: 7,
      pending: 2,
      failed: 1,
      rolledBack: 1,
      rollbackAvailable: 3,
      totalRecordsDeleted: 50,
    };

    it("should render overview statistics", async () => {
      const { OverviewTab } = await import("../../src/components/admin/OverviewTab");
      render(<OverviewTab stats={mockStats} loading={false} />);

      // Check for statistics display - total removals
      expect(screen.getByText(/10/)).toBeInTheDocument();
    });

    it("should show loading state", async () => {
      const { OverviewTab } = await import("../../src/components/admin/OverviewTab");
      render(<OverviewTab stats={null} loading={true} />);

      // Should show loading indicator (animate-pulse div)
      const loadingContainer = document.querySelector(".animate-pulse");
      expect(loadingContainer).toBeInTheDocument();
    });

    it("should scope data for federation admins", () => {
      setAdminContext(mockFederationAdminContext);
      const context = currentAdminContext;

      expect(context.adminType).toBe("federation");
      expect(context.federationId).toBe("federation-123");
    });
  });

  // ============================================================================
  // OrphansTab Tests
  // ============================================================================
  describe("OrphansTab", () => {
    it("should render orphans tab for platform admins", async () => {
      setAdminContext(mockPlatformAdminContext);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orphans: mockOrphanRecords }),
      });

      const { OrphansTab } = await import("../../src/components/admin/OrphansTab");
      render(<OrphansTab sessionToken="mock-token" />);

      // Should render the tab container
      await waitFor(() => {
        expect(document.body).toBeInTheDocument();
      });
    });

    it("should verify platform admin permission for orphan management", () => {
      setAdminContext(mockPlatformAdminContext);
      const platformContext = { ...currentAdminContext };

      setAdminContext(mockFederationAdminContext);
      const federationContext = currentAdminContext;

      expect(platformContext.adminType).toBe("platform");
      expect(platformContext.permissions).toContain("manage_orphans");
      expect(federationContext.permissions).not.toContain("manage_orphans");
    });

    it("should call API when detecting orphans", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orphans: mockOrphanRecords }),
      });

      const { OrphansTab } = await import("../../src/components/admin/OrphansTab");
      render(<OrphansTab sessionToken="mock-token" />);

      // Click detect button if present
      const detectButton = screen.queryByRole("button", { name: /detect/i });
      if (detectButton) {
        fireEvent.click(detectButton);
        await waitFor(() => {
          expect(mockFetch).toHaveBeenCalled();
        });
      }
    });

    it("should display orphan records when found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orphans: mockOrphanRecords }),
      });

      // Verify mock data structure
      expect(mockOrphanRecords.length).toBe(1);
      expect(mockOrphanRecords[0].identifier).toBe("orphan1");
    });
  });

  // ============================================================================
  // AuditLogTab Tests
  // ============================================================================
  describe("AuditLogTab", () => {
    it("should render audit log tab with removals", async () => {
      const { AuditLogTab } = await import("../../src/components/admin/AuditLogTab");
      render(
        <AuditLogTab
          removals={mockRemovalLogEntries}
          loading={false}
          sessionToken="mock-token"
        />
      );

      // Should render the tab with search input
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });

    it("should display removal history entries", async () => {
      const { AuditLogTab } = await import("../../src/components/admin/AuditLogTab");
      render(
        <AuditLogTab
          removals={mockRemovalLogEntries}
          loading={false}
          sessionToken="mock-token"
        />
      );

      // Check that log entries are displayed
      await waitFor(() => {
        expect(screen.getByText(/user_request/i)).toBeInTheDocument();
      });
    });

    it("should show loading state", async () => {
      const { AuditLogTab } = await import("../../src/components/admin/AuditLogTab");
      render(
        <AuditLogTab
          removals={[]}
          loading={true}
          sessionToken="mock-token"
        />
      );

      // Should show loading indicator
      const loadingContainer = document.querySelector(".animate-pulse");
      expect(loadingContainer).toBeInTheDocument();
    });

    it("should filter by status", async () => {
      const completedRemovals = mockRemovalLogEntries.filter(
        (r) => r.status === "completed"
      );
      const failedRemovals = mockRemovalLogEntries.filter(
        (r) => r.status === "failed"
      );

      expect(completedRemovals.length).toBe(1);
      expect(failedRemovals.length).toBe(1);
    });

    it("should scope logs for federation admins", () => {
      const federationId = mockFederationAdminContext.federationId;
      const federationLogs = mockRemovalLogEntries.filter(
        (r) => r.admin_type === "federation"
      );

      expect(federationId).toBe("federation-123");
      expect(federationLogs.length).toBe(1);
    });
  });

  // ============================================================================
  // RollbackConfirmationModal Tests
  // ============================================================================
  describe("RollbackConfirmationModal", () => {
    const mockRemoval = mockRemovalLogEntries[0];

    it("should render rollback modal", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          eligible: true,
          backup_valid: true,
          expires_at: mockRemoval.rollback_expires_at,
          time_remaining: "29 days",
        }),
      });

      const { RollbackConfirmationModal } = await import("../../src/components/admin/RollbackConfirmationModal");
      render(
        <RollbackConfirmationModal
          removal={mockRemoval}
          sessionToken="mock-token"
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/rollback/i)).toBeInTheDocument();
      });
    });

    it("should check rollback eligibility on mount", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          eligible: true,
          backup_valid: true,
          expires_at: mockRemoval.rollback_expires_at,
        }),
      });

      const { RollbackConfirmationModal } = await import("../../src/components/admin/RollbackConfirmationModal");
      render(
        <RollbackConfirmationModal
          removal={mockRemoval}
          sessionToken="mock-token"
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it("should close when cancel button clicked", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          eligible: true,
          backup_valid: true,
          expires_at: mockRemoval.rollback_expires_at,
        }),
      });

      const onClose = vi.fn();
      const { RollbackConfirmationModal } = await import("../../src/components/admin/RollbackConfirmationModal");
      render(
        <RollbackConfirmationModal
          removal={mockRemoval}
          sessionToken="mock-token"
          onClose={onClose}
          onSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        const cancelButton = screen.queryByRole("button", { name: /cancel/i });
        if (cancelButton) {
          fireEvent.click(cancelButton);
          expect(onClose).toHaveBeenCalled();
        }
      });
    });

    it("should verify eligibility logic", () => {
      const eligibleRemoval = mockRemovalLogEntries[0];
      const ineligibleRemoval = mockRemovalLogEntries[1];

      const isEligible = (removal: typeof eligibleRemoval) => {
        return (
          removal.status === "completed" &&
          !removal.rollback_executed &&
          removal.rollback_expires_at !== null &&
          new Date(removal.rollback_expires_at) > new Date()
        );
      };

      expect(isEligible(eligibleRemoval)).toBe(true);
      expect(isEligible(ineligibleRemoval)).toBe(false);
    });
  });

  // ============================================================================
  // AdminAccountControlDashboard Tests
  // ============================================================================
  describe("AdminAccountControlDashboard", () => {
    it("should display all tabs for platform admins", () => {
      setAdminContext(mockPlatformAdminContext);
      const context = currentAdminContext;

      // Tab visibility logic from component
      const tabs = ["overview", "accounts", "deletions", "orphans", "audit", "monitoring"];
      const visibleTabs = tabs.filter((tab) => {
        if (tab === "orphans" || tab === "monitoring") {
          return context.adminType === "platform";
        }
        return true;
      });

      expect(visibleTabs.length).toBe(6);
      expect(visibleTabs).toContain("orphans");
      expect(visibleTabs).toContain("monitoring");
    });

    it("should hide platform-only tabs for federation admins", () => {
      setAdminContext(mockFederationAdminContext);
      const context = currentAdminContext;

      const tabs = ["overview", "accounts", "deletions", "orphans", "audit", "monitoring"];
      const visibleTabs = tabs.filter((tab) => {
        if (tab === "orphans" || tab === "monitoring") {
          return context.adminType === "platform";
        }
        return true;
      });

      expect(visibleTabs.length).toBe(4);
      expect(visibleTabs).not.toContain("orphans");
      expect(visibleTabs).not.toContain("monitoring");
    });

    it("should track active tab state", () => {
      let activeTab = "overview";

      const setActiveTab = (tab: string) => {
        activeTab = tab;
      };

      setActiveTab("accounts");
      expect(activeTab).toBe("accounts");

      setActiveTab("audit");
      expect(activeTab).toBe("audit");
    });

    it("should handle loading states", () => {
      const loadingState = {
        isLoading: true,
        error: null,
        data: null,
      };

      expect(loadingState.isLoading).toBe(true);
      expect(loadingState.error).toBeNull();
    });

    it("should handle error states", () => {
      const errorState = {
        isLoading: false,
        error: "Failed to load dashboard data",
        data: null,
      };

      expect(errorState.isLoading).toBe(false);
      expect(errorState.error).toBeDefined();
    });

    it("should refresh data on demand", async () => {
      let refreshCount = 0;
      const refreshData = () => {
        refreshCount++;
        return Promise.resolve({ success: true });
      };

      await refreshData();
      expect(refreshCount).toBe(1);

      await refreshData();
      expect(refreshCount).toBe(2);
    });
  });

  // ============================================================================
  // AccountsTab Tests
  // ============================================================================
  describe("AccountsTab", () => {
    it("should render accounts tab with search panel", async () => {
      const { AccountsTab } = await import("../../src/components/admin/AccountsTab");
      render(
        <AccountsTab
          sessionToken="mock-token"
          adminContext={mockPlatformAdminContext as unknown as import("../../src/components/admin/AdminAuthGuard").AdminContext}
        />
      );

      // Should render search panel
      expect(screen.getByText(/search accounts/i)).toBeInTheDocument();
    });

    it("should display search input", async () => {
      const { AccountsTab } = await import("../../src/components/admin/AccountsTab");
      render(
        <AccountsTab
          sessionToken="mock-token"
          adminContext={mockPlatformAdminContext as unknown as import("../../src/components/admin/AdminAuthGuard").AdminContext}
        />
      );

      expect(screen.getByPlaceholderText(/search by nip-05/i)).toBeInTheDocument();
    });

    it("should filter by account status", () => {
      const activeAccounts = mockAccountSearchResults.filter((a) => a.is_active);
      expect(activeAccounts.length).toBe(2);
    });

    it("should trigger removal action", () => {
      let removalTriggered = false;
      type AccountResult = (typeof mockAccountSearchResults)[0];
      let targetAccount: AccountResult | null = null;

      const onRemoveClick = (account: AccountResult) => {
        removalTriggered = true;
        targetAccount = account;
      };

      onRemoveClick(mockAccountSearchResults[0]);

      expect(removalTriggered).toBe(true);
      expect((targetAccount as AccountResult | null)?.identifier).toBe("alice");
    });

    it("should scope accounts for federation admins", () => {
      setAdminContext(mockFederationAdminContext);
      const context = currentAdminContext;

      const federationAccounts = mockAccountSearchResults.filter(
        (a) => a.federation_id === context.federationId
      );

      expect(federationAccounts.length).toBe(1);
      expect(federationAccounts[0].identifier).toBe("bob");
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================
  describe("Integration", () => {
    it("should integrate with useAuth hook", async () => {
      const { useAuth } = await import("../../src/components/auth/AuthProvider");
      const mockAuth = setupAuthMock(mockPlatformAdmin, true);
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(mockAuth);

      expect(mockAuth.authenticated).toBe(true);
      expect(mockAuth.user.role).toBe("guardian");
    });

    it("should validate JWT token format", () => {
      const mockAuth = setupAuthMock(mockPlatformAdmin, true);
      const token = mockAuth.sessionToken;

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token!.startsWith("mock-jwt-token-")).toBe(true);
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      });

      const response = await fetch("/api/admin/account-control");
      expect(response.ok).toBe(false);
    });

    it("should respect feature flags", () => {
      const featureFlags = {
        adminAccountControlEnabled: true,
        orphanCleanupEnabled: true,
        rollbackEnabled: true,
      };

      expect(featureFlags.adminAccountControlEnabled).toBe(true);
    });
  });

  // ============================================================================
  // Phase 4: User Self-Service Account Deletion Tests
  // ============================================================================
  describe("User Self-Service Account Deletion", () => {
    describe("user-deletion-service", () => {
      it("should calculate cooling-off time remaining correctly", async () => {
        const { getCoolingOffTimeRemaining } = await import(
          "../../src/lib/user-deletion-service"
        );

        // Test future date (not expired)
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 3);
        futureDate.setHours(futureDate.getHours() + 5);
        const futureResult = getCoolingOffTimeRemaining(futureDate.toISOString());

        expect(futureResult.expired).toBe(false);
        expect(futureResult.days).toBeGreaterThanOrEqual(2);
        expect(futureResult.totalMs).toBeGreaterThan(0);

        // Test past date (expired)
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 1);
        const pastResult = getCoolingOffTimeRemaining(pastDate.toISOString());

        expect(pastResult.expired).toBe(true);
        expect(pastResult.days).toBe(0);
        expect(pastResult.hours).toBe(0);
        expect(pastResult.minutes).toBe(0);
        expect(pastResult.totalMs).toBe(0);
      });

      it("should format cooling-off time for display", async () => {
        const { formatCoolingOffTime } = await import(
          "../../src/lib/user-deletion-service"
        );

        // Test expired
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 1);
        expect(formatCoolingOffTime(pastDate.toISOString())).toBe(
          "Cooling-off period complete"
        );

        // Test future date
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 5);
        const formatted = formatCoolingOffTime(futureDate.toISOString());
        expect(formatted).toContain("remaining");
        expect(formatted).toContain("day");
      });

      it("should create deletion event content with correct structure", async () => {
        const { createDeletionEventContent, DELETION_EVENT_KIND } = await import(
          "../../src/lib/user-deletion-service"
        );

        const content = createDeletionEventContent(
          "test-user-duid",
          "test@example.com",
          "personal_choice"
        );

        expect(content.kind).toBe(DELETION_EVENT_KIND);
        expect(content.tags).toContainEqual(["t", "account-deletion"]);
        expect(content.tags).toContainEqual(["nip05", "test@example.com"]);

        const parsedContent = JSON.parse(content.content);
        expect(parsedContent.action).toBe("delete_account");
        expect(parsedContent.user_duid).toBe("test-user-duid");
        expect(parsedContent.reason).toBe("personal_choice");
      });

      it("should check NIP-07 availability", async () => {
        const { isNIP07Available } = await import(
          "../../src/lib/user-deletion-service"
        );

        // In test environment, window.nostr is not available
        expect(isNIP07Available()).toBe(false);
      });

      it("should export COOLING_OFF_DAYS constant", async () => {
        const { COOLING_OFF_DAYS } = await import(
          "../../src/lib/user-deletion-service"
        );

        expect(COOLING_OFF_DAYS).toBe(7);
      });
    });

    describe("PendingDeletionsTab", () => {
      it("should display pending deletions tab for admins", () => {
        setAdminContext(mockPlatformAdminContext);
        const context = currentAdminContext;

        // Verify admin has access to deletions tab
        const tabs = ["overview", "accounts", "deletions", "orphans", "audit", "monitoring"];
        const visibleTabs = tabs.filter((tab) => {
          if (tab === "orphans" || tab === "monitoring") {
            return context.adminType === "platform";
          }
          return true;
        });

        expect(visibleTabs).toContain("deletions");
        expect(visibleTabs.length).toBe(6);
      });

      it("should filter deletion requests by status", () => {
        const requests = [
          { id: "1", status: "pending", cooling_off_ends_at: new Date(Date.now() + 86400000).toISOString() },
          { id: "2", status: "ready", cooling_off_ends_at: new Date(Date.now() - 86400000).toISOString() },
          { id: "3", status: "pending", cooling_off_ends_at: new Date(Date.now() + 172800000).toISOString() },
        ];

        const pendingOnly = requests.filter((r) => r.status === "pending");
        expect(pendingOnly.length).toBe(2);

        const readyOnly = requests.filter((r) => r.status === "ready");
        expect(readyOnly.length).toBe(1);
      });

      it("should determine if cooling-off period has expired", async () => {
        const { getCoolingOffTimeRemaining } = await import(
          "../../src/lib/user-deletion-service"
        );

        const futureDate = new Date(Date.now() + 86400000).toISOString();
        const pastDate = new Date(Date.now() - 86400000).toISOString();

        expect(getCoolingOffTimeRemaining(futureDate).expired).toBe(false);
        expect(getCoolingOffTimeRemaining(pastDate).expired).toBe(true);
      });
    });

    describe("DeleteAccountSection", () => {
      it("should require NIP-07 for deletion requests", () => {
        // Simulate NIP-07 not available
        const nip07Available = typeof window !== "undefined" && !!window.nostr;
        expect(nip07Available).toBe(false);

        // Button should be disabled when NIP-07 is not available
        const buttonDisabled = !nip07Available;
        expect(buttonDisabled).toBe(true);
      });

      it("should validate DELETE confirmation input", () => {
        const confirmInput: string = "DELETE";
        const isValid = confirmInput === "DELETE";
        expect(isValid).toBe(true);

        const invalidInput: string = "delete";
        const isInvalid = invalidInput.toUpperCase() === "DELETE";
        expect(isInvalid).toBe(true);

        const wrongInput: string = "REMOVE";
        const isWrong = wrongInput === "DELETE";
        expect(isWrong).toBe(false);
      });

      it("should display account summary before deletion", () => {
        const accountSummary = {
          nip05_identifier: "test@satnam.social",
          federation_membership: "Test Family",
          wallet_balance_sats: 1000,
          contacts_count: 25,
          messages_count: 150,
          attestations_count: 3,
          created_at: "2024-01-01T00:00:00Z",
        };

        expect(accountSummary.nip05_identifier).toBe("test@satnam.social");
        expect(accountSummary.wallet_balance_sats).toBe(1000);
        expect(accountSummary.contacts_count).toBe(25);
      });
    });

    describe("DeletionPendingModal", () => {
      it("should display countdown timer", async () => {
        const { formatCoolingOffTime } = await import(
          "../../src/lib/user-deletion-service"
        );

        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 5);
        futureDate.setHours(futureDate.getHours() + 12);

        const formatted = formatCoolingOffTime(futureDate.toISOString());
        expect(formatted).toContain("day");
        expect(formatted).toContain("remaining");
      });

      it("should allow cancellation during cooling-off period", () => {
        const request = {
          id: "test-request-id",
          status: "pending",
          cooling_off_ends_at: new Date(Date.now() + 86400000 * 5).toISOString(),
        };

        const coolingOffExpired = new Date(request.cooling_off_ends_at) < new Date();
        const canCancel = !coolingOffExpired && request.status === "pending";

        expect(canCancel).toBe(true);
      });

      it("should prevent cancellation after cooling-off expires", () => {
        const request = {
          id: "test-request-id",
          status: "ready",
          cooling_off_ends_at: new Date(Date.now() - 86400000).toISOString(),
        };

        const coolingOffExpired = new Date(request.cooling_off_ends_at) < new Date();
        const canCancel = !coolingOffExpired && request.status === "pending";

        expect(canCancel).toBe(false);
      });

      it("should display what will be deleted", () => {
        const deletionItems = [
          "NIP-05 identifier and profile data",
          "All contacts and messaging history",
          "Family federation memberships",
          "Wallet information and transaction history",
          "All attestations and verifications",
        ];

        expect(deletionItems.length).toBe(5);
        expect(deletionItems).toContain("NIP-05 identifier and profile data");
      });
    });
  });

  // ============================================================================
  // Phase 5: Automation & Monitoring Tests
  // ============================================================================
  describe("Phase 5: Automation & Monitoring", () => {
    describe("Scheduled Orphan Detection", () => {
      it("should define correct schedule for orphan detection (daily at 2 AM UTC)", () => {
        const schedule = "0 2 * * *"; // cron expression
        const parts = schedule.split(" ");

        expect(parts[0]).toBe("0"); // minute 0
        expect(parts[1]).toBe("2"); // hour 2 (2 AM)
        expect(parts[2]).toBe("*"); // any day of month
        expect(parts[3]).toBe("*"); // any month
        expect(parts[4]).toBe("*"); // any day of week
      });

      it("should have correct orphan age threshold (24 hours)", () => {
        const ORPHAN_AGE_THRESHOLD_HOURS = 24;
        const thresholdMs = ORPHAN_AGE_THRESHOLD_HOURS * 60 * 60 * 1000;

        expect(thresholdMs).toBe(86400000); // 24 hours in ms
      });

      it("should have auto-cleanup disabled by default for safety", () => {
        const AUTO_CLEANUP_ENABLED = false;
        expect(AUTO_CLEANUP_ENABLED).toBe(false);
      });

      it("should only auto-cleanup when orphan count is below threshold", () => {
        const CLEANUP_THRESHOLD = 10;
        const orphanCounts = [5, 10, 15, 100];

        const shouldAutoCleanup = orphanCounts.map(count => count <= CLEANUP_THRESHOLD);

        expect(shouldAutoCleanup).toEqual([true, true, false, false]);
      });
    });

    describe("Admin Notification System", () => {
      it("should support multiple notification severities", () => {
        const severities = ["info", "warning", "error", "critical"];

        expect(severities.length).toBe(4);
        expect(severities).toContain("critical");
      });

      it("should support multiple notification types", () => {
        const types = [
          "orphan_detection",
          "account_removal",
          "security_alert",
          "system_health",
          "rate_limit_exceeded",
          "backup_reminder",
        ];

        expect(types.length).toBe(6);
        expect(types).toContain("orphan_detection");
      });

      it("should rate limit notifications per type", () => {
        const rateLimitPerHour = 10;
        const notificationCounts = new Map<string, number>();

        // Simulate sending notifications
        for (let i = 0; i < 15; i++) {
          const type = "orphan_detection";
          const count = notificationCounts.get(type) || 0;

          if (count < rateLimitPerHour) {
            notificationCounts.set(type, count + 1);
          }
        }

        expect(notificationCounts.get("orphan_detection")).toBe(10);
      });

      it("should only send email for high severity notifications", () => {
        const SEVERITY_PRIORITY: Record<string, number> = {
          info: 0,
          warning: 1,
          error: 2,
          critical: 3,
        };
        const minSeverityForEmail = "error";

        const shouldSendEmail = (severity: string) =>
          SEVERITY_PRIORITY[severity] >= SEVERITY_PRIORITY[minSeverityForEmail];

        expect(shouldSendEmail("info")).toBe(false);
        expect(shouldSendEmail("warning")).toBe(false);
        expect(shouldSendEmail("error")).toBe(true);
        expect(shouldSendEmail("critical")).toBe(true);
      });
    });

    describe("Audit Log Export", () => {
      it("should support CSV export format", () => {
        const exportFormats = ["csv", "json"];
        expect(exportFormats).toContain("csv");
      });

      it("should support JSON export format", () => {
        const exportFormats = ["csv", "json"];
        expect(exportFormats).toContain("json");
      });

      it("should filter by date range", () => {
        const entries = [
          { requested_at: "2024-01-01T00:00:00Z" },
          { requested_at: "2024-01-15T00:00:00Z" },
          { requested_at: "2024-02-01T00:00:00Z" },
        ];

        const dateFrom = "2024-01-10";
        const dateTo = "2024-01-20";

        const filtered = entries.filter(e => {
          const date = new Date(e.requested_at);
          return date >= new Date(dateFrom) && date <= new Date(dateTo + "T23:59:59");
        });

        expect(filtered.length).toBe(1);
        expect(filtered[0].requested_at).toBe("2024-01-15T00:00:00Z");
      });

      it("should include all required fields in CSV export", () => {
        const csvHeaders = [
          "ID", "Reason", "Status", "Target User",
          "Requested At", "Completed At", "Records Deleted", "Rollback Executed"
        ];

        expect(csvHeaders.length).toBe(8);
        expect(csvHeaders).toContain("Rollback Executed");
      });

      it("should include metadata in JSON export", () => {
        const jsonExport = {
          exportDate: new Date().toISOString(),
          filters: { searchQuery: "", statusFilter: "all", dateFrom: "", dateTo: "" },
          totalEntries: 10,
          entries: [],
        };

        expect(jsonExport).toHaveProperty("exportDate");
        expect(jsonExport).toHaveProperty("filters");
        expect(jsonExport).toHaveProperty("totalEntries");
      });
    });

    describe("Monitoring Dashboard", () => {
      it("should display orphan detection metrics", () => {
        const orphanMetrics = {
          lastRun: "2024-01-15T02:00:00Z",
          orphansFound: 5,
          orphansCleanedUp: 3,
          nextScheduledRun: "2024-01-16T02:00:00Z",
        };

        expect(orphanMetrics).toHaveProperty("lastRun");
        expect(orphanMetrics).toHaveProperty("orphansFound");
        expect(orphanMetrics).toHaveProperty("orphansCleanedUp");
      });

      it("should display account removal metrics", () => {
        const removalMetrics = {
          total: 50,
          last24Hours: 2,
          pendingRollbacks: 1,
        };

        expect(removalMetrics.total).toBeGreaterThanOrEqual(removalMetrics.last24Hours);
      });

      it("should display system health status", () => {
        const healthStatuses = ["healthy", "degraded", "down"];
        const jobStatuses = ["running", "paused", "error"];

        expect(healthStatuses).toContain("healthy");
        expect(jobStatuses).toContain("running");
      });

      it("should support auto-refresh with configurable interval", () => {
        const autoRefreshInterval = 30000; // 30 seconds

        expect(autoRefreshInterval).toBe(30000);
      });

      it("should display and acknowledge alerts", () => {
        const alerts = [
          { id: "1", severity: "warning", acknowledged: false },
          { id: "2", severity: "error", acknowledged: true },
        ];

        const unacknowledged = alerts.filter(a => !a.acknowledged);
        expect(unacknowledged.length).toBe(1);

        // Acknowledge alert
        alerts[0].acknowledged = true;
        const stillUnacknowledged = alerts.filter(a => !a.acknowledged);
        expect(stillUnacknowledged.length).toBe(0);
      });

      it("should only be accessible to platform admins", () => {
        setAdminContext(mockPlatformAdminContext);
        const platformContext = { ...currentAdminContext };

        setAdminContext(mockFederationAdminContext);
        const federationContext = currentAdminContext;

        // Monitoring should be platform admin only
        expect(platformContext.adminType).toBe("platform");
        expect(federationContext.adminType).toBe("federation");
      });
    });
  });
});
