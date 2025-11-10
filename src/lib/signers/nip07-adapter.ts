/**
 * NIP-07 Signer Adapter (browser extension: nos2x, Alby, etc.)
 *
 * Provides event signing via window.nostr. Payment/threshold are not supported by NIP-07.
 */

import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";
import type {
  SignerAdapter,
  SignerCapability,
  SignerStatus,
  SigningMethodId,
} from "./signer-adapter";

interface NostrExtension {
  signEvent: (
    unsigned: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  getPublicKey?: () => Promise<string>;
}

function getNostr(): NostrExtension | null {
  if (typeof window === "undefined") return null;
  const ext = (window as unknown as { nostr?: NostrExtension }).nostr;
  return ext ?? null;
}

export class Nip07Adapter implements SignerAdapter {
  public readonly id: SigningMethodId = "nip07";
  public readonly label = "NIP-07 Extension";
  public readonly capabilities: SignerCapability = {
    event: true,
    payment: false,
    threshold: false,
  };

  private connected = false;

  async initialize(): Promise<void> {
    // No-op: we detect availability on demand
    this.connected = false;
  }

  async getStatus(): Promise<SignerStatus> {
    // CRITICAL FIX: Check registration flag FIRST before any extension access
    // During Identity Forge registration, IdentityForgeGuard blocks getPublicKey()
    // to prevent NIP-07 extension access. We must return "unavailable" immediately
    // to prevent infinite recursion between selectSigner() -> getStatus() -> getPublicKey() -> error -> fallback adapter
    if (typeof window !== "undefined") {
      const win = window as any;
      if (win.__identityForgeRegFlow) {
        return "unavailable";
      }
    }

    const ext = getNostr();
    if (!ext) return "unavailable";
    if (this.connected) return "connected";

    // Best effort probe without user prompt
    try {
      if (ext.getPublicKey) {
        await ext.getPublicKey().catch(() => {});
      }
      return "available";
    } catch {
      return "available";
    }
  }

  async connect(): Promise<void> {
    const ext = getNostr();
    if (!ext) throw new Error("NIP-07 extension not detected");
    // Attempt a public key call to trigger permission UI in some extensions
    try {
      if (ext.getPublicKey) {
        await ext.getPublicKey();
      }
      this.connected = true;
    } catch (e) {
      this.connected = false;
      throw new Error(
        e instanceof Error ? e.message : "Extension permission denied or locked"
      );
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async signEvent(unsigned: unknown): Promise<unknown> {
    const ext = getNostr();
    if (!ext) throw new Error("NIP-07 not available");
    try {
      const signed = await ext.signEvent(unsigned as Record<string, unknown>);
      // Verify via CEPS if possible
      try {
        const ok = (CEPS as any).verifyEvent?.(signed);
        if (ok === false) throw new Error("Invalid signature from extension");
      } catch {
        // ignore verification if unavailable
      }
      return signed;
    } catch (e) {
      throw new Error(
        e instanceof Error
          ? e.message
          : "User rejected signing or extension error"
      );
    }
  }

  async authorizePayment(): Promise<{
    authorized: boolean;
    proof?: unknown;
    error?: string;
  }> {
    return { authorized: false, error: "Not supported by NIP-07" };
  }

  async signThreshold(): Promise<{
    partial: unknown;
    meta?: Record<string, unknown>;
  }> {
    throw new Error("Threshold signing not supported by NIP-07");
  }
}

export default Nip07Adapter;
