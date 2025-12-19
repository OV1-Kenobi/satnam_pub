/**
 * Time Window Configurator
 *
 * UI for setting scheduled/temporary permission windows.
 * Supports business hours, temporary elevations, and cooldown periods.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Time-based permission modifications
 * - Parental control scheduling
 * - Temporary access grants
 */

import {
  AlertTriangle,
  Calendar,
  Clock,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import React, { useState } from "react";
import type { FederationRole } from "../../types/permissions";

interface TimeWindow {
  id: string;
  windowType: "scheduled" | "temporary" | "cooldown";
  startTime?: string; // HH:mm format for scheduled
  endTime?: string;
  daysOfWeek?: number[]; // 0-6 for Sun-Sat
  startsAt?: string; // ISO datetime for temporary
  expiresAt?: string;
  timezone: string;
  reason?: string;
}

interface TimeWindowConfiguratorProps {
  federationId: string;
  memberDuid?: string;
  targetRole?: FederationRole;
  eventType: string;
  existingWindows?: TimeWindow[];
  onSave: (windows: TimeWindow[]) => Promise<void>;
  disabled?: boolean;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const generateId = () => Math.random().toString(36).slice(2, 11);

/**
 * Convert datetime-local input value to ISO string with timezone awareness.
 * datetime-local inputs capture values in browser's local time without offset.
 * This function converts to UTC ISO string for consistent server-side processing.
 *
 * @param localDatetime - Value from datetime-local input (YYYY-MM-DDTHH:mm)
 * @returns ISO 8601 string in UTC, or undefined if input is empty
 */
const toISOString = (localDatetime: string | undefined): string | undefined => {
  if (!localDatetime) return undefined;
  // Parse as local time and convert to ISO (UTC)
  const date = new Date(localDatetime);
  if (isNaN(date.getTime())) return undefined;
  return date.toISOString();
};

/**
 * Convert ISO string back to datetime-local format for input display.
 * Takes a UTC ISO string and converts to local time format for the input.
 *
 * @param isoString - ISO 8601 string (UTC)
 * @returns datetime-local format string (YYYY-MM-DDTHH:mm) in local time
 */
const fromISOString = (isoString: string | undefined): string => {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";
  // Format as YYYY-MM-DDTHH:mm for datetime-local input
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const TimeWindowConfigurator: React.FC<TimeWindowConfiguratorProps> = ({
  federationId,
  memberDuid,
  targetRole,
  eventType,
  existingWindows = [],
  onSave,
  disabled = false,
}) => {
  const [windows, setWindows] = useState<TimeWindow[]>(existingWindows);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWindow, setNewWindow] = useState<Partial<TimeWindow>>({
    windowType: "scheduled",
    daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri default
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const handleAddWindow = () => {
    if (!newWindow.windowType) return;

    const window: TimeWindow = {
      id: generateId(),
      windowType: newWindow.windowType,
      timezone: newWindow.timezone || "UTC",
      startTime: newWindow.startTime,
      endTime: newWindow.endTime,
      daysOfWeek: newWindow.daysOfWeek,
      startsAt: newWindow.startsAt,
      expiresAt: newWindow.expiresAt,
      reason: newWindow.reason,
    };

    setWindows([...windows, window]);
    setShowAddForm(false);
    setNewWindow({
      windowType: "scheduled",
      daysOfWeek: [1, 2, 3, 4, 5],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  };

  const handleRemoveWindow = (id: string) => {
    setWindows(windows.filter((w) => w.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(windows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const formatWindowDescription = (window: TimeWindow): string => {
    switch (window.windowType) {
      case "scheduled":
        const days = window.daysOfWeek
          ?.map((d) => DAYS_OF_WEEK.find((dw) => dw.value === d)?.label)
          .join(", ");
        return `${window.startTime} - ${window.endTime} on ${days}`;
      case "temporary":
        const start = window.startsAt
          ? new Date(window.startsAt).toLocaleString()
          : "Now";
        const end = window.expiresAt
          ? new Date(window.expiresAt).toLocaleString()
          : "Indefinite";
        return `${start} until ${end}`;
      case "cooldown":
        return `Cooldown until ${window.expiresAt ? new Date(window.expiresAt).toLocaleString() : "N/A"}`;
      default:
        return "Unknown window type";
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <Clock className="h-5 w-5 text-purple-600" />
          <h3 className="font-medium text-gray-900">Time Windows</h3>
          <span className="text-sm text-gray-500">
            ({eventType.replace(/_/g, " ")})
          </span>
        </div>

        {!disabled && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center space-x-1 px-3 py-1 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Plus className="h-4 w-4" />
            <span>Add Window</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Add Window Form */}
      {showAddForm && (
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="space-y-4">
            {/* Window Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Window Type
              </label>
              <div className="flex space-x-4">
                {(["scheduled", "temporary", "cooldown"] as const).map((type) => (
                  <label key={type} className="flex items-center">
                    <input
                      type="radio"
                      value={type}
                      checked={newWindow.windowType === type}
                      onChange={() =>
                        setNewWindow({ ...newWindow, windowType: type })
                      }
                      className="mr-2"
                    />
                    <span className="capitalize text-sm">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Scheduled Window Fields */}
            {newWindow.windowType === "scheduled" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={newWindow.startTime || ""}
                      onChange={(e) =>
                        setNewWindow({ ...newWindow, startTime: e.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={newWindow.endTime || ""}
                      onChange={(e) =>
                        setNewWindow({ ...newWindow, endTime: e.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Days of Week
                  </label>
                  <div className="flex space-x-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day.value}
                        onClick={() => {
                          const current = newWindow.daysOfWeek || [];
                          const updated = current.includes(day.value)
                            ? current.filter((d) => d !== day.value)
                            : [...current, day.value];
                          setNewWindow({ ...newWindow, daysOfWeek: updated });
                        }}
                        className={`px-3 py-1 rounded text-sm ${newWindow.daysOfWeek?.includes(day.value)
                          ? "bg-purple-600 text-white"
                          : "bg-gray-200 text-gray-700"
                          }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Temporary/Cooldown Fields */}
            {/* NOTE: datetime-local inputs are converted to/from ISO strings for
                consistent timezone handling. The timezone field indicates the user's
                intent, and all times are stored as UTC ISO strings. */}
            {(newWindow.windowType === "temporary" ||
              newWindow.windowType === "cooldown") && (
                <div className="grid grid-cols-2 gap-4">
                  {newWindow.windowType === "temporary" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Starts At (your local time)
                      </label>
                      <input
                        type="datetime-local"
                        value={fromISOString(newWindow.startsAt)}
                        onChange={(e) =>
                          setNewWindow({
                            ...newWindow,
                            startsAt: toISOString(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expires At (your local time)
                    </label>
                    <input
                      type="datetime-local"
                      value={fromISOString(newWindow.expiresAt)}
                      onChange={(e) =>
                        setNewWindow({
                          ...newWindow,
                          expiresAt: toISOString(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
              )}

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <input
                type="text"
                value={newWindow.reason || ""}
                onChange={(e) =>
                  setNewWindow({ ...newWindow, reason: e.target.value })
                }
                placeholder="e.g., Business hours only"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAddWindow}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Add Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Windows */}
      <div className="divide-y divide-gray-100">
        {windows.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No time windows configured</p>
            <p className="text-sm">Permissions apply 24/7</p>
          </div>
        ) : (
          windows.map((window) => (
            <div
              key={window.id}
              className="flex items-center justify-between p-4 hover:bg-gray-50"
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`p-2 rounded-lg ${window.windowType === "scheduled"
                    ? "bg-blue-100 text-blue-600"
                    : window.windowType === "temporary"
                      ? "bg-green-100 text-green-600"
                      : "bg-orange-100 text-orange-600"
                    }`}
                >
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium text-gray-900 capitalize">
                    {window.windowType}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatWindowDescription(window)}
                  </div>
                  {window.reason && (
                    <div className="text-sm text-gray-400 italic">
                      {window.reason}
                    </div>
                  )}
                </div>
              </div>

              {!disabled && (
                <button
                  onClick={() => handleRemoveWindow(window.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Save Button */}
      {windows.length > 0 && !disabled && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>Save Time Windows</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default TimeWindowConfigurator;

