import { useMemo, useState } from "react";

import { fetchWithAuth } from "../../lib/auth/fetch-with-auth";

type AgentRole = "private" | "offspring" | "adult" | "steward" | "guardian";
type PaymentProtocol = "lightning" | "cashu" | "fedimint";
type PaygateProvider = "lightning_faucet" | "routstr" | "aperture" | "self_hosted";
type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;

export interface EconomicPreview {
  isFreeTier: boolean;
  requiredCreationFeeSats: number;
  requiredBondAmountSats: number;
  retry_configuration?: boolean;
}

export interface AgentIntentConfig {
  vision_title: string;
  vision_summary: string;
  mission_summary: string;
  mission_checklist: string[];
  value_context: string;
  constraints: string[];
  success_metrics: string[];
  extra_config?: Record<string, unknown>;
}

export interface AgentCreationWizardRequestContext {
  agent_username: string;
  nostr_pubkey: string;
  family_federation_id?: string;
  account_creation_payment_proof?: string;
  account_creation_payment_protocol?: PaymentProtocol;
  bond_amount_sats: number;
  bond_payment_type: PaymentProtocol;
  bond_payment_proof: string;
  preferred_protocol: PaymentProtocol;
  enable_lightning?: boolean;
  enable_cashu?: boolean;
  enable_fedimint?: boolean;
}

interface AgentPaygateConfig {
  provider: PaygateProvider;
  max_spend_per_call_sats: number;
  max_spend_per_hour_sats: number;
  max_spend_per_day_sats: number;
  fallback_provider: PaygateProvider | "";
}

interface AgentCreationWizardProps {
  creationContext: AgentCreationWizardRequestContext;
  onAgentCreated(agentId: string): void;
}

const SENSITIVE_INTENT_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bnsec1[0-9a-z]+\b/i, message: "Remove any raw nsec material from the intent text." },
  { pattern: /\b(private key|seed phrase|recovery phrase|mnemonic)\b/i, message: "Intent text cannot include key recovery material." },
  { pattern: /\b(password|passphrase|secret key|api key|auth token)\b/i, message: "Intent text cannot include passwords, tokens, or secret keys." },
];

const STEP_LABELS = [
  "Role & Context",
  "Vision",
  "Mission",
  "Value Creation",
  "Pay-Gate Provider",
  "Review & Economic Summary",
] as const;

const ROLE_OPTIONS: Array<{ value: AgentRole; description: string }> = [
  { value: "private", description: "Private agents operate with tightly scoped personal authority." },
  { value: "offspring", description: "Offspring agents inherit stricter family constraints and oversight." },
  { value: "adult", description: "Adult agents can act independently within federation-defined boundaries." },
  { value: "steward", description: "Steward agents manage delegated responsibilities for a federation." },
  { value: "guardian", description: "Guardian agents carry governance authority and broader policy implications." },
];

const PAYGATE_OPTIONS: Array<{ value: PaygateProvider; label: string; description: string }> = [
  { value: "lightning_faucet", label: "Lightning Faucet", description: "Lowest-friction managed spending with the highest external trust assumption." },
  { value: "routstr", label: "Routstr", description: "Shared provider path with moderate sovereignty and delegated routing trust." },
  { value: "aperture", label: "Aperture", description: "Gateway-style provider with stronger operator control and bounded trust." },
  { value: "self_hosted", label: "Self Hosted", description: "Highest sovereignty; you control the wallet or NWC source directly." },
];

export function AgentCreationWizard({ creationContext, onAgentCreated }: AgentCreationWizardProps) {
  const [step, setStep] = useState<WizardStep>(0);
  const [agentRole, setAgentRole] = useState<AgentRole>("adult");
  const [intent, setIntent] = useState<AgentIntentConfig>({
    vision_title: "",
    vision_summary: "",
    mission_summary: "",
    mission_checklist: [""],
    value_context: "",
    constraints: ["never store raw nsec"],
    success_metrics: [""],
  });
  const [paygate, setPaygate] = useState<AgentPaygateConfig>({
    provider: "self_hosted",
    max_spend_per_call_sats: 0,
    max_spend_per_hour_sats: 0,
    max_spend_per_day_sats: 0,
    fallback_provider: "",
  });
  const [economicPreview, setEconomicPreview] = useState<EconomicPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reviewItems = useMemo(
    () => ({
      mission_checklist: intent.mission_checklist.filter(Boolean),
      constraints: intent.constraints.filter(Boolean),
      success_metrics: intent.success_metrics.filter(Boolean),
    }),
    [intent],
  );

  const sensitiveIntentWarning = useMemo(() => getSensitiveIntentWarning(intent), [intent]);

  const economicSummary = useMemo(
    () => ({
      isFreeTier: economicPreview?.isFreeTier ?? false,
      requiredCreationFeeSats: economicPreview?.requiredCreationFeeSats ?? 0,
      requiredBondAmountSats:
        economicPreview?.requiredBondAmountSats ?? creationContext.bond_amount_sats,
    }),
    [creationContext.bond_amount_sats, economicPreview],
  );

  async function handleSubmit() {
    if (sensitiveIntentWarning) {
      setError(sensitiveIntentWarning);
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      ...creationContext,
      agent_role: agentRole,
      creator_type: "human" as const,
      intent: {
        ...intent,
        mission_checklist: reviewItems.mission_checklist,
        constraints: reviewItems.constraints,
        success_metrics: reviewItems.success_metrics,
        extra_config: {
          ...(intent.extra_config ?? {}),
          paygate_provider: paygate.provider,
        },
      },
      paygate: {
        provider: paygate.provider,
        max_spend_per_call_sats: paygate.max_spend_per_call_sats,
        max_spend_per_hour_sats: paygate.max_spend_per_hour_sats,
        max_spend_per_day_sats: paygate.max_spend_per_day_sats,
        fallback_provider: paygate.fallback_provider || null,
      },
    };

    const response = await fetchWithAuth("/.netlify/functions/agents/create-agent-with-fees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as {
      agent_id?: string;
      error?: string;
      lifecycle_state?: string;
      economic_failure_hint?: EconomicPreview;
    };

    if (!response.ok) {
      if (result.economic_failure_hint) {
        setEconomicPreview(result.economic_failure_hint);
      }
      setError(result.error ?? "Failed to create agent");
      setSubmitting(false);
      return;
    }

    if (
      result.lifecycle_state === "PENDING_CONFIG" ||
      result.economic_failure_hint?.retry_configuration
    ) {
      setEconomicPreview(result.economic_failure_hint ?? null);
      setError("Agent created, but configuration needs to be retried before continuing.");
      setSubmitting(false);
      return;
    }

    if (result.agent_id) {
      onAgentCreated(result.agent_id);
    }
  }

  function updateListField(
    field: "mission_checklist" | "constraints" | "success_metrics",
    index: number,
    value: string,
  ) {
    setIntent((current) => ({
      ...current,
      [field]: current[field].map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ),
    }));
  }

  function addListField(field: "mission_checklist" | "constraints" | "success_metrics") {
    setIntent((current) => ({ ...current, [field]: [...current[field], ""] }));
  }

  function removeListField(
    field: "mission_checklist" | "constraints" | "success_metrics",
    index: number,
  ) {
    setIntent((current) => ({
      ...current,
      [field]: current[field].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function canContinue(currentStep: WizardStep): boolean {
    if (sensitiveIntentWarning) {
      return false;
    }

    switch (currentStep) {
      case 1:
        return intent.vision_title.trim().length > 0 && intent.vision_summary.trim().length > 0;
      case 2:
        return intent.mission_summary.trim().length > 0;
      case 3:
        return intent.value_context.trim().length > 0;
      default:
        return true;
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-6 text-slate-100">
      <div className="flex flex-wrap gap-2 text-xs text-slate-400">
        {STEP_LABELS.map((label, index) => (
          <span
            key={label}
            className={`rounded-full px-3 py-1 ${index === step ? "bg-violet-600/30 text-violet-100" : "bg-slate-900 text-slate-400"}`}
          >
            {index}. {label}
          </span>
        ))}
      </div>

      {step === 0 ? (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Role & Context</h3>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">
            <div><strong>Federation context:</strong> New agents are created inside the selected federation authority path.</div>
            <div className="mt-2"><strong>Agent username:</strong> {creationContext.agent_username}</div>
            <div className="mt-1"><strong>Federation ID:</strong> {creationContext.family_federation_id ?? "Assigned during creation"}</div>
            <div className="mt-1"><strong>Default payment rail:</strong> {creationContext.preferred_protocol}</div>
          </div>
          {ROLE_OPTIONS.map((option) => (
            <label key={option.value} className="block rounded-xl border border-slate-800 p-4">
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="agent-role"
                  checked={agentRole === option.value}
                  onChange={() => setAgentRole(option.value)}
                />
                <div>
                  <div className="font-medium capitalize">{option.value}</div>
                  <div className="mt-1 text-sm text-slate-400">{option.description}</div>
                </div>
              </div>
            </label>
          ))}
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Vision</h3>
          <p className="text-sm text-amber-200">Do not place secrets, nsec material, passwords, or personal data in intent text.</p>
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            placeholder="Vision title"
            maxLength={120}
            value={intent.vision_title}
            onChange={(event) => setIntent((current) => ({ ...current, vision_title: event.target.value }))}
          />
          <textarea
            className="min-h-32 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            placeholder="High-level purpose"
            maxLength={500}
            value={intent.vision_summary}
            onChange={(event) => setIntent((current) => ({ ...current, vision_summary: event.target.value }))}
          />
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Mission</h3>
          <textarea
            className="min-h-32 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            placeholder="How the agent should operate"
            maxLength={500}
            value={intent.mission_summary}
            onChange={(event) => setIntent((current) => ({ ...current, mission_summary: event.target.value }))}
          />
          <ListEditor
            label="Mission checklist"
            values={intent.mission_checklist}
            onAdd={() => addListField("mission_checklist")}
            onChange={(index, value) => updateListField("mission_checklist", index, value)}
            onRemove={(index) => removeListField("mission_checklist", index)}
          />
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Value Creation</h3>
          <p className="text-sm text-emerald-200">
            Prefer privacy-first constraints such as remote signing, bounded scopes, and never storing raw nsec.
          </p>
          <textarea
            className="min-h-32 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            placeholder="Describe the value context, operating constraints, and success model"
            maxLength={600}
            value={intent.value_context}
            onChange={(event) => setIntent((current) => ({ ...current, value_context: event.target.value }))}
          />
          <ListEditor
            label="Constraints"
            values={intent.constraints}
            onAdd={() => addListField("constraints")}
            onChange={(index, value) => updateListField("constraints", index, value)}
            onRemove={(index) => removeListField("constraints", index)}
          />
          <ListEditor
            label="Success metrics"
            values={intent.success_metrics}
            onAdd={() => addListField("success_metrics")}
            onChange={(index, value) => updateListField("success_metrics", index, value)}
            onRemove={(index) => removeListField("success_metrics", index)}
          />
        </section>
      ) : null}

      {step === 4 ? (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Pay-Gate Provider</h3>
          <p className="text-sm text-slate-300">
            Sovereignty scale: <strong>lightning_faucet</strong> → <strong>routstr</strong> → <strong>aperture</strong> → <strong>self_hosted</strong>
          </p>
          {PAYGATE_OPTIONS.map((option) => (
            <label key={option.value} className="block rounded-xl border border-slate-800 p-4">
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="paygate-provider"
                  checked={paygate.provider === option.value}
                  onChange={() => setPaygate((current) => ({ ...current, provider: option.value }))}
                />
                <div>
                  <div className="font-medium">{option.label}</div>
                  <div className="mt-1 text-sm text-slate-400">{option.description}</div>
                </div>
              </div>
            </label>
          ))}
          <div className="grid gap-4 md:grid-cols-3">
            <NumberField
              label="Max spend / call"
              value={paygate.max_spend_per_call_sats}
              onChange={(value) => setPaygate((current) => ({ ...current, max_spend_per_call_sats: value }))}
            />
            <NumberField
              label="Max spend / hour"
              value={paygate.max_spend_per_hour_sats}
              onChange={(value) => setPaygate((current) => ({ ...current, max_spend_per_hour_sats: value }))}
            />
            <NumberField
              label="Max spend / day"
              value={paygate.max_spend_per_day_sats}
              onChange={(value) => setPaygate((current) => ({ ...current, max_spend_per_day_sats: value }))}
            />
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-300">Fallback provider</span>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              value={paygate.fallback_provider}
              onChange={(event) =>
                setPaygate((current) => ({
                  ...current,
                  fallback_provider: event.target.value as PaygateProvider | "",
                }))
              }
            >
              <option value="">No fallback</option>
              {PAYGATE_OPTIONS.filter((option) => option.value !== paygate.provider).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Review & Economic Summary</h3>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm">
            <div><strong>Role:</strong> {agentRole}</div>
            <div className="mt-2"><strong>Vision:</strong> {intent.vision_title || "—"}</div>
            <div className="mt-2"><strong>Mission:</strong> {intent.mission_summary || "—"}</div>
            <div className="mt-2"><strong>Value Context:</strong> {intent.value_context || "—"}</div>
            <div className="mt-2"><strong>Pay-Gate:</strong> {paygate.provider}</div>
            <div className="mt-2"><strong>Fallback:</strong> {paygate.fallback_provider || "No fallback"}</div>
            <div className="mt-2"><strong>Spend caps:</strong> {paygate.max_spend_per_call_sats}/{paygate.max_spend_per_hour_sats}/{paygate.max_spend_per_day_sats} sats</div>
            {reviewItems.mission_checklist.length > 0 ? (
              <div className="mt-2"><strong>Mission checklist:</strong> {reviewItems.mission_checklist.join(" • ")}</div>
            ) : null}
            {reviewItems.constraints.length > 0 ? (
              <div className="mt-2"><strong>Constraints:</strong> {reviewItems.constraints.join(" • ")}</div>
            ) : null}
            {reviewItems.success_metrics.length > 0 ? (
              <div className="mt-2"><strong>Success metrics:</strong> {reviewItems.success_metrics.join(" • ")}</div>
            ) : null}
          </div>
          <div className="rounded-xl border border-amber-700 bg-amber-950/20 p-4 text-sm text-amber-100">
            <div><strong>Free tier:</strong> {economicSummary.isFreeTier ? "Eligible based on backend preview" : "Not yet confirmed or not eligible"}</div>
            <div className="mt-1"><strong>Creation fee:</strong> {formatSats(economicSummary.requiredCreationFeeSats)}</div>
            <div className="mt-1"><strong>Bond ladder requirement:</strong> {formatSats(economicSummary.requiredBondAmountSats)}</div>
            <div className="mt-1"><strong>Payment route for retry:</strong> {creationContext.account_creation_payment_protocol ?? creationContext.preferred_protocol}</div>
            <div className="mt-2 text-xs text-amber-200">
              If the backend returns an economic failure hint, complete the required fee or bond via the existing payment/token flows and retry.
            </div>
          </div>
        </section>
      ) : null}

      {sensitiveIntentWarning ? (
        <div className="rounded-xl border border-rose-800 bg-rose-950/20 p-4 text-sm text-rose-200">
          {sensitiveIntentWarning}
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-rose-800 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</div> : null}

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm"
          disabled={step === 0 || submitting}
          onClick={() => setStep((current) => Math.max(0, current - 1) as WizardStep)}
        >
          Back
        </button>
        {step < 5 ? (
          <button
            type="button"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!canContinue(step) || submitting}
            onClick={() => setStep((current) => Math.min(5, current + 1) as WizardStep)}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "Creating…" : "Create Agent"}
          </button>
        )}
      </div>
    </div>
  );
}

function getSensitiveIntentWarning(intent: AgentIntentConfig): string | null {
  const fields = [
    intent.vision_title,
    intent.vision_summary,
    intent.mission_summary,
    intent.value_context,
    ...intent.mission_checklist,
    ...intent.constraints,
    ...intent.success_metrics,
  ].filter(Boolean);

  for (const value of fields) {
    for (const rule of SENSITIVE_INTENT_PATTERNS) {
      if (rule.pattern.test(value)) {
        return rule.message;
      }
    }
  }

  return null;
}

function ListEditor(props: {
  label: string;
  values: string[];
  onAdd(): void;
  onChange(index: number, value: string): void;
  onRemove(index: number): void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{props.label}</label>
        <button type="button" className="text-sm text-violet-300" onClick={props.onAdd}>
          Add row
        </button>
      </div>
      {props.values.map((value, index) => (
        <div key={`${props.label}-${index}`} className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            value={value}
            onChange={(event) => props.onChange(index, event.target.value)}
          />
          <button type="button" className="rounded-lg border border-slate-700 px-3" onClick={() => props.onRemove(index)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function NumberField(props: { label: string; value: number; onChange(value: number): void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-300">{props.label}</span>
      <input
        type="number"
        min={0}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value) || 0)}
      />
    </label>
  );
}

function formatSats(value: number): string {
  return `${value} sats`;
}

export default AgentCreationWizard;
