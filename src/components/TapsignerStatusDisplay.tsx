/**
 * Tapsigner Status Display Component
 * Phase 3 Task 3.4: Display current Tapsigner card registration status and capabilities
 *
 * Features:
 * - Status badge with color coding (green=active, yellow=warning, red=error, gray=not registered)
 * - Card information panel (ID, registration date, last activity)
 * - Capabilities list (Nostr signing, multi-purpose auth, PIN 2FA)
 * - Security status (PIN attempts, lockout timer)
 * - Action buttons (test connection, view details, unregister)
 * - Empty state with register CTA
 * - Loading state with skeleton loaders
 * - Error handling with retry functionality
 * - Confirmation dialog for destructive actions
 *
 * Security Requirements:
 * - Never display full card UID (only hashed)
 * - Never log sensitive card information
 * - Maintain zero-knowledge architecture
 * - Require authentication to view status
 * - Implement rate limiting for status checks
 */

import {
  AlertCircle,
  CheckCircle,
  Copy,
  Lock,
  RefreshCw,
  Smartphone,
  Trash2,
  Zap,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { getEnvVar } from "../config/env.client";
import { apiClient } from "../utils/api-client";

/**
 * Card status data structure
 */
interface CardStatus {
  cardId: string;
  isRegistered: boolean;
  familyRole: "private" | "offspring" | "adult" | "steward" | "guardian";
  pinAttempts: number;
  isLocked: boolean;
  createdAt: string;
  lastUsed: string | null;
  walletLink?: {
    walletId: string;
    spendLimitSats: number;
    tapToSpendEnabled: boolean;
  };
}

/**
 * Props for TapsignerStatusDisplay component
 */
interface TapsignerStatusDisplayProps {
  /** Card ID to display status for */
  cardId?: string | null;

  /** Callback when user wants to register a card */
  onRegisterCard?: () => void;

  /** Callback when user wants to unregister a card */
  onUnregisterCard?: () => void;

  /** Callback to test card connection */
  onTestConnection?: () => Promise<void>;

  /** Show action buttons */
  showActions?: boolean;

  /** Compact view for dashboard widgets */
  compact?: boolean;
}

/**
 * TapsignerStatusDisplay Component
 * Displays current Tapsigner card status with management actions
 */
export const TapsignerStatusDisplay: React.FC<TapsignerStatusDisplayProps> = ({
  cardId,
  onRegisterCard,
  onUnregisterCard,
  onTestConnection,
  showActions = true,
  compact = false,
}) => {
  // Feature flag check
  const TAPSIGNER_ENABLED =
    getEnvVar("VITE_TAPSIGNER_ENABLED") === "true";

  if (!TAPSIGNER_ENABLED) {
    return null;
  }

  // State management
  const [cardStatus, setCardStatus] = useState<CardStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUnregisterConfirm, setShowUnregisterConfirm] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [copiedCardId, setCopiedCardId] = useState(false);

  /**
   * Fetch card status from backend
   */
  const fetchCardStatus = useCallback(async () => {
    if (!cardId) {
      setCardStatus(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.get(
        `/api/tapsigner-unified?action=status&cardId=${encodeURIComponent(cardId)}`
      );

      if (response.success && response.data) {
        setCardStatus(response.data as CardStatus);
      } else {
        setError(response.error || "Failed to fetch card status");
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to fetch card status";
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [cardId]);

  /**
   * Load card status on mount and when cardId changes
   */
  useEffect(() => {
    fetchCardStatus();
  }, [fetchCardStatus]);

  /**
   * Copy card ID to clipboard
   */
  const handleCopyCardId = useCallback(async () => {
    if (!cardStatus?.cardId) return;

    try {
      await navigator.clipboard.writeText(cardStatus.cardId);
      setCopiedCardId(true);
      setTimeout(() => setCopiedCardId(false), 2000);
    } catch (err) {
      console.error("Failed to copy card ID:", err);
    }
  }, [cardStatus?.cardId]);

  /**
   * Test card connection
   */
  const handleTestConnection = useCallback(async () => {
    if (!onTestConnection) return;

    try {
      setIsTestingConnection(true);
      setError(null);
      await onTestConnection();
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Connection test failed";
      setError(errorMsg);
    } finally {
      setIsTestingConnection(false);
    }
  }, [onTestConnection]);

  /**
   * Handle unregister card
   */
  const handleUnregister = useCallback(async () => {
    if (onUnregisterCard) {
      onUnregisterCard();
      setShowUnregisterConfirm(false);
    }
  }, [onUnregisterCard]);

  /**
   * Get status badge color based on card state
   */
  const getStatusColor = (): string => {
    if (isLoading) return "bg-gray-500/20 border-gray-500/50";
    if (!cardStatus?.isRegistered) return "bg-gray-500/20 border-gray-500/50";
    if (cardStatus.isLocked) return "bg-orange-500/20 border-orange-500/50";
    if (cardStatus.pinAttempts <= 1) return "bg-amber-500/20 border-amber-500/50";
    return "bg-green-500/20 border-green-500/50";
  };

  /**
   * Get status text
   */
  const getStatusText = (): string => {
    if (isLoading) return "Loading...";
    if (!cardStatus?.isRegistered) return "Not Registered";
    if (cardStatus.isLocked) return "Locked";
    if (cardStatus.pinAttempts <= 1) return "Warning";
    return "Active";
  };

  /**
   * Get status icon
   */
  const getStatusIcon = () => {
    if (isLoading) return <RefreshCw className="h-5 w-5 animate-spin" />;
    if (!cardStatus?.isRegistered)
      return <AlertCircle className="h-5 w-5 text-gray-400" />;
    if (cardStatus.isLocked)
      return <Lock className="h-5 w-5 text-orange-400" />;
    if (cardStatus.pinAttempts <= 1)
      return <AlertCircle className="h-5 w-5 text-amber-400" />;
    return <CheckCircle className="h-5 w-5 text-green-400" />;
  };

  /**
   * Format date for display
   */
  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Unknown";
    }
  };

  // Empty state - no card registered
  if (!isLoading && !cardStatus?.isRegistered) {
    return (
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-6 text-center">
        <Smartphone className="h-12 w-12 text-purple-400 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-white mb-2">
          No Tapsigner Card Registered
        </h3>
        <p className="text-purple-200/80 mb-6">
          Register your Tapsigner NFC card to enable secure tap-to-sign operations
        </p>
        {showActions && onRegisterCard && (
          <button
            onClick={onRegisterCard}
            className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-6 rounded-lg transition-all duration-300"
          >
            Register Tapsigner Card
          </button>
        )}
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-12 bg-gray-700/50 rounded-lg animate-pulse" />
        <div className="h-24 bg-gray-700/50 rounded-lg animate-pulse" />
        <div className="h-20 bg-gray-700/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  // Error state
  if (error && !cardStatus) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <AlertCircle className="h-6 w-6 text-red-400 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="font-bold text-red-200 mb-2">Error Loading Status</h3>
            <p className="text-red-200/80 text-sm mb-4">{error}</p>
            <button
              onClick={fetchCardStatus}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!cardStatus) {
    return null;
  }

  return (
    <div className={`space-y-4 ${compact ? "max-w-sm" : ""}`}>
      {/* Status Badge */}
      <div
        className={`${getStatusColor()} border rounded-2xl p-4 flex items-center gap-3`}
      >
        {getStatusIcon()}
        <div>
          <p className="text-sm font-medium text-gray-300">Status</p>
          <p className="text-lg font-bold text-white">{getStatusText()}</p>
        </div>
      </div>

      {/* Card Information Panel */}
      <div className="bg-black/20 border border-white/10 rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-bold text-white mb-4">Card Information</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Card ID</span>
            <div className="flex items-center gap-2">
              <code className="text-sm text-purple-300 font-mono">
                {cardStatus.cardId.substring(0, 16)}...
              </code>
              <button
                onClick={handleCopyCardId}
                className="p-1 hover:bg-white/10 rounded transition-colors"
                title="Copy card ID"
              >
                <Copy
                  className={`h-4 w-4 ${copiedCardId ? "text-green-400" : "text-gray-400"
                    }`}
                />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-400">Registered</span>
            <span className="text-white font-medium">
              {formatDate(cardStatus.createdAt)}
            </span>
          </div>

          {cardStatus.lastUsed && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Last Activity</span>
              <span className="text-white font-medium">
                {formatDate(cardStatus.lastUsed)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-gray-400">Family Role</span>
            <span className="text-white font-medium capitalize">
              {cardStatus.familyRole}
            </span>
          </div>
        </div>
      </div>

      {/* Capabilities List */}
      <div className="bg-black/20 border border-white/10 rounded-2xl p-6 space-y-3">
        <h3 className="text-lg font-bold text-white mb-4">Capabilities</h3>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-400" />
            <span className="text-white">Nostr Remote Signer</span>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-400" />
            <span className="text-white">Multi-Purpose Authentication</span>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-400" />
            <span className="text-white">PIN 2FA Protection</span>
          </div>

          {cardStatus.walletLink && (
            <>
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <span className="text-white">Lightning Wallet Link</span>
              </div>
              {cardStatus.walletLink.tapToSpendEnabled && (
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <span className="text-white">Tap-to-Spend Enabled</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Security Status */}
      <div className="bg-black/20 border border-white/10 rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-bold text-white mb-4">Security Status</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">PIN Attempts</span>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 w-2 rounded-full ${i < cardStatus.pinAttempts
                        ? "bg-green-400"
                        : "bg-gray-600"
                      }`}
                  />
                ))}
              </div>
              <span className="text-white font-medium">
                {cardStatus.pinAttempts}/3
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-400">Lockout Status</span>
            <span
              className={`font-medium ${cardStatus.isLocked ? "text-orange-400" : "text-green-400"
                }`}
            >
              {cardStatus.isLocked ? "Locked" : "Active"}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {showActions && (
        <div className="flex gap-3 flex-wrap">
          {onTestConnection && (
            <button
              onClick={handleTestConnection}
              disabled={isTestingConnection}
              className="flex-1 min-w-[150px] bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
            >
              {isTestingConnection ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Test Connection
            </button>
          )}

          {onUnregisterCard && (
            <button
              onClick={() => setShowUnregisterConfirm(true)}
              className="flex-1 min-w-[150px] bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Unregister
            </button>
          )}
        </div>
      )}

      {/* Unregister Confirmation Dialog */}
      {showUnregisterConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-xl font-bold text-white mb-4">
              Unregister Tapsigner Card?
            </h3>
            <p className="text-gray-300 mb-6">
              This action will remove your Tapsigner card from this account. You can
              register it again later.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowUnregisterConfirm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={handleUnregister}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300"
              >
                Unregister
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TapsignerStatusDisplay;

