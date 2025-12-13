/**
 * Signer registration bootstrap.
 *
 * Registers available signer adapters with CEPS at app startup.
 */
import { central_event_publishing_service as CEPS } from "../../../lib/central_event_publishing_service";
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

// Always register NIP-05/Password
try {
  CEPS.registerExternalSigner(new Nip05PasswordAdapter());
} catch {}

// Conditionally register NIP-07
try {
  if (getFlag("VITE_ENABLE_NIP07_SIGNING", true)) {
    CEPS.registerExternalSigner(new Nip07Adapter());
  }
  // Conditionally register NTAG424 physical MFA signer
  try {
    if (getFlag("VITE_ENABLE_NFC_SIGNING", false)) {
      CEPS.registerExternalSigner(new Ntag424Adapter());
    }
  } catch {}
  // Register Amber signer (NIP-46/NIP-55) unconditionally; Android-only behavior is enforced in the adapter
  try {
    CEPS.registerExternalSigner(new AmberAdapter());
  } catch {}
  // Conditionally register Tapsigner NFC card signer
  try {
    if (getFlag("VITE_TAPSIGNER_ENABLED", false)) {
      CEPS.registerExternalSigner(new TapsignerAdapter());
    }
  } catch {}
} catch {}
