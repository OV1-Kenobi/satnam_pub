/**
 * @fileoverview React Hook for Federated Family Nostr Signing
 * @description Provides functionality to manage multi-signature Nostr events
 * for family coordination with secure signing workflows
 */

import { useCallback, useEffect, useState } from "react";
import { useSecureToken } from "./useSecureTokenStorage";

/**
 * Sanitizes user agent string to remove sensitive version information
 * while preserving basic browser and OS information for security purposes
 */
function sanitizeUserAgent(userAgent: string): string {
  if (!userAgent) return "Unknown";

  // Extract basic browser family
  let browser = "Unknown";
  if (userAgent.includes("Chrome")) browser = "Chrome";
  else if (userAgent.includes("Firefox")) browser = "Firefox";
  else if (userAgent.includes("Safari") && !userAgent.includes("Chrome"))
    browser = "Safari";
  else if (userAgent.includes("Edge")) browser = "Edge";

  // Extract basic OS family
  let os = "Unknown";
  if (userAgent.includes("Windows")) os = "Windows";
  else if (userAgent.includes("Mac")) os = "macOS";
  else if (userAgent.includes("Linux")) os = "Linux";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("iOS")) os = "iOS";

  // Return sanitized version without specific versions or identifying details
  return `${browser} on ${os}`;
}

export interface FederatedNostrEvent {
  id: string;
  familyId: string;
  eventType:
    | "family_announcement"
    | "payment_request"
    | "member_update"
    | "coordination";
  content: string;
  author: string;
  authorPubkey: string;
  timestamp: Date;
  status: "pending" | "signed" | "broadcast" | "expired";
  signaturesRequired: number;
  signaturesReceived: number;
  memberSignatures: Record<string, MemberSignature>;
  nostrEventId?: string;
  broadcastTimestamp?: Date;
  expiresAt: Date;
}

export interface MemberSignature {
  memberId: string;
  memberPubkey: string;
  signed: boolean;
  signature?: string;
  timestamp?: Date;
  deviceInfo?: {
    userAgent: string;
    ipAddress: string;
  };
}

export interface FederatedSigningSession {
  sessionId: string;
  eventId: string;
  eventType: string;
  initiator: string;
  initiatorPubkey: string;
  requiredSigners: string[];
  completedSigners: string[];
  status: "active" | "completed" | "expired" | "cancelled";
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
}

export interface CreateEventParams {
  familyId: string;
  eventType: FederatedNostrEvent["eventType"];
  content: string;
  requiredSigners?: string[];
}

export interface SignEventParams {
  eventId: string;
  memberPrivateKey: string;
  deviceInfo?: MemberSignature["deviceInfo"];
}

export interface FederatedSigningResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: Record<string, unknown>;
}

export interface UseFederatedSigningReturn {
  // State
  pendingEvents: FederatedNostrEvent[];
  activeSessions: FederatedSigningSession[];
  loading: boolean;
  error: string | null;

  // Actions
  createEvent: (params: CreateEventParams) => Promise<FederatedSigningResponse>;
  signEvent: (params: SignEventParams) => Promise<FederatedSigningResponse>;
  refreshPendingEvents: (familyId: string) => Promise<void>;
  refreshActiveSessions: (familyId: string) => Promise<void>;

  // Utilities
  canUserSign: (event: FederatedNostrEvent, userId: string) => boolean;
  getEventProgress: (event: FederatedNostrEvent) => {
    percentage: number;
    remaining: number;
  };
  isEventExpired: (event: FederatedNostrEvent) => boolean;
}

/**
 * Hook for managing federated family Nostr signing
 */
export function useFederatedSigning(): UseFederatedSigningReturn {
  const [pendingEvents, setPendingEvents] = useState<FederatedNostrEvent[]>([]);
  const [activeSessions, setActiveSessions] = useState<
    FederatedSigningSession[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use secure token storage instead of localStorage
  const { getToken } = useSecureToken();

  /**
   * Create a new federated event requiring multiple signatures
   */
  const createEvent = useCallback(
    async (params: CreateEventParams): Promise<FederatedSigningResponse> => {
      try {
        setLoading(true);
        setError(null);

        const authToken = await getToken();
        if (!authToken) {
          throw new Error("Authentication required");
        }

        const response = await fetch("/api/federated-signing/create-event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(params),
        });

        const result = await response.json();

        if (result.success) {
          // Refresh pending events to include the new one
          await refreshPendingEvents(params.familyId);
        } else {
          setError(result.error || "Failed to create event");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create event";
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  /**
   * Sign a federated event
   */
  const signEvent = useCallback(
    async (params: SignEventParams): Promise<FederatedSigningResponse> => {
      try {
        setLoading(true);
        setError(null);

        // Add device info if not provided
        const deviceInfo = params.deviceInfo || {
          userAgent: sanitizeUserAgent(
            typeof navigator !== "undefined" ? navigator.userAgent : "",
          ), // Remove version numbers and specific details
          ipAddress: "client-side", // Will be filled by server
        };

        const authToken = await getToken();
        if (!authToken) {
          throw new Error("Authentication required");
        }

        const response = await fetch("/api/federated-signing/sign-event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            ...params,
            deviceInfo,
          }),
        });

        const result = await response.json();

        if (result.success) {
          // Update the event in local state
          setPendingEvents((prev) =>
            prev.map((event) => {
              if (event.id === params.eventId) {
                return {
                  ...event,
                  signaturesReceived: result.data.signaturesReceived,
                  status: result.data.status,
                };
              }
              return event;
            }),
          );

          // If event is completed, refresh sessions
          if (result.data.status === "signed") {
            const event = pendingEvents.find((e) => e.id === params.eventId);
            if (event) {
              await refreshActiveSessions(event.familyId);
            }
          }
        } else {
          setError(result.error || "Failed to sign event");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to sign event";
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setLoading(false);
      }
    },
    [pendingEvents, getToken],
  );

  /**
   * Refresh pending events for a family
   */
  const refreshPendingEvents = useCallback(
    async (familyId: string): Promise<void> => {
      try {
        setLoading(true);
        setError(null);

        const authToken = await getToken();
        if (!authToken) {
          throw new Error("Authentication required");
        }

        const response = await fetch(
          `/api/federated-signing/pending-events/${familyId}`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          },
        );

        const result = await response.json();

        if (result.success) {
          // Convert timestamp strings to Date objects
          const events = result.data.events.map(
            (
              event: Partial<FederatedNostrEvent> & {
                timestamp: string;
                expiresAt: string;
                broadcastTimestamp?: string;
              },
            ) =>
              ({
                ...event,
                timestamp: new Date(event.timestamp),
                expiresAt: new Date(event.expiresAt),
                broadcastTimestamp: event.broadcastTimestamp
                  ? new Date(event.broadcastTimestamp)
                  : undefined,
              }) as FederatedNostrEvent,
          );

          setPendingEvents(events);
        } else {
          setError(result.error || "Failed to fetch pending events");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch pending events";
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  /**
   * Refresh active sessions for a family
   */
  const refreshActiveSessions = useCallback(
    async (familyId: string): Promise<void> => {
      try {
        setLoading(true);
        setError(null);

        const authToken = await getToken();
        if (!authToken) {
          throw new Error("Authentication required");
        }

        const response = await fetch(
          `/api/federated-signing/active-sessions/${familyId}`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          },
        );

        const result = await response.json();

        if (result.success) {
          // Convert timestamp strings to Date objects
          const sessions = result.data.sessions.map(
            (
              session: Partial<FederatedSigningSession> & {
                created_at: string;
                expires_at: string;
                last_activity: string;
              },
            ) =>
              ({
                ...session,
                createdAt: new Date(session.created_at),
                expiresAt: new Date(session.expires_at),
                lastActivity: new Date(session.last_activity),
              }) as FederatedSigningSession,
          );

          setActiveSessions(sessions);
        } else {
          setError(result.error || "Failed to fetch active sessions");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to fetch active sessions";
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  /**
   * Check if user can sign an event
   */
  const canUserSign = useCallback(
    (event: FederatedNostrEvent, userId: string): boolean => {
      const memberSignature = event.memberSignatures[userId];
      if (!memberSignature) return false;

      return (
        !memberSignature.signed &&
        event.status === "pending" &&
        !isEventExpired(event)
      );
    },
    [],
  );

  /**
   * Get event signing progress
   */
  const getEventProgress = useCallback((event: FederatedNostrEvent) => {
    const percentage =
      (event.signaturesReceived / event.signaturesRequired) * 100;
    const remaining = event.signaturesRequired - event.signaturesReceived;

    return { percentage, remaining };
  }, []);

  /**
   * Check if event is expired
   */
  const isEventExpired = useCallback((event: FederatedNostrEvent): boolean => {
    return new Date() > event.expiresAt;
  }, []);

  // Auto-refresh intervals
  useEffect(() => {
    // Only set up interval if there are items to refresh
    if (pendingEvents.length === 0 && activeSessions.length === 0) {
      return;
    }

    // Set up periodic refresh for pending events and sessions
    const refreshInterval = setInterval(() => {
      // Only refresh if we have events/sessions to refresh
      if (pendingEvents.length > 0) {
        const familyId = pendingEvents[0].familyId;
        refreshPendingEvents(familyId);
      }

      if (activeSessions.length > 0) {
        const familyId = activeSessions[0].sessionId.split("_")[0]; // Assuming sessionId contains familyId
        refreshActiveSessions(familyId);
      }
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(refreshInterval);
  }, [
    pendingEvents,
    activeSessions,
    refreshPendingEvents,
    refreshActiveSessions,
  ]);

  return {
    // State
    pendingEvents,
    activeSessions,
    loading,
    error,

    // Actions
    createEvent,
    signEvent,
    refreshPendingEvents,
    refreshActiveSessions,

    // Utilities
    canUserSign,
    getEventProgress,
    isEventExpired,
  };
}

/**
 * Hook for managing family nostr protection
 */
export interface ProtectionParams {
  familyMemberId: string;
  nsec: string;
  guardians: string[];
  threshold: number;
  federationId: string;
}

export interface RecoveryParams {
  protectionId: string;
  guardianSignatures: Array<{
    guardianId: string;
    signature: string;
    shardData: string;
    timestamp: Date;
  }>;
  familyMemberId: string;
}

export interface NostrProtection {
  id: string;
  familyMemberId: string;
  protectionType: "shamir" | "multisig" | "threshold";
  threshold: number;
  totalShards: number;
  guardianIds: string[];
  status: "active" | "pending" | "revoked" | "expired";
  createdAt: Date;
  expiresAt?: Date;
  metadata: {
    encryptionMethod: string;
    keyDerivation: string;
    federationId: string;
  };
}

export interface UseFamilyNostrProtectionReturn {
  // State
  protections: NostrProtection[];
  loading: boolean;
  error: string | null;

  // Actions
  protectNsec: (params: ProtectionParams) => Promise<FederatedSigningResponse>;
  recoverNsec: (params: RecoveryParams) => Promise<FederatedSigningResponse>;
  getProtectionStatus: (
    familyMemberId: string,
  ) => Promise<FederatedSigningResponse>;
  refreshProtections: () => Promise<void>;
}

export function useFamilyNostrProtection(): UseFamilyNostrProtectionReturn {
  const [protections, setProtections] = useState<NostrProtection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use secure token storage instead of localStorage
  const { getToken } = useSecureToken();

  /**
   * Protect a family member's nsec key
   */
  const protectNsec = useCallback(
    async (params: ProtectionParams): Promise<FederatedSigningResponse> => {
      try {
        setLoading(true);
        setError(null);

        const authToken = await getToken();
        if (!authToken) {
          throw new Error("Authentication required");
        }

        const response = await fetch(
          "/api/family-nostr-protection/protect-nsec",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify(params),
          },
        );

        const result = await response.json();

        if (result.success) {
          await refreshProtections();
        } else {
          setError(result.error || "Failed to protect nsec");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to protect nsec";
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setLoading(false);
      }
    },
    [getToken, refreshProtections],
  );

  /**
   * Recover a family member's nsec key
   */
  const recoverNsec = useCallback(
    async (params: RecoveryParams): Promise<FederatedSigningResponse> => {
      try {
        setLoading(true);
        setError(null);

        const authToken = await getToken();
        if (!authToken) {
          throw new Error("Authentication required");
        }

        const response = await fetch(
          "/api/family-nostr-protection/recover-nsec",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify(params),
          },
        );

        const result = await response.json();

        if (!result.success) {
          setError(result.error || "Failed to recover nsec");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to recover nsec";
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  /**
   * Get protection status for a family member
   */
  const getProtectionStatus = useCallback(
    async (familyMemberId: string): Promise<FederatedSigningResponse> => {
      try {
        setLoading(true);
        setError(null);

        const authToken = await getToken();
        if (!authToken) {
          throw new Error("Authentication required");
        }

        const response = await fetch(
          `/api/family-nostr-protection/status/${familyMemberId}`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          },
        );

        const result = await response.json();

        if (!result.success) {
          setError(result.error || "Failed to get protection status");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to get protection status";
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  /**
   * Refresh protection list
   */
  const refreshProtections = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const authToken = await getToken();
      if (!authToken) {
        throw new Error("Authentication required");
      }

      const response = await fetch(`/api/family-nostr-protection/list`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        setProtections(result.data.protections);
      } else {
        setError(result.error || "Failed to fetch protections");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to refresh protections";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  return {
    // State
    protections,
    loading,
    error,

    // Actions
    protectNsec,
    recoverNsec,
    getProtectionStatus,
    refreshProtections,
  };
}
