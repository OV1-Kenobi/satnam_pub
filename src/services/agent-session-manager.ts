/**
 * Agent Session Manager
 *
 * Phase 2.5 - Step 8: Session Lifecycle Management Service
 *
 * Manages agent session lifecycle with:
 * - Local caching with TTL
 * - Batch event processing (100ms debounce)
 * - Supabase Realtime subscriptions
 * - Auto-hibernation warnings
 * - Reactive updates via callbacks
 *
 * Singleton pattern - use AgentSessionManager.getInstance()
 *
 * @module src/services/agent-session-manager
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  AgentSession,
  CreateSessionRequest,
  LogEventRequest,
  ManageSessionRequest,
  SessionChannel,
  SessionEventType,
  SessionQueryParams,
  SessionStatus,
  SessionType,
} from "../../types/agent-sessions";
import {
  logApiCall,
  logCacheAccess,
  logCacheInvalidation,
  logEventBatchFlush,
  logRealtimeSubscription,
  logSessionCreate,
  logSessionError,
  logSessionTransition,
} from "../../utils/session-logger";
import SecureTokenManager from "../lib/auth/secure-token-manager";
import { supabase } from "../lib/supabase";
import { getSessionChannelSync } from "./session-channel-sync";

// ============================================================================
// Types
// ============================================================================

interface CachedData<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

interface EventQueueItem {
  sessionId: string;
  eventType: SessionEventType;
  eventData: Record<string, any>;
  tokens?: number;
  satsCost?: number;
  inputTokens?: number;
  outputTokens?: number;
  toolName?: string;
  toolParameters?: Record<string, any>;
  toolResult?: Record<string, any>;
}

interface SessionUpdateCallback {
  (session: AgentSession): void;
}

interface SessionEventCallback {
  (sessionId: string, event: any): void;
}

// ============================================================================
// Agent Session Manager (Singleton)
// ============================================================================

export class AgentSessionManager {
  private static instance: AgentSessionManager | null = null;

  /** Local session cache with TTL */
  private sessionCache: Map<string, CachedData<AgentSession>> = new Map();

  /** Query result cache with TTL */
  private queryCache: Map<string, CachedData<any>> = new Map();

  /** Event queue for batching */
  private eventQueue: EventQueueItem[] = [];

  /** Event flush timer */
  private flushTimer: NodeJS.Timeout | null = null;

  /** Hibernation check interval */
  private hibernationCheckInterval: NodeJS.Timeout | null = null;

  /** Realtime subscriptions */
  private realtimeChannels: RealtimeChannel[] = [];

  /** Session update callbacks */
  private sessionUpdateCallbacks: Set<SessionUpdateCallback> = new Set();

  /** Session event callbacks */
  private sessionEventCallbacks: Set<SessionEventCallback> = new Set();

  /** Last user interaction timestamp per session */
  private lastInteractionTimestamps: Map<string, number> = new Map();

  /** Auto-hibernation warning threshold (25 minutes = 1500000ms) */
  private readonly HIBERNATION_WARNING_THRESHOLD = 25 * 60 * 1000;

  /** Auto-hibernation threshold (30 minutes = 1800000ms) */
  private readonly HIBERNATION_THRESHOLD = 30 * 60 * 1000;

  /** Cache TTL for active sessions (30 seconds) */
  private readonly ACTIVE_SESSION_TTL = 30 * 1000;

  /** Cache TTL for historical data (5 minutes) */
  private readonly HISTORY_TTL = 5 * 60 * 1000;

  /** Event batch flush interval (100ms) */
  private readonly EVENT_FLUSH_INTERVAL = 100;

  /** JWT token for API calls */
  private jwtToken: string | null = null;

  /** API base URL */
  private readonly API_BASE = "/api";

  private constructor() {
    // Start interaction tracking
    this.startInteractionTracking();
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): AgentSessionManager {
    if (!AgentSessionManager.instance) {
      AgentSessionManager.instance = new AgentSessionManager();
    }
    return AgentSessionManager.instance;
  }

  /**
   * Destroy the singleton instance and cleanup resources.
   */
  static destroy(): void {
    if (AgentSessionManager.instance) {
      AgentSessionManager.instance.cleanup();
      AgentSessionManager.instance = null;
    }
  }

  /**
   * Initialize the session manager with JWT token.
   * @param jwtToken - JWT token for API authentication
   */
  async initialize(jwtToken: string): Promise<void> {
    const tokenChanged = this.jwtToken !== jwtToken;
    this.jwtToken = jwtToken;

    if (typeof supabase.realtime?.setAuth === "function") {
      await supabase.realtime.setAuth(jwtToken);
    }

    if (tokenChanged && this.realtimeChannels.length > 0) {
      this.realtimeChannels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      this.realtimeChannels = [];
    }

    if (this.realtimeChannels.length === 0) {
      await this.setupRealtimeSubscriptions();
    }
  }

  /**
   * Cleanup resources (subscriptions, timers, caches).
   */
  private cleanup(): void {
    // Clear flush timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any pending events (fire and forget)
    if (this.eventQueue.length > 0) {
      this.flushEventQueue().catch((err) => {
        logSessionError(
          "system",
          err instanceof Error ? err : new Error(String(err)),
          { operation: "cleanup_flush" },
        );
      });
    }

    // Clear hibernation check interval
    if (this.hibernationCheckInterval) {
      clearInterval(this.hibernationCheckInterval);
      this.hibernationCheckInterval = null;
    }

    // Unsubscribe from realtime channels
    this.realtimeChannels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    this.realtimeChannels = [];

    // Clear caches
    this.sessionCache.clear();
    this.queryCache.clear();
    this.eventQueue = [];
    this.lastInteractionTimestamps.clear();

    // Clear callbacks
    this.sessionUpdateCallbacks.clear();
    this.sessionEventCallbacks.clear();
  }

  // ============================================================================
  // Session Lifecycle Methods (Task 8.2)
  // ============================================================================

  /**
   * Create a new agent session.
   * @param agentId - Agent UUID
   * @param sessionType - Type of session
   * @param channel - Primary communication channel
   * @param humanCreatorId - Optional creator/guardian UUID
   * @returns Created session object
   */
  async createSession(
    agentId: string,
    sessionType: SessionType,
    channel: SessionChannel = "nostr",
    humanCreatorId?: string,
  ): Promise<AgentSession> {
    const request: CreateSessionRequest = {
      agent_id: agentId,
      session_type: sessionType,
      primary_channel: channel,
      created_by_user_id: humanCreatorId,
      human_creator_id: humanCreatorId,
    };

    const response = await logApiCall(
      `${this.API_BASE}/agent-session-create`,
      "POST",
      async () => {
        return await this.apiCall<{
          success: boolean;
          session_id: string;
          session: AgentSession;
        }>("POST", `${this.API_BASE}/agent-session-create`, request);
      },
      {
        component: "agent-session-manager",
        session_type: sessionType,
        channel,
      },
    );

    // Log successful session creation
    logSessionCreate({
      session_id: response.session_id,
      agent_id: agentId,
      session_type: sessionType,
      primary_channel: channel,
    });

    // Cache the new session
    this.cacheSession(response.session);

    // Initialize interaction tracking
    this.lastInteractionTimestamps.set(response.session_id, Date.now());

    return response.session;
  }

  /**
   * Pause an active session.
   * @param sessionId - Session ID to pause
   * @param reason - Optional reason for pausing
   */
  async pauseSession(sessionId: string, reason?: string): Promise<void> {
    const request: ManageSessionRequest = {
      session_id: sessionId,
      action: "pause",
      reason,
    };

    const cached = this.sessionCache.get(sessionId);
    const fromStatus = cached?.data.status ?? "ACTIVE";

    await logApiCall(
      `${this.API_BASE}/agent-session-manage`,
      "POST",
      async () => {
        return await this.apiCall(
          "POST",
          `${this.API_BASE}/agent-session-manage`,
          request,
        );
      },
      {
        component: "agent-session-manager",
        session_id: sessionId,
        operation: "pause",
      },
    );

    // Update local cache
    this.updateSessionStatus(sessionId, "PAUSED");
    logSessionTransition(sessionId, fromStatus, "PAUSED", reason);
  }

  /**
   * Resume a paused session.
   * @param sessionId - Session ID to resume
   */
  async resumeSession(sessionId: string): Promise<void> {
    const request: ManageSessionRequest = {
      session_id: sessionId,
      action: "resume",
    };

    const cached = this.sessionCache.get(sessionId);
    const fromStatus = cached?.data.status ?? "PAUSED";

    await logApiCall(
      `${this.API_BASE}/agent-session-manage`,
      "POST",
      async () => {
        return await this.apiCall(
          "POST",
          `${this.API_BASE}/agent-session-manage`,
          request,
        );
      },
      {
        component: "agent-session-manager",
        session_id: sessionId,
        operation: "resume",
      },
    );

    // Update local cache and interaction timestamp
    this.updateSessionStatus(sessionId, "ACTIVE");
    this.lastInteractionTimestamps.set(sessionId, Date.now());
    logSessionTransition(sessionId, fromStatus, "ACTIVE");
  }

  /**
   * Terminate a session.
   * @param sessionId - Session ID to terminate
   * @param reason - Optional reason for termination
   */
  async terminateSession(sessionId: string, reason?: string): Promise<void> {
    const request: ManageSessionRequest = {
      session_id: sessionId,
      action: "terminate",
      reason,
    };

    const cached = this.sessionCache.get(sessionId);
    const fromStatus = cached?.data.status ?? "ACTIVE";

    await logApiCall(
      `${this.API_BASE}/agent-session-manage`,
      "POST",
      async () => {
        return await this.apiCall(
          "POST",
          `${this.API_BASE}/agent-session-manage`,
          request,
        );
      },
      {
        component: "agent-session-manager",
        session_id: sessionId,
        operation: "terminate",
      },
    );

    // Update local cache and remove interaction tracking
    this.updateSessionStatus(sessionId, "TERMINATED");
    this.lastInteractionTimestamps.delete(sessionId);
    logSessionTransition(sessionId, fromStatus, "TERMINATED", reason);
  }

  /**
   * Switch session to a different channel.
   * @param sessionId - Session ID
   * @param newChannel - New communication channel
   */
  async switchChannel(
    sessionId: string,
    newChannel: SessionChannel,
  ): Promise<void> {
    const request: ManageSessionRequest = {
      session_id: sessionId,
      action: "switch_channel",
      new_channel: newChannel,
    };

    const cached = this.sessionCache.get(sessionId);
    const fromStatus = cached?.data.status ?? "ACTIVE";
    const fromChannel = cached?.data.primary_channel;
    const priorContext = cached?.data.conversation_context;

    // Pre-switch: if leaving Nostr, persist a private snapshot to Nostr (store only event_id in DB)
    let snapshotEventId: string | null = null;
    try {
      if (fromChannel === "nostr") {
        const sync = getSessionChannelSync();
        const snap = await sync.snapshotContext(
          sessionId,
          fromChannel,
          priorContext ?? null,
        );
        if (snap.success && snap.eventId) snapshotEventId = snap.eventId;
      }
    } catch (error) {
      // Non-fatal for the channel switch itself, but log for observability
      logSessionError(
        sessionId,
        error instanceof Error ? error : new Error(String(error)),
        { operation: "pre_switch_snapshot", from_channel: fromChannel },
      );
    }

    // Perform the server-side channel switch
    await logApiCall(
      `${this.API_BASE}/agent-session-manage`,
      "POST",
      async () => {
        return await this.apiCall(
          "POST",
          `${this.API_BASE}/agent-session-manage`,
          request,
        );
      },
      {
        component: "agent-session-manager",
        session_id: sessionId,
        operation: "switch_channel",
        new_channel: newChannel,
      },
    );

    // Update local cache (channel only) and notify
    const cachedAfter = this.sessionCache.get(sessionId);
    if (cachedAfter) {
      cachedAfter.data.primary_channel = newChannel;
      this.notifySessionUpdate(cachedAfter.data);
    }

    // Record channel history with linkage to latest CHANNEL_SWITCH event (best-effort)
    try {
      const sync = getSessionChannelSync();
      const channelSwitchEventId =
        await sync.getLatestChannelSwitchEventId(sessionId);
      await sync.recordChannelHistory({
        sessionId,
        fromChannel: (fromChannel as SessionChannel) ?? newChannel,
        toChannel: newChannel,
        snapshotEventId,
        channelSwitchEventId,
        metadata: { source: "web_ui" },
      });
    } catch (error) {
      logSessionError(
        sessionId,
        error instanceof Error ? error : new Error(String(error)),
        { operation: "record_channel_history", new_channel: newChannel },
      );
    }

    // Post-switch: if switching to Nostr, try to restore most recent snapshot and detect conflicts
    try {
      if (newChannel === "nostr") {
        const sync = getSessionChannelSync();
        const latestSnapId = await sync.getLatestSnapshotEventId(sessionId);
        if (latestSnapId) {
          const restored = await sync.restoreContext(latestSnapId);
          const restoredContext = restored?.context ?? null;
          // Lightweight conflict detection: compare restored vs prior cached context
          if (sync.contextsDiverge(restoredContext, priorContext ?? null)) {
            await sync.handleConflict(sessionId, {
              reason: "context_divergence_on_switch_to_nostr",
              from: fromChannel ?? "unknown",
              to: newChannel,
              snapshot_event_id: latestSnapId,
            });
          }
          // Apply restored context to local cache for continuity (UI-only; server is source of truth)
          if (cachedAfter && restoredContext !== null) {
            try {
              (cachedAfter.data as any).conversation_context = restoredContext;
              this.notifySessionUpdate(cachedAfter.data);
            } catch (e) {
              // Non-fatal: best-effort update
            }
          }
        }
      }
    } catch (error) {
      logSessionError(
        sessionId,
        error instanceof Error ? error : new Error(String(error)),
        { operation: "post_switch_restore", new_channel: newChannel },
      );
    }

    // Status is unchanged; record transition reason for observability
    logSessionTransition(
      sessionId,
      fromStatus,
      fromStatus,
      `switch_channel:${newChannel}`,
    );
  }

  /**
   * Update session context metadata.
   * @param sessionId - Session ID
   * @param context - Context metadata to update
   */
  async updateContext(
    sessionId: string,
    context: Record<string, any>,
  ): Promise<void> {
    // TODO: Implement when update_session_context RPC is available
    throw new Error(
      "updateContext not yet implemented - requires update_session_context RPC",
    );
  }

  // ============================================================================
  // Event Logging Methods (Task 8.3)
  // ============================================================================

  /**
   * Log a message event to the session.
   * @param sessionId - Session ID
   * @param eventData - Message event data (role, content, etc.)
   * @param tokens - Optional token usage
   */
  async logMessage(
    sessionId: string,
    eventData: Record<string, any>,
    tokens?: { input?: number; output?: number; total?: number },
  ): Promise<void> {
    this.queueEvent({
      sessionId,
      eventType: "MESSAGE",
      eventData,
      inputTokens: tokens?.input,
      outputTokens: tokens?.output,
      tokens: tokens?.total,
    });

    // Update interaction timestamp
    this.lastInteractionTimestamps.set(sessionId, Date.now());
  }

  /**
   * Log a tool call event to the session.
   * @param sessionId - Session ID
   * @param toolName - Name of the tool called
   * @param params - Tool parameters
   * @param result - Tool result
   * @param tokens - Optional token usage
   */
  async logToolCall(
    sessionId: string,
    toolName: string,
    params: Record<string, any>,
    result: Record<string, any>,
    tokens?: { input?: number; output?: number; total?: number },
  ): Promise<void> {
    this.queueEvent({
      sessionId,
      eventType: "TOOL_CALL",
      eventData: { tool_name: toolName },
      toolName,
      toolParameters: params,
      toolResult: result,
      inputTokens: tokens?.input,
      outputTokens: tokens?.output,
      tokens: tokens?.total,
    });

    // Update interaction timestamp
    this.lastInteractionTimestamps.set(sessionId, Date.now());
  }

  /**
   * Log an error event to the session.
   * @param sessionId - Session ID
   * @param error - Error object or message
   * @param context - Optional error context
   */
  async logError(
    sessionId: string,
    error: Error | string,
    context?: Record<string, any>,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    this.queueEvent({
      sessionId,
      eventType: "ERROR",
      eventData: {
        error: errorMessage,
        stack: errorStack,
        context,
      },
    });
  }

  /**
   * Log a warning event to the session.
   * @param sessionId - Session ID
   * @param message - Warning message
   * @param context - Optional warning context
   */
  async logWarning(
    sessionId: string,
    message: string,
    context?: Record<string, any>,
  ): Promise<void> {
    this.queueEvent({
      sessionId,
      eventType: "WARNING",
      eventData: {
        message,
        context,
      },
    });
  }

  /**
   * Queue an event for batch processing.
   * Events are flushed every 100ms to reduce API calls.
   */
  private queueEvent(event: EventQueueItem): void {
    this.eventQueue.push(event);

    // Schedule flush if not already scheduled
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushEventQueue();
      }, this.EVENT_FLUSH_INTERVAL);
    }
  }

  /**
   * Flush queued events to the API.
   */
  private async flushEventQueue(): Promise<void> {
    if (this.eventQueue.length === 0) {
      this.flushTimer = null;
      return;
    }

    // Take all queued events
    const eventsToFlush = [...this.eventQueue];
    this.eventQueue = [];
    this.flushTimer = null;

    // Send events in parallel (up to 10 at a time to avoid overwhelming the API)
    const batchSize = 10;
    for (let i = 0; i < eventsToFlush.length; i += batchSize) {
      const batch = eventsToFlush.slice(i, i + batchSize);
      const start = performance.now();
      try {
        const results = await Promise.all(
          batch.map(async (event) => {
            try {
              await this.sendEvent(event);
              return { ok: true } as const;
            } catch (err: any) {
              logSessionError(
                event.sessionId,
                err instanceof Error ? err : new Error(String(err)),
                { operation: "send_event", event_type: event.eventType },
              );
              return { ok: false } as const;
            }
          }),
        );
        const duration = performance.now() - start;
        const success = results.every((r) => r.ok);
        logEventBatchFlush(batch.length, duration, success);
      } catch (err: any) {
        const duration = performance.now() - start;
        logEventBatchFlush(batch.length, duration, false);
        logSessionError(
          "system",
          err instanceof Error ? err : new Error(String(err)),
          { operation: "flush_event_batch" },
        );
      }
    }
  }

  /**
   * Send a single event to the API.
   */
  private async sendEvent(event: EventQueueItem): Promise<void> {
    const request: LogEventRequest = {
      session_id: event.sessionId,
      event_type: event.eventType,
      event_data: event.eventData,
      tokens_used: event.tokens,
      sats_cost: event.satsCost,
      input_tokens: event.inputTokens,
      output_tokens: event.outputTokens,
      tool_name: event.toolName,
      tool_parameters: event.toolParameters,
      tool_result: event.toolResult,
    };

    await this.apiCall("POST", `${this.API_BASE}/agent-session-event`, request);
  }

  // ============================================================================
  // Query Methods (Task 8.4)
  // ============================================================================

  /**
   * Get active sessions for the current user's agents.
   * Uses local cache with 30s TTL.
   */
  async getActiveSessions(): Promise<any[]> {
    const cacheKey = "active_sessions";
    const cached = this.queryCache.get(cacheKey);

    // Return cached data if still valid
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    // Fetch from API
    const params: SessionQueryParams = {
      view: "active_summary",
      limit: 100,
    };

    const response = await this.queryAPI(params);

    // Cache the result
    this.queryCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now(),
      ttl: this.ACTIVE_SESSION_TTL,
    });

    return response.data;
  }

  /**
   * Get session history with optional filters.
   * Uses local cache with 5min TTL.
   */
  async getSessionHistory(
    filters?: Partial<SessionQueryParams>,
  ): Promise<any[]> {
    const cacheKey = `history_${JSON.stringify(filters || {})}`;
    const cached = this.queryCache.get(cacheKey);

    // Return cached data if still valid
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    // Fetch from API
    const params: SessionQueryParams = {
      view: "history",
      limit: 50,
      ...filters,
    };

    const response = await this.queryAPI(params);

    // Cache the result
    this.queryCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now(),
      ttl: this.HISTORY_TTL,
    });

    return response.data;
  }

  /**
   * Get event timeline for a specific session.
   * Uses local cache with 30s TTL.
   */
  async getSessionTimeline(sessionId: string): Promise<any[]> {
    const cacheKey = `timeline_${sessionId}`;
    const cached = this.queryCache.get(cacheKey);

    // Return cached data if still valid
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    // Fetch from API
    const params: SessionQueryParams = {
      view: "timeline",
      session_id: sessionId,
      sort_by: "created_at" as SessionQueryParams["sort_by"],
      limit: 100,
    };

    const response = await this.queryAPI(params);

    // Cache the result
    this.queryCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now(),
      ttl: this.ACTIVE_SESSION_TTL,
    });

    return response.data;
  }

  /**
   * Get cost analysis with optional filters.
   * Uses local cache with 5min TTL.
   */
  async getCostAnalysis(filters?: Partial<SessionQueryParams>): Promise<any[]> {
    const cacheKey = `cost_analysis_${JSON.stringify(filters || {})}`;
    const cached = this.queryCache.get(cacheKey);

    // Return cached data if still valid
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    // Fetch from API
    const params: SessionQueryParams = {
      view: "cost_analysis",
      limit: 50,
      ...filters,
    };

    const response = await this.queryAPI(params);

    // Cache the result
    this.queryCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now(),
      ttl: this.HISTORY_TTL,
    });

    return response.data;
  }

  /**
   * Query the session API with parameters.
   */
  private async queryAPI(
    params: SessionQueryParams,
  ): Promise<{ data: any[]; pagination: any }> {
    const queryString = new URLSearchParams(
      Object.entries(params).reduce(
        (acc, [key, value]) => {
          if (value !== undefined && value !== null) {
            acc[key] = String(value);
          }
          return acc;
        },
        {} as Record<string, string>,
      ),
    ).toString();

    return this.apiCall(
      "GET",
      `${this.API_BASE}/agent-session-query?${queryString}`,
    );
  }

  // ============================================================================
  // Supabase Realtime Subscriptions (Task 8.5)
  // ============================================================================

  /**
   * Setup Supabase Realtime subscriptions for session updates.
   */
  private async setupRealtimeSubscriptions(): Promise<void> {
    const tokenPayload = this.jwtToken
      ? SecureTokenManager.parseTokenPayload(this.jwtToken)
      : null;

    let authenticatedUserId = tokenPayload?.userId ?? null;

    if (!authenticatedUserId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      authenticatedUserId = user?.id ?? null;
    }

    if (!authenticatedUserId) {
      console.warn("No authenticated user - skipping realtime subscriptions");
      return;
    }

    // Subscribe to agent-owned session changes
    const agentSessionsChannel = supabase
      .channel("agent_sessions_changes_agent")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_sessions",
          filter: `agent_id=eq.${authenticatedUserId}`,
        },
        (payload) => {
          this.handleSessionChange(payload);
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          logRealtimeSubscription("agent_sessions_changes_agent", "SUBSCRIBED");
        } else if (status === "CHANNEL_ERROR") {
          logRealtimeSubscription(
            "agent_sessions_changes_agent",
            "CHANNEL_ERROR",
            err ?? undefined,
          );
          this.scheduleReconnect(
            agentSessionsChannel,
            "agent_sessions_changes_agent",
          );
        }
      });

    this.realtimeChannels.push(agentSessionsChannel);

    // Subscribe to creator-owned session changes
    const creatorSessionsChannel = supabase
      .channel("agent_sessions_changes_creator")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_sessions",
          filter: `human_creator_id=eq.${authenticatedUserId}`,
        },
        (payload) => {
          this.handleSessionChange(payload);
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          logRealtimeSubscription(
            "agent_sessions_changes_creator",
            "SUBSCRIBED",
          );
        } else if (status === "CHANNEL_ERROR") {
          logRealtimeSubscription(
            "agent_sessions_changes_creator",
            "CHANNEL_ERROR",
            err ?? undefined,
          );
          this.scheduleReconnect(
            creatorSessionsChannel,
            "agent_sessions_changes_creator",
          );
        }
      });

    this.realtimeChannels.push(creatorSessionsChannel);

    const createdBySessionsChannel = supabase
      .channel("agent_sessions_changes_created_by")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_sessions",
          filter: `created_by_user_id=eq.${authenticatedUserId}`,
        },
        (payload) => {
          this.handleSessionChange(payload);
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          logRealtimeSubscription(
            "agent_sessions_changes_created_by",
            "SUBSCRIBED",
          );
        } else if (status === "CHANNEL_ERROR") {
          logRealtimeSubscription(
            "agent_sessions_changes_created_by",
            "CHANNEL_ERROR",
            err ?? undefined,
          );
          this.scheduleReconnect(
            createdBySessionsChannel,
            "agent_sessions_changes_created_by",
          );
        }
      });

    this.realtimeChannels.push(createdBySessionsChannel);

    // Subscribe to agent_session_events inserts
    const eventsChannel = supabase
      .channel("agent_session_events_inserts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_session_events",
          // Filter events to sessions owned by this user's agents
          // Note: This requires the agent_session_events table to have
          // appropriate RLS policies or a user_id column
        },
        (payload) => {
          this.handleSessionEvent(payload);
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          logRealtimeSubscription("agent_session_events_inserts", "SUBSCRIBED");
        } else if (status === "CHANNEL_ERROR") {
          logRealtimeSubscription(
            "agent_session_events_inserts",
            "CHANNEL_ERROR",
            err ?? undefined,
          );
          this.scheduleReconnect(eventsChannel, "agent_session_events_inserts");
        }
      });

    this.realtimeChannels.push(eventsChannel);
  }

  /**
   * Handle session change from realtime subscription.
   */
  private handleSessionChange(payload: any): void {
    const session = payload.new as AgentSession;

    // Update local cache
    this.cacheSession(session);

    // Notify callbacks
    this.notifySessionUpdate(session);

    // Invalidate query cache
    const cleared = this.queryCache.size;
    this.queryCache.clear();
    if (cleared > 0) {
      logCacheInvalidation("realtime_session_change", cleared);
    }
  }

  /**
   * Handle session event from realtime subscription.
   */
  private handleSessionEvent(payload: any): void {
    const event = payload.new;
    const sessionId = event.session_id;

    // Notify event callbacks
    this.sessionEventCallbacks.forEach((callback) => {
      try {
        callback(sessionId, event);
      } catch (error) {
        logSessionError(
          sessionId,
          error instanceof Error ? error : new Error(String(error)),
          { operation: "session_event_callback" },
        );
      }
    });

    // Invalidate timeline cache for this session
    const hadKey = this.queryCache.delete(`timeline_${sessionId}`);
    if (hadKey) {
      logCacheInvalidation("realtime_session_event", 1);
    }
  }

  /**
   * Schedule reconnection with exponential backoff.
   */
  private scheduleReconnect(
    channel: RealtimeChannel,
    channelName: string,
    attempt: number = 1,
  ): void {
    const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // Exponential, max 30s

    setTimeout(() => {
      logRealtimeSubscription(channelName, "RECONNECTING");
      channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          logRealtimeSubscription(channelName, "SUBSCRIBED");
        } else if (status === "CHANNEL_ERROR") {
          logRealtimeSubscription(
            channelName,
            "CHANNEL_ERROR",
            err ?? undefined,
          );
          this.scheduleReconnect(channel, channelName, attempt + 1);
        }
      });
    }, backoffMs);
  }

  // ============================================================================
  // Auto-Hibernation Detection (Task 8.6)
  // ============================================================================

  /**
   * Start tracking user interactions for auto-hibernation warnings.
   */
  private startInteractionTracking(): void {
    // Check every minute for sessions approaching hibernation
    this.hibernationCheckInterval = setInterval(() => {
      this.checkHibernationWarnings();
    }, 60 * 1000);
  }

  /**
   * Check for sessions approaching hibernation threshold.
   */
  /** Sessions that have been warned about hibernation */
  private warnedSessions: Set<string> = new Set();

  private checkHibernationWarnings(): void {
    const now = Date.now();

    this.lastInteractionTimestamps.forEach((lastInteraction, sessionId) => {
      const timeSinceInteraction = now - lastInteraction;

      // Warn if approaching hibernation (25 minutes)
      if (
        timeSinceInteraction >= this.HIBERNATION_WARNING_THRESHOLD &&
        timeSinceInteraction < this.HIBERNATION_THRESHOLD &&
        !this.warnedSessions.has(sessionId)
      ) {
        this.showHibernationWarning(sessionId);
        this.warnedSessions.add(sessionId);
      }
    });
  }

  /**
   * Show hibernation warning to user.
   * This should trigger a toast notification in the UI.
   */
  private showHibernationWarning(sessionId: string): void {
    // Emit a custom event that UI components can listen to
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("session-hibernation-warning", {
          detail: { sessionId },
        }),
      );
    }
  }

  /**
   * Keep a session alive by updating interaction timestamp.
   * Call this when user explicitly wants to extend the session.
   */
  keepAlive(sessionId: string): void {
    this.lastInteractionTimestamps.set(sessionId, Date.now());
    this.warnedSessions.delete(sessionId);
  }

  // ============================================================================
  // Callback Management
  // ============================================================================

  /**
   * Register a callback for session updates.
   * @param callback - Function to call when a session is updated
   * @returns Unsubscribe function
   */
  onSessionUpdate(callback: SessionUpdateCallback): () => void {
    this.sessionUpdateCallbacks.add(callback);
    return () => {
      this.sessionUpdateCallbacks.delete(callback);
    };
  }

  /**
   * Register a callback for session events.
   * @param callback - Function to call when a session event occurs
   * @returns Unsubscribe function
   */
  onSessionEvent(callback: SessionEventCallback): () => void {
    this.sessionEventCallbacks.add(callback);
    return () => {
      this.sessionEventCallbacks.delete(callback);
    };
  }

  /**
   * Notify all session update callbacks.
   */
  private notifySessionUpdate(session: AgentSession): void {
    this.sessionUpdateCallbacks.forEach((callback) => {
      try {
        callback(session);
      } catch (error) {
        logSessionError(
          session.session_id,
          error instanceof Error ? error : new Error(String(error)),
          { operation: "session_update_callback" },
        );
      }
    });
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Cache a session with TTL.
   */
  private cacheSession(session: AgentSession): void {
    this.sessionCache.set(session.session_id, {
      data: session,
      timestamp: Date.now(),
      ttl: this.ACTIVE_SESSION_TTL,
    });
  }

  /**
   * Update session status in cache.
   */
  private updateSessionStatus(sessionId: string, status: SessionStatus): void {
    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      cached.data.status = status;
      cached.data.last_activity_at = new Date().toISOString();
      this.notifySessionUpdate(cached.data);
    }
  }

  /**
   * Get session from cache or fetch from API.
   */
  async getSession(sessionId: string): Promise<AgentSession | null> {
    // Check cache first
    const cached = this.sessionCache.get(sessionId);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      logCacheAccess(`session_${sessionId}`, true, cached.ttl);
      return cached.data;
    }
    logCacheAccess(`session_${sessionId}`, false);

    // TODO: Implement dedicated get_session endpoint
    // Cache miss returns null until endpoint is available
    return null;
  }

  /**
   * Clear all caches.
   */
  clearCache(): void {
    const keysCleared = this.sessionCache.size + this.queryCache.size;
    this.sessionCache.clear();
    this.queryCache.clear();
    logCacheInvalidation("manual_clear", keysCleared);
  }

  // ============================================================================
  // API Communication
  // ============================================================================

  /**
   * Make an API call with authentication.
   */
  private async apiCall<T = any>(
    method: "GET" | "POST",
    url: string,
    body?: any,
  ): Promise<T> {
    const refreshedToken = await SecureTokenManager.silentRefresh();
    const effectiveToken = refreshedToken || this.jwtToken;

    if (!effectiveToken) {
      throw new Error(
        "AgentSessionManager not initialized - call initialize() first",
      );
    }

    if (effectiveToken !== this.jwtToken) {
      this.jwtToken = effectiveToken;
      if (typeof supabase.realtime?.setAuth === "function") {
        await supabase.realtime.setAuth(effectiveToken);
      }
    }

    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveToken}`,
      },
    };

    if (body && method === "POST") {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API call failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }
}

// ============================================================================
// Export singleton instance getter
// ============================================================================

/**
 * Get the AgentSessionManager singleton instance.
 * Must call initialize(jwtToken) before using.
 */
export function getAgentSessionManager(): AgentSessionManager {
  return AgentSessionManager.getInstance();
}

/**
 * Destroy the AgentSessionManager singleton instance.
 * Useful for cleanup and testing.
 */
export function destroyAgentSessionManager(): void {
  AgentSessionManager.destroy();
}
