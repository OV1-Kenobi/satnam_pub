// NFC Vault Policy Types (Client-side, zero-knowledge compatible)
// NFC is a second factor to authorize local vault unlock/use. No raw nsec handling here.

export type NFCSecondFactorPolicy = "none" | "webauthn" | "nfc" | "both";

// Callback invoked by the vault when an NFC check is required
export type NFCAuthCallback = () => Promise<boolean>;

export interface NFCVaultConfig {
  // How long an NFC authentication is considered fresh/valid
  pinTimeoutMs: number; // e.g., 120_000 for 2 minutes
  // Whether NFC is required per unlock or per sensitive operation
  confirmationMode: "per_unlock" | "per_operation";
  // Timestamp (ms) of last successful NFC authentication (client-only, memory/optional persisted metadata)
  lastAuthAt?: number;
}

export interface NFCAuthStatus {
  available: boolean; // whether Web NFC is available on this device
  fresh: boolean;     // whether last NFC authentication is within pinTimeoutMs
  lastAuthAt?: number;
}

