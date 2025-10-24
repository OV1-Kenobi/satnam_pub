/**
 * Visibility Mode Explainer Component
 * Phase 3: Public Profile URL System - UI Integration
 * 
 * Educational component explaining all 4 visibility modes with detailed
 * information about verification levels for trusted_contacts_only mode.
 */

import React, { useState } from 'react';
import { Eye, Lock, ShieldCheck, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { ProfileVisibility } from '../lib/services/profile-service';

interface VisibilityModeExplainerProps {
  currentMode?: ProfileVisibility;
  onModeSelect?: (mode: ProfileVisibility) => void;
  className?: string;
}

interface ModeDetails {
  value: ProfileVisibility;
  label: string;
  icon: React.ReactNode;
  shortDescription: string;
  detailedExplanation: string;
  useCases: string[];
  privacyLevel: 'Maximum' | 'High' | 'Medium' | 'Low';
  whoCanSee: string;
  color: string;
}

const VISIBILITY_MODES: ModeDetails[] = [
  {
    value: 'private',
    label: 'Private',
    icon: <Lock size={24} />,
    shortDescription: 'Only you can see your profile',
    detailedExplanation:
      'Your profile is completely hidden from everyone except you. This is the most private option and is recommended for users who want maximum privacy. Your profile will not appear in search results, and no one can view your profile information.',
    useCases: [
      'Maximum privacy and anonymity',
      'Testing profile changes before making them public',
      'Temporary privacy during sensitive periods',
      'Users who prefer complete control over their information',
    ],
    privacyLevel: 'Maximum',
    whoCanSee: 'Only you',
    color: 'gray',
  },
  {
    value: 'contacts_only',
    label: 'Contacts Only',
    icon: <Users size={24} />,
    shortDescription: 'Only your contacts can see your profile',
    detailedExplanation:
      'Your profile is visible only to people you have added as contacts. This provides a balance between privacy and discoverability within your trusted network. Contacts can view your profile information, but strangers cannot.',
    useCases: [
      'Sharing profile with known contacts only',
      'Building a trusted network',
      'Family and close friends communication',
      'Professional networking within known circles',
    ],
    privacyLevel: 'High',
    whoCanSee: 'Your contacts',
    color: 'blue',
  },
  {
    value: 'trusted_contacts_only',
    label: 'Trusted Contacts Only',
    icon: <ShieldCheck size={24} />,
    shortDescription: 'Only verified/trusted contacts can see your profile',
    detailedExplanation:
      'Your profile is visible only to contacts who have been verified through multiple verification methods. This is the most secure sharing option, requiring contacts to meet specific verification criteria before they can view your profile. Verification levels are automatically derived from verification flags.',
    useCases: [
      'High-security profile sharing',
      'Financial or sensitive information sharing',
      'Family federation members with verified identities',
      'Business relationships requiring strong verification',
    ],
    privacyLevel: 'High',
    whoCanSee: 'Verified/trusted contacts only',
    color: 'purple',
  },
  {
    value: 'public',
    label: 'Public',
    icon: <Eye size={24} />,
    shortDescription: 'Everyone can see your profile',
    detailedExplanation:
      'Your profile is visible to everyone on the internet. Anyone can view your profile information, and your profile will appear in search results. This is recommended for public figures, businesses, or users who want maximum discoverability.',
    useCases: [
      'Public figures and influencers',
      'Business profiles and services',
      'Content creators and educators',
      'Community leaders and organizers',
    ],
    privacyLevel: 'Low',
    whoCanSee: 'Everyone',
    color: 'green',
  },
];

const VERIFICATION_LEVELS = [
  {
    level: 'trusted',
    label: 'Trusted',
    description: 'Highest verification level',
    requirements: 'Physical MFA verified AND (SimpleProof OR Kind-0 verified)',
    color: 'text-yellow-400',
    icon: '🏆',
  },
  {
    level: 'verified',
    label: 'Verified',
    description: 'Strong verification level',
    requirements: 'Physical MFA verified OR (SimpleProof AND Kind-0 verified)',
    color: 'text-green-400',
    icon: '✓',
  },
  {
    level: 'basic',
    label: 'Basic',
    description: 'Minimal verification',
    requirements: 'Any single verification method completed',
    color: 'text-blue-400',
    icon: '○',
  },
  {
    level: 'unverified',
    label: 'Unverified',
    description: 'No verification',
    requirements: 'No verification methods completed',
    color: 'text-gray-400',
    icon: '—',
  },
];

export const VisibilityModeExplainer: React.FC<VisibilityModeExplainerProps> = ({
  currentMode,
  onModeSelect,
  className = '',
}) => {
  const [expandedMode, setExpandedMode] = useState<ProfileVisibility | null>(
    currentMode || null
  );
  const [showVerificationDetails, setShowVerificationDetails] = useState(false);

  const toggleMode = (mode: ProfileVisibility) => {
    setExpandedMode(expandedMode === mode ? null : mode);
  };

  const getColorClasses = (color: string, isExpanded: boolean) => {
    const colors = {
      gray: isExpanded
        ? 'border-gray-500 bg-gray-600/20'
        : 'border-gray-600 hover:border-gray-500',
      blue: isExpanded
        ? 'border-blue-500 bg-blue-600/20'
        : 'border-gray-600 hover:border-blue-500',
      purple: isExpanded
        ? 'border-purple-500 bg-purple-600/20'
        : 'border-gray-600 hover:border-purple-500',
      green: isExpanded
        ? 'border-green-500 bg-green-600/20'
        : 'border-gray-600 hover:border-green-500',
    };
    return colors[color as keyof typeof colors] || colors.gray;
  };

  return (
    <div className={`visibility-mode-explainer ${className}`}>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-white mb-2">
          Understanding Profile Visibility Modes
        </h3>
        <p className="text-gray-400 text-sm">
          Choose the visibility mode that best fits your privacy needs
        </p>
      </div>

      {/* Visibility Modes Accordion */}
      <div className="space-y-3 mb-6">
        {VISIBILITY_MODES.map((mode) => {
          const isExpanded = expandedMode === mode.value;
          const isCurrent = currentMode === mode.value;

          return (
            <div
              key={mode.value}
              className={`border-2 rounded-lg transition-all ${getColorClasses(
                mode.color,
                isExpanded
              )}`}
            >
              {/* Mode Header */}
              <button
                onClick={() => toggleMode(mode.value)}
                className="w-full p-4 text-left flex items-center justify-between"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className={`text-${mode.color}-400`}>{mode.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">{mode.label}</p>
                      {isCurrent && (
                        <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">{mode.shortDescription}</p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp size={20} className="text-gray-400" />
                ) : (
                  <ChevronDown size={20} className="text-gray-400" />
                )}
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4">
                  <div className="pt-2 border-t border-gray-700">
                    <p className="text-gray-300 text-sm mb-3">{mode.detailedExplanation}</p>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-gray-500 uppercase mb-1">Privacy Level</p>
                        <p className="text-sm font-semibold text-white">{mode.privacyLevel}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase mb-1">Who Can See</p>
                        <p className="text-sm font-semibold text-white">{mode.whoCanSee}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-2">Common Use Cases</p>
                      <ul className="space-y-1">
                        {mode.useCases.map((useCase, index) => (
                          <li key={index} className="text-sm text-gray-300 flex items-start gap-2">
                            <span className="text-purple-400 mt-0.5">•</span>
                            <span>{useCase}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {onModeSelect && !isCurrent && (
                      <button
                        onClick={() => onModeSelect(mode.value)}
                        className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                      >
                        Switch to {mode.label}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Verification Levels Explainer (for trusted_contacts_only mode) */}
      <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
        <button
          onClick={() => setShowVerificationDetails(!showVerificationDetails)}
          className="w-full flex items-center justify-between text-left"
        >
          <div>
            <p className="font-semibold text-purple-300 mb-1">
              Understanding Verification Levels
            </p>
            <p className="text-sm text-gray-400">
              Learn how contacts are verified for trusted_contacts_only mode
            </p>
          </div>
          {showVerificationDetails ? (
            <ChevronUp size={20} className="text-purple-400" />
          ) : (
            <ChevronDown size={20} className="text-purple-400" />
          )}
        </button>

        {showVerificationDetails && (
          <div className="mt-4 pt-4 border-t border-purple-500/30 space-y-3">
            {VERIFICATION_LEVELS.map((level) => (
              <div key={level.level} className="flex items-start gap-3">
                <span className="text-2xl">{level.icon}</span>
                <div className="flex-1">
                  <p className={`font-semibold ${level.color}`}>{level.label}</p>
                  <p className="text-xs text-gray-400 mb-1">{level.description}</p>
                  <p className="text-xs text-gray-500">
                    <strong>Requirements:</strong> {level.requirements}
                  </p>
                </div>
              </div>
            ))}
            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded">
              <p className="text-xs text-blue-300">
                <strong>Note:</strong> Verification levels are automatically derived from
                verification flags (Physical MFA, SimpleProof, Kind-0, PKARR, Iroh DHT). When you
                select "Trusted Contacts Only", only contacts with "verified" or "trusted" levels
                can view your profile.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VisibilityModeExplainer;

