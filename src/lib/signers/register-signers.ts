/**
 * Signer registration bootstrap.
 *
 * Registers available signer adapters with CEPS at app startup.
 * Uses lazy loading to avoid TDZ issues.
 */
import { getCEPS } from "../ceps";
import AmberAdapter from "./amber-adapter";
import Nip05PasswordAdapter from "./nip05-password-adapter";
import Nip07Adapter from "./nip07-adapter";
import Ntag424Adapter from "./ntag424-adapter";
import TapsignerAdapter from "./tapsigner-adapter";

function getFlag(key: string, def: boolean): boolean {
  try {
    const v =
      typeof process !== "undefined" ? (process as any)?.env?.[key] : undefined;
    if (v == null) return def;
    const s = String(v).toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  } catch {
    return def;
  }
}

let _signersRegistered = false;

/**
 * Register all signer adapters with CEPS.
 * This function is idempotent and safe to call multiple times.
 */
export async function registerSigners(): Promise<void> {
  if (_signersRegistered) return;

  try {
    const ceps = await getCEPS();

    // Always register NIP-05/Password
    try {
      (ceps as any).registerExternalSigner(new Nip05PasswordAdapter());
    } catch {}

    // Conditionally register NIP-07
    try {
      if (getFlag("VITE_ENABLE_NIP07_SIGNING", true)) {
        (ceps as any).registerExternalSigner(new Nip07Adapter());
      }
    } catch {}

    // Conditionally register NTAG424 physical MFA signer
    try {
      if (getFlag("VITE_ENABLE_NFC_SIGNING", false)) {
        (ceps as any).registerExternalSigner(new Ntag424Adapter());
      }
    } catch {}

    // Register Amber signer (NIP-46/NIP-55) unconditionally; Android-only behavior is enforced in the adapter
    try {
      (ceps as any).registerExternalSigner(new AmberAdapter());
    } catch {}

    // Conditionally register Tapsigner NFC card signer
    try {
      if (getFlag("VITE_TAPSIGNER_ENABLED", false)) {
        (ceps as any).registerExternalSigner(new TapsignerAdapter());
      }
    } catch {}

    _signersRegistered = true;
  } catch (error) {
    console.warn("[register-signers] Failed to register signers:", error);
  }
}

// Auto-register signers when module is imported (async, non-blocking)
void registerSigners();
