/**
 * Enhanced TrustSettings Component Tests
 * Phase 3 Day 4: Trust Provider Settings Integration
 */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrustSettings } from "../../../src/components/Settings/TrustSettings";

// Mock dependencies
vi.mock("../../../src/lib/supabase", () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
            })),
        })),
    },
}));

vi.mock("../../../src/components/auth/AuthProvider", () => ({
    useAuth: () => ({
        user: { id: "test-user-123" },
    }),
}));

vi.mock("../../../src/lib/trust/provider-management", () => ({
    ProviderManagementService: class {
        getTrustedProviders = vi.fn(() => Promise.resolve([]));
        setProviderTrustLevel = vi.fn(() => Promise.resolve({}));
    },
}));

describe("Enhanced TrustSettings Component", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should render all tabs", async () => {
        render(<TrustSettings />);

        await waitFor(() => {
            expect(screen.getByText("Providers")).toBeTruthy();
            expect(screen.getByText("Metrics")).toBeTruthy();
            expect(screen.getByText("Trust Model")).toBeTruthy();
            expect(screen.getByText("Marketplace")).toBeTruthy();
            expect(screen.getByText("Subscriptions")).toBeTruthy();
            expect(screen.getByText("Notifications")).toBeTruthy();
        });
    });

    it("should render Providers tab by default", async () => {
        render(<TrustSettings />);

        await waitFor(() => {
            expect(screen.getByText("Trusted Providers")).toBeTruthy();
        });
    });

    it("should have Marketplace tab button", async () => {
        render(<TrustSettings />);

        await waitFor(() => {
            const marketplaceTab = screen.queryByText("Marketplace");
            expect(marketplaceTab).toBeTruthy();
        });
    });

    it("should have Subscriptions tab button", async () => {
        render(<TrustSettings />);

        await waitFor(() => {
            const subscriptionsTab = screen.queryByText("Subscriptions");
            expect(subscriptionsTab).toBeTruthy();
        });
    });

    it("should have Notifications tab button", async () => {
        render(<TrustSettings />);

        await waitFor(() => {
            const notificationsTab = screen.queryByText("Notifications");
            expect(notificationsTab).toBeTruthy();
        });
    });

    it("should have Metrics tab button", async () => {
        render(<TrustSettings />);

        await waitFor(() => {
            const metricsTab = screen.queryByText("Metrics");
            expect(metricsTab).toBeTruthy();
        });
    });

    it("should have Trust Model tab button", async () => {
        render(<TrustSettings />);

        await waitFor(() => {
            const modelTab = screen.queryByText("Trust Model");
            expect(modelTab).toBeTruthy();
        });
    });

    it("should highlight active tab", async () => {
        render(<TrustSettings />);

        await waitFor(() => {
            const providersTab = screen.getByText("Providers");
            expect(providersTab.className).toContain("border-blue-600");
        });
    });

    it("should display all tabs in horizontal layout", async () => {
        render(<TrustSettings />);

        await waitFor(() => {
            const tabs = screen.getAllByRole("button");
            expect(tabs.length).toBeGreaterThanOrEqual(6);
        });
    });

    it("should handle loading state", async () => {
        render(<TrustSettings />);

        // Component should render without crashing
        await waitFor(() => {
            const providersTab = screen.queryByText("Providers");
            expect(providersTab).toBeTruthy();
        });
    });

    it("should support all 6 tabs", async () => {
        render(<TrustSettings />);

        await waitFor(() => {
            const tabs = ["Providers", "Metrics", "Trust Model", "Marketplace", "Subscriptions", "Notifications"];

            for (const tabName of tabs) {
                const tab = screen.queryByText(tabName);
                expect(tab).toBeTruthy();
            }
        });
    });
});
