/**
 * TrustNotificationSettings Component
 * Phase 3 Day 4: Trust Provider Settings Integration
 *
 * Component for configuring trust-related notifications and alerts
 * Manages notification preferences, thresholds, and delivery channels
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import React, { useEffect, useState } from "react";
import { Bell, AlertCircle, CheckCircle, Save } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { TrustLevel } from "../../lib/trust/types";

export interface NotificationPreferences {
  id?: string;
  userId: string;
  trustScoreThreshold: number;
  enableScoreAlerts: boolean;
  enableProviderAlerts: boolean;
  enableNewProviderAlerts: boolean;
  deliveryChannels: ("in-app" | "nostr-dm" | "email")[];
  frequency: "real-time" | "daily" | "weekly";
  minTrustLevel: TrustLevel;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TrustNotificationSettingsProps {
  userId: string;
  onSaved?: (prefs: NotificationPreferences) => void;
  onError?: (error: string) => void;
  readOnly?: boolean;
}

export const TrustNotificationSettings: React.FC<TrustNotificationSettingsProps> = ({
  userId,
  onSaved,
  onError,
  readOnly = false,
}) => {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    userId,
    trustScoreThreshold: 50,
    enableScoreAlerts: true,
    enableProviderAlerts: true,
    enableNewProviderAlerts: false,
    deliveryChannels: ["in-app"],
    frequency: "daily",
    minTrustLevel: 3,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, [userId]);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from("trust_notification_preferences")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (err && err.code !== "PGRST116") {
        throw err;
      }

      if (data) {
        setPreferences({
          id: data.id,
          userId: data.user_id,
          trustScoreThreshold: data.trust_score_threshold || 50,
          enableScoreAlerts: data.enable_score_alerts !== false,
          enableProviderAlerts: data.enable_provider_alerts !== false,
          enableNewProviderAlerts: data.enable_new_provider_alerts || false,
          deliveryChannels: data.delivery_channels || ["in-app"],
          frequency: data.frequency || "daily",
          minTrustLevel: data.min_trust_level || 3,
          createdAt: data.created_at ? new Date(data.created_at) : undefined,
          updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load preferences";
      setError(message);
      onError?.(message);
      console.error("Error loading notification preferences:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const payload = {
        user_id: userId,
        trust_score_threshold: preferences.trustScoreThreshold,
        enable_score_alerts: preferences.enableScoreAlerts,
        enable_provider_alerts: preferences.enableProviderAlerts,
        enable_new_provider_alerts: preferences.enableNewProviderAlerts,
        delivery_channels: preferences.deliveryChannels,
        frequency: preferences.frequency,
        min_trust_level: preferences.minTrustLevel,
      };

      if (preferences.id) {
        const { error: err } = await supabase
          .from("trust_notification_preferences")
          .update(payload)
          .eq("id", preferences.id);

        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from("trust_notification_preferences")
          .insert([payload]);

        if (err) throw err;
      }

      setSuccess(true);
      onSaved?.(preferences);

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save preferences";
      setError(message);
      onError?.(message);
      console.error("Error saving notification preferences:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading notification settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-sm text-green-700">Notification settings saved successfully</span>
        </div>
      )}

      {/* Trust Score Alerts */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Trust Score Alerts</h3>
        </div>

        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={preferences.enableScoreAlerts}
              onChange={(e) =>
                setPreferences((prev) => ({
                  ...prev,
                  enableScoreAlerts: e.target.checked,
                }))
              }
              disabled={readOnly}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700">Enable trust score alerts</span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Alert Threshold: {preferences.trustScoreThreshold}
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={preferences.trustScoreThreshold}
              onChange={(e) =>
                setPreferences((prev) => ({
                  ...prev,
                  trustScoreThreshold: parseInt(e.target.value),
                }))
              }
              disabled={readOnly || !preferences.enableScoreAlerts}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Alert when trust score drops below this threshold
            </p>
          </div>
        </div>
      </div>

      {/* Provider Alerts */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-4">Provider Alerts</h3>

        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={preferences.enableProviderAlerts}
              onChange={(e) =>
                setPreferences((prev) => ({
                  ...prev,
                  enableProviderAlerts: e.target.checked,
                }))
              }
              disabled={readOnly}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700">Provider status change alerts</span>
          </label>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={preferences.enableNewProviderAlerts}
              onChange={(e) =>
                setPreferences((prev) => ({
                  ...prev,
                  enableNewProviderAlerts: e.target.checked,
                }))
              }
              disabled={readOnly}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700">New provider availability alerts</span>
          </label>
        </div>
      </div>

      {/* Delivery Preferences */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-4">Delivery Preferences</h3>

        <div className="space-y-3 mb-4">
          <label className="block text-sm font-medium text-gray-700">Delivery Channels</label>
          {(["in-app", "nostr-dm", "email"] as const).map((channel) => (
            <label key={channel} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={preferences.deliveryChannels.includes(channel)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setPreferences((prev) => ({
                      ...prev,
                      deliveryChannels: [...prev.deliveryChannels, channel],
                    }));
                  } else {
                    setPreferences((prev) => ({
                      ...prev,
                      deliveryChannels: prev.deliveryChannels.filter((c) => c !== channel),
                    }));
                  }
                }}
                disabled={readOnly}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700 capitalize">{channel.replace("-", " ")}</span>
            </label>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
          <select
            value={preferences.frequency}
            onChange={(e) =>
              setPreferences((prev) => ({
                ...prev,
                frequency: e.target.value as "real-time" | "daily" | "weekly",
              }))
            }
            disabled={readOnly}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="real-time">Real-time</option>
            <option value="daily">Daily Digest</option>
            <option value="weekly">Weekly Digest</option>
          </select>
        </div>
      </div>

      {/* Save Button */}
      {!readOnly && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Settings"}
        </button>
      )}
    </div>
  );
};

export default TrustNotificationSettings;

