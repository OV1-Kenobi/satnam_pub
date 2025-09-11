/**
 * fetch-with-auth.ts
 *
 * Small helper to automatically attach the Authorization: Bearer <token>
 * header when an access token is available from SecureTokenManager.
 */

import SecureTokenManager from './secure-token-manager';

export type FetchWithAuth = (
  input: RequestInfo | URL,
  init?: RequestInit
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
  const baseHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  // Normalize provided headers into a plain object
  const provided: Record<string, string> = (() => {
    if (!init.headers) return {};
    if (init.headers instanceof Headers) {
      const obj: Record<string, string> = {};
      init.headers.forEach((v, k) => {
        obj[k] = v;
      });
      return obj;
    }
    if (Array.isArray(init.headers)) {
      const obj: Record<string, string> = {};
      init.headers.forEach(([k, v]) => (obj[k] = v));
      return obj;
    }
    return init.headers as Record<string, string>;
  })();

  const auth = getAuthHeaders();
  const headers = { ...baseHeaders, ...provided, ...auth };

  return fetch(input, { ...init, headers });
};

export default fetchWithAuth;

