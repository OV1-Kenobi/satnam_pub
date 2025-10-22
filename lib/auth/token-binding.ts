/**
 * Token Binding with Device Fingerprinting
 *
 * Implements device fingerprint-based token binding to detect token use from different devices.
 * Uses browser characteristics only (no hardware identifiers).
 *
 * SECURITY LIMITATIONS:
 * - Device fingerprinting alone does NOT prevent XSS token theft
 * - An attacker with XSS access can generate the same fingerprint and forge binding proofs
 * - This mechanism helps detect token use from a different device but should be combined
 *   with other security measures (CSP, secure session management, etc.)
 * - The fingerprint hash used as HMAC key is derived from semi-public browser characteristics
 *   that an attacker can observe or replicate
 *
 * Security Model:
 * - Generate device fingerprint from browser characteristics (stable across sessions)
 * - Bind tokens to device fingerprint using HMAC-SHA256
 * - Verify binding on every token use
 * - Detect device changes and invalidate tokens if device changes
 */

/**
 * Device fingerprint based on browser characteristics
 *
 * NOTE: Device fingerprinting alone does NOT prevent XSS token theft.
 * An attacker with XSS access can generate the same fingerprint and forge binding proofs.
 * This mechanism helps detect token use from a different device but should be combined
 * with other security measures (CSP, secure session management, etc.).
 */
export interface DeviceFingerprint {
  userAgent: string;
  language: string;
  timezone: string;
  screenResolution: string;
  colorDepth: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  maxTouchPoints: number;
}

/**
 * Token with binding proof
 */
export interface BoundToken {
  token: string;
  deviceFingerprint: string;
  bindingProof: string;
  expiresAt: number;
  createdAt: number;
}

/**
 * Generate device fingerprint from browser characteristics only
 * Uses only publicly available browser APIs, no hardware identifiers
 */
export async function generateDeviceFingerprint(): Promise<DeviceFingerprint> {
  const navigator = globalThis.navigator || {};
  const screen = globalThis.screen || {};

  return {
    userAgent: navigator.userAgent || "unknown",
    language: navigator.language || "unknown",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    screenResolution: `${screen.width || 0}x${screen.height || 0}`,
    colorDepth: `${screen.colorDepth || 0}`,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: (navigator as any).deviceMemory || 0,
    maxTouchPoints: navigator.maxTouchPoints || 0,
  };
}

/**
 * Generate fingerprint hash from device characteristics
 */
export async function generateFingerprintHash(
  fingerprint: DeviceFingerprint
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(fingerprint));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Bind token to device fingerprint using HMAC-SHA256
 *
 * NOTE: The fingerprint hash is derived from semi-public browser characteristics.
 * An attacker who can fingerprint the device can forge binding proofs.
 * This provides device-change detection but not XSS protection.
 */
export async function bindToken(
  token: string,
  fingerprintHash: string
): Promise<string> {
  const encoder = new TextEncoder();
  const tokenData = encoder.encode(token);
  const keyData = encoder.encode(fingerprintHash);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, tokenData);
  const signatureArray = Array.from(new Uint8Array(signature));
  return signatureArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify token binding
 */
export async function verifyTokenBinding(
  token: string,
  bindingProof: string,
  fingerprintHash: string
): Promise<boolean> {
  try {
    const expectedProof = await bindToken(token, fingerprintHash);

    // Constant-time comparison to prevent timing attacks
    if (expectedProof.length !== bindingProof.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < expectedProof.length; i++) {
      result |= expectedProof.charCodeAt(i) ^ bindingProof.charCodeAt(i);
    }

    return result === 0;
  } catch (error) {
    console.error("Token binding verification failed:", error);
    return false;
  }
}

/**
 * Detect device change by comparing fingerprints
 */
export async function detectDeviceChange(
  previousFingerprintHash: string
): Promise<boolean> {
  try {
    const currentFingerprint = await generateDeviceFingerprint();
    const currentHash = await generateFingerprintHash(currentFingerprint);

    // Constant-time comparison
    if (previousFingerprintHash.length !== currentHash.length) {
      return true; // Device changed
    }

    let result = 0;
    for (let i = 0; i < previousFingerprintHash.length; i++) {
      result |=
        previousFingerprintHash.charCodeAt(i) ^ currentHash.charCodeAt(i);
    }

    return result !== 0; // true if different (device changed)
  } catch (error) {
    console.error("Device change detection failed:", error);
    return true; // Assume device changed on error (safer)
  }
}

/**
 * Create bound token with device fingerprint
 */
export async function createBoundToken(
  token: string,
  expiresAt: number
): Promise<BoundToken> {
  const fingerprint = await generateDeviceFingerprint();
  const fingerprintHash = await generateFingerprintHash(fingerprint);
  const bindingProof = await bindToken(token, fingerprintHash);

  return {
    token,
    deviceFingerprint: fingerprintHash,
    bindingProof,
    expiresAt,
    createdAt: Date.now(),
  };
}

/**
 * Validate bound token
 */
export async function validateBoundToken(
  boundToken: BoundToken
): Promise<boolean> {
  // Check expiration
  if (boundToken.expiresAt < Date.now()) {
    return false;
  }

  // Verify binding
  const isBindingValid = await verifyTokenBinding(
    boundToken.token,
    boundToken.bindingProof,
    boundToken.deviceFingerprint
  );

  if (!isBindingValid) {
    return false;
  }

  // Check for device change
  const deviceChanged = await detectDeviceChange(boundToken.deviceFingerprint);
  if (deviceChanged) {
    console.warn("Device change detected - token binding invalid");
    return false;
  }

  return true;
}
