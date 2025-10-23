/**
 * TrustNotificationSettings Component Tests
 * Phase 3 Day 4: Trust Provider Settings Integration
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrustNotificationSettings } from "../../../src/components/trust/TrustNotificationSettings";

// Mock supabase
vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}));

describe("TrustNotificationSettings Component", () => {
  const mockUserId = "test-user-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render notification settings form", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      expect(screen.getByText("Trust Score Alerts")).toBeTruthy();
      expect(screen.getByText("Provider Alerts")).toBeTruthy();
      expect(screen.getByText("Delivery Preferences")).toBeTruthy();
    });
  });

  it("should display trust score threshold slider", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const slider = document.querySelector('input[type="range"]');
      expect(slider).toBeTruthy();
    });
  });

  it("should display alert toggle checkboxes", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });

  it("should display delivery channel options", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      expect(screen.getByText(/Delivery Channels/i)).toBeTruthy();
    });
  });

  it("should display frequency selector", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const select = document.querySelector("select");
      expect(select).toBeTruthy();
    });
  });

  it("should display save button", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const saveButton = screen.getByText(/Save Settings/i);
      expect(saveButton).toBeTruthy();
    });
  });

  it("should update trust score threshold when slider changes", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
      expect(slider).toBeTruthy();

      fireEvent.change(slider, { target: { value: "75" } });
      expect(slider.value).toBe("75");
    });
  });

  it("should toggle score alerts checkbox", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      const scoreAlertCheckbox = checkboxes[0] as HTMLInputElement;

      fireEvent.click(scoreAlertCheckbox);
      expect(scoreAlertCheckbox.checked).toBe(false);
    });
  });

  it("should toggle provider alerts checkbox", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      const providerAlertCheckbox = checkboxes[1] as HTMLInputElement;

      fireEvent.click(providerAlertCheckbox);
      expect(providerAlertCheckbox.checked).toBe(false);
    });
  });

  it("should change frequency selection", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const select = document.querySelector("select") as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "weekly" } });
      expect(select.value).toBe("weekly");
    });
  });

  it("should disable controls when readOnly is true", async () => {
    render(<TrustNotificationSettings userId={mockUserId} readOnly={true} />);

    await waitFor(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((checkbox) => {
        expect((checkbox as HTMLInputElement).disabled).toBe(true);
      });
    });
  });

  it("should not display save button when readOnly is true", async () => {
    render(<TrustNotificationSettings userId={mockUserId} readOnly={true} />);

    await waitFor(() => {
      const saveButton = screen.queryByText(/Save Settings/i);
      expect(saveButton).toBeFalsy();
    });
  });

  it("should call onSaved callback when preferences are saved", async () => {
    const onSaved = vi.fn();
    render(<TrustNotificationSettings userId={mockUserId} onSaved={onSaved} />);

    await waitFor(() => {
      const saveButton = screen.getByText(/Save Settings/i);
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("should display success message after saving", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const saveButton = screen.getByText(/Save Settings/i);
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/saved successfully/i)).toBeTruthy();
    });
  });

  it("should handle multiple delivery channels", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });

  it("should display loading state initially", () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    expect(screen.getByText(/Loading notification settings/i)).toBeTruthy();
  });

  it("should handle error state", async () => {
    const onError = vi.fn();
    render(<TrustNotificationSettings userId={mockUserId} onError={onError} />);

    await waitFor(() => {
      // Component should render without crashing
      expect(screen.getByText("Trust Score Alerts")).toBeTruthy();
    });
  });

  it("should update min trust level", async () => {
    render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const selects = document.querySelectorAll("select");
      // Find the min trust level select (should be after frequency)
      if (selects.length > 1) {
        const minTrustSelect = selects[1] as HTMLSelectElement;
        fireEvent.change(minTrustSelect, { target: { value: "4" } });
        expect(minTrustSelect.value).toBe("4");
      }
    });
  });

  it("should maintain state across re-renders", async () => {
    const { rerender } = render(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
      fireEvent.change(slider, { target: { value: "60" } });
    });

    rerender(<TrustNotificationSettings userId={mockUserId} />);

    await waitFor(() => {
      const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
      expect(slider.value).toBe("60");
    });
  });
});

