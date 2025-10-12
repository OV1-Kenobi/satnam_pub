/**
 * Messaging utilities
 *
 * Provides helpers for mapping messaging internals to user-facing labels.
 */

import type { SigningMethod } from "./types";

/**
 * Return a user-facing privacy description for a given signing/encryption method.
 *
 * Mapping rules:
 * - "giftwrapped"  -> "Sealed (Maximum Privacy)"
 * - "nip04"|"nip44" -> "Encrypted DM (Selective Privacy)"
 * - "signed"|"group" -> "Standard (Minimal Privacy)"
 * - undefined/other  -> "Standard (Minimal Privacy)"
 */
export function getPrivacyMethodLabel(signingMethod?: SigningMethod | null): string {
  switch (signingMethod) {
    case "giftwrapped":
      return "Sealed (Maximum Privacy)";
    case "nip04":
    case "nip44":
      return "Encrypted DM (Selective Privacy)";
    case "signed":
    case "group":
    default:
      return "Standard (Minimal Privacy)";
  }
}

