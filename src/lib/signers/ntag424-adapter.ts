/**
 * NTAG424 Physical MFA Signer Adapter
 *
 * Acts as a second-factor authorization gate using Web NFC + server-side PIN validation
 * before delegating real signing to the existing secure session (NIP-05/password vault via CEPS).
 *
 * - Zero-knowledge: no PIN or secret storage; per-operation NFC auth only
 * - Browser-only: uses Web APIs (CustomEvent, Web NFC check, Web Crypto for requestId)
 * - Feature gated by VITE_ENABLE_NFC_SIGNING (default false)
 * - CRITICAL: Signs events directly using secureNsecManager to avoid infinite recursion with CEPS
 */

import { signEventWithCeps } from "../ceps";
import type {
  SignerAdapter,
  SignerCapability,
  SignerStatus,
  SigningMethodId,
} from "./signer-adapter";

// Local JSON shape helper
type JsonRecord = Record<string, unknown>;

type Operation = "event" | "payment" | "threshold";

function getFlag(key: string, def: boolean): boolean {
  try {
    if (typeof process === "undefined") return def;
    const env = process.env as Record<string, string | undefined>;
    const v = env[key];
    if (v == null) return def;
    const s = String(v).toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  } catch {
    return def;
  }
}

function hasNfcSupport(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const w = window as any;
    return !!w?.NDEFReader || !!(navigator as any)?.nfc;
  } catch {
    return false;
  }
}

function genRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class Ntag424Adapter implements SignerAdapter {
  public readonly id: SigningMethodId = "ntag424";
  public readonly label = "NTAG424 Physical MFA";
  public readonly capabilities: SignerCapability = {
    event: true,
    payment: true,
    threshold: true,
  };

  private readonly featureEnabled = getFlag("VITE_ENABLE_NFC_SIGNING", false);
  private lastAuthAt: number | null = null;
  private authTtlMs = 120_000; // 2 minutes window to show as connected

  async initialize(): Promise<void> {
    // No-op: we do platform check in getStatus and per-operation
    return;
  }

  async getStatus(): Promise<SignerStatus> {
    try {
      if (!this.featureEnabled) return "unavailable";
      if (!hasNfcSupport()) return "unavailable";
      if (this.lastAuthAt && Date.now() - this.lastAuthAt < this.authTtlMs)
        return "connected";
      // We require per-operation auth; show as locked to hint interaction is needed
      return "locked";
    } catch (e) {
      console.error("[NTAG424Adapter] getStatus error:", e);
      return "error";
    }
  }

  async connect(): Promise<void> {
    await this.requireNfcAuth("event");
  }

  async disconnect(): Promise<void> {
    // Clear transient auth state
    this.lastAuthAt = null;
  }

  async signEvent(unsigned: unknown): Promise<unknown> {
    await this.requireNfcAuth("event");
    return await signEventWithCeps(unsigned as any);
  }

  async authorizePayment(
    request: unknown
  ): Promise<{ authorized: boolean; proof?: unknown; error?: string }> {
    try {
      await this.requireNfcAuth("payment");
      const now = Math.floor(Date.now() / 1000);
      const unsigned = {
        kind: 7371,
        created_at: now,
        tags: [
          ["m", "payment"],
          ["client", "satnam"],
          ["auth", "ntag424"],
        ],
        content: JSON.stringify(request as JsonRecord),
      } as any;
      const ev = await signEventWithCeps(unsigned);
      return { authorized: true, proof: { type: "nostr-event", payload: ev } };
    } catch (e) {
      return {
        authorized: false,
        error: e instanceof Error ? e.message : "Payment authorization failed",
      };
    }
  }

  async signThreshold(
    payload: unknown,
    sessionId: string
  ): Promise<{ partial: unknown; meta?: Record<string, unknown> }> {
    await this.requireNfcAuth("threshold");
    if (!sessionId) {
      throw new Error("sessionId is required for threshold signing");
    }
    const now = Math.floor(Date.now() / 1000);
    const unsigned = {
      kind: 7375,
      created_at: now,
      tags: [
        ["m", "threshold"],
        ["session", sessionId],
        ["auth", "ntag424"],
      ],
      content: JSON.stringify(payload as JsonRecord),
    } as any;
    const ev = await signEventWithCeps(unsigned);
    return { partial: ev, meta: { method: this.id } };
  }

  // --- Helpers ---

  private async requireNfcAuth(operation: Operation): Promise<void> {
    if (!this.featureEnabled) throw new Error("NFC signing is disabled");
    if (!hasNfcSupport())
      throw new Error("NFC not supported on this device/browser");

    const result = await this.requestNfcAuth(operation, 120_000);
    if (!result?.success) {
      const msg =
        typeof result?.error === "string" && result.error
          ? result.error
          : "User cancelled NFC authentication";
      throw new Error(msg);
    }
    // Mark as recently authenticated
    this.lastAuthAt = Date.now();
  }

  private requestNfcAuth(
    operation: Operation,
    timeoutMs: number
  ): Promise<{ success: boolean; error?: string; authResult?: unknown }> {
    return new Promise((resolve) => {
      const requestId = genRequestId();
      let done = false;
      let timeoutHandle: any = null;

      const onResult = (evt: Event) => {
        try {
          const e = evt as CustomEvent<{
            requestId?: string;
            success?: boolean;
            error?: string;
            authResult?: unknown;
          }>;
          if (!e?.detail || e.detail.requestId !== requestId) return;
          cleanup();
          done = true;
          resolve({
            success: !!e.detail.success,
            error: e.detail.error,
            authResult: e.detail.authResult,
          });
        } catch {
          cleanup();
          done = true;
          resolve({ success: false, error: "NFC authentication failed" });
        }
      };

      const cleanup = () => {
        window.removeEventListener(
          "satnam:ntag-auth-result",
          onResult as EventListener
        );
        if (timeoutHandle) clearTimeout(timeoutHandle);
      };

      // Install listener
      window.addEventListener(
        "satnam:ntag-auth-result",
        onResult as EventListener
      );

      // Dispatch open request
      const detail = { requestId, mode: "authentication", operation } as const;
      window.dispatchEvent(
        new CustomEvent("satnam:open-ntag-auth", { detail })
      );

      // Timeout -> treat as user cancel
      timeoutHandle = setTimeout(() => {
        if (done) return;
        cleanup();
        resolve({ success: false, error: "User cancelled NFC authentication" });
      }, timeoutMs);
    });
  }
}

export default Ntag424Adapter;
