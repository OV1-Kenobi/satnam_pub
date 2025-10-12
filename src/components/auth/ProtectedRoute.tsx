/**
 * Protected Route Component
 * 
 * Provides route-level authentication protection for sensitive areas.
 * Integrates with the unified authentication system to ensure only
 * verified users with active accounts can access protected features.
 */

import { AlertTriangle, Lock, RefreshCw, Shield } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ProtectedArea, useUnifiedAuth } from '../../lib/auth/unified-auth-system';

interface ProtectedRouteProps {
  children: React.ReactNode;
  area: ProtectedArea;
  fallbackPath?: string;
  showAuthPrompt?: boolean;
  customAuthComponent?: React.ComponentType<{
    onAuthSuccess: () => void;
    requiredArea: ProtectedArea;
  }>;
}

interface AuthPromptProps {
  area: ProtectedArea;
  onAuthSuccess: () => void;
  onCancel: () => void;
}

/**
 * Authentication prompt component for protected routes
 */
const AuthPrompt: React.FC<AuthPromptProps> = ({ area, onAuthSuccess, onCancel }) => {
  const auth = useUnifiedAuth();
  const [authMethod, setAuthMethod] = useState<'nip05' | 'nip07' | null>(null);
  const [nip05, setNip05] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleNIP05Auth = async () => {
    if (!nip05.trim() || !password.trim()) {
      return;
    }

    const success = await auth.authenticateNIP05Password(nip05, password);
    if (success) {
      onAuthSuccess();
    }
  };

  const handleNIP07Auth = async () => {
    try {
      // Do not invoke NIP-07 during Identity Forge registration flow
      if (typeof window !== 'undefined' && (window as any).__identityForgeRegFlow) {
        console.warn('[Diag][ProtectedRoute] NIP-07 blocked: registration flow active');
        if (typeof console !== 'undefined' && typeof console.trace === 'function') console.trace('[Diag][ProtectedRoute] stack');
        return;
      }

      if (!window.nostr) {
        auth.clearError();
        return;
      }

      if (!password.trim()) {
        return;
      }

      console.warn('[Diag][ProtectedRoute] calling window.nostr.getPublicKey()');
      const pubkey = await window.nostr.getPublicKey();
      const challenge = `auth-challenge-${Date.now()}-${Math.random()}`;

      const event = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['challenge', challenge]],
        content: `Authentication Challenge for ${area}: ${challenge}`,
        pubkey
      };

      const signedEvent = await window.nostr.signEvent(event);
      const success = await auth.authenticateNIP07(challenge, signedEvent.sig, pubkey);

      if (success) {
        onAuthSuccess();
      }
    } catch (error) {
      console.error('NIP-07 authentication failed:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">
            Authentication Required
          </h2>
        </div>

        <div className="mb-4">
          <p className="text-gray-600">
            Access to <span className="font-medium">{area}</span> requires authentication.
            Please sign in to continue.
          </p>
        </div>

        {auth.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-red-700 text-sm">{auth.error}</span>
            </div>
          </div>
        )}

        {!authMethod && (
          <div className="space-y-3">
            <button
              onClick={() => setAuthMethod('nip05')}
              className="w-full p-3 border border-gray-300 rounded-md hover:bg-gray-50 text-left"
            >
              <div className="font-medium">NIP-05 / Password</div>
              <div className="text-sm text-gray-600">Sign in with your identifier and password</div>
            </button>

            <button
              onClick={() => setAuthMethod('nip07')}
              className="w-full p-3 border border-gray-300 rounded-md hover:bg-gray-50 text-left"
            >
              <div className="font-medium">Browser Extension (NIP-07)</div>
              <div className="text-sm text-gray-600">Sign in with your Nostr browser extension</div>
            </button>
          </div>
        )}

        {authMethod === 'nip05' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                NIP-05 Identifier
              </label>
              <input
                type="text"
                value={nip05}
                onChange={(e) => setNip05(e.target.value)}
                placeholder="username@my.satnam.pub"
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleNIP05Auth}
                disabled={auth.loading || !nip05.trim() || !password.trim()}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {auth.loading && <RefreshCw className="h-4 w-4 animate-spin" />}
                Sign In
              </button>
              <button
                onClick={() => setAuthMethod(null)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {authMethod === 'nip07' && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-blue-800 text-sm">
                <strong>Enhanced Security:</strong> NIP-07 now requires your password for maximum encryption and privacy protection.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password for maximum security"
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Minor inconvenience for maximum privacy and security. Without your password, your data cannot be decrypted.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleNIP07Auth}
                disabled={auth.loading || !password.trim()}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {auth.loading && <RefreshCw className="h-4 w-4 animate-spin" />}
                Authenticate with Extension
              </button>
              <button
                onClick={() => setAuthMethod(null)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="w-full text-gray-600 hover:text-gray-800 text-sm"
          >
            Cancel and return to previous page
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Protected Route Component
 * Wraps components that require authentication
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  area,
  fallbackPath = '/',
  showAuthPrompt = true,
  customAuthComponent: CustomAuthComponent
}) => {
  const auth = useUnifiedAuth();
  const location = useLocation();
  const [showPrompt, setShowPrompt] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    checkAuthentication();
  }, [area, auth.authenticated, auth.loading]);

  const checkAuthentication = async () => {
    if (auth.loading) {
      return; // Wait for auth to finish loading
    }

    const hasAccess = await auth.requireAuthentication(area);

    if (hasAccess) {
      setShowPrompt(false);
      setAuthChecked(true);
    } else {
      if (showAuthPrompt) {
        setShowPrompt(true);
      }
      setAuthChecked(true);
    }
  };

  const handleAuthSuccess = () => {
    setShowPrompt(false);
    // Re-check authentication after successful auth
    checkAuthentication();
  };

  const handleAuthCancel = () => {
    setShowPrompt(false);
    // Navigate to fallback path
  };

  // Show loading while checking authentication
  if (auth.loading || !authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
          <span className="text-gray-600">Verifying authentication...</span>
        </div>
      </div>
    );
  }

  // Show authentication prompt if required and enabled
  if (showPrompt && showAuthPrompt) {
    if (CustomAuthComponent) {
      return (
        <CustomAuthComponent
          onAuthSuccess={handleAuthSuccess}
          requiredArea={area}
        />
      );
    }

    return (
      <AuthPrompt
        area={area}
        onAuthSuccess={handleAuthSuccess}
        onCancel={handleAuthCancel}
      />
    );
  }

  // Check if user has access
  if (!auth.canAccessProtectedArea(area)) {
    // If no auth prompt, redirect to fallback
    if (!showAuthPrompt) {
      return <Navigate to={fallbackPath} state={{ from: location }} replace />;
    }

    // Show access denied message
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-4">
          <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Access Restricted
          </h2>
          <p className="text-gray-600 mb-6">
            You need to be authenticated to access this area.
          </p>
          <button
            onClick={() => setShowPrompt(true)}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // User has access - render protected content
  return <>{children}</>;
};

export default ProtectedRoute;
