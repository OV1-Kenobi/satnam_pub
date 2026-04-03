import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

type ReportRange = "daily" | "weekly";

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface DailyReportRow {
  report_date: string;
  agent_id: string;
  tasks_completed: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  total_cost_sats: number;
  total_cost_usd_cents: number;
  avg_cost_sats: number;
  avg_tokens: number;
  llm_providers: string[];
  llm_models: string[];
  last_completed_at: string;
}

interface WeeklyReportRow {
  week_start_date: string;
  week_end_date: string;
  agent_id: string;
  tasks_completed: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  total_cost_sats: number;
  total_cost_usd_cents: number;
  avg_cost_sats: number;
  avg_tokens: number;
  llm_providers: string[];
  llm_models: string[];
  last_completed_at: string;
}

interface PerformanceReportResponse {
  success: boolean;
  range: ReportRange;
  data: Array<DailyReportRow | WeeklyReportRow>;
  pagination: PaginationInfo;
  error?: string;
}

/**
 * Sanitize CSV cell to prevent formula injection and escape quotes.
 * Must match the behavior tested in tests/sanitizeCSVCell.test.ts.
 */
const sanitizeCSVCell = (value: string | number | undefined): string => {
  if (value === undefined || value === null) return "";
  const str = String(value);

  // Prevent CSV injection: prefix dangerous characters with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    return `"'${str.replace(/"/g, '""')}"`;
  }

  // Escape internal quotes by doubling them, and wrap in quotes if needed
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

export function AgentPerformanceReport(): React.ReactElement {
  const { sessionToken } = useAuth();

  const [range, setRange] = useState<ReportRange>("daily");
  const [agentIdFilter, setAgentIdFilter] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(50);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<DailyReportRow | WeeklyReportRow>>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  const totals = useMemo(() => {
    const tasks = rows.reduce((acc, r) => acc + (r.tasks_completed ?? 0), 0);
    const sats = rows.reduce((acc, r) => acc + (r.total_cost_sats ?? 0), 0);
    const usdCents = rows.reduce(
      (acc, r) => acc + (r.total_cost_usd_cents ?? 0),
      0,
    );
    const tokens = rows.reduce((acc, r) => acc + (r.total_tokens ?? 0), 0);
    return { tasks, sats, usdCents, tokens };
  }, [rows]);

  const fetchReport = useCallback(async () => {
    if (!sessionToken) return;

    setLoading(true);
    setError(null);

    try {
      const url = new URL(
        "/api/agents/performance-report",
        window.location.origin,
      );
      url.searchParams.set("range", range);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(limit));
      if (agentIdFilter.trim().length > 0) {
        url.searchParams.set("agent_id", agentIdFilter.trim());
      }

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
      });

      const json = (await res.json()) as PerformanceReportResponse;

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch performance report");
      }

      setRows(json.data || []);
      setPagination(json.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setRows([]);
      setPagination({ page: 1, limit, total: 0, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }, [agentIdFilter, limit, page, range, sessionToken]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const exportCSV = useCallback(() => {
    const isWeekly = range === "weekly";

    const headers = isWeekly
      ? [
          "week_start_date",
          "week_end_date",
          "agent_id",
          "tasks_completed",
          "input_tokens",
          "output_tokens",
          "total_tokens",
          "total_cost_sats",
          "total_cost_usd_cents",
          "avg_cost_sats",
          "avg_tokens",
          "llm_providers",
          "llm_models",
          "last_completed_at",
        ]
      : [
          "report_date",
          "agent_id",
          "tasks_completed",
          "input_tokens",
          "output_tokens",
          "total_tokens",
          "total_cost_sats",
          "total_cost_usd_cents",
          "avg_cost_sats",
          "avg_tokens",
          "llm_providers",
          "llm_models",
          "last_completed_at",
        ];

    const dataRows = rows.map((r) => {
      const providers = (r.llm_providers || []).join(";");
      const models = (r.llm_models || []).join(";");

      if (isWeekly) {
        const w = r as WeeklyReportRow;
        return [
          sanitizeCSVCell(w.week_start_date),
          sanitizeCSVCell(w.week_end_date),
          sanitizeCSVCell(w.agent_id),
          sanitizeCSVCell(w.tasks_completed),
          sanitizeCSVCell(w.input_tokens),
          sanitizeCSVCell(w.output_tokens),
          sanitizeCSVCell(w.total_tokens),
          sanitizeCSVCell(w.total_cost_sats),
          sanitizeCSVCell(w.total_cost_usd_cents),
          sanitizeCSVCell(w.avg_cost_sats),
          sanitizeCSVCell(w.avg_tokens),
          sanitizeCSVCell(providers),
          sanitizeCSVCell(models),
          sanitizeCSVCell(w.last_completed_at),
        ].join(",");
      }

      const d = r as DailyReportRow;
      return [
        sanitizeCSVCell(d.report_date),
        sanitizeCSVCell(d.agent_id),
        sanitizeCSVCell(d.tasks_completed),
        sanitizeCSVCell(d.input_tokens),
        sanitizeCSVCell(d.output_tokens),
        sanitizeCSVCell(d.total_tokens),
        sanitizeCSVCell(d.total_cost_sats),
        sanitizeCSVCell(d.total_cost_usd_cents),
        sanitizeCSVCell(d.avg_cost_sats),
        sanitizeCSVCell(d.avg_tokens),
        sanitizeCSVCell(providers),
        sanitizeCSVCell(models),
        sanitizeCSVCell(d.last_completed_at),
      ].join(",");
    });

    const csvLines = [
      headers.map((h) => sanitizeCSVCell(h)).join(","),
      ...dataRows,
    ];
    const csvContent = csvLines.join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agent-performance-${range}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [range, rows]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Agent Performance Report
          </h2>
          <p className="text-sm text-gray-600">
            Daily/weekly rollups of completed tasks, tokens, and cost.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-sm text-gray-700">
            Range
            <select
              className="ml-2 border rounded px-2 py-1"
              value={range}
              onChange={(e) => {
                setRange(e.target.value as ReportRange);
                setPage(1);
              }}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>

          <label className="text-sm text-gray-700">
            Agent ID (optional)
            <input
              className="ml-2 border rounded px-2 py-1 w-80 max-w-full"
              placeholder="UUID"
              value={agentIdFilter}
              onChange={(e) => {
                setAgentIdFilter(e.target.value);
                setPage(1);
              }}
            />
          </label>

          <button
            type="button"
            className="bg-gray-900 text-white rounded px-3 py-2 text-sm"
            onClick={exportCSV}
            disabled={rows.length === 0}
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border rounded p-3">
          <div className="text-xs text-gray-500">Tasks (page)</div>
          <div className="text-lg font-semibold">{totals.tasks}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-gray-500">Tokens (page)</div>
          <div className="text-lg font-semibold">{totals.tokens}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-gray-500">Cost sats (page)</div>
          <div className="text-lg font-semibold">{totals.sats}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-gray-500">Cost USD cents (page)</div>
          <div className="text-lg font-semibold">{totals.usdCents}</div>
        </div>
      </div>

      <div className="mt-4">
        {loading && <div className="text-sm text-gray-600">Loading…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

        {!loading && !error && rows.length === 0 && (
          <div className="text-sm text-gray-600">No report data available.</div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-700 border-b">
                  <th className="py-2 pr-4">{range === "weekly" ? "Week" : "Date"}</th>
                  <th className="py-2 pr-4">Agent</th>
                  <th className="py-2 pr-4">Tasks</th>
                  <th className="py-2 pr-4">Tokens</th>
                  <th className="py-2 pr-4">Cost (sats)</th>
                  <th className="py-2 pr-4">Cost (USD¢)</th>
                  <th className="py-2 pr-4">Providers</th>
                  <th className="py-2 pr-4">Models</th>
                  <th className="py-2 pr-4">Last Completed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key =
                    range === "weekly"
                      ? `${(r as WeeklyReportRow).week_start_date}-${r.agent_id}`
                      : `${(r as DailyReportRow).report_date}-${r.agent_id}`;
                  const dateLabel =
                    range === "weekly"
                      ? `${(r as WeeklyReportRow).week_start_date} → ${(r as WeeklyReportRow).week_end_date}`
                      : (r as DailyReportRow).report_date;
                  return (
                    <tr key={key} className="border-b text-gray-900">
                      <td className="py-2 pr-4 whitespace-nowrap">{dateLabel}</td>
                      <td className="py-2 pr-4 font-mono">{r.agent_id}</td>
                      <td className="py-2 pr-4">{r.tasks_completed}</td>
                      <td className="py-2 pr-4">{r.total_tokens}</td>
                      <td className="py-2 pr-4">{r.total_cost_sats}</td>
                      <td className="py-2 pr-4">{r.total_cost_usd_cents}</td>
                      <td className="py-2 pr-4">{(r.llm_providers || []).join(", ")}</td>
                      <td className="py-2 pr-4">{(r.llm_models || []).join(", ")}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {r.last_completed_at}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-700">
        <div>
          Page {pagination.page} / {Math.max(pagination.totalPages, 1)} · Total rows: {pagination.total}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="border rounded px-2 py-1 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <button
            type="button"
            className="border rounded px-2 py-1 disabled:opacity-50"
            onClick={() => setPage((p) => p + 1)}
            disabled={pagination.totalPages > 0 ? page >= pagination.totalPages : rows.length < limit}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default AgentPerformanceReport;
