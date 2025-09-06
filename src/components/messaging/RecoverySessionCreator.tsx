/**
 * Recovery Session Creator
 * 
 * UI component for creating temporary signing sessions using emergency recovery credentials.
 * Integrates with the Recovery Session Bridge to enable session-based signing for users
 * who authenticate via NIP-05/password instead of NIP-07 browser extensions.
 */

import React, { useState } from 'react';
import { recoverySessionBridge, RecoverySessionOptions } from '../../lib/auth/recovery-session-bridge';
import { Shield, Clock, AlertTriangle, CheckCircle, Eye, EyeOff, Key } from 'lucide-react';

interface RecoverySessionCreatorProps {
  onSessionCreated?: (sessionId: string) => void;
  onCancel?: () => void;
  className?: string;
  showAdvancedOptions?: boolean;
}

export const RecoverySessionCreator: React.FC<RecoverySessionCreatorProps> = ({
  onSessionCreated,
  onCancel,
  className = '',
  showAdvancedOptions = false
}) => {
  const [step, setStep] = useState<'credentials' | 'options' | 'creating' | 'success' | 'error'>('credentials');
  const [credentials, setCredentials] = useState({
    nip05: '',
    password: ''
  });
  const [options, setOptions] = useState<RecoverySessionOptions>({
    duration: 15 * 60 * 1000, // 15 minutes
    maxOperations: 50,
    requireConfirmation: true
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>('');
  const [sessionInfo, setSessionInfo] = useState<{
    sessionId: string;
    expiresAt: Date;
    securityLevel: string;
  } | null>(null);

  const handleCreateSession = async () => {
    if (!credentials.nip05.trim() || !credentials.password.trim()) {
      setError('Please provide both NIP-05 and password');
      return;
    }

    setStep('creating');
    setError('');

    try {
      const result = await recoverySessionBridge.createSessionFromRecovery(
        {
          nip05: credentials.nip05.trim(),
          password: credentials.password
        },
        options
      );

      if (result.success && result.sessionId) {
        setSessionInfo({
          sessionId: result.sessionId,
          expiresAt: result.expiresAt!,
          securityLevel: result.securityLevel || 'high'
        });
        setStep('success');
        onSessionCreated?.(result.sessionId);
      } else {
        setError(result.userMessage || result.error || 'Failed to create session');
        setStep('error');
      }
    } catch (error) {
      console.error('🔐 RecoverySessionCreator: Session creation failed:', error);
      setError('Failed to create signing session. Please try again.');
      setStep('error');
    }
  };

  const formatDuration = (ms: number): string => {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  };

  const renderCredentialsStep = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
          <Key className="w-6 h-6 text-blue-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Create Signing Session</h3>
        <p className="text-sm text-gray-600 mt-2">
          Use your recovery credentials to create a temporary session for message signing
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            NIP-05 Identifier
          </label>
          <input
            type="text"
            value={credentials.nip05}
            onChange={(e) => setCredentials(prev => ({ ...prev, nip05: e.target.value }))}
            placeholder="username@domain.com"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={step === 'creating'}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={credentials.password}
              onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
              placeholder="Enter your password"
              className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={step === 'creating'}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {showAdvancedOptions && (
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Session Options</h4>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Session Duration: {formatDuration(options.duration || 15 * 60 * 1000)}
                </label>
                <input
                  type="range"
                  min={5 * 60 * 1000} // 5 minutes
                  max={60 * 60 * 1000} // 1 hour
                  step={5 * 60 * 1000} // 5 minute steps
                  value={options.duration || 15 * 60 * 1000}
                  onChange={(e) => setOptions(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Max Operations: {options.maxOperations}
                </label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={10}
                  value={options.maxOperations || 50}
                  onChange={(e) => setOptions(prev => ({ ...prev, maxOperations: parseInt(e.target.value) }))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-700">{error}</div>
          </div>
        </div>
      )}

      <div className="flex space-x-3 pt-4">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            disabled={step === 'creating'}
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleCreateSession}
          disabled={step === 'creating' || !credentials.nip05.trim() || !credentials.password.trim()}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {step === 'creating' ? 'Creating Session...' : 'Create Session'}
        </button>
      </div>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="text-center space-y-4">
      <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
        <CheckCircle className="w-6 h-6 text-green-600" />
      </div>
      
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Session Created Successfully</h3>
        <p className="text-sm text-gray-600 mt-2">
          Your secure signing session is now active
        </p>
      </div>

      {sessionInfo && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-left">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Security Level:</span>
              <span className="font-medium text-green-700 capitalize">{sessionInfo.securityLevel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Expires:</span>
              <span className="font-medium text-gray-900">
                {sessionInfo.expiresAt.toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Session ID:</span>
              <span className="font-mono text-xs text-gray-600">
                {sessionInfo.sessionId.substring(0, 8)}...
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-start space-x-2">
          <Shield className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-700">
            Your session is now active and can be used for secure message signing. 
            The session will automatically expire for your security.
          </div>
        </div>
      </div>

      <button
        onClick={onCancel}
        className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
      >
        Close
      </button>
    </div>
  );

  const renderErrorStep = () => (
    <div className="text-center space-y-4">
      <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-red-600" />
      </div>
      
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Session Creation Failed</h3>
        <p className="text-sm text-gray-600 mt-2">{error}</p>
      </div>

      <div className="flex space-x-3">
        <button
          onClick={() => {
            setStep('credentials');
            setError('');
          }}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className={`bg-white rounded-lg p-6 max-w-md w-full ${className}`}>
      {step === 'credentials' && renderCredentialsStep()}
      {step === 'creating' && (
        <div className="text-center py-8">
          <div className="animate-spin mx-auto w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
          <p className="text-gray-600">Creating secure session...</p>
        </div>
      )}
      {step === 'success' && renderSuccessStep()}
      {step === 'error' && renderErrorStep()}
    </div>
  );
};

export default RecoverySessionCreator;
