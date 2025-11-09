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
 * Helper function for consistent API response handling
 * @param {Response} res - Fetch response object
 * @param {boolean} expectData - Whether to return response data
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
async function handleApiResponse(res, expectData = false) {
  if (!res.ok) {
    let err = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && typeof data.error === "string") err = data.error;
    } catch {}
    return { success: false, error: err };
  }

  if (expectData) {
    try {
      const data = await res.json();
      return { success: true, data };
    } catch {
      return { success: true };
    }
  }
  return { success: true };
}

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
 * @param {string} groupId - Group ID
 * @param {boolean} muted - Muted status
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function updateGroupPreferences(groupId, muted) {
  if (!groupId) {
    return { success: false, error: 'Group ID is required' };
  }

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
    return await handleApiResponse(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

/**
 * Leave a group
 * @param {string} groupId - Group ID
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function leaveGroup(groupId) {
  if (!groupId) {
    return { success: false, error: 'Group ID is required' };
  }

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
    return await handleApiResponse(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

// Admin endpoints (/.netlify/functions/group-management)

/**
 * Create a new group
 * @param {string} name - Group name
 * @param {string} groupType - Type of group
 * @param {string} encryptionType - Encryption type
 * @param {string|null} avatarUrl - Optional avatar URL
 * @param {string|null} groupDescription - Optional group description
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
export async function createGroup(name, groupType, encryptionType, avatarUrl = null, groupDescription = null) {
  if (!name || !groupType || !encryptionType) {
    return { success: false, error: 'Name, group type, and encryption type are required' };
  }

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
    const response = await handleApiResponse(res, true);
    return response;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

/**
 * Add a member to a group
 * @param {string} groupId - Group ID
 * @param {string} memberHash - Member hash to add
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function addGroupMember(groupId, memberHash) {
  if (!groupId || !memberHash) {
    return { success: false, error: 'Group ID and member hash are required' };
  }

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
    return await handleApiResponse(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

/**
 * Remove a member from a group
 * @param {string} groupId - Group ID
 * @param {string} memberHash - Member hash to remove
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function removeGroupMember(groupId, memberHash) {
  if (!groupId || !memberHash) {
    return { success: false, error: 'Group ID and member hash are required' };
  }

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
    return await handleApiResponse(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

/**
 * Create a topic within a group
 * @param {string} groupId - Group ID
 * @param {string} topicName - Name of the topic
 * @param {string|null} description - Optional topic description
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
export async function createGroupTopic(groupId, topicName, description = null) {
  if (!groupId || !topicName) {
    return { success: false, error: 'Group ID and topic name are required' };
  }

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
    return await handleApiResponse(res, true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

/**
 * Get details for a specific group
 * @param {string} groupId - Group ID
 * @param {number} page - Page number (default: 1)
 * @param {number} pageSize - Page size (default: 100)
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
export async function getGroupDetails(groupId, page = 1, pageSize = 100) {
  if (!groupId) {
    return { success: false, error: 'Group ID is required' };
  }

  try {
    const qs = new URLSearchParams({ groupId: String(groupId), page: String(page), pageSize: String(pageSize) }).toString();
    const url = `${apiConfig.baseUrl}/group-management?${qs}`;
    const res = await withRetry((signal) => fetchWithAuth(url, { method: "GET", signal }), { maxAttempts: 2, initialDelayMs: 1000, totalTimeoutMs: TIMEOUTS.nonCritical });
    return await handleApiResponse(res, true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { success: false, error: msg };
  }
}

