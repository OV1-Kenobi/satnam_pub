export type AgentWalletRoute =
  | "balance"
  | "pay"
  | "send"
  | "receive"
  | "history";

export type SpendRail = "lightning" | "cashu" | "auto";
export type PrivacyPreference = "high" | "balanced" | "fast";

export interface RailSelectionInput {
  requestedRail?: SpendRail;
  preferredRail?: SpendRail;
  privacyPreference?: PrivacyPreference;
  amountSats?: number;
  hasLightningTarget: boolean;
  hasCashuCapability: boolean;
  cashuBalanceSats?: number;
}

export function parseAgentWalletRoute(path: string): AgentWalletRoute | null {
  const normalized = path.replace(/\/+$/, "");
  if (normalized.endsWith("/v1/agent-wallet")) return "balance";
  if (normalized.endsWith("/v1/agent-wallet/pay")) return "pay";
  if (normalized.endsWith("/v1/agent-wallet/send")) return "send";
  if (normalized.endsWith("/v1/agent-wallet/receive")) return "receive";
  if (normalized.endsWith("/v1/agent-wallet/history")) return "history";
  return null;
}

export function normalizeRail(value: unknown): SpendRail {
  if (value === "lightning" || value === "cashu" || value === "auto") {
    return value;
  }
  return "auto";
}

export function normalizePrivacyPreference(
  value: unknown,
): PrivacyPreference {
  if (value === "high" || value === "balanced" || value === "fast") {
    return value;
  }
  return "balanced";
}

export function coercePositiveInteger(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

export function coerceOptionalInteger(
  value: unknown,
  fallback: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

export function looksLikeBolt11(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("lnbc") || normalized.startsWith("lntb") || normalized.startsWith("lnbcrt");
}

export function looksLikeCashuToken(value: string | undefined): boolean {
  if (!value) return false;
  return value.trim().startsWith("cashuA");
}

export function selectSpendRail(input: RailSelectionInput): SpendRail {
  const requestedRail = input.requestedRail ?? "auto";
  const preferredRail = input.preferredRail ?? "auto";
  const privacyPreference = input.privacyPreference ?? "balanced";
  const amountSats = input.amountSats ?? 0;
  const cashuCapable =
    input.hasCashuCapability && (input.cashuBalanceSats ?? amountSats) >= amountSats;

  if (requestedRail !== "auto") return requestedRail;
  if (preferredRail === "cashu" && cashuCapable) return "cashu";
  if (preferredRail === "lightning" && input.hasLightningTarget) return "lightning";
  if (privacyPreference === "high" && cashuCapable) return "cashu";
  if (amountSats > 0 && amountSats <= 5_000 && cashuCapable) return "cashu";
  if (input.hasLightningTarget) return "lightning";
  if (cashuCapable) return "cashu";
  return "lightning";
}

export function hashSafePreview(value: string): string {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}
