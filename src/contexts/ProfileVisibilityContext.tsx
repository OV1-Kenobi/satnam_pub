/**
 * Profile Visibility Context
 * Phase 3: Public Profile URL System - UI Integration
 * 
 * Centralized state management for profile visibility settings.
 * Provides context and hooks for managing profile visibility across the app.
 */

import React, { createContext, ReactNode, useEffect, useState } from 'react';
import ProfileAPI from '../lib/api/profile-endpoints';
import { ProfileVisibility } from '../lib/services/profile-service';
import { VisibilitySettings } from '../types/profile';

interface ProfileVisibilityContextValue {
  settings: VisibilitySettings | null;
  loading: boolean;
  error: string | null;
  updateVisibility: (visibility: ProfileVisibility) => Promise<boolean>;
  updateDiscoverability: (isDiscoverable: boolean) => Promise<boolean>;
  updateAnalytics: (analyticsEnabled: boolean) => Promise<boolean>;
  updateSettings: (settings: Partial<VisibilitySettings>) => Promise<boolean>;
  refreshSettings: () => Promise<void>;
}

export const ProfileVisibilityContext = createContext<ProfileVisibilityContextValue | undefined>(
  undefined
);

interface ProfileVisibilityProviderProps {
  children: ReactNode;
  authToken?: string;
  userId?: string;
}

export const ProfileVisibilityProvider: React.FC<ProfileVisibilityProviderProps> = ({
  children,
  authToken,
  userId,
}) => {
  const [settings, setSettings] = useState<VisibilitySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current settings on mount
  useEffect(() => {
    if (authToken && userId) {
      fetchSettings();
    } else {
      setLoading(false);
    }
  }, [authToken, userId]);

  const fetchSettings = async () => {
    if (!authToken) {
      setError('Authentication token required');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await ProfileAPI.getCurrentUserProfile(authToken);

      if (response.success && response.data) {
        setSettings({
          profile_visibility: response.data.profile_visibility,
          is_discoverable: response.data.is_discoverable,
          analytics_enabled: response.data.analytics_enabled,
        });
      } else {
        setError(response.error || 'Failed to fetch profile settings');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch profile settings');
    } finally {
      setLoading(false);
    }
  };

  const updateVisibility = async (visibility: ProfileVisibility): Promise<boolean> => {
    if (!authToken) {
      setError('Authentication token required');
      return false;
    }

    try {
      const response = await ProfileAPI.updateProfileSettings(authToken, { visibility });

      if (response.success) {
        setSettings((prev) =>
          prev ? { ...prev, profile_visibility: visibility } : null
        );
        setError(null);
        return true;
      } else {
        setError(response.error || 'Failed to update visibility');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update visibility');
      return false;
    }
  };

  const updateDiscoverability = async (isDiscoverable: boolean): Promise<boolean> => {
    if (!authToken) {
      setError('Authentication token required');
      return false;
    }

    try {
      const response = await ProfileAPI.updateProfileSettings(authToken, {
        is_discoverable: isDiscoverable,
      });

      if (response.success) {
        setSettings((prev) => (prev ? { ...prev, is_discoverable: isDiscoverable } : null));
        setError(null);
        return true;
      } else {
        setError(response.error || 'Failed to update discoverability');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update discoverability');
      return false;
    }
  };

  const updateAnalytics = async (analyticsEnabled: boolean): Promise<boolean> => {
    if (!authToken) {
      setError('Authentication token required');
      return false;
    }

    try {
      const response = await ProfileAPI.updateProfileSettings(authToken, {
        analytics_enabled: analyticsEnabled,
      });

      if (response.success) {
        setSettings((prev) =>
          prev ? { ...prev, analytics_enabled: analyticsEnabled } : null
        );
        setError(null);
        return true;
      } else {
        setError(response.error || 'Failed to update analytics');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update analytics');
      return false;
    }
  };

  const updateSettings = async (
    newSettings: Partial<VisibilitySettings>
  ): Promise<boolean> => {
    if (!authToken) {
      setError('Authentication token required');
      return false;
    }

    try {
      const response = await ProfileAPI.updateProfileSettings(authToken, newSettings);

      if (response.success) {
        setSettings((prev) => (prev ? { ...prev, ...newSettings } : null));
        setError(null);
        return true;
      } else {
        setError(response.error || 'Failed to update settings');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      return false;
    }
  };

  const refreshSettings = async () => {
    await fetchSettings();
  };

  const value: ProfileVisibilityContextValue = {
    settings,
    loading,
    error,
    updateVisibility,
    updateDiscoverability,
    updateAnalytics,
    updateSettings,
    refreshSettings,
  };

  return (
    <ProfileVisibilityContext.Provider value={value}>
      {children}
    </ProfileVisibilityContext.Provider>
  );
};

export default ProfileVisibilityProvider;

