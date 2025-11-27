/**
 * useGeoRoom Hook - Phase 2 Live Geo-Room Messaging
 *
 * React hook for managing geo-room subscriptions and messaging.
 * Provides connect, disconnect, and send message functionality.
 *
 * @module src/hooks/useGeoRoom
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { Event as NostrEvent } from "nostr-tools";
import {
  subscribeToGeoRoom,
  publishGeoRoomMessage,
  mapGeoRoomErrorToMessage,
} from "../lib/geochat/geo-room-service";
import {
  GeoRoomError,
  type GeoRoomSubscription,
  type GeoRoomState,
  type GeoRoomActions,
  type PublishGeoRoomMessageResult,
} from "../lib/geochat/types";
import { clientConfig } from "../config/env.client";
import { useGeoDiscovery } from "./useGeoDiscovery";

/**
 * Hook return type combining state and actions.
 */
export type UseGeoRoomReturn = GeoRoomState & GeoRoomActions;

/**
 * React hook for geo-room subscription and messaging.
 * @param authorPubkey - Optional author public key (hex) for sending messages
 * @returns State and actions for geo-room operations
 */
export function useGeoRoom(authorPubkey?: string): UseGeoRoomReturn {
  // Get consent status from discovery hook
  const { state: discoveryState } = useGeoDiscovery(
    clientConfig.flags.geochatEnabled
  );

  // State
  const [activeGeohash, setActiveGeohash] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<NostrEvent[]>([]);
  const [error, setError] = useState<GeoRoomError | null>(null);
  const [activeRelays, setActiveRelays] = useState<string[]>([]);

  // Subscription ref for cleanup
  const subscriptionRef = useRef<GeoRoomSubscription | null>(null);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
        } catch (err) {
          console.warn(
            "[useGeoRoom] Error during cleanup:",
            err instanceof Error ? err.message : String(err)
          );
        }
        subscriptionRef.current = null;
      }
    };
  }, []);

  // Connect to a geo-room
  const connect = useCallback(
    async (geohash: string): Promise<void> => {
      // Check feature flag
      if (!clientConfig.flags.geochatLiveEnabled) {
        const err = new GeoRoomError(
          "subscription_failed",
          "Live geo-room messaging is not enabled"
        );
        setError(err);
        throw err;
      }

      // Check consent
      if (!discoveryState.hasConsented) {
        const err = new GeoRoomError(
          "subscription_failed",
          "Geo-room consent required"
        );
        setError(err);
        throw err;
      }

      // Disconnect from current room if any
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
        } catch (err) {
          console.warn(
            "[useGeoRoom] Error disconnecting from previous room:",
            err instanceof Error ? err.message : String(err)
          );
        }
        subscriptionRef.current = null;
      }

      // Reset state for new connection
      setIsConnecting(true);
      setIsConnected(false);
      setError(null);
      setMessages([]);
      setActiveRelays([]);

      try {
        const subscription = await subscribeToGeoRoom({
          geohash,
          onEvent: (event: NostrEvent) => {
            setMessages((prev) => [...prev, event]);
          },
          onError: (geoError: GeoRoomError) => {
            console.error(
              "[useGeoRoom] Subscription error:",
              mapGeoRoomErrorToMessage(geoError)
            );
            setError(geoError);
          },
          onConnect: () => {
            setIsConnected(true);
            setIsConnecting(false);
          },
          onEose: () => {
            // End of stored events - connection is established
            setIsConnected(true);
            setIsConnecting(false);
          },
        });

        subscriptionRef.current = subscription;
        setActiveGeohash(subscription.activeGeohash);
        setIsConnecting(false);
        setIsConnected(true);
      } catch (err) {
        setIsConnecting(false);
        setIsConnected(false);

        const geoError =
          err instanceof GeoRoomError
            ? err
            : new GeoRoomError(
                "subscription_failed",
                err instanceof Error ? err.message : "Failed to connect",
                { geohash, cause: err }
              );

        setError(geoError);
        throw geoError;
      }
    },
    [discoveryState.hasConsented]
  );

  // Disconnect from current geo-room
  const disconnect = useCallback((): void => {
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.unsubscribe();
      } catch (err) {
        console.warn(
          "[useGeoRoom] Error during disconnect:",
          err instanceof Error ? err.message : String(err)
        );
      }
      subscriptionRef.current = null;
    }

    setActiveGeohash(null);
    setIsConnected(false);
    setIsConnecting(false);
    setMessages([]);
    setActiveRelays([]);
    setError(null);
  }, []);

  // Send a message to the current geo-room
  const sendMessage = useCallback(
    async (content: string): Promise<PublishGeoRoomMessageResult> => {
      // Validate connection
      if (!activeGeohash) {
        const err = new GeoRoomError(
          "publish_failed",
          "Not connected to a geo-room"
        );
        setError(err);
        throw err;
      }

      // Validate author pubkey
      if (!authorPubkey) {
        const err = new GeoRoomError(
          "publish_failed",
          "Author public key is required to send messages"
        );
        setError(err);
        throw err;
      }

      // Validate content
      if (!content || content.trim().length === 0) {
        const err = new GeoRoomError(
          "publish_failed",
          "Message content cannot be empty"
        );
        setError(err);
        throw err;
      }

      try {
        const result = await publishGeoRoomMessage({
          geohash: activeGeohash,
          content: content.trim(),
          authorPubkey,
        });

        // Clear any previous errors on success
        setError(null);

        // Note: We don't add the message to local state here.
        // It will come back through the subscription's onEvent callback.
        return result;
      } catch (err) {
        const geoError =
          err instanceof GeoRoomError
            ? err
            : new GeoRoomError(
                "publish_failed",
                err instanceof Error ? err.message : "Failed to send message",
                { geohash: activeGeohash, cause: err }
              );

        setError(geoError);
        throw geoError;
      }
    },
    [activeGeohash, authorPubkey]
  );

  // Clear error state
  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  // Clear message history
  const clearMessages = useCallback((): void => {
    setMessages([]);
  }, []);

  // Return combined state and actions
  return {
    // State
    activeGeohash,
    isConnecting,
    isConnected,
    messages,
    error,
    activeRelays,
    // Actions
    connect,
    disconnect,
    sendMessage,
    clearError,
    clearMessages,
  };
}
