/**
 * Permission Matrix View
 *
 * Visual matrix of permissions across roles and event types.
 * Provides at-a-glance view of federation permission configuration.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Read-only visualization of permission state
 * - Role hierarchy display
 * - Event type categorization
 */

import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  Shield,
  X,
} from "lucide-react";
import React from "react";
import { usePermissions } from "../../hooks/usePermissions";
import type {
  EventSigningPermission,
  FederationRole,
} from "../../types/permissions";

interface PermissionMatrixViewProps {
  federationId: string;
}

const ROLES: FederationRole[] = ["offspring", "adult", "steward", "guardian"];

const EVENT_TYPES = [
  { type: "payment", label: "Payment", category: "Financial" },
  { type: "invoice", label: "Invoice", category: "Financial" },
  { type: "treasury_access", label: "Treasury", category: "Financial" },
  { type: "social_post", label: "Social Post", category: "Social" },
  { type: "media_post", label: "Media Post", category: "Social" },
  { type: "profile_update", label: "Profile", category: "Social" },
  { type: "contact_list", label: "Contacts", category: "Social" },
  { type: "member_invite", label: "Invite", category: "Governance" },
  { type: "role_change", label: "Role Change", category: "Governance" },
  { type: "policy_update", label: "Policy", category: "Governance" },
];

interface PermissionCellProps {
  permission: EventSigningPermission | undefined;
}

const PermissionCell: React.FC<PermissionCellProps> = ({ permission }) => {
  if (!permission) {
    return (
      <td className="px-3 py-2 text-center">
        <div className="flex items-center justify-center">
          <X className="h-4 w-4 text-gray-300" />
        </div>
      </td>
    );
  }

  const { allowed, requiresApproval, dailyLimit } = permission;

  if (!allowed) {
    return (
      <td className="px-3 py-2 text-center bg-red-50">
        <div className="flex items-center justify-center" title="Not allowed">
          <X className="h-4 w-4 text-red-500" />
        </div>
      </td>
    );
  }

  if (requiresApproval) {
    return (
      <td className="px-3 py-2 text-center bg-orange-50">
        <div
          className="flex flex-col items-center justify-center"
          title={`Requires approval${dailyLimit ? `, limit: ${dailyLimit}/day` : ""}`}
        >
          <Clock className="h-4 w-4 text-orange-500" />
          {dailyLimit && (
            <span className="text-xs text-orange-600">{dailyLimit}/d</span>
          )}
        </div>
      </td>
    );
  }

  return (
    <td className="px-3 py-2 text-center bg-green-50">
      <div
        className="flex flex-col items-center justify-center"
        title={`Allowed${dailyLimit ? `, limit: ${dailyLimit}/day` : ""}`}
      >
        <Check className="h-4 w-4 text-green-500" />
        {dailyLimit && (
          <span className="text-xs text-green-600">{dailyLimit}/d</span>
        )}
      </div>
    </td>
  );
};

export const PermissionMatrixView: React.FC<PermissionMatrixViewProps> = ({
  federationId,
}) => {
  const { permissions, loading, error, refresh } = usePermissions(federationId);

  // Helper to find permission for role/event type
  const findPermission = (
    role: FederationRole,
    eventType: string
  ): EventSigningPermission | undefined => {
    return permissions.find(
      (p) => p.targetRole === role && p.eventType === eventType
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <span className="ml-2 text-gray-600">Loading permissions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center text-red-700">
          <AlertTriangle className="h-5 w-5 mr-2" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // Group event types by category
  const categories = EVENT_TYPES.reduce((acc, et) => {
    if (!acc[et.category]) acc[et.category] = [];
    acc[et.category].push(et);
    return acc;
  }, {} as Record<string, typeof EVENT_TYPES>);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <Shield className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Permission Matrix
          </h2>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center space-x-1">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-gray-600">Allowed</span>
          </div>
          <div className="flex items-center space-x-1">
            <Clock className="h-4 w-4 text-orange-500" />
            <span className="text-gray-600">Approval</span>
          </div>
          <div className="flex items-center space-x-1">
            <X className="h-4 w-4 text-red-500" />
            <span className="text-gray-600">Denied</span>
          </div>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                Event Type
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  className="px-3 py-3 text-center text-sm font-medium text-gray-700 capitalize"
                >
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Object.entries(categories).map(([category, eventTypes]) => (
              <React.Fragment key={category}>
                {/* Category Header */}
                <tr className="bg-gray-100">
                  <td
                    colSpan={ROLES.length + 1}
                    className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {category}
                  </td>
                </tr>
                {/* Event Type Rows */}
                {eventTypes.map((et) => (
                  <tr key={et.type} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {et.label}
                    </td>
                    {ROLES.map((role) => (
                      <PermissionCell
                        key={`${role}-${et.type}`}
                        permission={findPermission(role, et.type)}
                      />
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Note */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <p className="text-sm text-gray-500">
          <span className="font-medium">Note:</span> Member-specific overrides
          may modify these base permissions. Check Member Overrides for
          individual exceptions.
        </p>
      </div>
    </div>
  );
};

export default PermissionMatrixView;

