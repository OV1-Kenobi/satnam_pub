/**
 * LNbits API helpers (client-side)
 * - provisionWallet()
 * - createLightningAddress()
 * - createBoltcard({ label, spend_limit_sats })
 * - getPaymentHistory({ page, limit })
 * - getBoltcardLnurl()
 *
 * Uses fetchWithAuth to include JWT and returns standardized responses.
 */

import fetchWithAuth from "../../src/lib/auth/fetch-with-auth";
import { apiConfig } from "./index.js";

function jsonOrText(res) {
  const c = res.headers.get("content-type") || "";
  return c.includes("application/json") ? res.json() : res.text();
}

export async function provisionWallet() {
  try {
    const url = `${apiConfig.baseUrl}/lnbits-provision-wallet`;
    const res = await fetchWithAuth(url, { method: "POST", headers: { "Content-Type": "application/json" } });
    const data = await jsonOrText(res).catch(() => ({}));
    if (!res.ok) return { success: false, error: (data && data.error) || `HTTP ${res.status}` };
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function createLightningAddress(body = undefined) {
  try {
    const url = `${apiConfig.baseUrl}/lnbits-create-lnaddress`;
    const init = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: "POST", headers: { "Content-Type": "application/json" } };
    const res = await fetchWithAuth(url, init);
    const data = await jsonOrText(res).catch(() => ({}));
    if (!res.ok) return { success: false, error: (data && data.error) || `HTTP ${res.status}` };
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function createBoltcard({ label, spend_limit_sats }) {
  try {
    const url = `${apiConfig.baseUrl}/lnbits-create-boltcard`;
    const res = await fetchWithAuth(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, spend_limit_sats })
    });
    const data = await jsonOrText(res).catch(() => ({}));
    if (!res.ok) return { success: false, error: (data && data.error) || `HTTP ${res.status}` };
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function getPaymentHistory({ page = 1, limit = 20 } = {}) {
  try {
    const qp = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
    const url = `${apiConfig.baseUrl}/lnbits-payment-history?${qp}`;
    const res = await fetchWithAuth(url, { method: "GET" });
    const data = await jsonOrText(res).catch(() => ({}));
    if (!res.ok) return { success: false, error: (data && data.error) || `HTTP ${res.status}` };
    if (Array.isArray(data) || typeof data !== "object" || data === null) {
      return { success: true, data };
    }
    return { success: true, ...data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}


export async function getBoltcardLnurl() {
  try {
    const url = `${apiConfig.baseUrl}/lnbits-get-boltcard-lnurl`;
    const res = await fetchWithAuth(url, { method: "POST", headers: { "Content-Type": "application/json" } });
    const data = await jsonOrText(res).catch(() => ({}));
    if (!res.ok) return { success: false, error: (data && data.error) || `HTTP ${res.status}` };
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function getLNbitsWalletUrl() {
  try {
    const url = `${apiConfig.baseUrl}/lnbits-get-wallet-url`;
    const res = await fetchWithAuth(url, { method: "POST", headers: { "Content-Type": "application/json" } });
    const data = await jsonOrText(res).catch(() => ({}));
    if (!res.ok) return { success: false, error: (data && data.error) || `HTTP ${res.status}` };
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
