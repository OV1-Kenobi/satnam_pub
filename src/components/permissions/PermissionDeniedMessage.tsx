/**
 * Permission Denied Message
 *
 * User-friendly error message component for permission denials.
 * Shows contextual information about why access was denied
 * and what actions can be taken.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Clear communication of permission status
 * - Role-appropriate messaging
 * - Actionable guidance
 */

import {
  AlertTriangle,
  Clock,
  HelpCircle,
  Shield,
  UserX,
  X,
} from "lucide-react";
import React from "react";
import type { FederationRole } from "../../types/permissions";

export type DenialReason =
  | "role_not_allowed"
  | "requires_approval"
  | "daily_limit_exceeded"
  | "time_window_inactive"
  | "member_override_revoked"
  | "cooldown_active"
  | "federation_policy"
  | "unknown";

interface PermissionDeniedMessageProps {
  eventType: string;
  reason: DenialReason;
  userRole?: FederationRole;
  additionalInfo?: string;
  onRequestApproval?: () => void;
  onContactAdmin?: () => void;
  onDismiss?: () => void;
  compact?: boolean;
}

const REASON_MESSAGES: Record<
  DenialReason,
  { title: string; description: string; icon: React.FC<{ className?: string }> }
> = {
  role_not_allowed: {
    title: "Role Permission Required",
    description:
      "Your current role does not have permission for this action. Contact a Guardian or Steward to request access.",
    icon: UserX,
  },
  requires_approval: {
    title: "Approval Required",
    description:
      "This action requires approval from a Guardian or Steward before it can be executed.",
    icon: Clock,
  },
  daily_limit_exceeded: {
    title: "Daily Limit Reached",
    description:
      "You have reached your daily limit for this type of action. Try again tomorrow or request a limit increase.",
    icon: AlertTriangle,
  },
  time_window_inactive: {
    title: "Outside Allowed Hours",
    description:
      "This action is only permitted during specific time windows. Please try again during allowed hours.",
    icon: Clock,
  },
  member_override_revoked: {
    title: "Permission Revoked",
    description:
      "Your permission for this action has been specifically revoked. Contact an administrator for details.",
    icon: X,
  },
  cooldown_active: {
    title: "Cooldown Period Active",
    description:
      "A cooldown period is currently active. Please wait before attempting this action again.",
    icon: Clock,
  },
  federation_policy: {
    title: "Federation Policy Restriction",
    description:
      "This action is restricted by your family federation's policies.",
    icon: Shield,
  },
  unknown: {
    title: "Permission Denied",
    description:
      "You do not have permission to perform this action. Contact your federation administrator for assistance.",
    icon: HelpCircle,
  },
};

export const PermissionDeniedMessage: React.FC<PermissionDeniedMessageProps> = ({
  eventType,
  reason,
  userRole,
  additionalInfo,
  onRequestApproval,
  onContactAdmin,
  onDismiss,
  compact = false,
}) => {
  const reasonInfo = REASON_MESSAGES[reason] || REASON_MESSAGES.unknown;
  const Icon = reasonInfo.icon;

  if (compact) {
    return (
      <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
        <Icon className="h-5 w-5 text-red-500 flex-shrink-0" />
        <div className="flex-1">
          <span className="text-sm font-medium text-red-700">
            {reasonInfo.title}
          </span>
          {additionalInfo && (
            <span className="text-sm text-red-600 ml-1">- {additionalInfo}</span>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 text-red-400 hover:text-red-600"
            aria-label="Dismiss message"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6">
      <div className="flex items-start space-x-4">
        <div className="p-3 bg-red-100 rounded-full">
          <Icon className="h-6 w-6 text-red-600" />
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-800">
            {reasonInfo.title}
          </h3>
          <p className="text-sm text-red-600 mt-1">{reasonInfo.description}</p>

          {additionalInfo && (
            <p className="text-sm text-red-500 mt-2 italic">{additionalInfo}</p>
          )}

          <div className="mt-2 text-xs text-red-500">
            <span className="font-medium">Action:</span>{" "}
            {eventType.replace(/_/g, " ")}
            {userRole && (
              <>
                {" "}• <span className="font-medium">Your Role:</span>{" "}
                <span className="capitalize">{userRole}</span>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 mt-4">
            {reason === "requires_approval" && onRequestApproval && (
              <button
                onClick={onRequestApproval}
                className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors"
              >
                Request Approval
              </button>
            )}
            {onContactAdmin && (
              <button
                onClick={onContactAdmin}
                className="px-4 py-2 border border-red-300 text-red-700 text-sm rounded-lg hover:bg-red-100 transition-colors"
              >
                Contact Administrator
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="px-4 py-2 text-red-600 text-sm hover:text-red-800"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PermissionDeniedMessage;

