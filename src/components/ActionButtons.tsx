import { useEffect, useMemo, useState } from "react";

import type { BlindTokenType } from "../../types/agent-tokens";
import { AGENT_ACTION_PRICING } from "../lib/agents/agent-action-pricing";
import { BlindTokenManager } from "../lib/crypto/blind-tokens";
import { formatSats } from "../lib/utils";
import type { TokenPurchaseRequest } from "./AgentDashboard";

type PaymentMethod = "blind_token" | "direct_payment";

export interface AgentActionRequest {
  actionType: BlindTokenType;
  paymentMethod: PaymentMethod;
  feeSats: number;
}

interface BaseActionButtonProps {
  agentId: string;
  tokenType: BlindTokenType;
  label: string;
  onActionRequest?: (request: AgentActionRequest) => void;
  onPurchaseRequest?: (request: TokenPurchaseRequest) => void;
}

function ActionChoiceModal({
  actionLabel,
  feeSats,
  availableTokens,
  onClose,
  onUseToken,
  onDirectPayment,
  onBuyTokens,
}: {
  actionLabel: string;
  feeSats: number;
  availableTokens: number;
  onClose: () => void;
  onUseToken: () => void;
  onDirectPayment: () => void;
  onBuyTokens: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 text-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Choose how to pay for {actionLabel}</h3>
            <p className="mt-2 text-sm text-slate-400">
              Required fee: {formatSats(feeSats)} • Available blind tokens: {availableTokens}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={onUseToken}
            disabled={availableTokens < 1}
            className="rounded-xl bg-violet-600 px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Use Anonymous Token
          </button>
          <button
            type="button"
            onClick={onDirectPayment}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-left text-sm font-medium text-slate-100 transition hover:bg-slate-800"
          >
            Pay Directly
          </button>
          <button
            type="button"
            onClick={onBuyTokens}
            className="rounded-xl border border-emerald-700 bg-emerald-950/30 px-4 py-3 text-left text-sm font-medium text-emerald-100 transition hover:bg-emerald-950/50"
          >
            Buy More Tokens
          </button>
        </div>
      </div>
    </div>
  );
}

function BaseActionButton({
  tokenType,
  label,
  onActionRequest,
  onPurchaseRequest,
}: BaseActionButtonProps) {
  const [availableTokens, setAvailableTokens] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const pricing = AGENT_ACTION_PRICING[tokenType];

  useEffect(() => {
    let mounted = true;

    async function loadBalance() {
      const tokenManager = new BlindTokenManager();
      await tokenManager.initialize();

      if (mounted) {
        setAvailableTokens(tokenManager.getBalance(tokenType));
      }
    }

    void loadBalance();

    return () => {
      mounted = false;
    };
  }, [tokenType]);

  const helperText = useMemo(() => {
    if (availableTokens > 0) {
      return `${availableTokens} anonymous token${availableTokens === 1 ? "" : "s"} available`;
    }

    return "No anonymous tokens available";
  }, [availableTokens]);

  function handleBuyTokens() {
    onPurchaseRequest?.({
      tokenType,
      quantity: pricing.bundleQuantity,
      totalFeeSats: pricing.bundleFeeSats,
    });
    setShowModal(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-left transition hover:border-violet-500 hover:bg-slate-900"
      >
        <div className="text-sm font-medium text-slate-100">{label}</div>
        <div className="mt-2 text-lg font-semibold text-violet-200">{formatSats(pricing.singleFeeSats)}</div>
        <div className="mt-2 text-xs text-slate-400">{helperText}</div>
      </button>

      {showModal ? (
        <ActionChoiceModal
          actionLabel={label}
          feeSats={pricing.singleFeeSats}
          availableTokens={availableTokens}
          onClose={() => setShowModal(false)}
          onUseToken={() => {
            onActionRequest?.({ actionType: tokenType, paymentMethod: "blind_token", feeSats: pricing.singleFeeSats });
            setShowModal(false);
          }}
          onDirectPayment={() => {
            onActionRequest?.({ actionType: tokenType, paymentMethod: "direct_payment", feeSats: pricing.singleFeeSats });
            setShowModal(false);
          }}
          onBuyTokens={handleBuyTokens}
        />
      ) : null}
    </>
  );
}

interface ActionButtonsProps {
  agentId: string;
  onActionRequest?: (request: AgentActionRequest) => void;
  onPurchaseRequest?: (request: TokenPurchaseRequest) => void;
}

export function PublishEventButton(props: Omit<BaseActionButtonProps, "tokenType" | "label">) {
  return <BaseActionButton {...props} tokenType="event_post" label="Publish Event" />;
}

export function CreateTaskButton(props: Omit<BaseActionButtonProps, "tokenType" | "label">) {
  return <BaseActionButton {...props} tokenType="task_create" label="Create Task" />;
}

export function AddContactButton(props: Omit<BaseActionButtonProps, "tokenType" | "label">) {
  return <BaseActionButton {...props} tokenType="contact_add" label="Add Contact" />;
}

export function SendDMButton(props: Omit<BaseActionButtonProps, "tokenType" | "label">) {
  return <BaseActionButton {...props} tokenType="dm_send" label="Send Encrypted DM" />;
}

export default function ActionButtons({ onActionRequest, onPurchaseRequest }: ActionButtonsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <PublishEventButton agentId="" onActionRequest={onActionRequest} onPurchaseRequest={onPurchaseRequest} />
      <CreateTaskButton agentId="" onActionRequest={onActionRequest} onPurchaseRequest={onPurchaseRequest} />
      <AddContactButton agentId="" onActionRequest={onActionRequest} onPurchaseRequest={onPurchaseRequest} />
      <SendDMButton agentId="" onActionRequest={onActionRequest} onPurchaseRequest={onPurchaseRequest} />
    </div>
  );
}
