import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/components/auth/AuthProvider", () => ({
  useAuth: () => ({
    sessionToken: "testtoken",
    user: { role: "guardian" },
  }),
}));

describe("AgentPerformanceReport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exports CSV with formula-injection-safe cells", async () => {
    const maliciousModel = '=cmd|"/c calc"!A0';
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        range: "daily",
        data: [
          {
            report_date: "2026-03-03",
            agent_id: "550e8400-e29b-41d4-a716-446655440000",
            tasks_completed: 1,
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
            total_cost_sats: 2,
            total_cost_usd_cents: 1,
            avg_cost_sats: 2,
            avg_tokens: 15,
            llm_providers: ["openai"],
            llm_models: [maliciousModel],
            last_completed_at: "2026-03-03T12:00:00.000Z",
          },
        ],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      }),
    })) as any;

    let capturedBlob: Blob | null = null;

    // JSDOM may not implement these; define them so the component can export.
    if (!(URL as any).createObjectURL) {
      Object.defineProperty(URL, "createObjectURL", {
        value: () => "blob:noop",
        configurable: true,
        writable: true,
      });
    }
    if (!(URL as any).revokeObjectURL) {
      Object.defineProperty(URL, "revokeObjectURL", {
        value: () => undefined,
        configurable: true,
        writable: true,
      });
    }

    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: any) => {
      capturedBlob = blob as Blob;
      return "blob:mock";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const { default: AgentPerformanceReport } = await import(
      "../../src/components/agents/AgentPerformanceReport"
    );

    render(<AgentPerformanceReport />);

    await waitFor(() => {
      expect(screen.getByText("Agent Performance Report")).toBeTruthy();
    });

    const exportBtn = await screen.findByRole("button", { name: /export csv/i });
    await waitFor(() => {
      expect(exportBtn).not.toBeDisabled();
    });

    // Prevent JSDOM from attempting to navigate when the component triggers <a>.click().
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    fireEvent.click(exportBtn);

    expect(capturedBlob).toBeTruthy();

    const blobToText = async (blob: Blob): Promise<string> => {
      const maybeText = (blob as any).text;
      if (typeof maybeText === "function") return await maybeText.call(blob);

      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
    };

    const text = await blobToText(capturedBlob as Blob);

    // Ensure the cell is prefixed with a single quote and properly CSV-escaped
    expect(text).toContain(`"'${maliciousModel.replace(/"/g, '""')}"`);
  });
});
