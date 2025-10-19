/**
 * NIP-05/Password Signer Adapter
 *
 * Wraps ClientSessionVault and SecureNsecManager to sign events via CEPS with zero-knowledge patterns.
 * - No plaintext nsec is persisted; temporary session is created in-memory for limited duration/ops
 * - Supports event, payment (as signed nostr event proof), and threshold (partial as signed event)
 */

import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";
import {
  ClientSessionVault,
  getVaultStatus,
} from "../auth/client-session-vault";
import { secureNsecManager } from "../secure-nsec-manager";
import type {
  SignerAdapter,
  SignerCapability,
  SignerStatus,
  SigningMethodId,
} from "./signer-adapter";

// Minimal shape for payment/threshold payloads without coupling to subsystems
type JsonRecord = Record<string, unknown>;

export class Nip05PasswordAdapter implements SignerAdapter {
  public readonly id: SigningMethodId = "nip05_password";
  public readonly label = "NIP-05 / Password";
  public readonly capabilities: SignerCapability = {
    event: true,
    payment: true,
    threshold: true,
  };

  private async ensureSession(interactive: boolean): Promise<string> {
    // 1) If a temporary session is active, use it
    const active = secureNsecManager.getActiveSessionId();
    if (active) {
      const st = secureNsecManager.getSessionStatus(active);
      if (st.active) return active;
    }

    // 2) Try to unlock the vault (non-interactive first, then interactive if requested)
    const unlockedSilently = await ClientSessionVault.unlock({
      interactive: false,
    });
    if (!unlockedSilently && interactive) {
      const ok = await ClientSessionVault.unlock({ interactive: true });
      if (!ok) throw new Error("Vault locked");
    } else if (!unlockedSilently && !interactive) {
      throw new Error("Vault locked");
    }

    // 3) Create a bounded temporary session from unlocked vault material
    const nsecHex = await ClientSessionVault.getNsecHex();
    if (!nsecHex) throw new Error("Vault material unavailable");

    // 10 minutes, 50 operations default (matches manager defaults)
    const sessionId = await (
      secureNsecManager as any
    ).createPostRegistrationSession(nsecHex, 10 * 60 * 1000, 50, false);
    return sessionId as string;
  }

  async initialize(): Promise<void> {
    // Best-effort silent unlock to make adapter immediately usable when possible
    try {
      await ClientSessionVault.unlock({ interactive: false });
    } catch {
      /* ignore */
    }
  }

  async getStatus(): Promise<SignerStatus> {
    try {
      const sid = secureNsecManager.getActiveSessionId();
      if (sid && secureNsecManager.getSessionStatus(sid).active)
        return "connected";

      const status = await getVaultStatus();
      if (status === "none") {
        // Adapter is conceptually available; user may bootstrap later
        return "available";
      }
      // If a record exists but we couldn't silently unlock, treat as locked
      const ok = await ClientSessionVault.unlock({ interactive: false });
      return ok ? "available" : "locked";
    } catch {
      return "error";
    }
  }

  async connect(): Promise<void> {
    // Interactive unlock + session create
    await this.ensureSession(true);
  }

  async disconnect(): Promise<void> {
    try {
      secureNsecManager?.clearTemporarySession?.();
    } catch {
      /* ignore */
    }
  }

  async signEvent(unsigned: unknown): Promise<unknown> {
    // Ensure a valid session (non-interactive; caller UI should have connected already)
    await this.ensureSession(false);
    // Route through CEPS legacy path which uses the secure session
    // CEPS will validate and finalize event
    return await CEPS.signEventWithActiveSession(unsigned as any);
  }

  async authorizePayment(
    request: unknown
  ): Promise<{ authorized: boolean; proof?: unknown; error?: string }> {
    try {
      await this.ensureSession(false);
      const now = Math.floor(Date.now() / 1000);
      // Construct a generic proof event (kind 7371 reserved for app-auth proofs)
      const unsigned = {
        kind: 7371,
        created_at: now,
        tags: [
          ["m", "payment"],
          ["client", "satnam"],
        ],
        content: JSON.stringify(request as JsonRecord),
      } as any;
      const ev = await CEPS.signEventWithActiveSession(unsigned);
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
    // We produce a signed event as the partial artifact for now; federated combiner will interpret it
    await this.ensureSession(false);
    const now = Math.floor(Date.now() / 1000);
    const unsigned = {
      kind: 7375,
      created_at: now,
      tags: [
        ["m", "threshold"],
        ["session", String(sessionId || "")],
      ],
      content: JSON.stringify(payload as JsonRecord),
    } as any;
    const ev = await CEPS.signEventWithActiveSession(unsigned);
    return { partial: ev, meta: { method: this.id } };
  }
}

export default Nip05PasswordAdapter;
