import { useEffect, useMemo, useState } from "react";

import type { BlindTokenType } from "../../types/agent-tokens";
import { AGENT_ACTION_PRICING } from "../lib/agents/agent-action-pricing";
import { blindMessage } from "../lib/crypto/blind-signatures";
import { BlindTokenManager } from "../lib/crypto/blind-tokens";
import { formatSats } from "../lib/utils";
import { showToast } from "../services/toastService";

type PaymentProtocol = "lightning" | "cashu" | "fedimint";

interface TokenPurchaseModalProps {
  isOpen: boolean;
  agentId: string;
  tokenType: BlindTokenType;
  quantity?: number;
  onClose: () => void;
  onPurchaseComplete?: (payload: { tokenType: BlindTokenType; quantity: number }) => void;
}

const BLINDING_PUBLIC_KEY = `02${"11".repeat(32)}`;
const PAYMENT_PROTOCOLS: PaymentProtocol[] = ["lightning", "cashu", "fedimint"];

function generateRandomMessage(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `blind-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function TokenPurchaseModal({
  isOpen,
  agentId,
  tokenType,
  quantity,
  onClose,
  onPurchaseComplete,
}: TokenPurchaseModalProps) {
  const pricing = AGENT_ACTION_PRICING[tokenType];
  const defaultQuantity = quantity ?? pricing.bundleQuantity;
  const [selectedPaymentProtocol, setSelectedPaymentProtocol] =
    useState<PaymentProtocol>("lightning");
  const [paymentInvoice, setPaymentInvoice] = useState<string | null>(null);
  const [paymentProof, setPaymentProof] = useState("");
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalFeeSats = useMemo(() => {
    if (defaultQuantity === pricing.bundleQuantity) {
      return pricing.bundleFeeSats;
    }

    return pricing.singleFeeSats * defaultQuantity;
  }, [defaultQuantity, pricing.bundleFeeSats, pricing.bundleQuantity, pricing.singleFeeSats]);

  useEffect(() => {
    if (!isOpen) {
      setPaymentInvoice(null);
      setPaymentProof("");
      setError(null);
      setSelectedPaymentProtocol("lightning");
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleStartPurchase() {
    setLoadingInvoice(true);
    setError(null);

    try {
      const blindedMessages: string[] = [];

      for (let index = 0; index < defaultQuantity; index += 1) {
        const blinded = await blindMessage(generateRandomMessage(), BLINDING_PUBLIC_KEY);
        blindedMessages.push(blinded.blindedMessage);
      }

      const response = await fetch("/.netlify/functions/agents/issue-blind-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          token_type: tokenType,
          quantity: defaultQuantity,
          blinded_messages: blindedMessages,
          payment_protocol: selectedPaymentProtocol,
        }),
      });

      const result = (await response.json()) as { payment_request?: string; error?: string };

      if (!response.ok && response.status !== 402) {
        throw new Error(result.error ?? "Unable to generate token purchase invoice.");
      }

      if (!result.payment_request) {
        throw new Error("Payment invoice was not returned by the platform.");
      }

      setPaymentInvoice(result.payment_request);
    } catch (purchaseError) {
      setError(
        purchaseError instanceof Error
          ? purchaseError.message
          : "Unable to start blind token purchase.",
      );
    } finally {
      setLoadingInvoice(false);
    }
  }

  async function handleCompletePurchase() {
    if (!paymentProof.trim()) {
      setError("Provide a payment proof before completing the purchase.");
      return;
    }

    setPurchasing(true);
    setError(null);

    try {
      const tokenManager = new BlindTokenManager();
      await tokenManager.initialize();
      await tokenManager.purchaseTokens(
        agentId,
        tokenType,
        defaultQuantity,
        paymentProof.trim(),
        selectedPaymentProtocol,
      );

      showToast.success("Blind tokens purchased successfully.", { title: "Purchase Complete" });
      onPurchaseComplete?.({ tokenType, quantity: defaultQuantity });
      onClose();
    } catch (purchaseError) {
      setError(
        purchaseError instanceof Error
          ? purchaseError.message
          : "Unable to complete token purchase.",
      );
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-6 text-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Purchase Blind Tokens</h2>
            <p className="mt-2 text-sm text-slate-400">
              Tokens are purchased anonymously and stored client-side to preserve privacy.
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

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Action Type</div>
            <div className="mt-2 text-lg font-semibold">{pricing.label}</div>
            <div className="mt-2 text-sm text-slate-400">{pricing.description}</div>
          </div>
          <div className="rounded-xl border border-violet-800 bg-violet-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-violet-300">Bundle</div>
            <div className="mt-2 text-lg font-semibold">{defaultQuantity} tokens</div>
            <div className="mt-2 text-sm text-violet-100">Total: {formatSats(totalFeeSats)}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-medium text-slate-200">Payment Protocol</div>
          <div className="mt-3 flex flex-wrap gap-3">
            {PAYMENT_PROTOCOLS.map((protocol) => (
              <button
                key={protocol}
                type="button"
                onClick={() => setSelectedPaymentProtocol(protocol)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  selectedPaymentProtocol === protocol
                    ? "bg-violet-600 text-white"
                    : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                }`}
              >
                {protocol}
              </button>
            ))}
          </div>
        </div>

        {paymentInvoice ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-100">
              <div className="font-medium">Payment Invoice</div>
              <div className="mt-2 break-all font-mono text-xs">{paymentInvoice}</div>
            </div>

            <label className="block text-sm text-slate-200">
              Payment Proof
              <textarea
                value={paymentProof}
                onChange={(event) => setPaymentProof(event.target.value)}
                placeholder="Paste the payment proof, preimage, or settled payment reference here…"
                className="mt-2 min-h-[100px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </label>

            <button
              type="button"
              onClick={handleCompletePurchase}
              disabled={purchasing}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {purchasing ? "Completing Purchase…" : "Complete Purchase"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleStartPurchase}
            disabled={loadingInvoice}
            className="mt-6 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingInvoice ? "Generating Invoice…" : "Generate Payment Invoice"}
          </button>
        )}

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
