/*
 * SessionChannelSync Service (Step 11)
 * Manages Nostr-based context snapshots on channel switches with privacy-first design.
 */

import type { SessionChannel } from "../../types/agent-sessions";
import { logDebug, logError, logInfo } from "../../utils/session-logger";
import fetchWithAuth from "../lib/auth/fetch-with-auth";
import SecureTokenManager from "../lib/auth/secure-token-manager";
import {
  getCepsClient,
  listEventsWithCeps,
  publishOptimizedWithCeps,
} from "../lib/ceps/ceps-client";
import { supabase } from "../lib/supabase";

export interface SnapshotResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export class SessionChannelSync {
  private static instance: SessionChannelSync | null = null;
  private selfPubHex: string | null = null;

  static getInstance(): SessionChannelSync {
    if (!this.instance) this.instance = new SessionChannelSync();
    return this.instance;
  }

  // Resolve and cache our own pubkey (hex) via a harmless sign to reveal pubkey
  private async getSelfPubHex(): Promise<string> {
    if (this.selfPubHex) return this.selfPubHex;
    const ceps = await getCepsClient();
    const now = Math.floor(Date.now() / 1000);
    const signed = await ceps.signEventWithActiveSession({
      kind: 1,
      created_at: now,
      tags: [],
      content: "",
    } as any);
    const pub = (signed as any).pubkey as string;
    if (!pub || pub.length !== 64)
      throw new Error("Failed to resolve self pubkey");
    this.selfPubHex = pub;
    return pub;
  }

  // Publish a sealed+giftwrapped snapshot addressed to self; store only eventId
  async snapshotContext(
    sessionId: string,
    fromChannel: SessionChannel,
    conversationContext: unknown,
  ): Promise<SnapshotResult> {
    try {
      const ceps = await getCepsClient();
      const selfHex = await this.getSelfPubHex();
      const payload = {
        v: 1,
        type: "session_context_snapshot",
        sessionId,
        fromChannel,
        createdAt: Date.now(),
        // Store full context in the encrypted payload; never log it
        context: conversationContext,
      };

      const sealed = await ceps.sealKind13WithActiveSession(
        payload as any,
        selfHex,
      );
      const wrapped = await ceps.giftWrap1059(sealed, selfHex);
      const eventId = await publishOptimizedWithCeps(wrapped as any, {
        recipientPubHex: selfHex,
        senderPubHex: (wrapped as any).pubkey as string,
      });

      logInfo("Context snapshot published", {
        component: "session-channel-sync",
        session_id: sessionId,
        from_channel: fromChannel,
        snapshot_event_id: eventId,
        success: true,
      });

      return { success: true, eventId };
    } catch (error) {
      logError(
        "Snapshot publication failed",
        { component: "session-channel-sync", session_id: sessionId },
        error instanceof Error ? error : new Error(String(error)),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Fetch an event by ID and unwrap/decrypt it using CEPS
  async restoreContext(eventId: string): Promise<any | null> {
    try {
      const ceps = await getCepsClient();
      const events = await listEventsWithCeps([{ ids: [eventId] }]);
      if (!events || !events.length) return null;
      const outer = events[0] as any;
      // Try unwrap gift first; fall back to outer if not a wrap
      const inner = (await ceps.unwrapGift59WithActiveSession(outer)) || outer;
      const opened = await ceps.openNip17DmWithActiveSession(inner as any);
      if (!opened || !opened.content) return null;
      try {
        return JSON.parse(opened.content);
      } catch {
        return null;
      }
    } catch (error) {
      logError(
        "Restore context failed",
        { component: "session-channel-sync", snapshot_event_id: eventId },
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  }

  async getLatestChannelSwitchEventId(
    sessionId: string,
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from("agent_session_events")
        .select("id")
        .eq("session_id", sessionId)
        .eq("event_type", "CHANNEL_SWITCH")
        .order("timestamp", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = (data || [])[0];
      return row ? (row.id as string) : null;
    } catch (e) {
      logDebug("Latest CHANNEL_SWITCH lookup failed", {
        component: "session-channel-sync",
        session_id: sessionId,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  async recordChannelHistory(params: {
    sessionId: string;
    fromChannel: SessionChannel;
    toChannel: SessionChannel;
    snapshotEventId?: string | null;
    channelSwitchEventId?: string | null;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const {
      sessionId,
      fromChannel,
      toChannel,
      snapshotEventId,
      channelSwitchEventId,
      metadata,
    } = params;
    try {
      const { error } = await supabase
        .from("agent_session_channel_history")
        .insert({
          session_id: sessionId,
          from_channel: fromChannel,
          to_channel: toChannel,
          context_snapshot_event_id: snapshotEventId ?? null,
          channel_switch_event_id: channelSwitchEventId ?? null,
          metadata: metadata ?? {},
        });
      if (error) throw error;
      logInfo("Channel history recorded", {
        component: "session-channel-sync",
        session_id: sessionId,
        from_channel: fromChannel,
        to_channel: toChannel,
        snapshot_event_present: !!snapshotEventId,
        success: true,
      });
    } catch (error) {
      logError(
        "Record channel history failed",
        { component: "session-channel-sync", session_id: sessionId },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  // Get the most recent snapshot event id for this session (leaving Nostr)
  async getLatestSnapshotEventId(sessionId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from("agent_session_channel_history")
        .select("context_snapshot_event_id, from_channel, switched_at")
        .eq("session_id", sessionId)
        .not("context_snapshot_event_id", "is", null)
        .order("switched_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = (data || [])[0] as
        | { context_snapshot_event_id: string | null }
        | undefined;
      return row?.context_snapshot_event_id ?? null;
    } catch (e) {
      logDebug("Latest snapshot lookup failed", {
        component: "session-channel-sync",
        session_id: sessionId,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  // Light conflict detection and signaling
  async handleConflict(
    sessionId: string,
    details: Record<string, any>,
  ): Promise<void> {
    try {
      await SecureTokenManager.silentRefresh();

      // Log an event (source of truth) via API
      const response = await fetchWithAuth("/api/agent-session-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          event_type: "WARNING",
          event_data: {
            message: "Session context conflict detected",
            conflict_type: "CONFLICT_DETECTED",
            ...details,
          },
        }),
      });

      if (!response.ok) {
        logDebug("Conflict event logging returned non-OK response", {
          component: "session-channel-sync",
          session_id: sessionId,
          status: response.status,
        });
      }
    } catch (e) {
      // Non-fatal: UI signal still dispatched
    }

    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("session-conflict-detected", {
            detail: { sessionId, ...details },
          }),
        );
      }
    } catch {
      /* noop */
    }
  }

  // Compare contexts with a simple deterministic string compare
  contextsDiverge(a: unknown, b: unknown): boolean {
    try {
      const sa = JSON.stringify(a ?? null);
      const sb = JSON.stringify(b ?? null);
      return sa !== sb;
    } catch {
      return true;
    }
  }
}

export function getSessionChannelSync(): SessionChannelSync {
  return SessionChannelSync.getInstance();
}
