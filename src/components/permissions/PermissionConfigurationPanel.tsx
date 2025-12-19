/**
 * Permission Configuration Panel
 *
 * Panel for Guardians/Stewards to configure role permissions.
 * Integrates with Family Finances Dashboard as a tab.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Guardian/Steward-only access
 * - Role-based permission management
 * - Privacy-first architecture
 */

import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  Save,
  Shield,
  X,
} from "lucide-react";
import React, { useCallback, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { usePermissions } from "../../hooks/usePermissions";
import type {
  EventSigningPermission,
  FederationRole,
} from "../../types/permissions";

// Event type categories for organization
const EVENT_TYPE_CATEGORIES = {
  financial: [
    { type: "payment", label: "Payments", description: "Lightning/Fedimint payments" },
    { type: "invoice", label: "Invoices", description: "Create payment requests" },
    { type: "treasury_access", label: "Treasury Access", description: "Access shared funds" },
    { type: "financial_report", label: "Financial Reports", description: "View/export reports" },
  ],
  social: [
    { type: "social_post", label: "Social Posts", description: "Kind 1 text notes" },
    { type: "media_post", label: "Media Posts", description: "Images, videos, audio" },
    { type: "profile_update", label: "Profile Updates", description: "Update profile metadata" },
    { type: "contact_list", label: "Contact List", description: "Manage follow list" },
  ],
  governance: [
    { type: "member_invite", label: "Member Invites", description: "Invite new members" },
    { type: "role_change", label: "Role Changes", description: "Modify member roles" },
    { type: "policy_update", label: "Policy Updates", description: "Federation policies" },
    { type: "threshold_change", label: "Threshold Changes", description: "FROST thresholds" },
  ],
};

const ROLES: FederationRole[] = ["offspring", "adult", "steward", "guardian"];

interface PermissionConfigurationPanelProps {
  federationId: string;
  userRole: FederationRole;
  onPermissionChange?: () => void;
}

interface PermissionRowProps {
  eventType: string;
  label: string;
  description: string;
  permission: Partial<EventSigningPermission>;
  onUpdate: (updates: Partial<EventSigningPermission>) => void;
  disabled: boolean;
}

const PermissionRow: React.FC<PermissionRowProps> = ({
  eventType,
  label,
  description,
  permission,
  onUpdate,
  disabled,
}) => {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <div className="font-medium text-gray-900">{label}</div>
        <div className="text-sm text-gray-500">{description}</div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Can Sign Toggle */}
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600">Allowed</label>
          <button
            onClick={() => onUpdate({ canSign: !permission.canSign })}
            disabled={disabled}
            className={`w-10 h-6 rounded-full transition-colors ${permission.canSign ? "bg-green-500" : "bg-gray-300"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${permission.canSign ? "translate-x-5" : "translate-x-1"
                }`}
            />
          </button>
        </div>

        {/* Requires Approval Toggle */}
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600">Approval</label>
          <button
            onClick={() =>
              onUpdate({ requiresApproval: !permission.requiresApproval })
            }
            disabled={disabled || !permission.canSign}
            className={`w-10 h-6 rounded-full transition-colors ${permission.requiresApproval ? "bg-orange-500" : "bg-gray-300"
              } ${disabled || !permission.canSign ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${permission.requiresApproval ? "translate-x-5" : "translate-x-1"
                }`}
            />
          </button>
        </div>

        {/* Daily Limit Input */}
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600">Daily Limit</label>
          <input
            type="number"
            value={permission.maxDailyCount ?? ""}
            min={0}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "") {
                onUpdate({ maxDailyCount: undefined });
              } else {
                const parsed = parseInt(val, 10);
                if (!isNaN(parsed) && parsed >= 0) {
                  onUpdate({ maxDailyCount: parsed });
                }
              }
            }}
            disabled={disabled || !permission.canSign}
            placeholder="∞"
            className="w-20 px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
};

export const PermissionConfigurationPanel: React.FC<
  PermissionConfigurationPanelProps
> = ({ federationId, userRole, onPermissionChange }) => {
  const { user } = useAuth();
  const { permissions, loading, error, refresh } = usePermissions(federationId);
  const [selectedRole, setSelectedRole] = useState<FederationRole>("adult");
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, Partial<EventSigningPermission>>
  >(new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Check if user can configure permissions
  const canConfigure = userRole === "guardian" || userRole === "steward";

  // Get current permission for role/event type
  const getPermission = useCallback(
    (eventType: string): Partial<EventSigningPermission> => {
      // Check pending changes first
      const key = `${selectedRole}::${eventType}`;
      if (pendingChanges.has(key)) {
        return pendingChanges.get(key)!;
      }

      // Find in existing permissions
      const existing = permissions.find(
        (p) => p.role === selectedRole && p.eventType === eventType
      );

      return {
        canSign: existing?.canSign ?? false,
        requiresApproval: existing?.requiresApproval ?? false,
        maxDailyCount: existing?.maxDailyCount,
      };
    },
    [selectedRole, permissions, pendingChanges]
  );

  // Handle permission update
  const handlePermissionUpdate = useCallback(
    (eventType: string, updates: Partial<EventSigningPermission>) => {
      const key = `${selectedRole}::${eventType}`;
      const current = getPermission(eventType);
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(key, { ...current, ...updates });
        return next;
      });
    },
    [selectedRole, getPermission]
  );

  // Save all pending changes
  const handleSave = async () => {
    if (pendingChanges.size === 0) return;

    setSaving(true);
    setSaveError(null);

    try {
      // Group changes by role
      const changesByRole = new Map<
        FederationRole,
        Array<{ eventType: string; permission: Partial<EventSigningPermission> }>
      >();

      pendingChanges.forEach((permission, key) => {
        const delimiterIndex = key.indexOf("::");
        const role = key.substring(0, delimiterIndex) as FederationRole;
        const eventType = key.substring(delimiterIndex + 2);
        if (!changesByRole.has(role)) {
          changesByRole.set(role, []);
        }
        changesByRole.get(role)!.push({ eventType, permission });
      });

      // Submit each role's changes
      for (const [role, changes] of changesByRole) {
        const response = await fetch("/api/permissions/role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            federationId,
            targetRole: role,
            permissions: changes.map((c) => ({
              eventType: c.eventType,
              canSign: c.permission.canSign,
              requiresApproval: c.permission.requiresApproval,
              maxDailyCount: c.permission.maxDailyCount,
            })),
            configuredBy: user?.id, // Server validates session and maps to DUID internally
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Request failed" }));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to save permissions");
        }
      }

      setPendingChanges(new Map());
      await refresh();
      onPermissionChange?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Discard pending changes
  const handleDiscard = () => {
    setPendingChanges(new Map());
    setSaveError(null);
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <Shield className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Signing Permissions
          </h2>
        </div>

        {pendingChanges.size > 0 && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-orange-600">
              {pendingChanges.size} unsaved changes
            </span>
            <button
              onClick={handleDiscard}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center space-x-1 px-3 py-1 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>Save</span>
            </button>
          </div>
        )}
      </div>

      {saveError && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {saveError}
        </div>
      )}

      {/* Role Selector Tabs */}
      <div className="flex border-b border-gray-200">
        {ROLES.map((role) => (
          <button
            key={role}
            onClick={() => setSelectedRole(role)}
            className={`flex-1 px-4 py-3 text-sm font-medium capitalize transition-colors ${selectedRole === role
              ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50"
              : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
              }`}
          >
            {role}
          </button>
        ))}
      </div>

      {/* Permission Categories */}
      <div className="p-4 space-y-6">
        {Object.entries(EVENT_TYPE_CATEGORIES).map(([category, eventTypes]) => (
          <div key={category}>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              {category}
            </h3>
            <div className="bg-gray-50 rounded-lg p-4">
              {eventTypes.map((et) => (
                <PermissionRow
                  key={et.type}
                  eventType={et.type}
                  label={et.label}
                  description={et.description}
                  permission={getPermission(et.type)}
                  onUpdate={(updates) =>
                    handlePermissionUpdate(et.type, updates)
                  }
                  disabled={!canConfigure}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {!canConfigure && (
        <div className="m-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center text-yellow-700 text-sm">
            <Clock className="h-4 w-4 mr-2" />
            <span>
              Only Guardians and Stewards can configure permissions.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PermissionConfigurationPanel;

