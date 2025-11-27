/**
 * GeoRoomTab - Geo Discovery & Live Messaging UI
 *
 * Standalone component for geo-room discovery within GiftwrappedMessaging.
 * Phase 1: Read-only preview mode with consent flow.
 * Phase 2: Live messaging in public geo-rooms.
 * Phase 3: Contact creation and private chat initiation from geo-room messages.
 *
 * @module src/components/communications/GeoRoomTab
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import type { Event as NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { useGeoDiscovery } from "../../hooks/useGeoDiscovery";
import { useGeoRoom } from "../../hooks/useGeoRoom";
import { usePrivacyFirstMessaging } from "../../hooks/usePrivacyFirstMessaging";
import { mapGeoRoomErrorToMessage } from "../../lib/geochat/geo-room-service";
import type { GeoRoomPreview, GeoRoomError } from "../../lib/geochat/types";
import {
  clientConfig,
  GEOCHAT_CONTACTS_ENABLED,
  GEOCHAT_PAYMENTS_ENABLED,
} from "../../config/env.client";
import {
  buildGeoPaymentContext,
  getPaymentWarning,
} from "../../lib/geochat/geo-payment-service";
import type { GeoPaymentContext } from "../../lib/geochat/geo-payment-types";

interface GeoRoomTabProps {
  /** Whether geochat feature is enabled */
  isEnabled?: boolean;
  /** Author public key (hex) for sending messages */
  authorPubkey?: string;
}

/**
 * GeoRoomTab component for geo-room discovery and live messaging.
 */
export function GeoRoomTab({
  isEnabled = true,
  authorPubkey,
}: GeoRoomTabProps): React.ReactElement {
  // Phase 1: Discovery state
  const {
    state,
    setSelection,
    reset,
    recordConsent,
    preview,
    requestBrowserLocation,
  } = useGeoDiscovery(isEnabled);

  // Phase 2: Live messaging state
  const {
    activeGeohash,
    isConnecting,
    isConnected,
    messages,
    error: roomError,
    connect,
    disconnect,
    sendMessage,
    clearError,
  } = useGeoRoom(authorPubkey);

  // Phase 3: Privacy-first messaging for contact creation
  const { startPrivateChat } = usePrivacyFirstMessaging();

  // Local UI state
  const [geohashInput, setGeohashInput] = useState("");
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Auto-scroll ref for message list
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if live messaging is enabled
  const isLiveEnabled = clientConfig.flags.geochatLiveEnabled;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Handle geohash input submission
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (geohashInput.trim()) {
        setSelection(geohashInput.trim());
      }
    },
    [geohashInput, setSelection]
  );

  // Handle consent acceptance
  const handleAcceptConsent = useCallback(() => {
    recordConsent();
    setShowConsentModal(false);
  }, [recordConsent]);

  // Handle connect/disconnect toggle
  const handleConnectToggle = useCallback(async () => {
    if (isConnected) {
      disconnect();
    } else if (preview?.geohash) {
      try {
        await connect(preview.geohash);
      } catch (err) {
        // Error is already set by the hook
        console.error(
          "[GeoRoomTab] Connect failed:",
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }, [isConnected, preview?.geohash, connect, disconnect]);

  // Handle send message
  const handleSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!messageInput.trim() || isSending) return;

      setIsSending(true);
      try {
        await sendMessage(messageInput.trim());
        setMessageInput("");
      } catch (err) {
        // Error is already set by the hook
        console.error(
          "[GeoRoomTab] Send failed:",
          err instanceof Error ? err.message : String(err)
        );
      } finally {
        setIsSending(false);
      }
    },
    [messageInput, isSending, sendMessage]
  );

  // Phase 3: Handle adding a contact from geo-room message
  const handleAddContact = useCallback(
    async (pubkeyHex: string) => {
      if (!GEOCHAT_CONTACTS_ENABLED) {
        setActionError("Contact creation is not enabled");
        return;
      }

      setActionLoading(pubkeyHex);
      setActionError(null);
      setActionSuccess(null);

      try {
        // Convert hex pubkey to npub
        const npub = nip19.npubEncode(pubkeyHex);

        const result = await startPrivateChat({
          npub,
          originGeohash: activeGeohash || undefined,
          revealIdentity: false, // Start in pseudonymous mode
        });

        if (result.success) {
          setActionSuccess(`Contact added! ${result.identityRevealed ? "Identity shared." : "Pseudonymous mode."}`);
          // Clear success message after 3 seconds
          setTimeout(() => setActionSuccess(null), 3000);
        } else {
          setActionError("Failed to add contact");
        }
      } catch (err) {
        console.error("[GeoRoomTab] Add contact failed:", err);
        setActionError(err instanceof Error ? err.message : "Failed to add contact");
      } finally {
        setActionLoading(null);
      }
    },
    [activeGeohash, startPrivateChat]
  );

  // Phase 3: Handle starting a private chat from geo-room message
  const handleStartPrivateChat = useCallback(
    async (pubkeyHex: string, revealIdentity: boolean) => {
      if (!GEOCHAT_CONTACTS_ENABLED) {
        setActionError("Private messaging is not enabled");
        return;
      }

      setActionLoading(pubkeyHex);
      setActionError(null);
      setActionSuccess(null);

      try {
        // Convert hex pubkey to npub
        const npub = nip19.npubEncode(pubkeyHex);

        const result = await startPrivateChat({
          npub,
          originGeohash: activeGeohash || undefined,
          revealIdentity,
        });

        if (result.success) {
          setActionSuccess(
            `Private chat started! ${result.identityRevealed ? "Identity shared." : "Pseudonymous mode."}`
          );
          // Clear success message after 3 seconds
          setTimeout(() => setActionSuccess(null), 3000);
        } else {
          setActionError("Failed to start private chat");
        }
      } catch (err) {
        console.error("[GeoRoomTab] Start private chat failed:", err);
        setActionError(err instanceof Error ? err.message : "Failed to start private chat");
      } finally {
        setActionLoading(null);
      }
    },
    [activeGeohash, startPrivateChat]
  );

  // Phase 4: State for payment modal
  const [paymentContext, setPaymentContext] = useState<GeoPaymentContext | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Phase 4: Handle opening payment dialog from geo-room message
  const handleOpenPayment = useCallback(
    async (event: NostrEvent) => {
      if (!GEOCHAT_PAYMENTS_ENABLED) {
        setActionError("Payments are not enabled");
        return;
      }

      if (!authorPubkey) {
        setActionError("Authentication required for payments");
        return;
      }

      setActionLoading(event.pubkey);
      setActionError(null);

      try {
        // Convert current user's hex pubkey to npub
        const userNpub = nip19.npubEncode(authorPubkey);

        // Build payment context from message
        const context = await buildGeoPaymentContext(
          event,
          activeGeohash || "",
          userNpub,
          "unknown" // Default trust level - can be enhanced with contact lookup
        );

        // Check if there's a warning (but not blocking) for info
        const warning = getPaymentWarning(context.trustLevel, 0);
        if (warning) {
          console.log("[GeoRoomTab] Payment warning for context:", warning.message);
        }

        setPaymentContext(context);
        setShowPaymentModal(true);
      } catch (err) {
        console.error("[GeoRoomTab] Payment context failed:", err);
        setActionError(err instanceof Error ? err.message : "Failed to prepare payment");
      } finally {
        setActionLoading(null);
      }
    },
    [activeGeohash, authorPubkey]
  );

  // Phase 4: Close payment modal
  const handleClosePaymentModal = useCallback(() => {
    setShowPaymentModal(false);
    setPaymentContext(null);
  }, []);

  // Render consent modal
  if (showConsentModal || !state.hasConsented) {
    return (
      <div className="text-xs text-purple-900 space-y-3 p-2 bg-purple-50 rounded">
        <div className="font-medium text-sm">⚠️ Geo-Room Discovery (Beta)</div>
        <div className="space-y-2 text-[11px] text-purple-800">
          <p>
            <strong>What this does:</strong> Geo-rooms let you discover and
            {isLiveEnabled ? " participate in " : " preview "}
            public conversations based on geographic location.
          </p>
          <p>
            <strong>Privacy Warning:</strong> Your approximate location may be visible
            to other users in the same geo-room. This feature is for public discovery
            only—do not share sensitive information.
          </p>
          {!isLiveEnabled && (
            <p>
              <strong>Preview Mode:</strong> Live messaging is not enabled. You can
              only view geo-room previews.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAcceptConsent}
            className="px-3 py-1.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
          >
            I Understand, Continue
          </button>
          <button
            onClick={() => setShowConsentModal(false)}
            className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-xs text-purple-900 space-y-3">
      <div className="font-medium">Geo-Rooms (Bitchat)</div>

      {/* Privacy Warning (always visible) */}
      <div
        className="text-[10px] text-yellow-800 bg-yellow-50 px-2 py-1 rounded border border-yellow-200"
        role="status"
      >
        ⚠️ Public geo-rooms with minimal privacy. Use for discovery only.
      </div>

      {/* Geohash Input Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={geohashInput}
          onChange={(e) => setGeohashInput(e.target.value.toLowerCase())}
          placeholder="Enter geohash (e.g. 9q8yy)"
          className="border border-purple-300 rounded px-2 py-1 text-xs flex-1 min-w-0"
          maxLength={12}
          aria-label="Geohash input"
          disabled={isConnected}
        />
        <button
          type="submit"
          disabled={!geohashInput.trim() || isConnected}
          className="text-xs bg-purple-600 text-white rounded px-2 py-1 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={requestBrowserLocation}
          disabled={state.isLocating || isConnected}
          className="text-xs bg-gray-200 text-gray-700 rounded px-2 py-1 hover:bg-gray-300 disabled:opacity-50"
          title="Use browser location"
          aria-label="Use browser location"
        >
          {state.isLocating ? "..." : "📍"}
        </button>
      </form>

      {/* Phase 1 Error Display */}
      {state.error && (
        <div className="text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded">
          {state.error}
        </div>
      )}

      {/* Phase 2 Error Banner */}
      {roomError && (
        <div
          className="text-[11px] text-red-700 bg-red-50 px-2 py-1.5 rounded border border-red-200 flex items-center justify-between"
          role="alert"
        >
          <span>{mapGeoRoomErrorToMessage(roomError)}</span>
          <button
            onClick={clearError}
            className="text-red-600 hover:text-red-800 ml-2"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Preview Display */}
      {preview && (
        <GeoRoomPreviewCard
          preview={preview}
          onReset={reset}
          isLiveEnabled={isLiveEnabled}
          isConnected={isConnected}
          isConnecting={isConnecting}
          onConnectToggle={handleConnectToggle}
        />
      )}

      {/* Phase 2: Connection Status */}
      {isLiveEnabled && isConnected && activeGeohash && (
        <div className="text-[11px] text-green-700 bg-green-50 px-2 py-1 rounded flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Connected to #{activeGeohash}
        </div>
      )}

      {/* Phase 3: Action Status Messages */}
      {actionError && (
        <div className="text-[11px] text-red-700 bg-red-50 px-2 py-1 rounded flex items-center justify-between">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-red-500 hover:text-red-700 ml-2"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
      {actionSuccess && (
        <div className="text-[11px] text-green-700 bg-green-50 px-2 py-1 rounded">
          {actionSuccess}
        </div>
      )}

      {/* Phase 2: Message List */}
      {isLiveEnabled && isConnected && (
        <div
          className="bg-white border border-purple-200 rounded p-2 max-h-48 overflow-y-auto"
          role="log"
          aria-label="Geo-room messages"
        >
          {messages.length === 0 ? (
            <div className="text-[11px] text-gray-500 italic">
              No messages yet. Be the first to say hello!
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((msg, idx) => (
                <GeoRoomMessageItem
                  key={msg.id || idx}
                  event={msg}
                  currentUserPubkey={authorPubkey}
                  contactsEnabled={GEOCHAT_CONTACTS_ENABLED}
                  paymentsEnabled={GEOCHAT_PAYMENTS_ENABLED}
                  isLoading={actionLoading === msg.pubkey}
                  onAddContact={handleAddContact}
                  onStartPrivateChat={handleStartPrivateChat}
                  onOpenPayment={handleOpenPayment}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Phase 2: Message Input */}
      {isLiveEnabled && isConnected && authorPubkey && (
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Type a message..."
            className="border border-purple-300 rounded px-2 py-1 text-xs flex-1 min-w-0"
            disabled={isSending}
            aria-label="Message input"
          />
          <button
            type="submit"
            disabled={!messageInput.trim() || isSending}
            className="text-xs bg-purple-600 text-white rounded px-2 py-1 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? "..." : "Send"}
          </button>
        </form>
      )}

      {/* Phase 2: No Author Key Warning */}
      {isLiveEnabled && isConnected && !authorPubkey && (
        <div className="text-[10px] text-gray-500 italic">
          Sign in to send messages.
        </div>
      )}

      {/* Privacy Notice (when no preview) */}
      {!preview && !isConnected && (
        <div className="text-[11px] text-purple-700">
          Enter a geohash to preview a geo-room.
          {!isLiveEnabled && " (Preview mode only)"}
        </div>
      )}

      {/* Phase 4: Payment Modal Placeholder */}
      {showPaymentModal && paymentContext && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-3">Send Payment</h3>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-gray-500">To:</span>{" "}
                {paymentContext.recipientDisplayName ||
                  `${paymentContext.recipientNpub.slice(0, 12)}...`}
              </p>
              <p>
                <span className="text-gray-500">Trust Level:</span>{" "}
                <span
                  className={
                    paymentContext.trustLevel === "verified"
                      ? "text-green-600"
                      : paymentContext.trustLevel === "known"
                        ? "text-blue-600"
                        : "text-orange-600"
                  }
                >
                  {paymentContext.trustLevel}
                </span>
              </p>
              <p>
                <span className="text-gray-500">Account:</span>{" "}
                {paymentContext.accountContext.type === "federation"
                  ? paymentContext.accountContext.federationName || "Federation"
                  : "Individual"}
              </p>
              {paymentContext.trustLevel === "unknown" && (
                <p className="text-orange-600 text-xs bg-orange-50 p-2 rounded">
                  ⚠️ This contact has not been verified. Consider adding them as a contact first.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={handleClosePaymentModal}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // TODO: Open actual payment modal based on account type
                  handleClosePaymentModal();
                  setActionSuccess("Payment modal would open here");
                  setTimeout(() => setActionSuccess(null), 3000);
                }}
                className="px-3 py-1 text-sm bg-amber-500 text-white rounded hover:bg-amber-600"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Props for GeoRoomPreviewCard.
 */
interface GeoRoomPreviewCardProps {
  preview: GeoRoomPreview;
  onReset: () => void;
  isLiveEnabled: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  onConnectToggle: () => void;
}

/**
 * Preview card component for geo-room details.
 */
function GeoRoomPreviewCard({
  preview,
  onReset,
  isLiveEnabled,
  isConnected,
  isConnecting,
  onConnectToggle,
}: GeoRoomPreviewCardProps): React.ReactElement {
  return (
    <div className="bg-white border border-purple-200 rounded p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">#{preview.geohash}</span>
        <button
          onClick={onReset}
          disabled={isConnected}
          className="text-[10px] text-purple-600 hover:text-purple-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>

      {/* Precision and Radius */}
      <div className="text-[11px] text-gray-600 space-y-1">
        <div>
          <span className="font-medium">Precision:</span>{" "}
          <span className="capitalize">{preview.precision}</span>
        </div>
        <div>
          <span className="font-medium">Coverage:</span> {preview.radiusDescription}
        </div>
      </div>

      {/* Relay Preview */}
      {preview.relays.length > 0 && (
        <div className="text-[11px]">
          <div className="font-medium text-gray-700 mb-1">
            Relays ({preview.relays.length}):
          </div>
          <ul className="space-y-0.5 text-gray-600 max-h-24 overflow-y-auto">
            {preview.relays.map((relay) => (
              <li key={relay.url} className="flex items-center gap-1">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${relay.trustLevel === "self-hosted"
                    ? "bg-green-500"
                    : "bg-blue-400"
                    }`}
                  title={relay.trustLevel}
                />
                <span className="truncate">{relay.url.replace("wss://", "")}</span>
                {relay.countryCode && (
                  <span className="text-[9px] text-gray-400">
                    [{relay.countryCode}]
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Phase 2: Connect Button */}
      {isLiveEnabled && (
        <button
          onClick={onConnectToggle}
          disabled={isConnecting}
          className={`w-full text-xs py-1.5 rounded ${isConnected
            ? "bg-red-100 text-red-700 hover:bg-red-200"
            : "bg-green-600 text-white hover:bg-green-700"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label={isConnected ? "Disconnect from room" : "Connect to room"}
        >
          {isConnecting ? "Connecting..." : isConnected ? "Disconnect" : "Connect to Room"}
        </button>
      )}

      {/* Phase 1 Notice (only when live is disabled) */}
      {!isLiveEnabled && (
        <div className="text-[10px] text-orange-600 bg-orange-50 px-2 py-1 rounded">
          Preview mode only. Live messaging is not enabled.
        </div>
      )}
    </div>
  );
}

/**
 * Props for GeoRoomMessageItem with Phase 3/4 actions.
 */
interface GeoRoomMessageItemProps {
  /** The Nostr event to display */
  event: NostrEvent;
  /** Current user's pubkey (hex) to hide actions on own messages */
  currentUserPubkey?: string;
  /** Whether geo-room contacts feature is enabled */
  contactsEnabled: boolean;
  /** Whether geo-room payments feature is enabled */
  paymentsEnabled: boolean;
  /** Whether an action is loading for this message */
  isLoading: boolean;
  /** Callback to add sender as contact */
  onAddContact: (pubkeyHex: string) => void;
  /** Callback to start private chat with sender */
  onStartPrivateChat: (pubkeyHex: string, revealIdentity: boolean) => void;
  /** Phase 4: Callback to open payment modal */
  onOpenPayment: (event: NostrEvent) => void;
}

/**
 * Message item component for geo-room messages.
 * Phase 3: Includes action buttons for contact creation and private chat.
 * Phase 4: Includes payment button for sending sats.
 */
function GeoRoomMessageItem({
  event,
  currentUserPubkey,
  contactsEnabled,
  paymentsEnabled,
  isLoading,
  onAddContact,
  onStartPrivateChat,
  onOpenPayment,
}: GeoRoomMessageItemProps): React.ReactElement {
  const [showActions, setShowActions] = useState(false);

  // Truncate pubkey for display
  const truncatedPubkey = event.pubkey
    ? `${event.pubkey.slice(0, 8)}...${event.pubkey.slice(-4)}`
    : "unknown";

  // Format timestamp
  const timestamp = new Date(event.created_at * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Don't show actions for own messages
  const isOwnMessage = currentUserPubkey && event.pubkey === currentUserPubkey;

  // Show action bar if contacts OR payments enabled and not own message
  const showActionBar = (contactsEnabled || paymentsEnabled) && !isOwnMessage && event.pubkey && showActions;

  return (
    <div
      className="text-[11px] border-b border-gray-100 pb-1 last:border-0 group relative"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-center justify-between text-gray-500 mb-0.5">
        <span className="font-mono">{truncatedPubkey}</span>
        <span>{timestamp}</span>
      </div>
      <div className="text-gray-800 break-words">{event.content}</div>

      {/* Phase 3/4: Action buttons (shown on hover for non-own messages) */}
      {showActionBar && (
        <div className="absolute right-0 top-0 flex items-center gap-1 bg-white/90 px-1 py-0.5 rounded shadow-sm border border-purple-100">
          {isLoading ? (
            <span className="text-[10px] text-purple-600">Loading...</span>
          ) : (
            <>
              {contactsEnabled && (
                <>
                  <button
                    onClick={() => onAddContact(event.pubkey)}
                    className="text-[10px] text-purple-600 hover:text-purple-800 px-1"
                    title="Add to contacts"
                    aria-label="Add sender to contacts"
                  >
                    + Contact
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => onStartPrivateChat(event.pubkey, false)}
                    className="text-[10px] text-purple-600 hover:text-purple-800 px-1"
                    title="Start private chat (pseudonymous)"
                    aria-label="Start private chat"
                  >
                    💬 DM
                  </button>
                </>
              )}
              {paymentsEnabled && (
                <>
                  {contactsEnabled && <span className="text-gray-300">|</span>}
                  <button
                    onClick={() => onOpenPayment(event)}
                    className="text-[10px] text-amber-600 hover:text-amber-800 px-1"
                    title="Send payment"
                    aria-label="Send payment to sender"
                  >
                    ⚡ Pay
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default GeoRoomTab;
