/**
 * Action Context Selector Component
 * Phase 3 Task 3.2: Select and confirm action type for Tapsigner authorization
 *
 * Features:
 * - Action type selector (payment, event, login/threshold)
 * - Action context display panel with relevant details
 * - Action preview with formatted data
 * - Confirmation step before proceeding to PIN entry
 * - Security warnings for high-value payments
 * - Loading states and error handling
 * - Responsive design with dark mode support
 * - Accessibility support (ARIA labels, keyboard navigation)
 *
 * Security Requirements:
 * - Display action details clearly to prevent phishing
 * - Show warning for high-value payments (>100k sats)
 * - Validate action context before proceeding
 * - Never auto-submit without user confirmation
 * - Follow zero-knowledge architecture principles
 */

import React, { useCallback, useMemo, useState } from "react";
import { getEnvVar } from "../config/env.client";

/**
 * Supported action types
 */
export type ActionType = "payment" | "event" | "login";

/**
 * Action context data structure
 */
interface ActionContextData {
  [key: string]: any;
}

/**
 * Props for ActionContextSelector component
 */
interface ActionContextSelectorProps {
  /** Available action types to select from */
  availableActions: ActionType[];

  /** Callback when action is selected and confirmed */
  onActionSelect: (actionType: ActionType, context: ActionContextData) => Promise<void>;

  /** Callback when user cancels */
  onCancel: () => void;

  /** Optional default selected action */
  defaultAction?: ActionType;

  /** Optional context data for the action */
  actionContext?: ActionContextData;

  /** Loading state during action processing */
  isLoading?: boolean;

  /** Error message to display */
  error?: string | null;
}

/**
 * Component state
 */
interface SelectorState {
  selectedAction: ActionType;
  isConfirming: boolean;
  error: string | null;
}

/**
 * Get action label for display
 */
const getActionLabel = (action: ActionType): string => {
  switch (action) {
    case "payment":
      return "Authorize Payment";
    case "event":
      return "Sign Nostr Event";
    case "login":
      return "Threshold Signing";
    default:
      return "Unknown Action";
  }
};

/**
 * Get action description
 */
const getActionDescription = (action: ActionType): string => {
  switch (action) {
    case "payment":
      return "Authorize a Lightning payment transaction";
    case "event":
      return "Sign a Nostr event with your card";
    case "login":
      return "Participate in threshold/federated signing";
    default:
      return "Perform an action with your card";
  }
};

/**
 * Get action icon
 */
const getActionIcon = (action: ActionType): React.ReactNode => {
  switch (action) {
    case "payment":
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case "event":
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case "login":
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      );
    default:
      return null;
  }
};

/**
 * Format context data for display
 */
const formatContextData = (action: ActionType, context?: ActionContextData): React.ReactNode => {
  if (!context) return null;

  switch (action) {
    case "payment":
      return (
        <div className="space-y-2 text-sm">
          {context.amount && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Amount:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {context.amount.toLocaleString()} sats
              </span>
            </div>
          )}
          {context.recipient && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Recipient:</span>
              <span className="font-mono text-gray-900 dark:text-white truncate">
                {context.recipient}
              </span>
            </div>
          )}
          {context.description && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Description:</span>
              <span className="text-gray-900 dark:text-white">{context.description}</span>
            </div>
          )}
        </div>
      );

    case "event":
      return (
        <div className="space-y-2 text-sm">
          {context.kind && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Event Kind:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{context.kind}</span>
            </div>
          )}
          {context.contentPreview && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">Content:</span>
              <p className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded text-gray-900 dark:text-white text-xs break-words max-h-24 overflow-y-auto">
                {context.contentPreview}
              </p>
            </div>
          )}
          {context.tags && Array.isArray(context.tags) && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">Tags:</span>
              <p className="mt-1 text-gray-900 dark:text-white text-xs">
                {context.tags.length} tag{context.tags.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>
      );

    case "login":
      return (
        <div className="space-y-2 text-sm">
          {context.sessionId && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Session ID:</span>
              <span className="font-mono text-gray-900 dark:text-white truncate">
                {context.sessionId.substring(0, 16)}...
              </span>
            </div>
          )}
          {context.participants && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Participants:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {context.participants}
              </span>
            </div>
          )}
          {context.threshold && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Threshold:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {context.threshold}
              </span>
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
};

/**
 * Check if payment is high-value (>100k sats)
 */
const isHighValuePayment = (context?: ActionContextData): boolean => {
  return context?.amount ? context.amount > 100000 : false;
};

/**
 * ActionContextSelector Component
 * Select and confirm action type for Tapsigner authorization
 *
 * @param props - Component props
 * @returns React component
 */
export const ActionContextSelector: React.FC<ActionContextSelectorProps> = ({
  availableActions,
  onActionSelect,
  onCancel,
  defaultAction,
  actionContext,
  isLoading = false,
  error: externalError = null,
}) => {
  // Feature flag check
  const TAPSIGNER_ENABLED =
    (getEnvVar("VITE_TAPSIGNER_ENABLED") || "true").toLowerCase() === "true";

  if (!TAPSIGNER_ENABLED) {
    return null;
  }

  // Component state
  const [state, setState] = useState<SelectorState>({
    selectedAction: defaultAction || availableActions[0] || "payment",
    isConfirming: false,
    error: externalError,
  });

  // Update error when external error changes
  React.useEffect(() => {
    setState((prev) => ({ ...prev, error: externalError }));
  }, [externalError]);

  // Check if high-value payment
  const isHighValue = useMemo(
    () => state.selectedAction === "payment" && isHighValuePayment(actionContext),
    [state.selectedAction, actionContext]
  );

  /**
   * Handle action selection
   */
  const handleActionSelect = useCallback((action: ActionType) => {
    setState((prev) => ({
      ...prev,
      selectedAction: action,
      error: null,
    }));
  }, []);

  /**
   * Handle action confirmation
   */
  const handleConfirm = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      isConfirming: true,
      error: null,
    }));

    try {
      await onActionSelect(state.selectedAction, actionContext || {});
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Action confirmation failed";
      setState((prev) => ({
        ...prev,
        error: errorMsg,
        isConfirming: false,
      }));
    }
  }, [state.selectedAction, actionContext, onActionSelect]);

  /**
   * Handle cancel
   */
  const handleCancel = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
    onCancel();
  }, [onCancel]);

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Select Action
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Choose the action you want to authorize with your Tapsigner card
        </p>
      </div>

      {/* Action Type Selector */}
      <div className="mb-6 space-y-3">
        {availableActions.map((action) => (
          <label
            key={action}
            className="flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors"
            style={{
              borderColor:
                state.selectedAction === action
                  ? "rgb(59, 130, 246)"
                  : "rgb(229, 231, 235)",
              backgroundColor:
                state.selectedAction === action
                  ? "rgb(239, 246, 255)"
                  : "transparent",
            }}
          >
            <input
              type="radio"
              name="action"
              value={action}
              checked={state.selectedAction === action}
              onChange={() => handleActionSelect(action)}
              className="mt-1 w-4 h-4 text-blue-600 cursor-pointer"
              aria-label={getActionLabel(action)}
            />
            <div className="ml-4 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-blue-600 dark:text-blue-400">{getActionIcon(action)}</div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {getActionLabel(action)}
                </p>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {getActionDescription(action)}
              </p>
            </div>
          </label>
        ))}
      </div>

      {/* Action Context Display */}
      {actionContext && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            Action Details
          </h3>
          {formatContextData(state.selectedAction, actionContext)}
        </div>
      )}

      {/* High-Value Payment Warning */}
      {isHighValue && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <p className="font-semibold mb-1">High-Value Payment</p>
              <p>This payment exceeds 100,000 sats. Please verify the amount carefully.</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {state.error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{state.error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isLoading || state.isConfirming}
          className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isLoading || state.isConfirming}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {state.isConfirming || isLoading ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Confirming...
            </>
          ) : (
            "Confirm & Continue"
          )}
        </button>
      </div>
    </div>
  );
};

export default ActionContextSelector;

