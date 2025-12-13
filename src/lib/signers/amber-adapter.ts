/**
 * Amber (NIP-46 / NIP-55) Signer Adapter
 *
 * Provides event signing via Amber mobile signer using Nostr Connect (NIP-46) pairing
 * and (optional) Android intent bridge (NIP-55). This adapter acts as a remote
 * signer delegator and stores no key material beyond ephemeral client keys used
 * for pairing. Browser-only; no Node.js APIs.
 */

import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";
import type {
  SignerAdapter,
  SignerCapability,
  SignerStatus,
  SigningMethodId,
} from "./signer-adapter";

/**
 * Type-safe interface for CEPS NIP-46 methods
 * Extends the base CEPS type to include NIP-46 specific functionality
 */
interface CEPSWithNip46 {
  getNip46PairingState?: () => { signerPubHex?: string } | null;
  clearNip46Pairing?: () => void;
  nip46SignEvent?: (unsigned: unknown) => Promise<{ event?: unknown }>;
  getRelays?: () => string[] | undefined;
  getPublicKeyHex?: (privateKeyHex: string) => string;
  establishNip46Connection?: (opts: {
    clientPrivHex: string;
    clientPubHex: string;
    secretHex: string;
    relay: string;
    encryption: string;
  }) => Promise<{ signerPubHex?: string }>;
  verifyEvent?: (ev: unknown) => boolean;
}

function getFlag(key: string, def: boolean): boolean {
  try {
    // Access process.env safely without type assertion
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

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class AmberAdapter implements SignerAdapter {
  public readonly id: SigningMethodId = "amber";
  public readonly label = "Amber (Nostr Connect)";
  public readonly capabilities: SignerCapability = {
    event: true,
    payment: false,
    threshold: false,
  };

  private paired = false; // becomes true after user completes pairing in Amber (best-effort)
  private pairingUri: string | null = null;
  private clientPrivHex: string | null = null;
  private clientPubHex: string | null = null;
  private sharedSecretHex: string | null = null;

  // ---- NIP-55 (Android intent) ephemeral state ----
  private nip55Pending: Map<
    string,
    {
      id: string;
      nonce?: string;
      resolve: (v: any) => void;
      reject: (e: any) => void;
      timer: any;
    }
  > = new Map();
  private nip55SignerPubHex: string | null = null;

  private getAmberPackage(): string {
    try {
      if (typeof process === "undefined") return "com.greenart.amber";
      const env = process.env as Record<string, string | undefined>;
      const v = env["VITE_AMBER_PACKAGE_NAME"];
      return v && String(v).trim().length > 0
        ? String(v)
        : "com.greenart.amber";
    } catch {
      return "com.greenart.amber";
    }
  }
  private getAmberScheme(): string {
    try {
      if (typeof process === "undefined") return "nostrsigner";
      const env = process.env as Record<string, string | undefined>;
      const v = env["VITE_AMBER_INTENT_SCHEME"];
      return v && String(v).trim().length > 0 ? String(v) : "nostrsigner";
    } catch {
      return "nostrsigner";
    }
  }
  private getAmberCallbackUrl(): string {
    try {
      if (typeof process === "undefined")
        return "https://www.satnam.pub/amber-intent-callback";
      const env = process.env as Record<string, string | undefined>;
      const v = env["VITE_AMBER_CALLBACK_URL"];
      return v && String(v).trim().length > 0
        ? String(v)
        : "https://www.satnam.pub/amber-intent-callback";
    } catch {
      return "https://www.satnam.pub/amber-intent-callback";
    }
  }

  async initialize(): Promise<void> {
    // No-op; defer until connect()
    this.paired = false;
    this.pairingUri = null;
    this.clientPrivHex = null;
    this.clientPubHex = null;
    this.sharedSecretHex = null;
  }

  async getStatus(): Promise<SignerStatus> {
    try {
      if (!isAndroid()) return "unavailable";
      // Reflect CEPS pairing state (NIP-46) and local NIP-55 state
      try {
        const cepsTyped = CEPS as unknown as CEPSWithNip46;
        const st = cepsTyped.getNip46PairingState?.();
        if (st && st.signerPubHex) this.paired = true;
      } catch {}
      if (this.nip55SignerPubHex) this.paired = true;
      return this.paired ? "connected" : "available";
    } catch {
      return "error";
    }
  }

  async connect(): Promise<void> {
    if (!isAndroid()) {
      throw new Error("Amber signing is only available on Android devices");
    }

    // Prefer NIP-55 on Android if enabled; fallback to NIP-46 on failure
    if (this.preferNip55()) {
      try {
        const pub = await this.nip55GetPublicKey();
        if (pub && typeof pub === "string") {
          this.nip55SignerPubHex = pub;
          this.paired = true;
          return;
        }
      } catch (e) {
        // fall through to NIP-46
      }
    }

    // NIP-46 fallback flow
    const sk = new Uint8Array(32);
    crypto.getRandomValues(sk);
    const clientPrivHex = bytesToHex(sk);
    const clientPubHex = CEPS.getPublicKeyHex(clientPrivHex);

    const secret = new Uint8Array(32);
    crypto.getRandomValues(secret);
    const secretHex = bytesToHex(secret);

    const cepsTyped = CEPS as unknown as CEPSWithNip46;
    const relays = cepsTyped.getRelays?.() as string[] | undefined;
    const relay =
      Array.isArray(relays) && relays.length
        ? relays[0]
        : "wss://relay.satnam.pub";

    const uri = `nostrconnect://${clientPubHex}?relay=${encodeURIComponent(
      relay
    )}&secret=${encodeURIComponent(secretHex)}`;

    const handshake = cepsTyped.establishNip46Connection?.({
      clientPrivHex,
      clientPubHex,
      secretHex,
      relay,
      encryption: "nip04",
    });

    // Open URI in new tab to preserve current context and allow await to complete
    try {
      if (
        typeof window !== "undefined" &&
        typeof window.location !== "undefined"
      ) {
        window.open(uri, "_blank");
      }
    } catch {}

    try {
      const res = await handshake;
      if (res && res.signerPubHex) this.paired = true;
    } catch (e) {
      this.paired = false;
      throw new Error(e instanceof Error ? e.message : "Amber pairing failed");
    }
  }

  async disconnect(): Promise<void> {
    // Clear local session state
    this.paired = false;
    this.nip55SignerPubHex = null;
    // Reject and clear any pending NIP-55 awaits
    try {
      const entries = Array.from(this.nip55Pending.entries());
      for (let i = 0; i < entries.length; i++) {
        const [id, entry] = entries[i];
        try {
          entry.reject(new Error(`amber_nip55_disconnected:${id}`));
        } catch {}
        clearTimeout(entry.timer);
      }
      this.nip55Pending.clear();
    } catch {}
    try {
      const cepsTyped = CEPS as unknown as CEPSWithNip46;
      cepsTyped.clearNip46Pairing?.();
    } catch {}
  }

  // ---- NIP-55 helpers ----
  private preferNip55(): boolean {
    try {
      if (!isAndroid()) return false;
      // Local preference override from Settings (persisted across sessions)
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem("amberPreferNip55");
        if (raw != null) {
          const s = String(raw).toLowerCase();
          if (s === "1" || s === "true" || s === "yes") return true;
          if (s === "0" || s === "false" || s === "no") return false;
        }
      }
      // Default flag-gated behavior
      return getFlag("VITE_ENABLE_AMBER_NIP55", true);
    } catch {
      return false;
    }
  }

  private generateIdHex(bytesLen = 16): string {
    const b = new Uint8Array(bytesLen);
    crypto.getRandomValues(b);
    return bytesToHex(b);
  }

  private async nip55LaunchIntent(
    req: any,
    path: "get_public_key" | "sign_event",
    id: string
  ): Promise<string> {
    const scheme = this.getAmberScheme();
    const pkg = this.getAmberPackage();
    const callback = this.getAmberCallbackUrl();

    const payload = {
      id,
      method: path === "get_public_key" ? "get_public_key" : "sign_event",
      params: path === "sign_event" ? { event: req } : {},
      callback,
      app: "satnam.pub",
    };
    const json = JSON.stringify(payload);
    const base64url = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const nonce = this.generateIdHex(8);
    const intent = `intent://${path}#Intent;scheme=${encodeURIComponent(
      scheme
    )};package=${encodeURIComponent(pkg)};S.REQUEST=${encodeURIComponent(
      base64url
    )};S.CALLBACK_URL=${encodeURIComponent(
      callback
    )};S.NONCE=${encodeURIComponent(nonce)};end`;

    // Open intent via browser
    try {
      if (typeof window !== "undefined") {
        window.location.href = intent;
      }
    } catch {}

    return nonce;
  }

  private nip55AwaitCallback(
    id: string,
    timeoutMs = 60000,
    nonce?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          this.nip55Pending.delete(id);
        } catch {}
        reject(new Error("amber_nip55_timeout"));
      }, timeoutMs);
      this.nip55Pending.set(id, { id, nonce, resolve, reject, timer });
    });
  }

  public nip55HandleCallbackParams(params: URLSearchParams): void {
    try {
      const id = params.get("id") || "";
      const ok = params.get("ok") || "0";
      const resultB64 = params.get("result") || "";
      const errMsg = params.get("error") || "";
      const nonceParam = params.get("nonce") || params.get("NONCE") || "";

      if (!id || !this.nip55Pending.has(id)) return;
      const pending = this.nip55Pending.get(id)!;
      clearTimeout(pending.timer);
      this.nip55Pending.delete(id);

      // Strict NONCE validation (default on)
      const strict = getFlag("VITE_AMBER_STRICT_NIP55_VALIDATION", true);
      if (strict) {
        const expected = pending.nonce || "";
        if (!nonceParam || !expected || nonceParam !== expected) {
          pending.reject(
            new Error("Invalid or missing NONCE in Amber callback")
          );
          return;
        }
      }

      if (ok !== "1") {
        pending.reject(new Error(errMsg || "amber_nip55_cancelled"));
        return;
      }

      if (resultB64) {
        try {
          const json = decodeURIComponent(
            escape(atob(resultB64.replace(/-/g, "+").replace(/_/g, "/")))
          );
          const data = JSON.parse(json);
          pending.resolve(data);
          return;
        } catch (e) {
          pending.reject(new Error("amber_nip55_result_parse_failed"));
          return;
        }
      }
      pending.resolve({ ok: true });
    } catch (e) {
      // No-op; best-effort processing
    }
  }

  private async nip55GetPublicKey(): Promise<string> {
    const id = this.generateIdHex();
    const nonce = await this.nip55LaunchIntent({}, "get_public_key", id);
    const res = await this.nip55AwaitCallback(id, 60000, nonce);
    const pub = (res && (res.pubkey || res.result?.pubkey)) as
      | string
      | undefined;
    if (!pub) throw new Error("amber_nip55_no_pubkey");
    // record locally
    this.nip55SignerPubHex = pub;
    return pub;
  }

  private async nip55SignEvent(unsigned: object): Promise<any> {
    const id = this.generateIdHex();
    const nonce = await this.nip55LaunchIntent(unsigned, "sign_event", id);
    const res = await this.nip55AwaitCallback(id, 60000, nonce);
    const ev = res?.event || res?.result?.event || res;
    // Validate signature and (if known) pubkey
    try {
      if (!ev || typeof ev !== "object")
        throw new Error("amber_nip55_no_event");
      const verified = CEPS.verifyEvent(ev as any);
      if (!verified) throw new Error("amber_nip55_invalid_signature");
      if (
        this.nip55SignerPubHex &&
        ev.pubkey &&
        ev.pubkey !== this.nip55SignerPubHex
      ) {
        throw new Error("amber_nip55_pubkey_mismatch");
      }
    } catch (e) {
      throw new Error(
        e instanceof Error ? e.message : "amber_nip55_verify_failed"
      );
    }
    return ev;
  }

  async signEvent(unsigned: unknown): Promise<unknown> {
    if (!isAndroid()) {
      throw new Error("Amber signing requires Android device");
    }

    // Prefer NIP-55 if enabled and paired
    if (this.preferNip55()) {
      // If not yet paired via NIP-55, attempt quick pubkey query once
      if (!this.paired || !this.nip55SignerPubHex) {
        try {
          const pub = await this.nip55GetPublicKey();
          if (pub) {
            this.nip55SignerPubHex = pub;
            this.paired = true;
          }
        } catch {
          // fall back to NIP-46 path below
        }
      }
      if (this.paired && this.nip55SignerPubHex) {
        const ev = await this.nip55SignEvent(unsigned as object);
        return ev;
      }
    }

    // NIP-46 fallback signing
    if (!this.paired) {
      const cepsTyped = CEPS as unknown as CEPSWithNip46;
      const st = cepsTyped.getNip46PairingState?.();
      if (!(st && st.signerPubHex)) {
        throw new Error(
          "Amber is not paired. Open Amber and complete pairing."
        );
      }
      this.paired = true;
    }
    const cepsTyped = CEPS as unknown as CEPSWithNip46;
    const res = await cepsTyped.nip46SignEvent?.(unsigned);
    return res?.event ?? res;
  }

  async authorizePayment(): Promise<{
    authorized: boolean;
    proof?: unknown;
    error?: string;
  }> {
    return { authorized: false, error: "Not supported by Amber" };
  }

  async signThreshold(): Promise<{
    partial: unknown;
    meta?: Record<string, unknown>;
  }> {
    throw new Error("Threshold signing not supported by Amber");
  }

  // ---- Public NIP-46 pairing helpers ----

  /**
   * Generate a NIP-46 pairing URI for external signers to scan
   * Returns the nostrconnect:// URI along with ephemeral credentials
   */
  generatePairingUri(options?: {
    permissions?: string;
    appName?: string;
    appUrl?: string;
  }): {
    uri: string;
    clientPubKeyHex: string;
    secretHex: string;
    relay: string;
  } {
    const {
      permissions = "sign_event,nip44_encrypt,nip44_decrypt",
      appName = "Satnam",
      appUrl = "https://satnam.pub",
    } = options ?? {};

    // Generate ephemeral client keypair
    const sk = new Uint8Array(32);
    crypto.getRandomValues(sk);
    const clientPrivHex = bytesToHex(sk);
    const clientPubHex = CEPS.getPublicKeyHex(clientPrivHex);

    // Generate random secret
    const secret = new Uint8Array(32);
    crypto.getRandomValues(secret);
    const secretHex = bytesToHex(secret);

    // Get relay
    const cepsTyped = CEPS as unknown as CEPSWithNip46;
    const relays = cepsTyped.getRelays?.() as string[] | undefined;
    const relay =
      Array.isArray(relays) && relays.length
        ? relays[0]
        : "wss://relay.satnam.pub";

    // Store for later use
    this.clientPrivHex = clientPrivHex;
    this.clientPubHex = clientPubHex;
    this.sharedSecretHex = secretHex;
    this.pairingUri = null;

    // Build URI
    const params = new URLSearchParams();
    params.set("relay", relay);
    params.set("secret", secretHex);
    params.set("name", appName);
    params.set("perms", permissions);
    if (appUrl) {
      params.set("url", appUrl);
    }

    const uri = `nostrconnect://${clientPubHex}?${params.toString()}`;
    this.pairingUri = uri;

    return {
      uri,
      clientPubKeyHex: clientPubHex,
      secretHex,
      relay,
    };
  }

  /**
   * Get current pairing state
   */
  getPairingState(): {
    isPaired: boolean;
    signerPubKeyHex: string | null;
    pairingUri: string | null;
  } {
    // Check NIP-55 state
    if (this.nip55SignerPubHex) {
      return {
        isPaired: true,
        signerPubKeyHex: this.nip55SignerPubHex,
        pairingUri: null, // NIP-55 doesn't use pairing URIs
      };
    }

    // Check CEPS NIP-46 state
    try {
      const cepsTyped = CEPS as unknown as CEPSWithNip46;
      const st = cepsTyped.getNip46PairingState?.();
      if (st && st.signerPubHex) {
        return {
          isPaired: true,
          signerPubKeyHex: st.signerPubHex,
          pairingUri: this.pairingUri,
        };
      }
    } catch {
      // Ignore
    }

    return {
      isPaired: this.paired,
      signerPubKeyHex: null,
      pairingUri: this.pairingUri,
    };
  }

  /**
   * Get the stored client public key (hex) used for pairing
   */
  getClientPubKeyHex(): string | null {
    return this.clientPubHex;
  }
}

export default AmberAdapter;
