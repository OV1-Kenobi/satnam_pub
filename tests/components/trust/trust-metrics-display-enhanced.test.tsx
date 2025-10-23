/**
 * TrustMetricsDisplay Enhanced Component Tests
 * Phase 3 Day 3: Trust Metrics Comparison UI
 *
 * Tests for enhanced TrustMetricsDisplay with Compare, Timeline, and Export buttons
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrustMetricsDisplay } from "../../../src/components/trust/TrustMetricsDisplay";
import { createNetworkHops, createTrustMetricValue } from "../../../src/lib/trust/types";

describe("TrustMetricsDisplay Enhanced Component", () => {
  const mockMetrics = {
    rank: createTrustMetricValue(85),
    followers: 500,
    hops: createNetworkHops(2),
    influence: createTrustMetricValue(75),
    reliability: createTrustMetricValue(90),
    recency: createTrustMetricValue(80),
    compositeScore: createTrustMetricValue(82),
  };

  it("should render basic metrics display", () => {
    render(<TrustMetricsDisplay metrics={mockMetrics} />);
    expect(screen.getByText("Composite Score")).toBeTruthy();
  });

  it("should render Compare button when onCompare provided", () => {
    const onCompare = vi.fn();
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        onCompare={onCompare}
      />
    );
    expect(screen.getByText("Compare")).toBeTruthy();
  });

  it("should render Timeline button when onViewTimeline provided", () => {
    const onViewTimeline = vi.fn();
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        onViewTimeline={onViewTimeline}
      />
    );
    expect(screen.getByText("Timeline")).toBeTruthy();
  });

  it("should render Export button when onExport provided", () => {
    const onExport = vi.fn();
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        onExport={onExport}
      />
    );
    expect(screen.getByText("Export")).toBeTruthy();
  });

  it("should call onCompare when Compare button clicked", () => {
    const onCompare = vi.fn();
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        onCompare={onCompare}
      />
    );
    const compareButton = screen.getByText("Compare");
    fireEvent.click(compareButton);
    expect(onCompare).toHaveBeenCalled();
  });

  it("should call onViewTimeline when Timeline button clicked", () => {
    const onViewTimeline = vi.fn();
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        onViewTimeline={onViewTimeline}
      />
    );
    const timelineButton = screen.getByText("Timeline");
    fireEvent.click(timelineButton);
    expect(onViewTimeline).toHaveBeenCalled();
  });

  it("should call onExport when Export button clicked", () => {
    const onExport = vi.fn();
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        onExport={onExport}
      />
    );
    const exportButton = screen.getByText("Export");
    fireEvent.click(exportButton);
    expect(onExport).toHaveBeenCalledWith("json");
  });

  it("should render all three buttons together", () => {
    const onCompare = vi.fn();
    const onViewTimeline = vi.fn();
    const onExport = vi.fn();
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        onCompare={onCompare}
        onViewTimeline={onViewTimeline}
        onExport={onExport}
      />
    );
    expect(screen.getByText("Compare")).toBeTruthy();
    expect(screen.getByText("Timeline")).toBeTruthy();
    expect(screen.getByText("Export")).toBeTruthy();
  });

  it("should not render buttons when callbacks not provided", () => {
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
      />
    );
    expect(screen.queryByText("Compare")).not.toBeTruthy();
    expect(screen.queryByText("Timeline")).not.toBeTruthy();
    expect(screen.queryByText("Export")).not.toBeTruthy();
  });

  it("should render buttons with correct styling", () => {
    const onCompare = vi.fn();
    const onViewTimeline = vi.fn();
    const onExport = vi.fn();
    const { container } = render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        onCompare={onCompare}
        onViewTimeline={onViewTimeline}
        onExport={onExport}
      />
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("should display provider name with buttons", () => {
    const onCompare = vi.fn();
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Alice's Trust Provider"
        onCompare={onCompare}
      />
    );
    expect(screen.getByText("Alice's Trust Provider")).toBeTruthy();
    expect(screen.getByText("Compare")).toBeTruthy();
  });

  it("should work in compact mode without buttons", () => {
    const onCompare = vi.fn();
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        compact={true}
        onCompare={onCompare}
      />
    );
    // Compact mode should still show provider name
    expect(screen.getByText("Test Provider")).toBeTruthy();
  });

  it("should display composite score", () => {
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
      />
    );
    expect(screen.getByText("82")).toBeTruthy();
  });

  it("should display all individual metrics when showDetails true", () => {
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        showDetails={true}
      />
    );
    expect(screen.getByText("Rank")).toBeTruthy();
    expect(screen.getByText("Followers")).toBeTruthy();
    expect(screen.getByText("Influence")).toBeTruthy();
    expect(screen.getByText("Reliability")).toBeTruthy();
    expect(screen.getByText("Recency")).toBeTruthy();
  });

  it("should hide individual metrics when showDetails false", () => {
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        showDetails={false}
      />
    );
    expect(screen.queryByText("Rank")).not.toBeTruthy();
  });

  it("should render metric weights section", () => {
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        showDetails={true}
      />
    );
    expect(screen.getByText("Metric Weights")).toBeTruthy();
  });

  it("should display correct metric weight percentages", () => {
    const { container } = render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        showDetails={true}
      />
    );
    expect(container.textContent).toContain("25%"); // Rank
    expect(container.textContent).toContain("15%"); // Followers
    expect(container.textContent).toContain("20%"); // Influence
  });

  it("should handle missing provider name", () => {
    const onCompare = vi.fn();
    const { container } = render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        onCompare={onCompare}
      />
    );
    // When provider name is missing, buttons are not rendered
    // But composite score should still be displayed
    expect(container.textContent).toContain("Composite Score");
  });

  it("should render buttons in flex layout", () => {
    const onCompare = vi.fn();
    const onViewTimeline = vi.fn();
    const onExport = vi.fn();
    const { container } = render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        onCompare={onCompare}
        onViewTimeline={onViewTimeline}
        onExport={onExport}
      />
    );
    const buttonContainer = container.querySelector("[class*='flex']");
    expect(buttonContainer).toBeTruthy();
  });

  it("should have proper button spacing", () => {
    const onCompare = vi.fn();
    const onViewTimeline = vi.fn();
    const onExport = vi.fn();
    const { container } = render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        onCompare={onCompare}
        onViewTimeline={onViewTimeline}
        onExport={onExport}
      />
    );
    const buttons = container.querySelectorAll("button");
    buttons.forEach((button) => {
      expect(button.className).toContain("px-3");
      expect(button.className).toContain("py-1");
    });
  });

  it("should render buttons with icons", () => {
    const onCompare = vi.fn();
    const onViewTimeline = vi.fn();
    const onExport = vi.fn();
    const { container } = render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        onCompare={onCompare}
        onViewTimeline={onViewTimeline}
        onExport={onExport}
      />
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(3);
  });

  it("should maintain backward compatibility without new props", () => {
    render(
      <TrustMetricsDisplay
        metrics={mockMetrics}
        providerName="Test Provider"
        showDetails={true}
        compact={false}
      />
    );
    expect(screen.getByText("Test Provider")).toBeTruthy();
    expect(screen.getByText("Composite Score")).toBeTruthy();
  });
});

