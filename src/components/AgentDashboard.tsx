import { useEffect, useMemo, useState } from "react";

import { AGENT_ACTION_PRICING } from "../lib/agents/agent-action-pricing";
import { supabase } from "../lib/supabase";
import { formatSats } from "../lib/utils";
import { showToast } from "../services/toastService";
import ActionButtons, { type AgentActionRequest } from "./ActionButtons";
import TokenPurchaseModal from "./TokenPurchaseModal";
import { OTSProofList } from "./ots/OTSProofList";

type AgentRole = "private" | "offspring" | "adult" | "steward" | "guardian" | string;
type DashboardTokenType = "event_post" | "task_create" | "contact_add" | "dm_send";

interface AgentProfileRow {
  agent_role?: AgentRole | null;
  reputation_score?: number | null;
  credit_limit_sats?: number | null;
  current_bonded_sats?: number | null;
  total_bonds_released_sats?: number | null;
  total_bonds_staked_sats?: number | null;
  unified_address?: string | null;
  nip05_verified?: boolean | null;
  free_tier_claimed?: boolean | null;
  free_tier_allocation_number?: number | null;
  tier1_validations?: number | null;
  tier2_validations?: number | null;
  tier3_validations?: number | null;
  event_tokens_balance?: number | null;
  task_tokens_balance?: number | null;
  contact_tokens_balance?: number | null;
  dm_tokens_balance?: number | null;
  total_platform_fees_paid_sats?: number | null;
  // OTS proof metrics (added 2026-03-22)
  ots_attestation_count?: number | null;
  last_ots_attestation_at?: string | null;
  agent_pubkey?: string | null;
}

interface PaymentConfigRow {
  unified_address?: string | null;
  lightning_enabled?: boolean | null;
  cashu_enabled?: boolean | null;
  fedimint_enabled?: boolean | null;
  total_received_lightning_sats?: number | null;
  total_received_cashu_sats?: number | null;
  total_received_fedimint_sats?: number | null;
}

interface AgentDashboardData {
  id: string;
  npub: string;
  nip05: string | null;
  role?: AgentRole | null;
  agent_profiles: AgentProfileRow | AgentProfileRow[] | null;
  payment_config: PaymentConfigRow | PaymentConfigRow[] | null;
}

interface TokenBalances {
  event_tokens: number;
  task_tokens: number;
  contact_tokens: number;
  dm_tokens: number;
}

export interface TokenPurchaseRequest {
  tokenType: DashboardTokenType;
  quantity: number;
  totalFeeSats: number;
}

interface AgentDashboardProps {
  agentId: string;
  onPurchaseRequest?: (request: TokenPurchaseRequest) => void;
}

interface FeeRecord {
  id: string;
  action_type: string;
  fee_sats: number;
  payment_protocol: string;
  paid_at: string | null;
}

interface Sig4SatsEarning {
  id: string;
  purpose: string;
  amount_sats: number;
  received_at: string | null;
}

type TokenOption = {
  tokenType: DashboardTokenType;
  balanceKey: keyof TokenBalances;
  label: string;
  buttonLabel: string;
  quantity: number;
  totalFeeSats: number;
};

const TOKEN_OPTIONS: TokenOption[] = [
  {
    tokenType: "event_post",
    balanceKey: "event_tokens",
    label: AGENT_ACTION_PRICING.event_post.label,
    buttonLabel: "Buy 10 (210 sats)",
    quantity: 10,
    totalFeeSats: 210,
  },
  {
    tokenType: "task_create",
    balanceKey: "task_tokens",
    label: AGENT_ACTION_PRICING.task_create.label,
    buttonLabel: "Buy 10 (1,500 sats)",
    quantity: 10,
    totalFeeSats: 1500,
  },
  {
    tokenType: "contact_add",
    balanceKey: "contact_tokens",
    label: AGENT_ACTION_PRICING.contact_add.label,
    buttonLabel: "Buy 10 (500 sats)",
    quantity: 10,
    totalFeeSats: 500,
  },
  {
    tokenType: "dm_send",
    balanceKey: "dm_tokens",
    label: AGENT_ACTION_PRICING.dm_send.label,
    buttonLabel: "Buy 10 bundles (210 sats)",
    quantity: 10,
    totalFeeSats: 210,
  },
];

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function calculateBondReleaseRate(releasedSats: number, stakedSats: number): number {
  if (stakedSats <= 0) return 0;
  return Math.round((releasedSats / stakedSats) * 100);
}

async function copyToClipboard(value: string): Promise<void> {
  if (!value) return;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  throw new Error("Clipboard is not available in this environment.");
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function RecentFeesTable({ agentId }: { agentId: string }) {
  const [fees, setFees] = useState<FeeRecord[]>([]);

  useEffect(() => {
    let mounted = true;

    async function fetchFees() {
      const { data, error } = await supabase
        .from("platform_revenue")
        .select("id, action_type, fee_sats, payment_protocol, paid_at")
        .eq("payer_agent_id", agentId)
        .eq("payment_status", "paid")
        .order("paid_at", { ascending: false })
        .limit(10);

      if (!mounted) return;
      if (error) {
        setFees([]);
        return;
      }

      setFees((data ?? []) as FeeRecord[]);
    }

    void fetchFees();

    return () => {
      mounted = false;
    };
  }, [agentId]);

  if (fees.length === 0) {
    return <div className="text-sm text-slate-400">No fee payments recorded yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm text-slate-200">
        <thead className="text-slate-400">
          <tr>
            <th className="pb-2 pr-4 font-medium">Action</th>
            <th className="pb-2 pr-4 font-medium">Amount</th>
            <th className="pb-2 pr-4 font-medium">Protocol</th>
            <th className="pb-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {fees.map((fee) => (
            <tr key={fee.id} className="border-t border-slate-800">
              <td className="py-2 pr-4 capitalize">{fee.action_type.replace(/_/g, " ")}</td>
              <td className="py-2 pr-4">{formatSats(fee.fee_sats)}</td>
              <td className="py-2 pr-4 capitalize">{fee.payment_protocol}</td>
              <td className="py-2">{formatRelativeTime(fee.paid_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sig4SatsEarningsTable({ agentId }: { agentId: string }) {
  const [earnings, setEarnings] = useState<Sig4SatsEarning[]>([]);

  useEffect(() => {
    let mounted = true;

    async function fetchEarnings() {
      const { data, error } = await supabase
        .from("agent_payment_receipts")
        .select("id, purpose, amount_sats, received_at")
        .eq("agent_id", agentId)
        .eq("payment_protocol", "cashu")
        .like("purpose", "sig4sats%")
        .order("received_at", { ascending: false });

      if (!mounted) return;
      if (error) {
        setEarnings([]);
        return;
      }

      setEarnings((data ?? []) as Sig4SatsEarning[]);
    }

    void fetchEarnings();

    return () => {
      mounted = false;
    };
  }, [agentId]);

  const totalEarned = useMemo(
    () => earnings.reduce((sum, earning) => sum + earning.amount_sats, 0),
    [earnings],
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-800 bg-emerald-950/20 p-4 text-sm text-emerald-200">
        Total Sig4Sats Earned: <span className="font-semibold">{formatSats(totalEarned)}</span>
      </div>
      {earnings.length === 0 ? (
        <div className="text-sm text-slate-400">No Sig4Sats earnings recorded yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-200">
            <thead className="text-slate-400">
              <tr>
                <th className="pb-2 pr-4 font-medium">Purpose</th>
                <th className="pb-2 pr-4 font-medium">Amount</th>
                <th className="pb-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {earnings.map((earning) => (
                <tr key={earning.id} className="border-t border-slate-800">
                  <td className="py-2 pr-4 capitalize">
                    {earning.purpose.replace(/^sig4sats_/, "").replace(/_/g, " ")}
                  </td>
                  <td className="py-2 pr-4">{formatSats(earning.amount_sats)}</td>
                  <td className="py-2">{formatRelativeTime(earning.received_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AgentDashboard({ agentId, onPurchaseRequest }: AgentDashboardProps) {
  const [agent, setAgent] = useState<AgentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalances>({
    event_tokens: 0,
    task_tokens: 0,
    contact_tokens: 0,
    dm_tokens: 0,
  });
  const [platformFeesPaid, setPlatformFeesPaid] = useState(0);
  const [purchaseRequest, setPurchaseRequest] = useState<TokenPurchaseRequest | null>(null);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [actionRequest, setActionRequest] = useState<AgentActionRequest | null>(null);
  const [showOTSProofs, setShowOTSProofs] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchAgent() {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("user_identities")
        .select("id, npub, nip05, role, agent_profiles(*), payment_config:agent_payment_config(*)")
        .eq("id", agentId)
        .single();

      if (!mounted) return;

      if (queryError || !data) {
        setAgent(null);
        setError("Unable to load agent dashboard.");
        setLoading(false);
        return;
      }

      const dashboardData = data as AgentDashboardData;
      const profile = normalizeRelation(dashboardData.agent_profiles);

      setAgent(dashboardData);
      setTokenBalances({
        event_tokens: profile?.event_tokens_balance ?? 0,
        task_tokens: profile?.task_tokens_balance ?? 0,
        contact_tokens: profile?.contact_tokens_balance ?? 0,
        dm_tokens: profile?.dm_tokens_balance ?? 0,
      });
      setPlatformFeesPaid(profile?.total_platform_fees_paid_sats ?? 0);
      setLoading(false);
    }

    void fetchAgent();

    return () => {
      mounted = false;
    };
  }, [agentId]);

  const profile = normalizeRelation(agent?.agent_profiles);
  const paymentConfig = normalizeRelation(agent?.payment_config);
  const unifiedAddress = profile?.unified_address ?? paymentConfig?.unified_address ?? "";
  const agentRole = profile?.agent_role ?? agent?.role ?? "agent";
  const nip05Verified = profile?.nip05_verified ?? Boolean(agent?.nip05);

  async function handleCopyAddress() {
    try {
      await copyToClipboard(unifiedAddress);
      showToast.success("Payment address copied.", { title: "Copied" });
    } catch (copyError) {
      const message = copyError instanceof Error ? copyError.message : "Unable to copy address.";
      showToast.error(message, { title: "Copy Failed" });
    }
  }

  function handlePurchaseSelection(option: TokenOption) {
    const nextRequest: TokenPurchaseRequest = {
      tokenType: option.tokenType,
      quantity: option.quantity,
      totalFeeSats: option.totalFeeSats,
    };

    setPurchaseRequest(nextRequest);
    setPurchaseModalOpen(true);
    onPurchaseRequest?.(nextRequest);
  }

  function handleActionRequest(nextRequest: AgentActionRequest) {
    setActionRequest(nextRequest);
  }

  if (loading) {
    return <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-slate-300">Loading agent dashboard…</div>;
  }

  if (error || !agent) {
    return <div className="rounded-xl border border-rose-800 bg-rose-950/20 p-6 text-rose-200">{error ?? "Agent not found."}</div>;
  }

  return (
    <div className="space-y-6 text-slate-100">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">{unifiedAddress || agent.npub}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-violet-600/20 px-3 py-1 text-violet-200">{agentRole}</span>
              {nip05Verified ? <span className="rounded-full bg-emerald-600/20 px-3 py-1 text-emerald-200">✓ NIP-05</span> : null}
              {profile?.free_tier_claimed ? (
                <span className="rounded-full bg-amber-600/20 px-3 py-1 text-amber-200">
                  Free Tier #{profile.free_tier_allocation_number ?? "—"}
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-sm text-slate-400">{agent.nip05 ?? agent.npub}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
        <h3 className="text-lg font-semibold">Blind Token Balances</h3>
        <p className="mt-2 text-sm text-slate-400">Blind tokens allow anonymous actions without linking activity back to your identity.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TOKEN_OPTIONS.map((option) => (
            <div key={option.tokenType} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="text-sm text-slate-400">{option.label}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-100">{tokenBalances[option.balanceKey]}</div>
              <button
                type="button"
                className="mt-4 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
                onClick={() => handlePurchaseSelection(option)}
              >
                {option.buttonLabel}
              </button>
            </div>
          ))}
        </div>
        {purchaseRequest ? (
          <div className="mt-4 rounded-xl border border-violet-700 bg-violet-950/30 p-4 text-sm text-violet-100">
            Selected purchase: {purchaseRequest.quantity} {purchaseRequest.tokenType.replace(/_/g, " ")} tokens for {formatSats(purchaseRequest.totalFeeSats)} sats.
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
        <h3 className="text-lg font-semibold">Agent Action Buttons</h3>
        <p className="mt-2 text-sm text-slate-400">
          Each action surfaces its fee and lets the agent choose anonymous tokens or direct payment.
        </p>
        <div className="mt-4">
          <ActionButtons
            agentId={agentId}
            onActionRequest={handleActionRequest}
            onPurchaseRequest={(request) => {
              setPurchaseRequest(request);
              setPurchaseModalOpen(true);
              onPurchaseRequest?.(request);
            }}
          />
        </div>
        {actionRequest ? (
          <div className="mt-4 rounded-xl border border-emerald-700 bg-emerald-950/20 p-4 text-sm text-emerald-100">
            Selected {actionRequest.paymentMethod === "blind_token" ? "anonymous token" : "direct payment"} for {actionRequest.actionType.replace(/_/g, " ")} at {formatSats(actionRequest.feeSats)}.
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
        <h3 className="text-lg font-semibold">Platform Fees</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <StatCard label="Total Paid" value={formatSats(platformFeesPaid)} />
        </div>
        <div className="mt-4">
          <RecentFeesTable agentId={agentId} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
        <h3 className="text-lg font-semibold">Universal Payment Address</h3>
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <input
            readOnly
            value={unifiedAddress}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          />
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
            onClick={handleCopyAddress}
          >
            Copy
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {paymentConfig?.lightning_enabled ? <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-yellow-100">⚡ Lightning</span> : null}
          {paymentConfig?.cashu_enabled ? <span className="rounded-full bg-lime-500/20 px-3 py-1 text-lime-100">🥜 Cashu</span> : null}
          {paymentConfig?.fedimint_enabled ? <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-cyan-100">🏛️ Fedimint</span> : null}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <StatCard label="Lightning Received" value={formatSats(paymentConfig?.total_received_lightning_sats ?? 0)} />
          <StatCard label="Cashu Received" value={formatSats(paymentConfig?.total_received_cashu_sats ?? 0)} />
          <StatCard label="Fedimint Received" value={formatSats(paymentConfig?.total_received_fedimint_sats ?? 0)} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
        <h3 className="text-lg font-semibold">Reputation & Bonds</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Reputation Score" value={profile?.reputation_score ?? 0} />
          <StatCard label="Credit Limit" value={formatSats(profile?.credit_limit_sats ?? 0)} />
          <StatCard label="Currently Bonded" value={formatSats(profile?.current_bonded_sats ?? 0)} />
          <StatCard
            label="Bond Release Rate"
            value={`${calculateBondReleaseRate(profile?.total_bonds_released_sats ?? 0, profile?.total_bonds_staked_sats ?? 0)}%`}
          />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-200">⭐ Self-Report: {profile?.tier1_validations ?? 0}</div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-200">⭐⭐ Peer Verified: {profile?.tier2_validations ?? 0}</div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-200">⭐⭐⭐ Oracle: {profile?.tier3_validations ?? 0}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
        <h3 className="text-lg font-semibold">OpenTimestamps Proofs</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <StatCard label="Total Proofs Generated" value={profile?.ots_attestation_count ?? 0} />
          <StatCard
            label="Last Proof Generated"
            value={
              profile?.last_ots_attestation_at
                ? new Date(profile.last_ots_attestation_at).toLocaleString()
                : "Never"
            }
          />
        </div>
        <div className="mt-4">
          <button
            type="button"
            className="w-full rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
            onClick={() => setShowOTSProofs(!showOTSProofs)}
          >
            {showOTSProofs ? "Hide All Proofs" : "View All Proofs"}
          </button>
        </div>
        {showOTSProofs && (
          <div className="mt-4">
            <OTSProofList agentPubkey={profile?.agent_pubkey ?? undefined} />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
        <h3 className="text-lg font-semibold">Sig4Sats Earnings</h3>
        <div className="mt-4">
          <Sig4SatsEarningsTable agentId={agentId} />
        </div>
      </section>

      {purchaseRequest ? (
        <TokenPurchaseModal
          isOpen={purchaseModalOpen}
          agentId={agentId}
          tokenType={purchaseRequest.tokenType}
          quantity={purchaseRequest.quantity}
          onClose={() => setPurchaseModalOpen(false)}
          onPurchaseComplete={() => {
            showToast.success("Blind token purchase recorded locally.", {
              title: "Tokens Ready",
            });
          }}
        />
      ) : null}
    </div>
  );
}