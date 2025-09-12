/**
 * Authentication Integration Components
 *
 * Provides seamless integration between the unified authentication system
 * and existing Identity Forge (registration) and Nostrich Signin (login) components.
 *
 * SECURITY ARCHITECTURE:
 * - Uses zero-knowledge DUID-based authentication (no plaintext credential storage)
 * - Credentials are passed to auth system which immediately generates DUIDs and hashes
 * - Database stores only hashed identities (hashed_nip05, password_hash with salts)
 * - O(1) authentication using deterministic DUIDs generated from npub + password
 * - Browser-only Web Crypto API for all cryptographic operations
 * - No plaintext credentials ever stored or logged anywhere in the system
 */

import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { cloneElement, useEffect, useState, type FC, type ReactElement, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useIdentityForge, useNostrichSignin } from './AuthProvider';

import { createRecoverySession } from '../../lib/auth/recovery-session-bridge';

interface AuthIntegrationProps {
  children: ReactNode;
  onAuthSuccess?: (destination?: 'individual' | 'family') => void;
  onAuthFailure?: (error: string) => void;
}

/**
 * Identity Forge Integration
 * Wraps Identity Forge component to integrate with unified auth
 */
export const IdentityForgeIntegration: FC<AuthIntegrationProps> = ({
  children,
  onAuthSuccess,
  onAuthFailure
}) => {
  const auth = useAuth();
  const identityForge = useIdentityForge();
  const navigate = useNavigate();
  // Set registration flow when component mounts
  useEffect(() => {
    identityForge.setRegistrationFlow(true);

    return () => {
      identityForge.setRegistrationFlow(false);
    };
  }, []);

  // Handle successful registration
  const handleRegistrationSuccess = async (userData: {
    nip05: string;
    password: string;
    [key: string]: any;
  }) => {
    try {
      // Post-registration auth already handled by registration flow using returned token
      const authSuccess = auth.authenticated;

      if (authSuccess) {
        // Initialize NSEC session for hybrid message signing (if nsec available)
        try {
          // Note: In a real implementation, you'd get the nsec from the registration flow
          // For now, we'll just log that session-based signing setup is needed
          console.log('🔐 AuthIntegration: Registration successful, NSEC session setup needed for message signing');

          // TODO: If nsec is available from registration, initialize session:
          // const sessionId = await nsecSessionBridge.initializeAfterAuth(userNsec);
          // console.log('🔐 AuthIntegration: NSEC session initialized:', sessionId);
        } catch (nsecError) {
          console.warn('🔐 AuthIntegration: Failed to initialize NSEC session:', nsecError);
          // Don't fail the entire auth flow for NSEC session issues
        }

        identityForge.completeRegistration();
        onAuthSuccess?.('individual'); // Default to individual for new users

        // Navigate to appropriate dashboard
        navigate('/profile', { replace: true });
      } else {
        onAuthFailure?.(auth.error || 'Authentication failed after registration');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration authentication failed';
      onAuthFailure?.(errorMessage);
    }
  };

  // Handle registration failure
  const handleRegistrationFailure = (error: string) => {
    identityForge.completeRegistration();
    onAuthFailure?.(error);
  };

  return (
    <div className="relative">
      {/* Registration Status Indicator */}
      {identityForge.isRegistrationFlow && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-blue-600" />
            <span className="text-blue-800 text-sm font-medium">
              Registration in progress...
            </span>
          </div>
        </div>
      )}

      {/* Authentication Error Display */}
      {auth.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-red-700 text-sm">{auth.error}</span>
          </div>
        </div>
      )}

      {/* Success Indicator */}
      {auth.authenticated && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-green-800 text-sm font-medium">
              Registration and authentication successful!
            </span>
          </div>
        </div>
      )}

      {/* Wrap children with registration handlers */}
      {cloneElement(children as ReactElement, {
        onRegistrationSuccess: handleRegistrationSuccess,
        onRegistrationFailure: handleRegistrationFailure,
        isAuthenticating: auth.loading,
        authError: auth.error
      })}
    </div>
  );
};

/**
 * Nostrich Signin Integration
 * Wraps Nostrich Signin component to integrate with unified auth
 */
export const NostrichSigninIntegration: FC<AuthIntegrationProps> = ({
  children,
  onAuthSuccess,
  onAuthFailure
}) => {
  const auth = useAuth();
  const nostrichSignin = useNostrichSignin();
  const navigate = useNavigate();
  const location = useLocation();

  // Set login flow when component mounts
  useEffect(() => {
    nostrichSignin.setLoginFlow(true);

    return () => {
      nostrichSignin.setLoginFlow(false);
    };
  }, []);

  // Handle successful authentication
  const handleAuthSuccess = async (destination?: 'individual' | 'family') => {
    try {
      console.log('🔐 AuthIntegration: Signin successful, creating secure session');
      // Attempt automatic secure session creation via recovery bridge using stored signin context
      // We don't have plaintext password here; session creation is handled directly in the modal flow (NIP05PasswordAuth)
      // This handler focuses on navigation only to avoid duplicating sensitive flows
    } catch (nsecError) {
      console.warn('🔐 AuthIntegration: Session setup note:', nsecError);
    }

    nostrichSignin.completeLogin();
    onAuthSuccess?.(destination);

    // Respect intended destination from route state
    const from = (location.state as any)?.from?.pathname || '/';
    navigate(from, { replace: true });
  };

  // Handle authentication failure
  const handleAuthFailure = (error: string) => {
    nostrichSignin.completeLogin();
    onAuthFailure?.(error);
  };

  // Handle NIP-05/Password authentication
  const handleNIP05Auth = async (nip05: string, password: string) => {
    try {
      // SECURITY: Credentials are immediately processed by unified auth system
      // - Generates DUID from nip05 for O(1) database lookup
      // - Uses PBKDF2-SHA512 for password verification with timing-safe comparison
      // - No plaintext credentials stored - all processing in zero-knowledge architecture
      const success = await nostrichSignin.authenticateNIP05Password(nip05, password);

      if (success) {
        // Immediately create a secure signing session (default 15 minutes)
        try {
          const session = await createRecoverySession({ nip05: nip05.trim(), password }, { duration: 15 * 60 * 1000 });
          if (!session.success) {
            console.warn('🔐 AuthIntegration: Auto session creation failed:', session.error);
          } else {
            await new Promise((r) => setTimeout(r, 50));
          }
        } catch (sessErr) {
          console.warn('🔐 AuthIntegration: Auto session creation threw:', sessErr);
        }
        handleAuthSuccess('individual');
      } else {
        handleAuthFailure(auth.error || 'NIP-05/Password authentication failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      handleAuthFailure(errorMessage);
    }
  };

  // Handle NIP-07 authentication
  const handleNIP07Auth = async (challenge: string, signature: string, pubkey: string, password: string) => {
    try {
      // SECURITY: NIP-07 + password hybrid authentication
      // - Converts pubkey to npub and generates same DUID as NIP-05/Password method
      // - Cryptographic signature verification ensures key ownership
      // - Password still required for database lookup consistency
      // - Zero-knowledge: no browser extension keys ever stored server-side
      const success = await nostrichSignin.authenticateNIP07(challenge, signature, pubkey);

      if (success) {
        handleAuthSuccess('individual');
      } else {
        handleAuthFailure(auth.error || 'NIP-07 authentication failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'NIP-07 authentication failed';
      handleAuthFailure(errorMessage);
    }
  };

  return (
    <div className="relative">
      {/* Login Status Indicator */}
      {nostrichSignin.isLoginFlow && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-blue-600" />
            <span className="text-blue-800 text-sm font-medium">
              Authentication in progress...
            </span>
          </div>
        </div>
      )}

      {/* Authentication Error Display */}
      {auth.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-red-700 text-sm">{auth.error}</span>
          </div>
        </div>
      )}

      {/* Success Indicator */}
      {auth.authenticated && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-green-800 text-sm font-medium">
              Authentication successful!
            </span>
          </div>
        </div>
      )}

      {/* Wrap children with authentication handlers */}
      {cloneElement(children as ReactElement, {
        onNIP05Auth: handleNIP05Auth,
        onNIP07Auth: handleNIP07Auth,
        onAuthSuccess: handleAuthSuccess,
        onAuthFailure: handleAuthFailure,
        isAuthenticating: auth.loading,
        authError: auth.error
      })}
    </div>
  );
};

/**
 * Session Monitor Component
 * Monitors session health and provides user feedback
 */
export const SessionMonitor: FC = () => {
  const auth = useAuth();
  const [showSessionWarning, setShowSessionWarning] = useState(false);

  // Monitor session validity
  useEffect(() => {
    if (auth.authenticated && !auth.sessionValid) {
      setShowSessionWarning(true);

      // Auto-hide warning after 10 seconds
      const timer = setTimeout(() => {
        setShowSessionWarning(false);
      }, 10000);

      return () => clearTimeout(timer);
    } else {
      setShowSessionWarning(false);
    }
  }, [auth.authenticated, auth.sessionValid]);

  // Handle session refresh
  const handleRefreshSession = async () => {
    const success = await auth.refreshSession();
    if (success) {
      setShowSessionWarning(false);
    }
  };

  if (!showSessionWarning) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 bg-yellow-50 border border-yellow-200 rounded-lg shadow-lg p-4 max-w-sm z-50">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-medium text-yellow-800 mb-1">
            Session Warning
          </h4>
          <p className="text-yellow-700 text-sm mb-3">
            Your session may have expired. Some features may not work properly.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRefreshSession}
              disabled={auth.loading}
              className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700 disabled:opacity-50"
            >
              {auth.loading ? 'Refreshing...' : 'Refresh Session'}
            </button>
            <button
              onClick={() => setShowSessionWarning(false)}
              className="text-yellow-600 px-3 py-1 rounded text-sm hover:bg-yellow-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Authentication Guard Component
 * Provides a simple way to protect any component
 */
interface AuthGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  requireActive?: boolean;
}

export const AuthGuard: FC<AuthGuardProps> = ({
  children,
  fallback,
  requireActive = true
}) => {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!auth.authenticated || (requireActive && !auth.accountActive)) {
    return fallback || (
      <div className="text-center p-8">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Authentication Required
        </h3>
        <p className="text-gray-600">
          Please sign in to access this content.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export default {
  IdentityForgeIntegration,
  NostrichSigninIntegration,
  SessionMonitor,
  AuthGuard
};
