/**
 * NIP-46 Nostr Connect Client
 *
 * Browser-only implementation for client-initiated NIP-46 pairing.
 * Generates ephemeral keypairs and constructs nostrconnect:// URIs
 * for pairing with external signers like Amber.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/46.md
 */

import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";

/** Storage key for NIP-46 pairing state */
export const NIP46_STORAGE_KEY = "satnam.nip46.pairing";

/** Default pairing timeout in milliseconds (10 minutes) */
export const NIP46_PAIRING_TIMEOUT_MS = 10 * 60 * 1000;

/** Default permissions to request from signer */
export const NIP46_DEFAULT_PERMISSIONS =
  "sign_event,nip44_encrypt,nip44_decrypt";

/** Interface for CEPS NIP-46 methods */
interface CEPSWithNip46 {
  getNip46PairingState?: () => {
    signerPubHex?: string;
    clientPubHex?: string;
  } | null;
  clearNip46Pairing?: () => void;
  getRelays?: () => string[] | undefined;
  getPublicKeyHex?: (privateKeyHex: string) => string;
  establishNip46Connection?: (opts: {
    clientPrivHex: string;
    clientPubHex: string;
    secretHex: string;
    relay: string;
    encryption?: "nip04" | "nip44";
    timeoutMs?: number;
  }) => Promise<{ signerPubHex?: string }>;
}

/** Persisted NIP-46 pairing state */
export interface Nip46PairingStorage {
  clientPrivKeyHex: string;
  clientPubKeyHex: string;
  signerPubKeyHex: string | null;
  secretHex: string;
  relays: string[];
  connectedAt: number | null;
  expiresAt: number | null;
  createdAt: number;
}

/** Connection status for UI */
export type Nip46ConnectionStatus =
  | "idle"
  | "waiting"
  | "connected"
  | "error"
  | "expired";

/** Result of generating a pairing URI */
export interface Nip46PairingResult {
  uri: string;
  clientPubKeyHex: string;
  secretHex: string;
  relays: string[];
  expiresAt: number;
}

/** Convert Uint8Array to hex string */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a cryptographically random hex string
 */
export function generateRandomHex(byteLength: number = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Get available relays for NIP-46 connection
 */
export function getAvailableRelays(): string[] {
  try {
    const cepsTyped = CEPS as unknown as CEPSWithNip46;
    const relays = cepsTyped.getRelays?.();
    if (Array.isArray(relays) && relays.length > 0) {
      return relays;
    }
  } catch {
    // Fall through to default
  }
  return ["wss://relay.satnam.pub"];
}

/**
 * Generate NIP-46 pairing URI and ephemeral credentials
 *
 * Creates a nostrconnect:// URI that can be displayed as QR code
 * for external signers to scan and establish connection.
 */
export function generatePairingUri(options?: {
  permissions?: string;
  appName?: string;
  appUrl?: string;
  timeoutMs?: number;
}): Nip46PairingResult {
  const {
    permissions = NIP46_DEFAULT_PERMISSIONS,
    appName = "Satnam",
    appUrl = "https://satnam.pub",
    timeoutMs = NIP46_PAIRING_TIMEOUT_MS,
  } = options ?? {};

  // Generate ephemeral client keypair
  const clientPrivKeyHex = generateRandomHex(32);
  const clientPubKeyHex = CEPS.getPublicKeyHex(clientPrivKeyHex);

  // Generate random secret for validation
  const secretHex = generateRandomHex(32);

  // Get relays
  const relays = getAvailableRelays();
  const primaryRelay = relays[0];

  // Build URI following NIP-46 spec for client-initiated connection
  const params = new URLSearchParams();
  params.set("relay", primaryRelay);
  params.set("secret", secretHex);
  params.set("name", appName);
  params.set("perms", permissions);
  if (appUrl) {
    params.set("url", appUrl);
  }

  const uri = `nostrconnect://${clientPubKeyHex}?${params.toString()}`;

  // Calculate expiration
  const expiresAt = Date.now() + timeoutMs;

  return {
    uri,
    clientPubKeyHex,
    secretHex,
    relays,
    expiresAt,
  };
}

/**
 * Save pairing state to localStorage
 */
export function savePairingState(state: Nip46PairingStorage): void {
  try {
    localStorage.setItem(NIP46_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[NIP-46] Failed to save pairing state:", error);
  }
}

/**
 * Load pairing state from localStorage
 */
export function loadPairingState(): Nip46PairingStorage | null {
  try {
    const stored = localStorage.getItem(NIP46_STORAGE_KEY);
    if (!stored) return null;

    const state = JSON.parse(stored) as Nip46PairingStorage;

    // Validate structure
    if (!state.clientPrivKeyHex || !state.clientPubKeyHex || !state.secretHex) {
      console.warn("[NIP-46] Invalid stored pairing state, clearing");
      clearPairingState();
      return null;
    }

    // Check expiration (only if not connected)
    if (!state.connectedAt && state.expiresAt && Date.now() > state.expiresAt) {
      console.log("[NIP-46] Stored pairing expired, clearing");
      clearPairingState();
      return null;
    }

    return state;
  } catch (error) {
    console.warn("[NIP-46] Failed to load pairing state:", error);
    return null;
  }
}

/**
 * Clear pairing state from localStorage and CEPS
 */
export function clearPairingState(): void {
  try {
    localStorage.removeItem(NIP46_STORAGE_KEY);

    // Also clear CEPS NIP-46 state
    const cepsTyped = CEPS as unknown as CEPSWithNip46;
    cepsTyped.clearNip46Pairing?.();
  } catch (error) {
    console.warn("[NIP-46] Failed to clear pairing state:", error);
  }
}

/**
 * Get current connection status based on stored state
 */
export function getConnectionStatus(): Nip46ConnectionStatus {
  const state = loadPairingState();

  if (!state) return "idle";

  if (state.connectedAt && state.signerPubKeyHex) {
    return "connected";
  }

  if (state.expiresAt && Date.now() > state.expiresAt) {
    return "expired";
  }

  if (state.createdAt && !state.connectedAt) {
    return "waiting";
  }

  return "idle";
}

/**
 * Establish NIP-46 connection using CEPS
 *
 * This subscribes to relays and waits for the signer to respond
 * to the connect request after scanning the QR code.
 */
export async function establishConnection(
  clientPrivKeyHex: string,
  clientPubKeyHex: string,
  secretHex: string,
  relay: string,
  options?: { timeoutMs?: number; encryption?: "nip04" | "nip44" }
): Promise<{ signerPubKeyHex: string }> {
  const cepsTyped = CEPS as unknown as CEPSWithNip46;

  if (!cepsTyped.establishNip46Connection) {
    throw new Error("CEPS does not support NIP-46 connection");
  }

  const result = await cepsTyped.establishNip46Connection({
    clientPrivHex: clientPrivKeyHex,
    clientPubHex: clientPubKeyHex,
    secretHex,
    relay,
    encryption: options?.encryption ?? "nip04",
    timeoutMs: options?.timeoutMs ?? NIP46_PAIRING_TIMEOUT_MS,
  });

  if (!result.signerPubHex) {
    throw new Error("Connection established but no signer pubkey received");
  }

  return { signerPubKeyHex: result.signerPubHex };
}

/**
 * Check if currently connected via NIP-46
 */
export function isConnected(): boolean {
  // Check localStorage state
  const state = loadPairingState();
  if (state?.connectedAt && state?.signerPubKeyHex) {
    return true;
  }

  // Also check CEPS state
  try {
    const cepsTyped = CEPS as unknown as CEPSWithNip46;
    const cepsState = cepsTyped.getNip46PairingState?.();
    if (cepsState?.signerPubHex) {
      return true;
    }
  } catch {
    // Ignore
  }

  return false;
}

/**
 * Get connected signer's public key (hex)
 */
export function getSignerPubKeyHex(): string | null {
  const state = loadPairingState();
  if (state?.signerPubKeyHex) {
    return state.signerPubKeyHex;
  }

  try {
    const cepsTyped = CEPS as unknown as CEPSWithNip46;
    const cepsState = cepsTyped.getNip46PairingState?.();
    return cepsState?.signerPubHex ?? null;
  } catch {
    return null;
  }
}
