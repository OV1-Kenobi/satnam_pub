import { useEffect, useMemo, useState } from "react";
import type {
  SessionChannel,
  SessionStatus,
} from "../../types/agent-sessions";
import SecureTokenManager from "../lib/auth/secure-token-manager";
import { supabase } from "../lib/supabase";
import {
  getAgentSessionManager,
} from "../services/agent-session-manager";
import { showToast } from "../services/toastService";

type TabKey = "active" | "history" | "cost";

export default function AgentSessionMonitor() {
  const manager = useMemo(() => getAgentSessionManager(), []);

  const [hasAgents, setHasAgents] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabKey>("active");

  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [timelines, setTimelines] = useState<Record<string, any[]>>({});
  const [managerReady, setManagerReady] = useState<boolean>(false);

  useEffect(() => {
    // Feature gate: only render UI if user has agents
    // Reuse AgentHealthDashboard's source to check quickly
    supabase
      .from("agent_health_summary")
      .select("agent_id", { count: "exact" })
      .limit(1)
      .then(({ data, error, count }) => {
        if (!error) setHasAgents((count ?? (data?.length || 0)) > 0);
      });
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initializeManager() {
      try {
        const token = await SecureTokenManager.silentRefresh();
        if (!token) {
          if (isMounted) setManagerReady(false);
          return;
        }

        await manager.initialize(token);
        if (isMounted) setManagerReady(true);
      } catch {
        if (isMounted) setManagerReady(false);
      }
    }

    initializeManager();

    return () => {
      isMounted = false;
    };
  }, [manager]);

  // Listen for lightweight conflict signals and surface a toast
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ sessionId?: string }>;
      const sid = ce?.detail?.sessionId || "unknown";
      showToast.warning(`Context conflict detected for ${sid}`);
    };
    window.addEventListener("session-conflict-detected", handler as EventListener);
    return () => {
      window.removeEventListener("session-conflict-detected", handler as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!managerReady) {
      return;
    }

    let isMounted = true;

    async function loadActive() {
      try {
        const rows = await manager.getActiveSessions();
        if (isMounted) setActiveSessions(rows || []);
      } catch { }
    }

    async function loadHistory() {
      try {
        const rows = await manager.getSessionHistory();
        if (isMounted) setHistory(rows || []);
      } catch { }
    }

    async function loadCosts() {
      try {
        const rows = await manager.getCostAnalysis();
        if (isMounted) setCosts(rows || []);
      } catch { }
    }

    // Initial loads
    loadActive();
    loadHistory();
    loadCosts();

    // Polling for active sessions every 10s
    const interval = setInterval(loadActive, 10000);

    // Realtime: refresh on updates
    const unsubscribeUpdate = manager.onSessionUpdate(() => loadActive());
    const unsubscribeEvent = manager.onSessionEvent((sessionId) => {
      if (expanded[sessionId]) {
        manager.getSessionTimeline(sessionId).then((rows) => {
          setTimelines((prev) => ({ ...prev, [sessionId]: rows || [] }));
        });
      }
    });

    return () => {
      isMounted = false;
      clearInterval(interval);
      unsubscribeUpdate?.();
      unsubscribeEvent?.();
    };
  }, [manager, managerReady, expanded]);

  if (!hasAgents) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Agent Session Monitor</h2>

      <div className="flex gap-2 border-b">
        {[
          { k: "active", label: "Active Sessions" },
          { k: "history", label: "Session History" },
          { k: "cost", label: "Cost Analytics" },
        ].map((t) => (
          <button
            key={t.k}
            className={`px-3 py-2 -mb-px border-b-2 ${activeTab === (t.k as TabKey)
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            onClick={() => setActiveTab(t.k as TabKey)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "active" && (
        <ActiveSessions
          rows={activeSessions}
          expanded={expanded}
          timelines={timelines}
          onToggleExpand={async (sid) => {
            setExpanded((prev) => ({ ...prev, [sid]: !prev[sid] }));
            if (!expanded[sid]) {
              const tl = await manager.getSessionTimeline(sid);
              setTimelines((p) => ({ ...p, [sid]: tl || [] }));
            }
          }}
          onPause={(sid) => manager.pauseSession(sid, "User action")}
          onResume={(sid) => manager.resumeSession(sid)}
          onTerminate={(sid) => manager.terminateSession(sid, "User action")}
          onSwitch={(sid, ch) => manager.switchChannel(sid, ch)}
        />
      )}

      {activeTab === "history" && <SessionHistory rows={history} />}

      {activeTab === "cost" && <CostAnalytics rows={costs} />}
    </div>
  );
}

function ActiveSessions({
  rows,
  expanded,
  timelines,
  onToggleExpand,
  onPause,
  onResume,
  onTerminate,
  onSwitch,
}: {
  rows: any[];
  expanded: Record<string, boolean>;
  timelines: Record<string, any[]>;
  onToggleExpand: (sessionId: string) => void | Promise<void>;
  onPause: (sessionId: string) => void | Promise<void>;
  onResume: (sessionId: string) => void | Promise<void>;
  onTerminate: (sessionId: string) => void | Promise<void>;
  onSwitch: (sessionId: string, ch: SessionChannel) => void | Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((s) => (
          <div key={s.session_id} className="border rounded p-3 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{truncate(s.session_id)}</div>
                <div className="text-xs text-gray-500">{getDisplayChannel(s)}</div>
              </div>
              <span className={`px-2 py-0.5 rounded text-white text-xs ${getStatusColor(s.status)}`}>
                {getStatusEmoji(s.status)} {String(s.status).toLowerCase()}
              </span>
            </div>

            <div className="mt-2 flex gap-2 text-sm">
              {s.status === "ACTIVE" ? (
                <button className="px-2 py-1 border rounded" onClick={() => onPause(s.session_id)}>
                  Pause
                </button>
              ) : (
                <button className="px-2 py-1 border rounded" onClick={() => onResume(s.session_id)}>
                  Resume
                </button>
              )}
              <button className="px-2 py-1 border rounded text-red-600" onClick={() => onTerminate(s.session_id)}>
                Terminate
              </button>
              <div className="ml-auto flex gap-1">
                {(["nostr", "telegram", "web_ui"] as SessionChannel[]).map((ch) => (
                  <button
                    key={ch}
                    className={`px-2 py-1 border rounded text-xs ${getDisplayChannel(s) === ch ? "bg-gray-100" : ""}`}
                    onClick={() => onSwitch(s.session_id, ch)}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            <button className="mt-2 text-blue-600 text-sm" onClick={() => onToggleExpand(s.session_id)}>
              {expanded[s.session_id] ? "Hide Timeline" : "Show Timeline"}
            </button>

            {expanded[s.session_id] && (
              <div className="mt-2 bg-gray-50 rounded p-2 max-h-48 overflow-auto text-xs">
                {(timelines[s.session_id] || []).map((e: any, idx: number) => (
                  <div key={idx} className="py-1 border-b last:border-0">
                    <div className="text-gray-600">{e.event_type}</div>
                    <div className="text-gray-500">{new Date(e.created_at || e.event_time).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {rows.length === 0 && (
        <div className="text-sm text-gray-500">No active sessions.</div>
      )}
    </div>
  );
}

function SessionHistory({ rows }: { rows: any[] }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.session_id + (r.ended_at || r.last_activity_at)} className="border rounded p-3">
            <div className="font-semibold">{truncate(r.session_id)}</div>
            <div className="text-xs text-gray-500">{getDisplayChannel(r)}</div>
            <div className="text-xs">{String(r.status).toLowerCase()}</div>
          </div>
        ))}
      </div>
      {rows.length === 0 && <div className="text-sm text-gray-500">No history yet.</div>}
    </div>
  );
}

function CostAnalytics({ rows }: { rows: any[] }) {
  const totalSats = (rows || []).reduce((acc, r) => acc + getSatsValue(r), 0);
  return (
    <div className="space-y-3">
      <div className="text-sm">Total Cost: <span className="font-semibold">{Number(totalSats).toLocaleString()} sats</span></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r, idx) => (
          <div key={idx} className="border rounded p-3">
            <div className="font-semibold">{truncate(r.session_id || r.agent_id || String(idx))}</div>
            <div className="text-xs text-gray-500">{getDisplayChannel(r)}</div>
            <div className="text-sm">{getSatsValue(r).toLocaleString()} sats</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function truncate(id: string, n: number = 8) {
  if (!id) return "";
  return id.length > 2 * n ? `${id.slice(0, n)}…${id.slice(-n)}` : id;
}

function getDisplayChannel(row: any): string {
  return String(row?.primary_channel || row?.channel || "");
}

function getSatsValue(row: any): number {
  return Number(row?.total_sats_spent ?? row?.total_sats_cost ?? row?.sats_cost ?? 0);
}

function getStatusColor(status: SessionStatus | string): string {
  switch (String(status).toUpperCase()) {
    case "ACTIVE":
      return "bg-green-500";
    case "PAUSED":
      return "bg-gray-500";
    case "HIBERNATED":
      return "bg-yellow-600";
    case "TERMINATED":
      return "bg-red-500";
    default:
      return "bg-gray-300";
  }
}

function getStatusEmoji(status: SessionStatus | string): string {
  switch (String(status).toUpperCase()) {
    case "ACTIVE":
      return "🟢";
    case "PAUSED":
      return "⏸️";
    case "HIBERNATED":
      return "🟡";
    case "TERMINATED":
      return "💀";
    default:
      return "⚪";
  }
}
