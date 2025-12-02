/**
 * NFC MFA Privacy Logger
 * Implements precise zero-knowledge logging strategy for NFC MFA operations
 * 
 * Truncation Policy:
 * - Signatures (256-bit): 3 hex chars (12 bits)
 * - Hashes (256-bit): 6 hex chars (24 bits)
 * - Public keys: 4 hex chars (16 bits)
 * - Identifiers (UID, DUID): Anonymized (nfc_card_1, steward_1)
 * - Timestamps: Full (no truncation)
 * - Error messages: High-level categories only (no attempt counts)
 */

// Session-scoped anonymization maps
const sessionAnonymizationMaps = new Map<
  string,
  { cardUids: Map<string, string>; stewards: Map<string, string> }
>();

/**
 * Initialize anonymization maps for a session
 */
export function initializeSessionAnonymization(sessionId: string): void {
  if (!sessionAnonymizationMaps.has(sessionId)) {
    sessionAnonymizationMaps.set(sessionId, {
      cardUids: new Map(),
      stewards: new Map(),
    });
  }
}

/**
 * Truncate cryptographic signature (256-bit value)
 * Truncation: 3 hex chars (12 bits) + "..."
 */
export function truncateSignature(signature: string): string {
  if (!signature || signature.length < 3) return "...";
  return signature.substring(0, 3) + "...";
}

/**
 * Truncate operation hash (256-bit SHA-256)
 * Truncation: 6 hex chars (24 bits) + "..."
 */
export function truncateHash(hash: string): string {
  if (!hash || hash.length < 6) return "...";
  return hash.substring(0, 6) + "...";
}

/**
 * Truncate public key (P-256 or secp256k1)
 * Truncation: 4 hex chars (16 bits) + "..."
 */
export function truncatePublicKey(publicKey: string): string {
  if (!publicKey || publicKey.length < 4) return "...";
  return publicKey.substring(0, 4) + "...";
}

/**
 * Anonymize card UID within a session
 * Maintains consistent anonymization across session
 */
export function anonymizeCardUid(cardUid: string, sessionId: string): string {
  const maps = sessionAnonymizationMaps.get(sessionId);
  if (!maps) {
    console.warn("⚠️ Session anonymization not initialized", {
      sessionId: sessionId.substring(0, 8) + "...",
    });
    return "nfc_card_unknown";
  }

  if (!maps.cardUids.has(cardUid)) {
    const anonymized = `nfc_card_${maps.cardUids.size + 1}`;
    maps.cardUids.set(cardUid, anonymized);
  }

  return maps.cardUids.get(cardUid) || "nfc_card_unknown";
}

/**
 * Anonymize steward DUID within a session
 * Maintains consistent anonymization across session
 */
export function anonymizeStewardDuid(stewardDuid: string, sessionId: string): string {
  const maps = sessionAnonymizationMaps.get(sessionId);
  if (!maps) {
    console.warn("⚠️ Session anonymization not initialized", {
      sessionId: sessionId.substring(0, 8) + "...",
    });
    return "steward_unknown";
  }

  if (!maps.stewards.has(stewardDuid)) {
    const anonymized = `steward_${maps.stewards.size + 1}`;
    maps.stewards.set(stewardDuid, anonymized);
  }

  return maps.stewards.get(stewardDuid) || "steward_unknown";
}

/**
 * Sanitize error message (high-level category only)
 * Never log PIN attempts, attempt counts, or error patterns
 */
export function sanitizeErrorMessage(error: string): string {
  // Map detailed errors to high-level categories
  if (error.includes("PIN") || error.includes("pin")) {
    return "pin_invalid";
  }
  if (error.includes("signature") || error.includes("verify")) {
    return "signature_invalid";
  }
  if (error.includes("timestamp") || error.includes("expired")) {
    return "signature_expired";
  }
  if (error.includes("timeout")) {
    return "operation_timeout";
  }
  if (error.includes("not found") || error.includes("missing")) {
    return "data_missing";
  }
  // Default to generic error
  return "verification_failed";
}

/**
 * Clean up session anonymization maps (call after session completes)
 */
export function cleanupSessionAnonymization(sessionId: string): void {
  sessionAnonymizationMaps.delete(sessionId);
}

/**
 * Log NFC MFA event with privacy protection
 */
export function logNfcMfaEvent(
  level: "log" | "warn" | "error",
  message: string,
  data: Record<string, any>,
  sessionId?: string
): void {
  const sanitizedData: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key === "signature" || key === "nfcSignature") {
      sanitizedData[key] = truncateSignature(value);
    } else if (key === "operationHash" || key === "hash") {
      sanitizedData[key] = truncateHash(value);
    } else if (key === "publicKey" || key === "nfcPublicKey") {
      sanitizedData[key] = truncatePublicKey(value);
    } else if (key === "cardUid" && sessionId) {
      sanitizedData[key] = anonymizeCardUid(value, sessionId);
    } else if (key === "stewardDuid" && sessionId) {
      sanitizedData[key] = anonymizeStewardDuid(value, sessionId);
    } else if (key === "error" || key === "errorMessage") {
      sanitizedData[key] = sanitizeErrorMessage(value);
    } else if (key === "sessionId") {
      sanitizedData[key] = value.substring(0, 8) + "...";
    } else {
      // Non-sensitive data passed through
      sanitizedData[key] = value;
    }
  }

  const consoleMethod = console[level] || console.log;
  consoleMethod(message, sanitizedData);
}

