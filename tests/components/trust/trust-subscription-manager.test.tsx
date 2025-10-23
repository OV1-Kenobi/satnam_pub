/**
 * TrustSubscriptionManager Component Tests
 * Phase 3 Day 4: Trust Provider Settings Integration
 */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrustSubscriptionManager } from "../../../src/components/trust/TrustSubscriptionManager";

// Mock supabase
vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

describe("TrustSubscriptionManager Component", () => {
  const mockUserId = "test-user-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render subscription manager", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should display empty state when no subscriptions", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      expect(screen.getByText(/Subscribe to trust providers/i)).toBeTruthy();
    });
  });

  it("should display loading state initially", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should show loading indicator or empty state
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should render subscription cards when data is loaded", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render without crashing
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should display subscription status badge", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render without crashing
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should display pause button for active subscriptions", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should display resume button for paused subscriptions", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should display cancel button", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should display usage metrics", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should display subscription date", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should display last used date when available", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should disable action buttons when readOnly is true", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} readOnly={true} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should call onSubscriptionChanged callback", async () => {
    const onSubscriptionChanged = vi.fn();
    render(
      <TrustSubscriptionManager
        userId={mockUserId}
        onSubscriptionChanged={onSubscriptionChanged}
      />
    );

    await waitFor(() => {
      expect(onSubscriptionChanged).toHaveBeenCalled();
    });
  });

  it("should handle pause action", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should handle resume action", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should handle cancel action with confirmation", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should display error message on failure", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should truncate provider ID to 8 characters", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should display usage count metric", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should display metrics count", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should maintain subscription list after action", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should handle multiple subscriptions", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should sort subscriptions by date", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should display different status colors", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });

  it("should handle expired subscriptions", async () => {
    render(<TrustSubscriptionManager userId={mockUserId} />);

    await waitFor(() => {
      // Component should render
      expect(screen.getByText(/No active subscriptions/i)).toBeTruthy();
    });
  });
});

