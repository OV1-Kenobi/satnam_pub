/**
 * fetch-with-auth.ts
 *
 * Small helper to automatically attach the Authorization: Bearer <token>
 * header when an access token is available from SecureTokenManager.
 */

import SecureTokenManager from "./secure-token-manager";

type AuthRequestInit = RequestInit & { timeoutMs?: number };

export type FetchWithAuth = (
  input: RequestInfo | URL,
  init?: AuthRequestInit
) => Promise<Response>;

/**
 * Returns Authorization headers when an access token is available.
 */
export function getAuthHeaders(): Record<string, string> {
  try {
    const token = SecureTokenManager.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (_) {
    return {};
  }
}

/**
 * fetchWithAuth: wraps window.fetch and adds Authorization header if present.
 */
export const fetchWithAuth: FetchWithAuth = async (input, init = {}) => {
  const { timeoutMs, ...rest } = init as AuthRequestInit;
  const baseHeaders: Record<string, string> = {
    Accept: "application/json",
  };

  // Normalize provided headers into a plain object
  const provided: Record<string, string> = (() => {
    if (!rest.headers) return {};
    if (rest.headers instanceof Headers) {
      const obj: Record<string, string> = {};
      rest.headers.forEach((v, k) => {
        obj[k] = v;
      });
      return obj;
    }
    if (Array.isArray(rest.headers)) {
      const obj: Record<string, string> = {};
      rest.headers.forEach(([k, v]) => (obj[k] = v));
      return obj;
    }
    return rest.headers as Record<string, string>;
  })();

  const auth = getAuthHeaders();
  const headers = { ...baseHeaders, ...provided, ...auth };

  if (typeof timeoutMs === "number" && timeoutMs > 0) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, {
        ...rest,
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(id);
    }
  }

  return fetch(input, { ...rest, headers });
};

export default fetchWithAuth;
