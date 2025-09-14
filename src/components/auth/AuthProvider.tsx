/**
 * Authentication Provider
 *
 * Provides unified authentication context throughout the application.
 * Integrates with Identity Forge (registration) and Nostrich Signin (login)
 * while maintaining privacy-first architecture with comprehensive protection.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type FC, type ReactNode } from 'react';
// Removed direct import to break circular dependency - will be loaded dynamically
import { UnifiedAuthActions, UnifiedAuthState, useUnifiedAuth } from '../../lib/auth/unified-auth-system';

import { getVaultFeatureFlags } from '../../lib/auth/client-session-vault';
import { setPassphraseProvider } from '../../lib/auth/passphrase-provider';
import PassphraseVaultModal from './PassphraseVaultModal';

// Authentication context type
type AuthContextType = UnifiedAuthState & UnifiedAuthActions & {
  // Integration helpers
  isRegistrationFlow: boolean;
  isLoginFlow: boolean;
  setIsRegistrationFlow: (isRegistration: boolean) => void;
  setIsLoginFlow: (isLogin: boolean) => void;
};

// Safe lazy context initialization to avoid production bundling/runtime edge cases
let AuthContextRef: ReturnType<typeof createContext<AuthContextType | null>> | null = null;

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Authentication Provider Component
 * Wraps the entire application to provide authentication state
 */
export const AuthProvider: FC<AuthProviderProps> = ({ children }) => {
  const auth = useUnifiedAuth();
  const [isRegistrationFlow, setIsRegistrationFlow] = useState(false);
  const [isLoginFlow, setIsLoginFlow] = useState(false);

  // Lazily ensure context exists; if createContext fails, render children without provider to avoid white screen
  const ContextOrNull = useMemo(() => {
    if (AuthContextRef) return AuthContextRef;
    try {
      AuthContextRef = createContext<AuthContextType | null>(null);
      return AuthContextRef;
    } catch (e) {
      console.error('[AuthProvider] createContext failed; running without provider for landing page:', e);
      return null;
    }
  }, []);

  // ClientSessionVault PBKDF2 passphrase modal wiring
  const [vaultOpen, setVaultOpen] = useState(false);
  const vaultResolverRef = useRef<((value: string | null) => void) | null>(null);

  // Install real passphrase provider only for users who opted-in via vault feature flags
  const installVaultPassphraseProvider = useCallback(() => {
    setPassphraseProvider(() => {
      return new Promise<string | null>((resolve) => {
        vaultResolverRef.current = resolve;
        setVaultOpen(true);
      });
    });
  }, []);

  useEffect(() => {
    try {
      const flags = getVaultFeatureFlags();
      if (flags?.passphraseEnabled) {
        installVaultPassphraseProvider();
      }
    } catch {
      // Ignore errors when reading flags; provider remains uninstalled by default
    }
    // We intentionally install once on mount when enabled; toggling can be handled elsewhere.
  }, [installVaultPassphraseProvider]);
  // Removed passphrase provider setup from app startup - only needed when vault is actually used

  // Monitor authentication state changes
  useEffect(() => {
    if (auth.authenticated) {
      // Clear flow states when authenticated
      setIsRegistrationFlow(false);
      setIsLoginFlow(false);
    }
  }, [auth.authenticated]);

  // Monitor account status
  useEffect(() => {
    if (auth.authenticated && !auth.accountActive) {
      console.warn('User account is inactive - logging out');
      auth.logout();
    }
  }, [auth.authenticated, auth.accountActive, auth.logout]);

  // Monitor session validity
  useEffect(() => {
    if (auth.authenticated && !auth.sessionValid) {
      console.warn('Session is invalid - attempting refresh');
      auth.refreshSession().then(success => {
        if (!success) {
          console.warn('Session refresh failed - logging out');
          auth.logout();
        }
      });
    }
  }, [auth.authenticated, auth.sessionValid, auth.refreshSession, auth.logout]);

  const contextValue: AuthContextType = {
    ...auth,
    isRegistrationFlow,
    isLoginFlow,
    setIsRegistrationFlow,
    setIsLoginFlow
  };

  if (!ContextOrNull) {
    // No provider available; render children directly for unauthenticated landing page
    return <>{children}</>;
  }

  return (
    <ContextOrNull.Provider value={contextValue}>
      {children}
      <PassphraseVaultModal
        open={vaultOpen}
        onSubmit={(passphrase) => {
          vaultResolverRef.current?.(passphrase);
          vaultResolverRef.current = null;
          setVaultOpen(false);
        }}
        onCancel={() => {
          vaultResolverRef.current?.(null);
          vaultResolverRef.current = null;
          setVaultOpen(false);
        }}
      />
    </ContextOrNull.Provider>
  );
};

/**
 * Hook to use authentication context
 */
export const useAuth = (): AuthContextType => {
  if (!AuthContextRef) {
    // Provide a minimal stub in routes that mount before the provider is available
    return {
      // UnifiedAuthState (safe defaults)
      authenticated: false,
      accountActive: false,
      sessionValid: false,
      loading: false,
      user: null as any,
      error: null,
      lastValidated: null as any,
      // UnifiedAuthActions (no-ops)
      authenticateNIP05Password: async () => false,
      authenticateNIP07: async () => false,
      refreshSession: async () => false,
      logout: () => { },
      clearError: () => { },
      // Integration helpers
      isRegistrationFlow: false,
      isLoginFlow: false,
      setIsRegistrationFlow: () => { },
      setIsLoginFlow: () => { },
    } as AuthContextType;
  }
  const context = useContext(AuthContextRef);
  if (!context) {
    // Should not happen when provider is set; return the same stub
    return {
      authenticated: false,
      accountActive: false,
      sessionValid: false,
      loading: false,
      user: null as any,
      error: null,
      lastValidated: null as any,
      authenticateNIP05Password: async () => false,
      authenticateNIP07: async () => false,
      refreshSession: async () => false,
      logout: () => { },
      clearError: () => { },
      isRegistrationFlow: false,
      isLoginFlow: false,
      setIsRegistrationFlow: () => { },
      setIsLoginFlow: () => { },
    } as AuthContextType;
  }
  return context;
};

/**
 * Hook for Identity Forge integration (registration)
 */
export const useIdentityForge = () => {
  const auth = useAuth();

  return {
    // Registration state
    isRegistrationFlow: auth.isRegistrationFlow,
    setRegistrationFlow: auth.setIsRegistrationFlow,

    // Post-registration authentication using unified flow (sets HttpOnly refresh cookie)
    authenticateAfterRegistration: async (nip05: string, password: string) => {
      try {
        const success = await auth.authenticateNIP05Password(nip05, password);
        if (success) auth.setIsRegistrationFlow(false);
        return success;
      } catch {
        return false;
      }
    },

    // Registration completion
    completeRegistration: () => {
      auth.setIsRegistrationFlow(false);
    }
  };
};

/**
 * Hook for Nostrich Signin integration (login)
 */
export const useNostrichSignin = () => {
  const auth = useAuth();

  return {
    // Login state
    isLoginFlow: auth.isLoginFlow,
    setLoginFlow: auth.setIsLoginFlow,

    // Authentication methods
    authenticateNIP05Password: async (nip05: string, password: string) => {
      auth.setIsLoginFlow(true);
      const success = await auth.authenticateNIP05Password(nip05, password);
      if (success) {
        auth.setIsLoginFlow(false);
      }
      return success;
    },

    authenticateNIP07: async (challenge: string, signature: string, pubkey: string) => {
      auth.setIsLoginFlow(true);
      const success = await auth.authenticateNIP07(challenge, signature, pubkey);
      if (success) {
        auth.setIsLoginFlow(false);
      }
      return success;
    },

    // Login completion
    completeLogin: () => {
      auth.setIsLoginFlow(false);
    }
  };
};

/**
 * Higher-order component for protected components
 */
export const withAuth = <P extends object>(
  Component: ComponentType<P>
): FC<P> => {
  return (props: P) => {
    const auth = useAuth();

    if (!auth.authenticated) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Authentication Required
            </h2>
            <p className="text-gray-600">
              Please sign in to access this component.
            </p>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
};

/**
 * Authentication status component for debugging
 */
export const AuthStatus: FC = () => {
  const auth = useAuth();

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-xs max-w-xs">
      <div className="font-semibold mb-2">Auth Status (Dev)</div>
      <div className="space-y-1">
        <div>Authenticated: {auth.authenticated ? '✅' : '❌'}</div>
        <div>Account Active: {auth.accountActive ? '✅' : '❌'}</div>
        <div>Session Valid: {auth.sessionValid ? '✅' : '❌'}</div>
        <div>Loading: {auth.loading ? '⏳' : '✅'}</div>
        {auth.user && (
          <div>User ID: {auth.user.id.substring(0, 8)}...</div>
        )}
        {auth.error && (
          <div className="text-red-600">Error: {auth.error}</div>
        )}
        {auth.lastValidated && (
          <div>
            Last Validated: {new Date(auth.lastValidated).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthProvider;
