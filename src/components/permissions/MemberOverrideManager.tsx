/**
 * Member Override Manager
 *
 * Interface for managing member-specific permission overrides.
 * Allows Guardians/Stewards to grant or restrict individual members.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Per-member permission customization
 * - Time-based override windows
 * - Audit trail integration
 */

import {
  AlertTriangle,
  Clock,
  Loader2,
  Plus,
  Shield,
  Trash2,
  User,
  X,
} from "lucide-react";
import React, { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { usePermissions } from "../../hooks/usePermissions";
import type {
  FederationRole,
  MemberSigningOverride,
} from "../../types/permissions";

interface MemberOverrideManagerProps {
  federationId: string;
  userRole: FederationRole;
  members: Array<{ duid: string; displayName: string; role: FederationRole }>;
  onOverrideChange?: () => void;
}

interface NewOverrideFormData {
  memberDuid: string;
  eventType: string;
  overrideType: "grant" | "revoke";
  reason: string;
  expiresAt: string;
}

const EVENT_TYPES = [
  "payment",
  "invoice",
  "treasury_access",
  "social_post",
  "media_post",
  "profile_update",
  "member_invite",
  "role_change",
];

export const MemberOverrideManager: React.FC<MemberOverrideManagerProps> = ({
  federationId,
  userRole,
  members,
  onOverrideChange,
}) => {
  const { user } = useAuth();
  const { overrides, loading, error, refresh } = usePermissions(federationId);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<NewOverrideFormData>({
    memberDuid: "",
    eventType: "",
    overrideType: "grant",
    reason: "",
    expiresAt: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const canManage = userRole === "guardian" || userRole === "steward";

  // Create new override
  const handleCreateOverride = async () => {
    if (
      !formData.memberDuid ||
      !formData.eventType ||
      !formData.reason
    ) {
      setSubmitError("Please fill in all required fields");
      return;
    }

    // Server maps session to DUID internally - we only need user.id for the request
    if (!user?.id) {
      setSubmitError("Authentication required");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/permissions/member-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          federationId,
          memberDuid: formData.memberDuid,
          eventType: formData.eventType,
          overrideType: formData.overrideType,
          allowed: formData.overrideType === "grant",
          reason: formData.reason,
          expiresAt: formData.expiresAt || null,
          createdBy: user.id, // Server validates session and maps to DUID internally
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      // Response was successful, parse to consume the body
      await response.json();

      setShowAddForm(false);
      setFormData({
        memberDuid: "",
        eventType: "",
        overrideType: "grant",
        reason: "",
        expiresAt: "",
      });
      await refresh();
      onOverrideChange?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Creation failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Revoke existing override
  const handleRevokeOverride = async (overrideId: string) => {
    if (!confirm("Are you sure you want to revoke this override?")) return;

    setRevokeError(null);
    try {
      const response = await fetch(
        `/api/permissions/member-override/${overrideId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      // Response was successful, parse to consume the body
      await response.json();

      await refresh();
      onOverrideChange?.();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke override");
    }
  };

  // Get member display name
  const getMemberName = (duid: string): string => {
    const member = members.find((m) => m.duid === duid);
    return member?.displayName || duid.slice(0, 8) + "...";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <span className="ml-2 text-gray-600">Loading overrides...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <User className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Member Overrides
          </h2>
        </div>

        {canManage && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center space-x-1 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
          >
            <Plus className="h-4 w-4" />
            <span>Add Override</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {revokeError && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{revokeError}</span>
          <button
            onClick={() => setRevokeError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Add Override Form */}
      {showAddForm && (
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-medium text-gray-900 mb-4">New Override</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Member
              </label>
              <select
                value={formData.memberDuid}
                onChange={(e) =>
                  setFormData({ ...formData, memberDuid: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select member...</option>
                {members.map((m) => (
                  <option key={m.duid} value={m.duid}>
                    {m.displayName} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Event Type
              </label>
              <select
                value={formData.eventType}
                onChange={(e) =>
                  setFormData({ ...formData, eventType: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select event type...</option>
                {EVENT_TYPES.map((et) => (
                  <option key={et} value={et}>
                    {et.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Override Type
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="grant"
                    checked={formData.overrideType === "grant"}
                    onChange={() =>
                      setFormData({ ...formData, overrideType: "grant" })
                    }
                    className="mr-2"
                  />
                  <span className="text-green-600">Grant</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="revoke"
                    checked={formData.overrideType === "revoke"}
                    onChange={() =>
                      setFormData({ ...formData, overrideType: "revoke" })
                    }
                    className="mr-2"
                  />
                  <span className="text-red-600">Revoke</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expires At (optional)
              </label>
              <input
                type="datetime-local"
                value={formData.expiresAt}
                onChange={(e) =>
                  setFormData({ ...formData, expiresAt: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason *
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) =>
                setFormData({ ...formData, reason: e.target.value })
              }
              placeholder="Explain why this override is needed..."
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {submitError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {submitError}
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateOverride}
              disabled={submitting}
              className="flex items-center space-x-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Create Override</span>
            </button>
          </div>
        </div>
      )}

      {/* Overrides List */}
      <div className="divide-y divide-gray-100">
        {overrides.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No member overrides configured</p>
            <p className="text-sm">Role-based permissions apply to all members</p>
          </div>
        ) : (
          overrides.map((override) => (
            <div
              key={override.id}
              className="flex items-center justify-between p-4 hover:bg-gray-50"
            >
              <div className="flex items-center space-x-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${override.allowed
                    ? "bg-green-100 text-green-600"
                    : "bg-red-100 text-red-600"
                    }`}
                >
                  {override.allowed ? (
                    <Shield className="h-5 w-5" />
                  ) : (
                    <X className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {getMemberName(override.memberDuid)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {override.eventType.replace(/_/g, " ")} -{" "}
                    {override.allowed ? "Granted" : "Revoked"}
                  </div>
                  {override.reason && (
                    <div className="text-sm text-gray-400 italic">
                      {override.reason}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-4">
                {override.expiresAt && (
                  <div className="flex items-center text-sm text-gray-500">
                    <Clock className="h-4 w-4 mr-1" />
                    Expires: {new Date(override.expiresAt).toLocaleDateString()}
                  </div>
                )}
                {canManage && (
                  <button
                    onClick={() => handleRevokeOverride(override.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    title="Revoke override"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MemberOverrideManager;

