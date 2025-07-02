// Privacy Controls Component for Satnam.pub
// File: src/components/privacy/PrivacyControls.tsx
// Provides user-configurable privacy level controls

import { Eye, EyeOff, Lock, Shield, Users } from 'lucide-react';
import React from 'react';
import { PrivacyLevel } from '../types/privacy';

interface PrivacyControlsProps {
  currentLevel: PrivacyLevel;
  onLevelChange: (level: PrivacyLevel) => void;
  userRole: 'adult' | 'child' | 'guardian';
  showMetrics?: boolean;
  privacyMetrics?: {
    transactionsRouted: number;
    privacyScore: number;
    lnproxyUsage: number;
    cashuPrivacy: number;
  };
}

interface PrivacyLevelOption {
  id: PrivacyLevel;
  label: string;
  description: string;
  icon: React.ReactNode;
  roles: string[];
}

// Get available privacy levels based on user role
function getAvailablePrivacyLevels(userRole: string): PrivacyLevelOption[] {
  const allLevels: PrivacyLevelOption[] = [
    {
      id: PrivacyLevel.MINIMAL,
      label: 'Minimal Privacy',
      description: 'Basic privacy with direct Lightning routing',
      icon: <Eye className="h-4 w-4" />,
      roles: ['adult', 'guardian']
    },
    {
      id: PrivacyLevel.ENCRYPTED,
      label: 'Enhanced Privacy',
      description: 'Balanced privacy with Fedimint and enhanced Lightning',
      icon: <Users className="h-4 w-4" />,
      roles: ['adult', 'child', 'guardian']
    },
    {
      id: PrivacyLevel.GIFTWRAPPED,
      label: 'Maximum Privacy',
      description: 'Maximum privacy with Cashu tokens and LNProxy routing',
      icon: <Lock className="h-4 w-4" />,
      roles: ['adult', 'child', 'guardian']
    }
  ];

  return allLevels.filter(level => level.roles.includes(userRole));
}

// Privacy Score Indicator
function PrivacyScoreIndicator({ score }: { score: number }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    return 'Needs Improvement';
  };

  return (
    <div className="flex items-center space-x-2">
      <div className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(score)}`}>
        {Math.round(score)}% {getScoreLabel(score)}
      </div>
      <Shield className="h-4 w-4 text-purple-500" />
    </div>
  );
}

// Main Privacy Controls Component
export function PrivacyControls({ 
  currentLevel, 
  onLevelChange, 
  userRole, 
  showMetrics = false,
  privacyMetrics 
}: PrivacyControlsProps) {
  const availableLevels = getAvailablePrivacyLevels(userRole);

  return (
    <div className="privacy-controls bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-purple-700 rounded-full flex items-center justify-center">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div>
            <h4 className="font-semibold text-purple-900">Privacy Level</h4>
            <p className="text-sm text-purple-700">Control your transaction visibility</p>
          </div>
        </div>
        {showMetrics && privacyMetrics && (
          <PrivacyScoreIndicator score={privacyMetrics.privacyScore} />
        )}
      </div>

      {/* Privacy Level Selection */}
      <div className="space-y-3">
        {availableLevels.map(level => (
          <label key={level.id} className="block">
            <div className={`p-3 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
              currentLevel === level.id
                ? 'border-purple-500 bg-white shadow-md'
                : 'border-purple-200 bg-purple-50/50 hover:border-purple-300 hover:bg-white/50'
            }`}>
              <div className="flex items-center space-x-3">
                <input
                  type="radio"
                  checked={currentLevel === level.id}
                  onChange={() => onLevelChange(level.id)}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <div className="flex items-center space-x-2">
                  <span className="text-purple-600">{level.icon}</span>
                  <span className="font-medium text-gray-900">{level.label}</span>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-2 ml-6">{level.description}</p>
            </div>
          </label>
        ))}
      </div>

      {/* Privacy Metrics */}
      {showMetrics && privacyMetrics && (
        <div className="mt-4 pt-4 border-t border-purple-200">
          <h5 className="text-sm font-semibold text-purple-900 mb-3">Privacy Metrics</h5>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded-lg border border-purple-100">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">LN Proxy</span>
                <EyeOff className="h-3 w-3 text-green-500" />
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {privacyMetrics.lnproxyUsage}
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-purple-100">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Cashu Privacy</span>
                <Shield className="h-3 w-3 text-blue-500" />
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {privacyMetrics.cashuPrivacy}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Tips */}
      <div className="mt-4 p-3 bg-purple-100 rounded-lg border border-purple-200">
        <div className="flex items-start space-x-2">
          <Shield className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-purple-900">Privacy Tip</p>
            <p className="text-xs text-purple-700 mt-1">
              {currentLevel === PrivacyLevel.GIFTWRAPPED && "Using maximum privacy with LN Proxy routing and Cashu ecash"}
              {currentLevel === PrivacyLevel.ENCRYPTED && "Balancing family transparency with external privacy"}
              {currentLevel === PrivacyLevel.MINIMAL && "Using basic privacy with direct Lightning routing"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrivacyControls;