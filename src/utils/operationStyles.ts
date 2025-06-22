/**
 * Utility functions for consistent operation-based styling across the application
 *
 * Color Scheme:
 * - Purple: Identity operations (Nostr, authentication, key management)
 * - Orange: Payment operations (Lightning, financial transactions)
 * - General: Other operations
 */

export type OperationType = "identity" | "payment" | "general";

export interface OperationStyleConfig {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  border: string;
  text: string;
  textSecondary: string;
  hover: string;
  focus: string;
}

/**
 * Get color configuration for a specific operation type
 */
export const getOperationColors = (
  type: OperationType
): OperationStyleConfig => {
  switch (type) {
    case "identity":
      return {
        primary: "bg-purple-800",
        secondary: "bg-purple-700",
        accent: "bg-purple-600",
        background: "bg-purple-900",
        border: "border-purple-400/20",
        text: "text-purple-200",
        textSecondary: "text-purple-300",
        hover: "hover:bg-purple-700",
        focus: "focus:border-purple-400",
      };
    case "payment":
      return {
        primary: "bg-orange-800",
        secondary: "bg-orange-700",
        accent: "bg-orange-600",
        background: "bg-orange-900",
        border: "border-orange-400/20",
        text: "text-orange-200",
        textSecondary: "text-orange-300",
        hover: "hover:bg-orange-700",
        focus: "focus:border-orange-400",
      };
    case "general":
      return {
        primary: "bg-gray-800",
        secondary: "bg-gray-700",
        accent: "bg-gray-600",
        background: "bg-gray-900",
        border: "border-gray-400/20",
        text: "text-gray-200",
        textSecondary: "text-gray-300",
        hover: "hover:bg-gray-700",
        focus: "focus:border-gray-400",
      };
  }
};

/**
 * Get button classes for a specific operation type
 */
export const getOperationButtonClasses = (
  type: OperationType,
  variant: "primary" | "secondary" | "outline" = "primary"
): string => {
  const colors = getOperationColors(type);

  const baseClasses =
    "font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2";

  switch (variant) {
    case "primary":
      return `${baseClasses} ${colors.primary} ${colors.hover} text-white`;
    case "secondary":
      return `${baseClasses} ${colors.secondary} ${colors.hover} text-white`;
    case "outline":
      return `${baseClasses} bg-transparent border-2 ${colors.border} ${colors.text} hover:bg-white/10`;
    default:
      return `${baseClasses} ${colors.primary} ${colors.hover} text-white`;
  }
};

/**
 * Get input classes for a specific operation type
 */
export const getOperationInputClasses = (type: OperationType): string => {
  const colors = getOperationColors(type);
  return `w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none ${colors.focus} transition-all duration-300`;
};

/**
 * Get modal/card classes for a specific operation type
 */
export const getOperationModalClasses = (type: OperationType): string => {
  const colors = getOperationColors(type);
  return `${colors.background} rounded-2xl p-8 ${colors.border} relative max-h-[90vh] overflow-y-auto`;
};

/**
 * Get gradient classes for operation type backgrounds
 */
export const getOperationGradient = (type: OperationType): string => {
  switch (type) {
    case "identity":
      return "bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600";
    case "payment":
      return "bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600";
    case "general":
      return "bg-gradient-to-br from-gray-400 via-gray-500 to-gray-600";
  }
};

/**
 * Get icon gradient classes for operation types
 */
export const getOperationIconGradient = (type: OperationType): string => {
  switch (type) {
    case "identity":
      return "bg-gradient-to-br from-purple-600 to-purple-800";
    case "payment":
      return "bg-gradient-to-br from-orange-600 to-orange-800";
    case "general":
      return "bg-gradient-to-br from-gray-600 to-gray-800";
  }
};
