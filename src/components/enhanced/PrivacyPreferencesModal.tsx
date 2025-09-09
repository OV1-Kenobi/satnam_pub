/**
 * Privacy Preferences Modal
 * Allows users to configure their privacy settings and preferences
 */

import { ChevronDown, ChevronUp, RefreshCw, Save, Shield, XCircle } from "lucide-react";
import React, { useEffect, useState } from "react";
import { PrivacyEnhancedApiService } from "../../services/privacyEnhancedApi";
import { PrivacyLevel } from "../../types/privacy";


interface PrivacyPreferences {
  default_privacy_level: PrivacyLevel;
  auto_upgrade_threshold: number;
  require_guardian_approval: boolean;
  guardian_approval_threshold: number;
  metadata_protection: boolean;
  transaction_unlinkability: boolean;
  privacy_routing_preference: 'always' | 'high_amounts' | 'never';
  cashu_preference: boolean;
  lnproxy_preference: boolean;
  fedimint_preference: boolean;
}

interface PrivacyPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: 'private' | 'offspring' | 'adult' | 'steward' | 'guardian';
  onPreferencesUpdate?: (prefs: PrivacyPreferences) => void;
}

const PrivacyPreferencesModal: React.FC<PrivacyPreferencesModalProps> = ({
  isOpen,
  onClose,
  userRole,
  onPreferencesUpdate,
}) => {
  const [preferences, setPreferences] = useState<PrivacyPreferences>({
    default_privacy_level: PrivacyLevel.GIFTWRAPPED,
    auto_upgrade_threshold: 100000,
    require_guardian_approval: true,
    guardian_approval_threshold: 500000,
    metadata_protection: true,
    transaction_unlinkability: true,
    privacy_routing_preference: 'always',
    cashu_preference: true,
    lnproxy_preference: true,
    fedimint_preference: true,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Signing session preferences
  const [enableSessionTimeout, setEnableSessionTimeout] = useState<boolean>(false);
  const [customSessionTimeoutMinutes, setCustomSessionTimeoutMinutes] = useState<number>(15);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const apiService = new PrivacyEnhancedApiService();

  useEffect(() => {
    if (isOpen) {
      loadUserPreferences();
    }
  }, [isOpen]);

  const loadUserPreferences = async () => {
    try {
      setLoading(true);

      // Mock loading user preferences - in real implementation, this would call the API
      const mockPreferences: PrivacyPreferences = {
        default_privacy_level: PrivacyLevel.GIFTWRAPPED,
        auto_upgrade_threshold: 100000,
        require_guardian_approval: userRole === 'offspring',
        guardian_approval_threshold: 500000,
        metadata_protection: true,
        transaction_unlinkability: true,
        privacy_routing_preference: 'always',
        cashu_preference: true,
        lnproxy_preference: true,
        fedimint_preference: true,
      };

      setPreferences(mockPreferences);

      // Load signing preferences for session timeout controls
      try {
        const sp = await userSigningPreferences.getUserPreferences();
        setEnableSessionTimeout(sp?.enableSessionTimeout ?? false);
        setCustomSessionTimeoutMinutes(sp?.customSessionTimeoutMinutes ?? 15);
      } catch (e) {
        console.warn('Failed to load signing preferences:', e);
      }
    } catch (error) {
      console.error('Failed to load privacy preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const validatePreferences = (prefs: PrivacyPreferences): string[] => {
    const errors: string[] = [];

    if (prefs.auto_upgrade_threshold < 1000) {
      errors.push('Auto-upgrade threshold must be at least 1,000 sats');
    }

    if (prefs.guardian_approval_threshold < prefs.auto_upgrade_threshold) {
      errors.push('Guardian approval threshold must be higher than auto-upgrade threshold');
    }

    if (userRole === 'offspring' && !prefs.require_guardian_approval) {
      errors.push('Offspring must have guardian approval enabled');
    }

    return errors;
  };

  const handleSavePreferences = async () => {
    const errors = validatePreferences(preferences);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    try {
      setSaving(true);
      setValidationErrors([]);

      // Mock saving privacy preferences - in real implementation, this would call the API
      await new Promise(resolve => setTimeout(resolve, 800));

      // Persist signing session preferences using signing preferences service
      try {
        await userSigningPreferences.updatePreferences({
          enableSessionTimeout,
          customSessionTimeoutMinutes,
        });
      } catch (e) {
        console.warn('Failed to save signing preferences:', e);
      }

      console.log('Saved privacy preferences:', preferences);

      if (onPreferencesUpdate) {
        onPreferencesUpdate(preferences);
      }

      onClose();
    } catch (error) {
      console.error('Failed to save privacy preferences:', error);
      setValidationErrors(['Failed to save preferences. Please try again.']);
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = <K extends keyof PrivacyPreferences>(
    key: K,
    value: PrivacyPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setValidationErrors([]);
  };

  const getPrivacyLevelDescription = (level: PrivacyLevel) => {
    switch (level) {
      case PrivacyLevel.GIFTWRAPPED:
        return 'Maximum privacy with Cashu tokens and LNProxy routing';
      case PrivacyLevel.ENCRYPTED:
        return 'Balanced privacy with Fedimint and enhanced Lightning';
      case PrivacyLevel.MINIMAL:
        return 'Basic privacy with direct Lightning routing';
      default:
        return 'Standard privacy level';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-purple-900 rounded-2xl p-8 max-w-2xl w-full border border-yellow-400/20 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-purple-200 transition-colors duration-200"
        >
          <XCircle className="h-6 w-6" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-700 rounded-full flex items-center justify-center">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Privacy Preferences</h2>
            <p className="text-purple-200">Configure your Bitcoin privacy settings</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
                <div className="space-y-1">
                  {validationErrors.map((error, index) => (
                    <p key={index} className="text-red-200 text-sm">• {error}</p>
                  ))}
                </div>
              </div>
            )}
            {/* Secure Signing Session Preferences */}
            <div className="space-y-3">
              <label className="block text-white font-semibold">Secure Signing Session</label>
              <p className="text-purple-200 text-sm">
                By default, sessions last for the lifetime of this browser tab. Enable timeouts to increase security at the cost of convenience.
              </p>
              <div className="flex items-center space-x-2">
                <input
                  id="enableSessionTimeout"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={enableSessionTimeout}
                  onChange={(e) => setEnableSessionTimeout(e.target.checked)}
                />
                <label htmlFor="enableSessionTimeout" className="text-white">Enable session timeout</label>
              </div>
              {enableSessionTimeout && (
                <div className="flex items-center space-x-3">
                  <label className="text-purple-200 text-sm" htmlFor="customSessionTimeoutMinutes">
                    Timeout (minutes)
                  </label>
                  <input
                    id="customSessionTimeoutMinutes"
                    type="number"
                    min={1}
                    className="w-24 rounded-md border border-purple-700 bg-purple-800 text-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={customSessionTimeoutMinutes}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCustomSessionTimeoutMinutes(Number.isFinite(val) ? Math.max(1, Math.floor(val)) : 15);
                    }}
                  />
                  <span className="text-purple-300 text-xs">
                    Note: Enabling timeouts increases security but reduces convenience.
                  </span>
                </div>
              )}
            </div>


            {/* Default Privacy Level */}
            <div className="space-y-3">
              <label className="block text-white font-semibold">Default Privacy Level</label>
              <div className="space-y-2">
                {Object.values(PrivacyLevel).map((level) => (
                  <label key={level} className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="defaultPrivacyLevel"
                      value={level}
                      checked={preferences.default_privacy_level === level}
                      onChange={(e) => updatePreference('default_privacy_level', e.target.value as PrivacyLevel)}
                      className="mt-1 text-purple-600"
                    />
                    <div className="flex-1">
                      <div className="text-white font-medium capitalize">{level}</div>
                      <div className="text-purple-200 text-sm">{getPrivacyLevelDescription(level)}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Privacy Routing Preference */}
            <div className="space-y-3">
              <label className="block text-white font-semibold">Privacy Routing</label>
              <select
                value={preferences.privacy_routing_preference}
                onChange={(e) => updatePreference('privacy_routing_preference', e.target.value as 'always' | 'high_amounts' | 'never')}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-yellow-400"
              >
                <option value="always">Always use privacy routing</option>
                <option value="high_amounts">Only for high-value transactions</option>
                <option value="never">Never use privacy routing</option>
              </select>
            </div>

            {/* Auto-upgrade Threshold */}
            <div className="space-y-3">
              <label className="block text-white font-semibold">Auto-upgrade to Higher Privacy (sats)</label>
              <input
                type="number"
                value={preferences.auto_upgrade_threshold}
                onChange={(e) => updatePreference('auto_upgrade_threshold', parseInt(e.target.value) || 0)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-yellow-400"
                placeholder="100000"
              />
              <p className="text-purple-200 text-sm">
                Automatically upgrade to higher privacy levels for transactions above this amount
              </p>
            </div>

            {/* Guardian Approval Settings */}
            {(userRole === 'offspring' || userRole === 'adult') && (
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={preferences.require_guardian_approval}
                    onChange={(e) => updatePreference('require_guardian_approval', e.target.checked)}
                    disabled={userRole === 'offspring'}
                    className="text-purple-600"
                  />
                  <label className="text-white font-semibold">Require Guardian Approval</label>
                </div>

                {preferences.require_guardian_approval && (
                  <div className="ml-6 space-y-2">
                    <label className="block text-purple-200 text-sm">Approval threshold (sats)</label>
                    <input
                      type="number"
                      value={preferences.guardian_approval_threshold}
                      onChange={(e) => updatePreference('guardian_approval_threshold', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-yellow-400"
                      placeholder="500000"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Advanced Settings Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center space-x-2 text-purple-200 hover:text-white transition-colors"
            >
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span>Advanced Settings</span>
            </button>

            {/* Advanced Settings */}
            {showAdvanced && (
              <div className="space-y-4 pl-4 border-l-2 border-purple-600/30">
                <h4 className="text-white font-semibold">Privacy Features</h4>

                {/* Metadata Protection */}
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={preferences.metadata_protection}
                    onChange={(e) => updatePreference('metadata_protection', e.target.checked)}
                    className="text-purple-600"
                  />
                  <div>
                    <label className="text-white">Metadata Protection</label>
                    <p className="text-purple-200 text-sm">Hide transaction metadata from external observers</p>
                  </div>
                </div>

                {/* Transaction Unlinkability */}
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={preferences.transaction_unlinkability}
                    onChange={(e) => updatePreference('transaction_unlinkability', e.target.checked)}
                    className="text-purple-600"
                  />
                  <div>
                    <label className="text-white">Transaction Unlinkability</label>
                    <p className="text-purple-200 text-sm">Make transactions harder to link together</p>
                  </div>
                </div>

                <h4 className="text-white font-semibold pt-4">Routing Preferences</h4>

                {/* Cashu Preference */}
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={preferences.cashu_preference}
                    onChange={(e) => updatePreference('cashu_preference', e.target.checked)}
                    className="text-purple-600"
                  />
                  <div>
                    <label className="text-white">Enable Cashu eCash</label>
                    <p className="text-purple-200 text-sm">Use Cashu tokens for small, private payments</p>
                  </div>
                </div>

                {/* LNProxy Preference */}
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={preferences.lnproxy_preference}
                    onChange={(e) => updatePreference('lnproxy_preference', e.target.checked)}
                    className="text-purple-600"
                  />
                  <div>
                    <label className="text-white">Enable LNProxy Routing</label>
                    <p className="text-purple-200 text-sm">Route payments through LNProxy for enhanced privacy</p>
                  </div>
                </div>

                {/* Fedimint Preference */}
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={preferences.fedimint_preference}
                    onChange={(e) => updatePreference('fedimint_preference', e.target.checked)}
                    className="text-purple-600"
                  />
                  <div>
                    <label className="text-white">Enable Fedimint</label>
                    <p className="text-purple-200 text-sm">Use family federation for shared custody</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-4 pt-6">
              <button
                onClick={onClose}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreferences}
                disabled={saving || validationErrors.length > 0}
                className="flex-1 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                {saving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                <span>{saving ? "Saving..." : "Save Preferences"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrivacyPreferencesModal;