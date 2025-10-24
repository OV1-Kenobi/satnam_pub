/**
 * Profile Visibility Settings Component
 *
 * Allows users to control their profile visibility with four modes:
 * - Private: Only visible to the user
 * - Contacts Only: Visible to any contacts in the platform
 * - Trusted Contacts Only: Visible only to verified/trusted contacts (Phase 2)
 * - Public: Visible to everyone
 */

import { Eye, Lock, ShieldCheck, Users } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import ProfileAPI from '../lib/api/profile-endpoints';
import { ProfileVisibility } from '../lib/services/profile-service';

interface ProfileVisibilitySettingsProps {
  currentVisibility: ProfileVisibility;
  currentIsDiscoverable?: boolean;
  currentAnalyticsEnabled?: boolean;
  onVisibilityChange?: (visibility: ProfileVisibility) => void;
  onSettingsChange?: (settings: {
    visibility?: ProfileVisibility;
    is_discoverable?: boolean;
    analytics_enabled?: boolean;
  }) => void;
  authToken?: string;
  className?: string;
}

const VISIBILITY_OPTIONS: Array<{
  value: ProfileVisibility;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
    {
      value: 'private',
      label: 'Private',
      description: 'Only you can see your profile',
      icon: <Lock size={20} />,
    },
    {
      value: 'contacts_only',
      label: 'Contacts Only',
      description: 'Only your contacts can see your profile',
      icon: <Users size={20} />,
    },
    {
      value: 'trusted_contacts_only',
      label: 'Trusted Contacts Only',
      description: 'Only verified/trusted contacts can see your profile',
      icon: <ShieldCheck size={20} />,
    },
    {
      value: 'public',
      label: 'Public',
      description: 'Everyone can see your profile',
      icon: <Eye size={20} />,
    },
  ];

export const ProfileVisibilitySettings: React.FC<ProfileVisibilitySettingsProps> = ({
  currentVisibility,
  currentIsDiscoverable = false,
  currentAnalyticsEnabled = false,
  onVisibilityChange,
  onSettingsChange,
  authToken,
  className = '',
}) => {
  const [visibility, setVisibility] = useState<ProfileVisibility>(currentVisibility);
  const [isDiscoverable, setIsDiscoverable] = useState(currentIsDiscoverable);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(currentAnalyticsEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setVisibility(currentVisibility);
  }, [currentVisibility]);

  useEffect(() => {
    setIsDiscoverable(currentIsDiscoverable);
  }, [currentIsDiscoverable]);

  useEffect(() => {
    setAnalyticsEnabled(currentAnalyticsEnabled);
  }, [currentAnalyticsEnabled]);

  const handleVisibilityChange = async (newVisibility: ProfileVisibility) => {
    setVisibility(newVisibility);
    setError(null);
    setSuccess(false);

    if (!authToken) {
      setError('Authentication token required');
      return;
    }

    setSaving(true);

    try {
      const response = await ProfileAPI.updateProfileSettings(authToken, {
        visibility: newVisibility,
      });

      if (response.success) {
        setSuccess(true);
        onVisibilityChange?.(newVisibility);
        onSettingsChange?.({ visibility: newVisibility });
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(response.error || 'Failed to update visibility');
        setVisibility(currentVisibility);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update visibility');
      setVisibility(currentVisibility);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDiscoverable = async () => {
    const newValue = !isDiscoverable;
    setIsDiscoverable(newValue);
    setError(null);
    setSuccess(false);

    if (!authToken) {
      setError('Authentication token required');
      setIsDiscoverable(!newValue);
      return;
    }

    setSaving(true);

    try {
      const response = await ProfileAPI.updateProfileSettings(authToken, {
        is_discoverable: newValue,
      });

      if (response.success) {
        setSuccess(true);
        onSettingsChange?.({ is_discoverable: newValue });
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(response.error || 'Failed to update discoverability');
        setIsDiscoverable(!newValue);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update discoverability');
      setIsDiscoverable(!newValue);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAnalytics = async () => {
    const newValue = !analyticsEnabled;
    setAnalyticsEnabled(newValue);
    setError(null);
    setSuccess(false);

    if (!authToken) {
      setError('Authentication token required');
      setAnalyticsEnabled(!newValue);
      return;
    }

    setSaving(true);

    try {
      const response = await ProfileAPI.updateProfileSettings(authToken, {
        analytics_enabled: newValue,
      });

      if (response.success) {
        setSuccess(true);
        onSettingsChange?.({ analytics_enabled: newValue });
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(response.error || 'Failed to update analytics');
        setAnalyticsEnabled(!newValue);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update analytics');
      setAnalyticsEnabled(!newValue);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`profile-visibility-settings ${className}`}>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-white mb-2">Profile Visibility</h3>
        <p className="text-gray-400 text-sm">
          Control who can see your profile and discover you on Satnam.pub
        </p>
      </div>

      {/* Visibility Options */}
      <div className="space-y-3 mb-6">
        {VISIBILITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => handleVisibilityChange(option.value)}
            disabled={saving}
            className={`w-full p-4 rounded-lg border-2 transition-all text-left ${visibility === option.value
              ? 'border-purple-500 bg-purple-600/20'
              : 'border-gray-600 bg-gray-900/50 hover:border-purple-400'
              } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-1 ${visibility === option.value ? 'text-purple-400' : 'text-gray-400'
                  }`}
              >
                {option.icon}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white">{option.label}</p>
                <p className="text-sm text-gray-400">{option.description}</p>
              </div>
              {visibility === option.value && (
                <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Additional Settings Toggles */}
      <div className="space-y-4 mb-6">
        {/* Discoverable Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-700">
          <div className="flex-1">
            <p className="font-semibold text-white">Make Profile Discoverable</p>
            <p className="text-sm text-gray-400">
              Allow others to find your profile through search
            </p>
          </div>
          <button
            onClick={handleToggleDiscoverable}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDiscoverable ? 'bg-purple-600' : 'bg-gray-600'
              } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            aria-label="Toggle discoverability"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDiscoverable ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
          </button>
        </div>

        {/* Analytics Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-700">
          <div className="flex-1">
            <p className="font-semibold text-white">Enable Profile Analytics</p>
            <p className="text-sm text-gray-400">
              Track profile views and visitor statistics (privacy-first)
            </p>
          </div>
          <button
            onClick={handleToggleAnalytics}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${analyticsEnabled ? 'bg-purple-600' : 'bg-gray-600'
              } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            aria-label="Toggle analytics"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${analyticsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg mb-4">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-900/30 border border-green-500/50 rounded-lg mb-4">
          <p className="text-green-300 text-sm">✓ Profile settings updated successfully</p>
        </div>
      )}

      {/* Profile URL Preview */}
      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
        <p className="text-gray-400 text-sm mb-2">Your Profile URL:</p>
        <div className="flex items-center gap-2">
          <code className="text-purple-300 text-sm break-all flex-1">
            satnam.pub/profile/[username]
          </code>
          <button
            onClick={() => {
              const url = `${window.location.origin}/profile/[username]`;
              navigator.clipboard.writeText(url);
            }}
            className="p-2 hover:bg-purple-600/30 rounded transition-colors"
            title="Copy URL"
          >
            📋
          </button>
        </div>

        {visibility === 'public' && (
          <p className="text-green-400 text-xs mt-2">✓ Your profile is publicly visible</p>
        )}
        {visibility === 'contacts_only' && (
          <p className="text-blue-400 text-xs mt-2">
            ✓ Your profile is visible to your contacts
          </p>
        )}
        {visibility === 'trusted_contacts_only' && (
          <p className="text-purple-400 text-xs mt-2">
            ✓ Your profile is visible to verified/trusted contacts only
          </p>
        )}
        {visibility === 'private' && (
          <p className="text-gray-400 text-xs mt-2">
            ✓ Your profile is private (only you can see it)
          </p>
        )}
      </div>

      {/* Privacy Notice */}
      <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
        <p className="text-blue-300 text-sm">
          <strong>Privacy First:</strong> Your profile never exposes your private keys or
          encrypted credentials. Only public profile information is displayed.
        </p>
      </div>
    </div>
  );
};

export default ProfileVisibilitySettings;

