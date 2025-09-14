/**
 * Standardized error messages and toast helpers for Communications UI
 */

import { showToast } from "../../services/toastService";

export type EndpointType = "groups" | "contacts" | "messaging";

export const TIMEOUT_MESSAGES: Record<EndpointType, string> = {
  groups: "Groups request timed out. Please try again.",
  contacts: "Contacts request timed out. Please try again.",
  messaging: "Messaging request timed out. Please try again.",
};

export const ERROR_SEVERITY = {
  info: "info",
  warning: "warning",
  error: "error",
} as const;

export type ErrorSeverity = keyof typeof ERROR_SEVERITY;

export function formatErrorMessage(
  message: string,
  endpoint?: EndpointType
): string {
  return endpoint ? `[${endpoint}] ${message}` : message;
}

export function showTimeoutError(
  endpoint: EndpointType,
  customMessage?: string
) {
  const msg =
    customMessage ||
    TIMEOUT_MESSAGES[endpoint] ||
    "Request timed out. Please try again.";
  showToast.error(formatErrorMessage(msg, endpoint), {
    title: "Communications Error",
  });
}
