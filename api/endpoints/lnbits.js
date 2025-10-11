/**
 * LNbits API helpers (client-side)
 * - provisionWallet()
 * - createLightningAddress()
 * - createBoltcard({ label, spend_limit_sats })
 * - getPaymentHistory({ page, limit })
 * - getBoltcardLnurl()
 * - payInvoice(invoice, { walletId?, maxFeeSats? })
 *
 * Uses fetchWithAuth to include JWT and returns standardized responses.
 */

import fetchWithAuth from "../../src/lib/auth/fetch-with-auth";
import { apiConfig } from "./index.js";

function jsonOrText(res) {
  const c = res.headers.get("content-type") || "";
  return c.includes("application/json") ? res.json() : res.text();
}

export async function provisionWallet(payload = {}) {
  try {
    const url = `${apiConfig.baseUrl}/lnbits-proxy`;
    const res = await fetchWithAuth(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "provisionWallet", payload }) });
    const data = await jsonOrText(res).catch(() => ({}));
    if (!res.ok) return { success: false, error: (data && data.error) || `HTTP ${res.status}` };
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function createLightningAddress(body = undefined) {
  try {
    const url = `${apiConfig.baseUrl}/lnbits-proxy`;
    const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createLightningAddress", payload: body || {} }) };
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
    const url = `${apiConfig.baseUrl}/lnbits-proxy`;
    const res = await fetchWithAuth(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createBoltcard", payload: { label, spend_limit_sats } })
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
    const url = `${apiConfig.baseUrl}/lnbits-proxy`;
    const numPage = Number(page);
    const numLimit = Number(limit);
    if (isNaN(numPage) || isNaN(numLimit) || numPage < 1 || numLimit < 1) {
      return { success: false, error: "Invalid page or limit parameters" };
    }
    const offset = Math.max(0, (numPage - 1) * numLimit);
    const res = await fetchWithAuth(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getPaymentHistory", payload: { limit: Number(limit), offset } })
    });
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
    const url = `${apiConfig.baseUrl}/lnbits-proxy`;
    const res = await fetchWithAuth(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "getBoltcardLnurl", payload: {} }) });
    const data = await jsonOrText(res).catch(() => ({}));
    if (!res.ok) return { success: false, error: (data && data.error) || `HTTP ${res.status}` };
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function getLNbitsWalletUrl() {
  try {
    const url = `${apiConfig.baseUrl}/lnbits-proxy`;
    const res = await fetchWithAuth(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getWalletUrl", payload: {} })
    });
    const data = await jsonOrText(res).catch(() => ({}));
    if (!res.ok) return { success: false, error: (data && data.error) || `HTTP ${res.status}` };
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function payInvoice(invoice, options = {}) {
  try {
    const url = `${apiConfig.baseUrl}/lnbits-proxy`;
    const res = await fetchWithAuth(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "payInvoice", payload: { invoice, ...options } })
    });
    const data = await jsonOrText(res).catch(() => ({}));
    if (!res.ok) return { success: false, error: (data && data.error) || `HTTP ${res.status}` };
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
