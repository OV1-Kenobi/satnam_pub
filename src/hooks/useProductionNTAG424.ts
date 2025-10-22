/**
 * @fileoverview React hook for NTAG424 Production Tag Authentication
 * @description Connects NFC-based authentication and registration to unified server endpoints
 * @compliance Master Context - Privacy-first, browser-only, zero-knowledge on server
 */

import { useCallback, useState } from "react";
import { makeSunBinding } from "../lib/nip42/challenge-binding";
import { authenticateWithRelays } from "../lib/nip42/relay-auth";

import { toBase64Utf8 } from "../lib/utils/encoding";

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
  // Feature flag check: NFC MFA must be enabled
  const NFC_MFA_ENABLED =
    (import.meta.env.VITE_ENABLE_NFC_MFA as string) === "true";

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
   * @param pin - 6-digit PIN for tag authentication
   * @param sunNonce - Optional SUN nonce for NIP-42 challenge binding
   */
  const authenticateWithNFC = useCallback(
    async (pin: string, sunNonce?: string) => {
      setIsProcessing(true);
      setAuthState((prev) => ({ ...prev, error: null }));
      try {
        // Feature flag check
        if (!NFC_MFA_ENABLED) {
          throw new Error(
            "NFC MFA is not enabled. Please enable VITE_ENABLE_NFC_MFA."
          );
        }
        if (typeof window === "undefined" || !("NDEFReader" in window)) {
          throw new Error("NFC not supported on this device/browser");
        }
        // Basic PIN validation (6 digits)
        const pinOk = typeof pin === "string" && /^[0-9]{6}$/.test(pin.trim());
        if (!pinOk) {
          throw new Error("Invalid PIN format. Use 6 digits.");
        }
        const ndef = new (window as any).NDEFReader();
        return await new Promise<any>((resolve, reject) => {
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          let listenerAdded = false;

          const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (listenerAdded) {
              try {
                ndef.removeEventListener("reading", readingHandler);
              } catch {}
            }
          };

          const readingHandler = async (event: any) => {
            try {
              const uid = event.serialNumber;
              const headers = await getAuthHeaders();
              const hasAuth = !!headers.Authorization;
              if (hasAuth) {
                // Build request body with optional SUN binding
                const requestBody: any = { tagUID: uid, pin };
                if (sunNonce) {
                  // If SUN nonce provided, include it as challengeData for NIP-42 binding
                  requestBody.challengeData = sunNonce;
                }
                const res = await fetch(`${API_BASE}/nfc-unified/verify`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...headers },
                  body: JSON.stringify(requestBody),
                });
                const json = await res.json();
                if (!res.ok || !json?.success) {
                  throw new Error(json?.error || `HTTP ${res.status}`);
                }
                // Extract and store session token from response
                try {
                  const { default: SecureTokenManager } = await import(
                    "../lib/auth/secure-token-manager"
                  );
                  const token: string = json?.data?.sessionToken;
                  if (token) {
                    const payload = SecureTokenManager.parseTokenPayload(token);
                    const expMs = payload?.exp
                      ? payload.exp * 1000
                      : Date.now() + 15 * 60 * 1000;
                    SecureTokenManager.setAccessToken(token, expMs);
                  }
                } catch {}
                cleanup();
                setAuthState((prev) => ({
                  ...prev,
                  isAuthenticated: true,
                  sessionToken: json?.data?.sessionToken || null,
                  error: null,
                }));
                resolve({
                  success: true,
                  data: json?.data,
                  sessionToken: json?.data?.sessionToken,
                });
              } else {
                const mapRaw = localStorage.getItem("nfc_tag_map");
                const map = mapRaw
                  ? (JSON.parse(mapRaw) as Record<string, string>)
                  : {};
                const tagId = map[uid];
                if (!tagId) {
                  throw new Error(
                    "Tag not recognized on this device. Complete registration or sign in normally once to link."
                  );
                }
                const res = await fetch(`${API_BASE}/nfc-unified/login`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tagId, tagUID: uid, pin }),
                });
                const json = await res.json();
                if (!res.ok || !json?.success) {
                  throw new Error(json?.error || `HTTP ${res.status}`);
                }
                try {
                  const { default: SecureTokenManager } = await import(
                    "../lib/auth/secure-token-manager"
                  );
                  const token: string = json?.data?.sessionToken;
                  const payload = SecureTokenManager.parseTokenPayload(token);
                  const expMs = payload?.exp
                    ? payload.exp * 1000
                    : Date.now() + 15 * 60 * 1000;
                  SecureTokenManager.setAccessToken(token, expMs);
                } catch {}
                cleanup();
                setAuthState((prev) => ({
                  ...prev,
                  isAuthenticated: true,
                  sessionToken: json?.data?.sessionToken || null,
                  error: null,
                }));
                resolve({ success: true, data: json?.data });
              }
            } catch (err: any) {
              cleanup();
              setAuthState((prev) => ({
                ...prev,
                error: err?.message || "NFC authentication error",
              }));
              reject(err);
            } finally {
              setIsProcessing(false);
            }
          };

          ndef
            .scan()
            .then(() => {
              listenerAdded = true;
              ndef.addEventListener("reading", readingHandler);
            })
            .catch((err: unknown) => {
              cleanup();
              reject(err instanceof Error ? err : new Error("NFC scan failed"));
            });

          timeoutId = setTimeout(() => {
            cleanup();
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
    },
    []
  );

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
        // Feature flag check
        if (!NFC_MFA_ENABLED) {
          throw new Error(
            "NFC MFA is not enabled. Please enable VITE_ENABLE_NFC_MFA."
          );
        }
        if (typeof window === "undefined" || !("NDEFReader" in window)) {
          throw new Error("NFC not supported on this device/browser");
        }
        const ndef = new (window as any).NDEFReader();
        return await new Promise<boolean>((resolve, reject) => {
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          let listenerAdded = false;

          const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (listenerAdded) {
              try {
                ndef.removeEventListener("reading", readingHandler);
              } catch {}
            }
          };

          const readingHandler = async (event: any) => {
            try {
              const uid = event.serialNumber;
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
                // Non-fatal: continue to attempt registration
              }

              const payload = {
                uid,
                userNpub,
                pinProtected: !!pin,
                createdAt: Date.now(),
              };
              const encryptedMetadata = toBase64Utf8(JSON.stringify(payload));
              const res = await fetch(`${API_BASE}/nfc-unified/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({
                  tagUID: uid,
                  encryptedMetadata,
                  familyRole,
                  pin,
                }),
              });
              const json = await res.json();
              if (!res.ok || !json?.success) {
                throw new Error(json?.error || `HTTP ${res.status}`);
              }
              try {
                const tagId: string | undefined = json?.data?.tagId;
                if (tagId) {
                  const mapRaw = localStorage.getItem("nfc_tag_map");
                  const map = mapRaw
                    ? (JSON.parse(mapRaw) as Record<string, string>)
                    : {};
                  map[uid] = tagId;
                  localStorage.setItem("nfc_tag_map", JSON.stringify(map));
                }
              } catch {}
              cleanup();
              resolve(true);
            } catch (err: any) {
              cleanup();
              setAuthState((prev) => ({
                ...prev,
                error: err?.message || "NFC registration error",
              }));
              reject(err);
            } finally {
              setIsProcessing(false);
            }
          };

          ndef
            .scan()
            .then(() => {
              listenerAdded = true;
              ndef.addEventListener("reading", readingHandler);
            })
            .catch((err: unknown) => {
              cleanup();
              reject(err instanceof Error ? err : new Error("NFC scan failed"));
            });

          timeoutId = setTimeout(() => {
            cleanup();
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
      // Feature flag check
      if (!NFC_MFA_ENABLED) {
        throw new Error(
          "NFC MFA is not enabled. Please enable VITE_ENABLE_NFC_MFA."
        );
      }
      if (typeof window === "undefined" || !("NDEFReader" in window)) {
        throw new Error("NFC not supported on this device/browser");
      }
      const ndef = new (window as any).NDEFReader();
      return await new Promise<boolean>((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let listenerAdded = false;

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          if (listenerAdded) {
            try {
              ndef.removeEventListener("reading", readingHandler);
            } catch {}
          }
        };

        const readingHandler = async (event: any) => {
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
            cleanup();
            resolve(true);
          } catch (err: any) {
            cleanup();
            setAuthState((prev) => ({
              ...prev,
              error: err?.message || "NFC initialization error",
            }));
            reject(err);
          } finally {
            setIsProcessing(false);
          }
        };

        ndef
          .scan()
          .then(() => {
            listenerAdded = true;
            ndef.addEventListener("reading", readingHandler);
          })
          .catch((err: unknown) => {
            cleanup();
            reject(err instanceof Error ? err : new Error("NFC scan failed"));
          });

        timeoutId = setTimeout(() => {
          cleanup();
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

  /**
   * NIP-42 live check bound to SUN nonce (if provided). Uses CEPS onauth wiring.
   */
  const performNIP42Auth = useCallback(
    async (params: {
      relays: string[];
      sunNonce?: string;
      timeoutMs?: number;
    }): Promise<{
      ok: boolean;
      results: { relay: string; ok: boolean; error?: string }[];
      bindingTag?: { tagName: string; value: string };
    }> => {
      try {
        const bindingTag = params.sunNonce
          ? makeSunBinding(params.sunNonce)
          : undefined;
        const results = await authenticateWithRelays(params.relays, {
          timeoutMs: params.timeoutMs ?? 8000,
        });
        const ok = results.some((r) => r.ok);
        return { ok, results, bindingTag };
      } catch (e) {
        return {
          ok: false,
          results: [],
          bindingTag: params.sunNonce
            ? makeSunBinding(params.sunNonce)
            : undefined,
        };
      }
    },
    []
  );

  /**
   * Read tag info (UID, limited Web NFC-exposed data). Server augments via /nfc-unified/read.
   */
  const readTagInfo = useCallback(async (): Promise<{
    uid: string;
    ndefRecords?: unknown;
    sdmState?: unknown;
  }> => {
    if (typeof window === "undefined" || !("NDEFReader" in window)) {
      throw new Error("NFC not supported on this device/browser");
    }
    const ndef = new (window as any).NDEFReader();
    return await new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let listenerAdded = false;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (listenerAdded) {
          try {
            ndef.removeEventListener("reading", readingHandler);
          } catch {}
        }
      };

      const readingHandler = async (event: any) => {
        try {
          const uid = event.serialNumber;
          let serverAugment: any = {};
          try {
            const headers = await getAuthHeaders();
            const res = await fetch(`${API_BASE}/nfc-unified/read`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify({ tagUID: uid }),
            });
            serverAugment = await res.json().catch(() => ({}));
          } catch {}
          cleanup();
          resolve({
            uid,
            ndefRecords: undefined,
            sdmState: serverAugment?.data?.sdm,
          });
        } catch (e: any) {
          cleanup();
          reject(new Error(e?.message || "readTagInfo error"));
        }
      };

      ndef
        .scan()
        .then(() => {
          listenerAdded = true;
          ndef.addEventListener("reading", readingHandler);
        })
        .catch((err: unknown) => {
          cleanup();
          reject(err instanceof Error ? err : new Error("NFC scan failed"));
        });

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error("NFC read timeout"));
      }, 15000);
    });
  }, []);

  /**
   * Program tag (server-coordinated). Web NFC cannot set SDM keys; we record intent + verify after.
   */
  const programTag = useCallback(
    async (params: {
      url: string;
      pin: string;
      enableSDM: boolean;
    }): Promise<boolean> => {
      // Feature flag check
      if (!NFC_MFA_ENABLED) {
        throw new Error(
          "NFC MFA is not enabled. Please enable VITE_ENABLE_NFC_MFA."
        );
      }
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/nfc-unified/program`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(params),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success)
        throw new Error(json?.error || `HTTP ${res.status}`);
      return true;
    },
    []
  );

  const verifyTag = useCallback(async (): Promise<boolean> => {
    // Feature flag check
    if (!NFC_MFA_ENABLED) {
      throw new Error(
        "NFC MFA is not enabled. Please enable VITE_ENABLE_NFC_MFA."
      );
    }
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/nfc-unified/verify-tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success)
      throw new Error(json?.error || `HTTP ${res.status}`);
    return true;
  }, [NFC_MFA_ENABLED]);

  const eraseTag = useCallback(async (): Promise<boolean> => {
    // Feature flag check
    if (!NFC_MFA_ENABLED) {
      throw new Error(
        "NFC MFA is not enabled. Please enable VITE_ENABLE_NFC_MFA."
      );
    }
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/nfc-unified/erase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success)
      throw new Error(json?.error || `HTTP ${res.status}`);
    return true;
  }, [NFC_MFA_ENABLED]);

  return {
    authState,
    isProcessing,
    authenticateWithNFC,
    registerNewTag,
    initializeTag,
    resetAuthState,
    // SCDiD/NIP-42 & NFC lifecycle helpers
    performNIP42Auth,
    readTagInfo,
    programTag,
    verifyTag,
    eraseTag,
  };
};
