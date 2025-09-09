/**
 * Signing Status Indicator
 * 
 * Real-time status indicator that shows current signing method availability,
 * session expiration timers, and provides quick actions for users.
 * Integrates with Privacy & Security Control panels.
 */

import { AlertTriangle, CheckCircle, Clock, RefreshCw, Settings, Shield, Wrench, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { nsecSessionBridge } from '../../lib/auth/nsec-session-bridge';
import { recoverySessionBridge } from '../../lib/auth/recovery-session-bridge';
import { hybridMessageSigning } from '../../lib/messaging/hybrid-message-signing';
import { UserSigningPreferences } from '../../lib/user-signing-preferences';

interface SigningStatusIndicatorProps {
  showDetails?: boolean;
  showQuickActions?: boolean;
  onOpenSettings?: () => void;
  className?: string;
}

export const SigningStatusIndicator: React.FC<SigningStatusIndicatorProps> = ({
  showDetails = true,
  showQuickActions = true,
  onOpenSettings,
  className = ''
}) => {
  const [preferences] = useState<UserSigningPreferences | null>(null);
  const [availableMethods, setAvailableMethods] = useState<any[]>([]);
  const [sessionStatus, setSessionStatus] = useState<any>(null);
  const [currentMethod, setCurrentMethod] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsedTime, setElapsedTime] = useState<string>('');
  const [fixingSigning, setFixingSigning] = useState(false);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000); // Update every 30 seconds
    const timeInterval = setInterval(updateElapsedTime, 1000); // Update time every second

    return () => {
      clearInterval(interval);
      clearInterval(timeInterval);
    };
  }, []);

  const loadStatus = async () => {
    try {
      setLoading(true);

      // For now, skip user preferences and just load available methods
      console.log('🔐 SigningStatusIndicator: Loading signing status...');

      // Load available methods from hybrid signing
      const methods = await hybridMessageSigning.getAvailableSigningMethods();
      setAvailableMethods(methods);
      console.log('🔐 SigningStatusIndicator: Available methods:', methods);

      // Get session status
      const status = nsecSessionBridge.getSessionStatus();
      setSessionStatus(status);
      console.log('🔐 SigningStatusIndicator: Session status:', status);

      // Determine current active method (simple logic for now)
      const sessionMethod = methods.find(m => m.id === 'session');
      const nip07Method = methods.find(m => m.id === 'nip07');

      if (sessionMethod?.available) {
        setCurrentMethod(sessionMethod);
        console.log('🔐 SigningStatusIndicator: Using session method');
      } else if (nip07Method?.available) {
        setCurrentMethod(nip07Method);
        console.log('🔐 SigningStatusIndicator: Using NIP-07 method');
      } else {
        setCurrentMethod(null);
        console.log('🔐 SigningStatusIndicator: No methods available');
      }

    } catch (error) {
      console.error('🔐 SigningStatusIndicator: Error loading status:', error);
      // Set some default state so the component still renders
      setAvailableMethods([]);
      setCurrentMethod(null);
    } finally {
      setLoading(false);
    }
  };

  const updateElapsedTime = () => {
    if (sessionStatus?.hasSession && currentMethod?.id === 'session') {
      const start = sessionStatus?.createdAt ? Number(sessionStatus.createdAt) : null;
      if (start) {
        const diff = Math.max(0, Date.now() - start);
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        const mm = String(minutes).padStart(2, '0');
        const ss = String(seconds).padStart(2, '0');
        setElapsedTime(`${mm}:${ss}`);
      } else {
        setElapsedTime('');
      }
    } else {
      setElapsedTime('');
    }
  };

  const handleRefresh = () => {
    loadStatus();
  };

  const handleFixSigning = async () => {
    try {
      setFixingSigning(true);
      // Fetch server user payload
      const resp = await fetch('/api/auth/session-user', { method: 'GET', credentials: 'include' });
      if (!resp.ok) {
        console.warn('Fix signing: session-user fetch failed', resp.status);
        return;
      }
      const json = await resp.json().catch(() => null) as { success?: boolean; data?: { user?: any } } | null;
      const u = json?.data?.user;
      if (!u || !(u.user_salt && u.encrypted_nsec)) {
        console.warn('Fix signing: insufficient user payload for session creation');
        return;
      }
      const session = await recoverySessionBridge.createRecoverySessionFromUser(u, { duration: 15 * 60 * 1000 });
      if (!session.success) {
        console.warn('Fix signing: session creation failed', session.error);
      }
    } catch (e) {
      console.warn('Fix signing: error', e);
    } finally {
      setFixingSigning(false);
      await loadStatus();
    }
  };

  const getStatusColor = () => {
    if (!currentMethod) return 'text-red-600 bg-red-100';
    if (currentMethod.securityLevel === 'maximum') return 'text-green-600 bg-green-100';
    if (currentMethod.securityLevel === 'high') return 'text-blue-600 bg-blue-100';
    return 'text-yellow-600 bg-yellow-100';
  };

  const getStatusIcon = () => {
    if (!currentMethod) return AlertTriangle;
    if (currentMethod.securityLevel === 'maximum') return Shield;
    if (currentMethod.securityLevel === 'high') return CheckCircle;
    return Clock;
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

  const StatusIcon = getStatusIcon();

  return (
    <div className={`${className}`}>
      {/* Main Status Display */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-full ${getStatusColor()}`}>
            <StatusIcon className="w-4 h-4" />
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-900">
                {currentMethod ? currentMethod.name : 'No Signing Method'}
              </span>
              {currentMethod && (
                <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor()}`}>
                  {currentMethod.securityLevel}
                </span>
              )}
            </div>

            {showDetails && (
              <div className="text-xs text-gray-500 mt-1">
                {currentMethod ? (
                  <span>
                    {currentMethod.description}
                    {elapsedTime && ` • active for ${elapsedTime}`}
                  </span>
                ) : (
                  'Message signing unavailable'
                )}
              </div>
            )}
          </div>
        </div>

        {showQuickActions && (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              title="Refresh status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Fix Signing quick action - visible when no session method is active */}
            {!sessionStatus?.hasSession && (
              <button
                onClick={handleFixSigning}
                className={`p-1 rounded ${fixingSigning ? 'text-blue-400' : 'text-gray-400 hover:text-gray-600'}`}
                title="Create signing session"
                disabled={fixingSigning}
              >
                <Wrench className={`w-4 h-4 ${fixingSigning ? 'animate-spin' : ''}`} />
              </button>
            )}

            {onOpenSettings && (
              <button
                onClick={() => {
                  console.log('🔐 SigningStatusIndicator: Settings button clicked');
                  onOpenSettings();
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                title="Open signing settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Detailed Status (when expanded) */}
      {showDetails && (
        <div className="mt-4 space-y-3">
          {/* Current Method Details */}
          {currentMethod && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">Active Method</span>
                <span className="text-xs text-gray-500">
                  {preferences?.preferredMethod === currentMethod.id ? 'Preferred' : 'Fallback'}
                </span>
              </div>

              <div className="text-sm text-gray-700">
                <p>{currentMethod.description}</p>
                {currentMethod.id === 'session' && elapsedTime && (
                  <p className="mt-1 text-blue-600">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Session active for {elapsedTime}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* No Method Available */}
          {!currentMethod && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-red-900 mb-1">No Signing Method Available</p>
                  <p className="text-red-700">
                    {preferences?.preferredMethod === 'session'
                      ? 'Create a secure session to enable message signing'
                      : 'Install a NIP-07 browser extension or create a secure session'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {showQuickActions && (
            <div className="flex space-x-2">
              {!sessionStatus?.hasSession && (
                <button
                  onClick={handleFixSigning}
                  disabled={fixingSigning}
                  className={`flex items-center space-x-1 px-3 py-2 text-xs rounded-lg transition-colors ${fixingSigning ? 'bg-blue-200 text-blue-600' : 'bg-blue-100 text-blue-800 hover:bg-blue-200'}`}
                  title="Create signing session"
                >
                  <Zap className={`w-3 h-3 ${fixingSigning ? 'animate-spin' : ''}`} />
                  <span>{fixingSigning ? 'Creating…' : 'Fix signing'}</span>
                </button>
              )}

              {!availableMethods.find(m => m.id === 'nip07')?.available && (
                <a
                  href="https://getalby.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-1 px-3 py-2 text-xs bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200 transition-colors"
                >
                  <Shield className="w-3 h-3" />
                  <span>Install Extension</span>
                </a>
              )}
            </div>
          )}

          {/* Method Availability Summary */}
          <div className="border-t border-gray-200 pt-3">
            <div className="text-xs text-gray-500 mb-2">Available Methods:</div>
            <div className="grid grid-cols-3 gap-2">
              {availableMethods.map(method => (
                <div
                  key={method.id}
                  className={`text-center p-2 rounded text-xs ${method.available
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                    }`}
                >
                  <div className="font-medium">{method.name}</div>
                  <div className="mt-1">
                    {method.available ? (
                      <CheckCircle className="w-3 h-3 mx-auto text-green-600" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 mx-auto text-gray-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SigningStatusIndicator;
