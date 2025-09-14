/**
 * Communications API helpers (client-side)
 * - deleteMessage(messageId)
 * - blockSender(senderPubkey)
 *
 * Uses fetchWithAuth to include JWT when available and returns
 * standardized responses: { success: boolean, error?: string }.
 */

import fetchWithAuth from "../../src/lib/auth/fetch-with-auth";
import { TIMEOUTS, withRetry } from "../../src/lib/utils/api-retry";
import { apiConfig } from "./index.js";

/**
 * Delete a message by server message ID
 * @param {string} messageId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function deleteMessage(messageId) {
  try {
    const url = `${apiConfig.baseUrl}/api/communications/messages/delete`;
    const res = await fetchWithAuth(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: messageId })
    });

    if (!res.ok) {
      let err = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data && typeof data.error === "string") err = data.error;
      } catch {}
      return { success: false, error: err };
    }
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

/**
 * Block a sender by pubkey (hex or npub as accepted by backend)
 * @param {string} senderPubkey
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function blockSender(senderPubkey) {
  try {
    const url = `${apiConfig.baseUrl}/api/communications/block`;
    const res = await fetchWithAuth(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: senderPubkey })
    });

    if (!res.ok) {
      let err = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data && typeof data.error === "string") err = data.error;
      } catch {}
      return { success: false, error: err };
    }
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}



/**
 * List user's groups
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
export async function listUserGroups() {
  try {
    // Netlify function path; apiConfig.baseUrl typically '/.netlify/functions'
    const url = `${apiConfig.baseUrl}/groups`;
    const res = await withRetry((signal) => fetchWithAuth(url, { method: "GET", signal }), { maxAttempts: 2, initialDelayMs: 1000, totalTimeoutMs: TIMEOUTS.nonCritical });
    if (!res.ok) {
      let err = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data && typeof data.error === "string") err = data.error;
      } catch {}
      return { success: false, error: err };
    }
    const data = await res.json();
    return { success: true, data: data?.data || [] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

/**
 * Update group preferences (mute/unmute)
 * @param {string} groupId
 * @param {boolean} muted
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function updateGroupPreferences(groupId, muted) {
  try {
    const url = `${apiConfig.baseUrl}/groups`;
    const res = await withRetry(
      (signal) => fetchWithAuth(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_preferences", groupId, muted }),
        signal,
      }),
      { maxAttempts: 2, initialDelayMs: 1000, totalTimeoutMs: TIMEOUTS.nonCritical }
    );
    if (!res.ok) {
      let err = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data && typeof data.error === "string") err = data.error;
      } catch {}
      return { success: false, error: err };
    }
    const data = await res.json();
    if (data && data.success) return { success: true };
    return { success: false, error: (data && data.error) || "Failed to update preferences" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

/**
 * Leave a group
 * @param {string} groupId
 */
export async function leaveGroup(groupId) {
  try {
    const url = `${apiConfig.baseUrl}/groups`;
    const res = await withRetry(
      (signal) => fetchWithAuth(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave_group", groupId }),
        signal,
      }),
      { maxAttempts: 2, initialDelayMs: 1000, totalTimeoutMs: TIMEOUTS.nonCritical }
    );
    const data = await res.json();
    if (res.ok && data?.success) return { success: true };
    return { success: false, error: data?.error || `HTTP ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

// Admin endpoints (/.netlify/functions/group-management)

export async function createGroup(name, groupType, encryptionType, avatarUrl = null, groupDescription = null) {
  try {
    const url = `${apiConfig.baseUrl}/group-management`;
    const res = await withRetry(
      (signal) => fetchWithAuth(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_group", name, group_type: groupType, encryption_type: encryptionType, avatar_url: avatarUrl, group_description: groupDescription }),
        signal,
      }),
      { maxAttempts: 2, initialDelayMs: 1000, totalTimeoutMs: TIMEOUTS.nonCritical }
    );
    const data = await res.json();
    if (res.ok && data?.success) return { success: true, data: data?.data };
    return { success: false, error: data?.error || `HTTP ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

export async function addGroupMember(groupId, memberHash) {
  try {
    const url = `${apiConfig.baseUrl}/group-management`;
    const res = await withRetry(
      (signal) => fetchWithAuth(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_member", groupId, memberHash }),
        signal,
      }),
      { maxAttempts: 2, initialDelayMs: 1000, totalTimeoutMs: TIMEOUTS.nonCritical }
    );
    const data = await res.json();
    if (res.ok && data?.success) return { success: true };
    return { success: false, error: data?.error || `HTTP ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

export async function removeGroupMember(groupId, memberHash) {
  try {
    const url = `${apiConfig.baseUrl}/group-management`;
    const res = await withRetry(
      (signal) => fetchWithAuth(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_member", groupId, memberHash }),
        signal,
      }),
      { maxAttempts: 2, initialDelayMs: 1000, totalTimeoutMs: TIMEOUTS.nonCritical }
    );
    const data = await res.json();
    if (res.ok && data?.success) return { success: true };
    return { success: false, error: data?.error || `HTTP ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

export async function createGroupTopic(groupId, topicName, description = null) {
  try {
    const url = `${apiConfig.baseUrl}/group-management`;
    const res = await withRetry(
      (signal) => fetchWithAuth(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_topic", groupId, topicName, description }),
        signal,
      }),
      { maxAttempts: 2, initialDelayMs: 1000, totalTimeoutMs: TIMEOUTS.nonCritical }
    );
    const data = await res.json();
    if (res.ok && data?.success) return { success: true, data: data?.data };
    return { success: false, error: data?.error || `HTTP ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

export async function getGroupDetails(groupId, page = 1, pageSize = 100) {
  try {
    const qs = new URLSearchParams({ groupId: String(groupId), page: String(page), pageSize: String(pageSize) }).toString();
    const url = `${apiConfig.baseUrl}/group-management?${qs}`;
    const res = await withRetry((signal) => fetchWithAuth(url, { method: "GET", signal }), { maxAttempts: 2, initialDelayMs: 1000, totalTimeoutMs: TIMEOUTS.nonCritical });
    const data = await res.json();
    if (res.ok && data?.success) return { success: true, data: data?.data };
    return { success: false, error: data?.error || `HTTP ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

