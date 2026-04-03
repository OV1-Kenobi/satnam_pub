import { useEffect, useMemo, useState } from "react";

import { fetchWithAuth } from "../../lib/auth/fetch-with-auth";
import { showToast } from "../../services/toastService";
import AgentDashboard from "../AgentDashboard";

interface ManagedAgentSummary {
  id: string;
  unified_address: string | null;
  agent_role: string;
  lifecycle_state: string | null;
  reputation_score: number;
  free_tier_claimed: boolean;
  free_tier_allocation_number: number | null;
  required_bond_amount_sats: number;
  intent_vision_title: string | null;
  intent_mission_summary: string | null;
}

interface AgentIntentConfig {
  vision_title: string;
  vision_summary: string;
  mission_summary: string;
  mission_checklist: string[] | null;
  value_context: string;
  constraints: string[] | null;
  success_metrics: string[] | null;
  extra_config: Record<string, unknown>;
  version?: number;
}

export function AgentManagementDashboard() {
  const [agents, setAgents] = useState<ManagedAgentSummary[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedIntent, setSelectedIntent] = useState<AgentIntentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError(null);

      const response = await fetchWithAuth("/.netlify/functions/agents/get-management-dashboard");
      const result = (await response.json()) as { agents?: ManagedAgentSummary[]; error?: string };

      if (!response.ok) {
        setError(result.error ?? "Failed to load managed agents");
        setAgents([]);
        setLoading(false);
        return;
      }

      const nextAgents = result.agents ?? [];
      setAgents(nextAgents);
      setSelectedAgentId((current) => current ?? nextAgents[0]?.id ?? null);
      setLoading(false);
    }

    void loadDashboard();
  }, []);

  useEffect(() => {
    async function loadIntent(agentId: string) {
      setSelectedIntent(null);
      const response = await fetchWithAuth(
        `/.netlify/functions/agents/get-agent-intent?agent_id=${encodeURIComponent(agentId)}`,
      );

      if (response.status === 404) {
        const selectedAgent = agents.find((agent) => agent.id === agentId);
        setError(null);
        setSelectedIntent(createEmptyIntent(selectedAgent));
        return;
      }

      const result = (await response.json()) as AgentIntentConfig & { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Failed to load agent intent");
        setSelectedIntent(null);
        return;
      }

      setError(null);
      setSelectedIntent({
        vision_title: result.vision_title,
        vision_summary: result.vision_summary,
        mission_summary: result.mission_summary,
        mission_checklist: result.mission_checklist ?? [],
        value_context: result.value_context,
        constraints: result.constraints ?? [],
        success_metrics: result.success_metrics ?? [],
        extra_config: result.extra_config ?? {},
        version: result.version,
      });
    }

    if (selectedAgentId) {
      void loadIntent(selectedAgentId);
    }
  }, [selectedAgentId]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  async function handleSaveIntent() {
    if (!selectedAgentId || !selectedIntent) {
      return;
    }

    setSaving(true);
    const response = await fetchWithAuth("/.netlify/functions/agents/upsert-agent-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: selectedAgentId, intent: selectedIntent }),
    });
    const result = (await response.json()) as { error?: string; version?: number };

    if (!response.ok) {
      setSaving(false);
      showToast.error(result.error ?? "Failed to save agent intent", { title: "Save Failed" });
      return;
    }

    setSelectedIntent((current) =>
      current ? { ...current, version: result.version ?? current.version } : current,
    );
    setAgents((current) =>
      current.map((agent) =>
        agent.id === selectedAgentId
          ? {
            ...agent,
            intent_vision_title: selectedIntent.vision_title,
            intent_mission_summary: selectedIntent.mission_summary,
          }
          : agent,
      ),
    );
    setSaving(false);
    showToast.success("Agent intent saved.", { title: "Saved" });
  }

  if (loading) {
    return <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-slate-300">Loading management dashboard…</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-rose-800 bg-rose-950/20 p-6 text-rose-200">{error}</div>;
  }

  return (
    <div className="space-y-6 text-slate-100">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
        <h3 className="text-lg font-semibold">Managed Agents</h3>
        <p className="mt-2 text-sm text-slate-400">
          This view is limited to agents you created or govern through founding federation authority.
        </p>
        {agents.length === 0 ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">
            No managed agents are visible for this account yet.
          </div>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              aria-pressed={selectedAgentId === agent.id}
              className={`rounded-xl border p-4 text-left ${selectedAgentId === agent.id ? "border-violet-500 bg-violet-950/20" : "border-slate-800 bg-slate-900/50"}`}
              onClick={() => {
                setError(null);
                setSelectedAgentId(agent.id);
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium">{agent.unified_address ?? agent.id}</div>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-200">
                  {agent.agent_role}
                </span>
                {agent.free_tier_claimed ? (
                  <span className="rounded-full bg-emerald-950/50 px-2 py-0.5 text-xs text-emerald-200">
                    Free Tier #{agent.free_tier_allocation_number ?? "—"}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-violet-950/40 px-2 py-0.5 text-violet-200">
                  Reputation {agent.reputation_score}
                </span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                  {agent.lifecycle_state ?? "ACTIVE"}
                </span>
                <span className="rounded-full bg-amber-950/40 px-2 py-0.5 text-amber-200">
                  {getBondStatusLabel(agent.required_bond_amount_sats)}
                </span>
              </div>
              <div className="mt-2 text-sm text-slate-400">Bond ladder: {agent.required_bond_amount_sats} sats</div>
              {agent.intent_vision_title ? <div className="mt-2 text-sm text-violet-200">{agent.intent_vision_title}</div> : null}
              {agent.intent_mission_summary ? (
                <div className="mt-2 text-sm text-slate-400">{agent.intent_mission_summary}</div>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      {selectedAgent ? (
        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 text-sm text-slate-300">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-100">Selected Agent</h3>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-200">
                  {selectedAgent.agent_role}
                </span>
              </div>
              <div className="mt-3">Address: {selectedAgent.unified_address ?? selectedAgent.id}</div>
              <div className="mt-1">Reputation score: {selectedAgent.reputation_score}</div>
              <div className="mt-1">Economic status: {getBondStatusLabel(selectedAgent.required_bond_amount_sats)}</div>
            </div>
            <AgentDashboard agentId={selectedAgent.id} />
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
            <h3 className="text-lg font-semibold">Agent Intent Editor</h3>
            {selectedIntent ? (
              <AgentIntentEditor intent={selectedIntent} onChange={setSelectedIntent} />
            ) : (
              <div className="mt-4 text-sm text-slate-400">Loading intent…</div>
            )}
            <button
              type="button"
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={saving || !selectedIntent}
              onClick={() => void handleSaveIntent()}
            >
              {saving ? "Saving…" : "Save Intent"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function getBondStatusLabel(requiredBondAmountSats: number): string {
  return requiredBondAmountSats > 0 ? "Bond Required" : "Bond OK";
}

function AgentIntentEditor(props: {
  intent: AgentIntentConfig;
  onChange(intent: AgentIntentConfig): void;
}) {
  function updateArrayField(
    field: "mission_checklist" | "constraints" | "success_metrics",
    value: string,
  ) {
    props.onChange({
      ...props.intent,
      [field]: value
        .split("\n")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    });
  }

  return (
    <div className="mt-4 space-y-3 text-sm">
      <InputField label="Vision title" value={props.intent.vision_title} onChange={(value) => props.onChange({ ...props.intent, vision_title: value })} />
      <TextAreaField label="Vision summary" value={props.intent.vision_summary} onChange={(value) => props.onChange({ ...props.intent, vision_summary: value })} />
      <TextAreaField label="Mission summary" value={props.intent.mission_summary} onChange={(value) => props.onChange({ ...props.intent, mission_summary: value })} />
      <TextAreaField label="Value context" value={props.intent.value_context} onChange={(value) => props.onChange({ ...props.intent, value_context: value })} />
      <TextAreaField label="Mission checklist" value={(props.intent.mission_checklist ?? []).join("\n")} onChange={(value) => updateArrayField("mission_checklist", value)} />
      <TextAreaField label="Constraints" value={(props.intent.constraints ?? []).join("\n")} onChange={(value) => updateArrayField("constraints", value)} />
      <TextAreaField label="Success metrics" value={(props.intent.success_metrics ?? []).join("\n")} onChange={(value) => updateArrayField("success_metrics", value)} />
    </div>
  );
}

function createEmptyIntent(agent: ManagedAgentSummary | undefined): AgentIntentConfig {
  return {
    vision_title: agent?.intent_vision_title ?? "",
    vision_summary: "",
    mission_summary: agent?.intent_mission_summary ?? "",
    mission_checklist: [],
    value_context: "",
    constraints: [],
    success_metrics: [],
    extra_config: {},
  };
}

function InputField(props: { label: string; value: string; onChange(value: string): void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-slate-300">{props.label}</span>
      <input className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField(props: { label: string; value: string; onChange(value: string): void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-slate-300">{props.label}</span>
      <textarea className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

export default AgentManagementDashboard;
