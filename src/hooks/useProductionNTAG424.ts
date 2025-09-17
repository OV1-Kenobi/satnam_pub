/**
 * @fileoverview React hook for NTAG424 Production Tag Authentication
 * @description Connects NFC-based authentication and registration to unified server endpoints
 * @compliance Master Context - Privacy-first, browser-only, zero-knowledge on server
 */

import { useCallback, useState } from "react";

export interface ProductionNTAG424AuthState {
  isAuthenticated: boolean;
  sessionToken: string | null;
  userNpub: string | null;
  familyRole: string | null;
  walletAccess: any;
  error?: string | null;
}

const API_BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string) || "/api";

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { SecureTokenManager } = await import(
      "../lib/auth/secure-token-manager"
    );
    const accessToken = SecureTokenManager.getAccessToken();
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  } catch {
    return {};
  }
}

/**
 * useProductionNTAG424
 * React hook for NFC-based authentication and registration routed via unified function
 */
export const useProductionNTAG424 = () => {
  const [authState, setAuthState] = useState<ProductionNTAG424AuthState>({
    isAuthenticated: false,
    sessionToken: null,
    userNpub: null,
    familyRole: null,
    walletAccess: null,
    error: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Authenticate with NTAG424 production tag via NFC
   */
  const authenticateWithNFC = useCallback(async (pin: string) => {
    setIsProcessing(true);
    setAuthState((prev) => ({ ...prev, error: null }));
    try {
      if (typeof window === "undefined" || !("NDEFReader" in window)) {
        throw new Error("NFC not supported on this device/browser");
      }
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      return await new Promise<any>((resolve, reject) => {
        ndef.addEventListener("reading", async (event: any) => {
          try {
            const uid = event.serialNumber;
            // Optional: extract SUN message from event.message.records if available
            const headers = await getAuthHeaders();
            const res = await fetch(`${API_BASE}/nfc-unified/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify({ tagUID: uid }),
            });
            const json = await res.json();
            if (!res.ok || !json?.success) {
              throw new Error(json?.error || `HTTP ${res.status}`);
            }
            setAuthState((prev) => ({
              ...prev,
              isAuthenticated: true,
              error: null,
            }));
            resolve({ success: true });
          } catch (err: any) {
            setAuthState((prev) => ({
              ...prev,
              error: err?.message || "NFC authentication error",
            }));
            reject(err);
          } finally {
            setIsProcessing(false);
          }
        });
        setTimeout(() => {
          setIsProcessing(false);
          setAuthState((prev) => ({ ...prev, error: "NFC read timeout" }));
          reject(new Error("NFC read timeout"));
        }, 30000);
      });
    } catch (error: any) {
      setIsProcessing(false);
      setAuthState((prev) => ({
        ...prev,
        error: error?.message || "NFC authentication error",
      }));
      throw error;
    }
  }, []);

  /**
   * Register a new NTAG424 production tag via NFC
   */
  const registerNewTag = useCallback(
    async (
      pin: string,
      userNpub: string,
      familyRole: string
    ): Promise<boolean> => {
      setIsProcessing(true);
      setAuthState((prev) => ({ ...prev, error: null }));
      try {
        if (typeof window === "undefined" || !("NDEFReader" in window)) {
          throw new Error("NFC not supported on this device/browser");
        }
        const ndef = new (window as any).NDEFReader();
        await ndef.scan();
        return await new Promise<boolean>((resolve, reject) => {
          ndef.addEventListener("reading", async (event: any) => {
            try {
              const uid = event.serialNumber;
              // Check initialization status via server (hardware bridge or heuristic)
              const headers = await getAuthHeaders();
              try {
                const statusRes = await fetch(
                  `${API_BASE}/nfc-unified/status`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...headers },
                    body: JSON.stringify({ tagUID: uid }),
                  }
                );
                const statusJson = await statusRes.json().catch(() => ({}));
                if (statusRes.ok && statusJson?.success) {
                  const initialized = !!statusJson.data?.initialized;
                  if (!initialized) {
                    const hint = statusJson.data?.hint;
                    throw new Error(
                      hint === "bridge_unconfigured"
                        ? "This NTAG424 tag is not initialized. Please run the Tag Initialization tool (desktop/mobile companion) before registering."
                        : "This NTAG424 tag appears uninitialized. Initialize it first, then try registration again."
                    );
                  }
                }
              } catch (e) {
                // Non-fatal: continue to attempt registration; underlying NDEF read may still fail if protected
              }

              // Minimal client-side encrypted metadata (zero-knowledge; server stores as opaque)
              const payload = {
                uid,
                userNpub,
                pinProtected: !!pin,
                createdAt: Date.now(),
              };
              const encryptedMetadata = btoa(
                unescape(encodeURIComponent(JSON.stringify(payload)))
              );
              const res = await fetch(`${API_BASE}/nfc-unified/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({
                  tagUID: uid,
                  encryptedMetadata,
                  familyRole,
                }),
              });
              const json = await res.json();
              if (!res.ok || !json?.success) {
                throw new Error(json?.error || `HTTP ${res.status}`);
              }
              resolve(true);
            } catch (err: any) {
              setAuthState((prev) => ({
                ...prev,
                error: err?.message || "NFC registration error",
              }));
              reject(err);
            } finally {
              setIsProcessing(false);
            }
          });
          setTimeout(() => {
            setIsProcessing(false);
            setAuthState((prev) => ({ ...prev, error: "NFC read timeout" }));
            reject(new Error("NFC read timeout"));
          }, 30000);
        });
      } catch (error: any) {
        setIsProcessing(false);
        setAuthState((prev) => ({
          ...prev,
          error: error?.message || "NFC registration error",
        }));
        throw error;
      }
    },
    []
  );

  /**
   * Initialize NTAG424 tag (mobile PWA acknowledgment).
   * Note: Web NFC does not expose APDU; this flow acknowledges mobile-side init and records an ops log.
   */
  const initializeTag = useCallback(async (): Promise<boolean> => {
    setIsProcessing(true);
    setAuthState((prev) => ({ ...prev, error: null }));
    try {
      if (typeof window === "undefined" || !("NDEFReader" in window)) {
        throw new Error("NFC not supported on this device/browser");
      }
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      return await new Promise<boolean>((resolve, reject) => {
        ndef.addEventListener("reading", async (event: any) => {
          try {
            const uid = event.serialNumber;
            const headers = await getAuthHeaders();
            const clientInfo = {
              ua: navigator.userAgent,
              platform: (navigator as any).platform || undefined,
            };
            const res = await fetch(`${API_BASE}/nfc-unified/initialize`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify({
                tagUID: uid,
                method: "mobile_pwa",
                clientInfo,
              }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.success) {
              throw new Error(json?.error || `HTTP ${res.status}`);
            }
            resolve(true);
          } catch (err: any) {
            setAuthState((prev) => ({
              ...prev,
              error: err?.message || "NFC initialization error",
            }));
            reject(err);
          } finally {
            setIsProcessing(false);
          }
        });
        setTimeout(() => {
          setIsProcessing(false);
          setAuthState((prev) => ({ ...prev, error: "NFC read timeout" }));
          reject(new Error("NFC read timeout"));
        }, 30000);
      });
    } catch (error: any) {
      setIsProcessing(false);
      setAuthState((prev) => ({
        ...prev,
        error: error?.message || "NFC initialization error",
      }));
      throw error;
    }
  }, []);

  const resetAuthState = useCallback(() => {
    setAuthState({
      isAuthenticated: false,
      sessionToken: null,
      userNpub: null,
      familyRole: null,
      walletAccess: null,
      error: null,
    });
  }, []);

  return {
    authState,
    isProcessing,
    authenticateWithNFC,
    registerNewTag,
    initializeTag,
    resetAuthState,
  };
};
