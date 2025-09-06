/**
 * Message Signing Status Component
 * 
 * Displays the current signing method status and provides user education
 * about security levels. Integrates with hybrid signing system to show
 * real-time availability of different signing methods.
 */

import React, { useState, useEffect } from 'react';
import { clientMessageService } from '../../lib/messaging/client-message-service';
import { SigningMethodInfo } from '../../lib/messaging/hybrid-message-signing';

interface MessageSigningStatusProps {
  onMethodChange?: (methodId: string) => void;
  showEducation?: boolean;
  className?: string;
}

const SecurityLevelIndicator: React.FC<{ level: string; method: string }> = ({ level, method }) => {
  const getIndicatorConfig = (level: string) => {
    switch (level) {
      case 'maximum':
        return {
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-200',
          icon: '🛡️',
          label: 'Maximum Security'
        };
      case 'high':
        return {
          color: 'text-blue-600',
          bgColor: 'bg-blue-100',
          borderColor: 'border-blue-200',
          icon: '🔒',
          label: 'High Security'
        };
      case 'medium':
        return {
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
          borderColor: 'border-yellow-200',
          icon: '⚠️',
          label: 'Medium Security'
        };
      default:
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200',
          icon: '❓',
          label: 'Unknown Security'
        };
    }
  };

  const config = getIndicatorConfig(level);

  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${config.bgColor} ${config.color} ${config.borderColor}`}>
      <span className="mr-1">{config.icon}</span>
      <span>{config.label}</span>
      {method && (
        <span className="ml-2 text-xs opacity-75">({method})</span>
      )}
    </div>
  );
};

export const MessageSigningStatus: React.FC<MessageSigningStatusProps> = ({
  onMethodChange,
  showEducation = true,
  className = ''
}) => {
  const [methods, setMethods] = useState<SigningMethodInfo[]>([]);
  const [currentMethod, setCurrentMethod] = useState<SigningMethodInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSigningStatus = async () => {
      try {
        setLoading(true);
        setError(null);

        const availableMethods = await clientMessageService.getAvailableSigningMethods();
        setMethods(availableMethods);

        // Find the best available method
        const bestMethod = availableMethods.find(m => m.available && !m.comingSoon && m.securityLevel === 'maximum') ||
                          availableMethods.find(m => m.available && !m.comingSoon && m.securityLevel === 'high') ||
                          availableMethods.find(m => m.available && !m.comingSoon);

        setCurrentMethod(bestMethod || null);

        if (bestMethod) {
          onMethodChange?.(bestMethod.id);
        }
      } catch (err) {
        console.error('Failed to load signing status:', err);
        setError('Failed to check signing methods');
      } finally {
        setLoading(false);
      }
    };

    loadSigningStatus();
  }, [onMethodChange]);

  const handleRefresh = () => {
    setLoading(true);
    // Trigger a re-check of signing methods
    window.location.reload();
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="flex items-center space-x-3">
          <div className="w-4 h-4 bg-gray-300 rounded-full"></div>
          <div className="h-4 bg-gray-300 rounded w-32"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-red-600 text-sm ${className}`}>
        <div className="flex items-center space-x-2">
          <span>⚠️</span>
          <span>{error}</span>
          <button
            onClick={handleRefresh}
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Current Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              currentMethod ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className="text-sm font-medium text-gray-900">
              Message Signing Status
            </span>
          </div>
          
          {currentMethod && (
            <SecurityLevelIndicator 
              level={currentMethod.securityLevel} 
              method={currentMethod.name}
            />
          )}
        </div>

        <button
          onClick={handleRefresh}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          Refresh
        </button>
      </div>

      {/* Status Message */}
      <div className="mb-4">
        {currentMethod ? (
          <div className="text-sm text-gray-700">
            <span className="font-medium">Active:</span> {currentMethod.description}
          </div>
        ) : (
          <div className="text-sm text-red-600">
            <span className="font-medium">No signing methods available.</span> Please install a NIP-07 extension or sign in.
          </div>
        )}
      </div>

      {/* Education Section */}
      {showEducation && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">
            Security Hierarchy (Best to Least Secure)
          </h4>
          
          <div className="space-y-2 text-xs text-blue-800">
            {methods.map((method, index) => (
              <div key={method.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-medium">{index + 1}.</span>
                  <span>{method.name}</span>
                  {method.comingSoon && (
                    <span className="text-purple-600 font-medium">(Coming Soon)</span>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <SecurityLevelIndicator level={method.securityLevel} method="" />
                  <div className={`w-2 h-2 rounded-full ${
                    method.available && !method.comingSoon ? 'bg-green-500' : 'bg-gray-400'
                  }`}></div>
                </div>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          <div className="mt-3 pt-3 border-t border-blue-200">
            <div className="text-xs text-blue-700">
              <strong>💡 Recommendations:</strong>
              <ul className="mt-1 space-y-1 ml-4">
                <li>• Install a NIP-07 browser extension for maximum security</li>
                <li>• Sign in to enable convenient session-based signing</li>
                <li>• NFC Physical MFA will provide ultimate security (coming soon)</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {!currentMethod && (
        <div className="mt-4 flex space-x-2">
          <a
            href="https://getalby.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-2 text-xs bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition-colors"
          >
            <span className="mr-1">⚡</span>
            Install Alby Extension
          </a>
          
          <button
            onClick={() => {
              // Trigger sign-in modal or redirect
              window.dispatchEvent(new CustomEvent('openSignInModal'));
            }}
            className="inline-flex items-center px-3 py-2 text-xs bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 transition-colors"
          >
            <span className="mr-1">🔑</span>
            Sign In
          </button>
        </div>
      )}
    </div>
  );
};

export default MessageSigningStatus;
