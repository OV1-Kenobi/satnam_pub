/**
 * PRIVACY-FIRST Decrypted User Context
 * 
 * This context manages decrypted user data in memory during the user session.
 * It maintains strict privacy principles:
 * - Decrypted data exists ONLY in browser memory
 * - No persistent storage of decrypted data
 * - Automatic cleanup on logout/session end
 * - Uses existing supabase client for database operations
 */

import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useDecryptedCurrentUser } from '../hooks/useClientDecryption';
import type { DecryptedUserProfile } from '../lib/client-decryption';

interface DecryptedUserContextType {
  // Current user data (decrypted)
  user: DecryptedUserProfile | null;

  // Loading and error states
  isLoading: boolean;
  error: string | null;

  // Actions
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;

  // Session management
  isAuthenticated: boolean;
}

const DecryptedUserContext = React.createContext<DecryptedUserContextType | undefined>(undefined);

/**
 * PRIVACY-FIRST: Decrypted User Provider
 * 
 * Provides decrypted user data to the entire application while maintaining
 * strict privacy principles and zero-knowledge architecture.
 */
export function DecryptedUserProvider({ children }: { children: React.ReactNode }) {
  const {
    decryptedProfile,
    isLoading,
    error,
    refetch,
    logout: performLogout
  } = useDecryptedCurrentUser();

  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Update authentication state based on decrypted profile
  useEffect(() => {
    setIsAuthenticated(!!decryptedProfile);
  }, [decryptedProfile]);

  /**
   * Refresh current user data
   */
  const refreshUser = useCallback(async () => {
    console.log('🔄 Refreshing decrypted user data...');
    await refetch();
  }, [refetch]);

  /**
   * Logout and clear all decrypted data
   */
  const logout = useCallback(async () => {
    console.log('🚪 Logging out and clearing decrypted data...');
    await performLogout();
    setIsAuthenticated(false);
  }, [performLogout]);

  // Monitor authentication state changes
  useEffect(() => {
    const setupAuthListener = async () => {
      // Import supabase client dynamically
      const { supabase } = await import('../lib/supabase');

      // Listen for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('🔐 Auth state changed:', event);

          if (event === 'SIGNED_OUT' || !session) {
            // Clear decrypted data on sign out
            setIsAuthenticated(false);
          } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            // Refresh decrypted data on sign in or token refresh
            await refreshUser();
          }
        }
      );

      return () => {
        subscription.unsubscribe();
      };
    };

    setupAuthListener();
  }, [refreshUser]);

  const contextValue: DecryptedUserContextType = {
    user: decryptedProfile,
    isLoading,
    error,
    refreshUser,
    logout,
    isAuthenticated
  };

  return (
    <DecryptedUserContext.Provider value={contextValue}>
      {children}
    </DecryptedUserContext.Provider>
  );
}

/**
 * Hook to use decrypted user context
 */
export function useDecryptedUser(): DecryptedUserContextType {
  const context = useContext(DecryptedUserContext);

  if (context === undefined) {
    throw new Error('useDecryptedUser must be used within a DecryptedUserProvider');
  }

  return context;
}

/**
 * PRIVACY-FIRST: Component wrapper that requires authentication
 * 
 * This component ensures that children only render when user is authenticated
 * and decrypted user data is available.
 */
export function RequireDecryptedAuth({
  children,
  fallback
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, user } = useDecryptedUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Decrypting user data...</span>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return fallback || (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-gray-600">Please sign in to access this content.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * PRIVACY-FIRST: Hook for accessing specific user profile fields
 * 
 * This hook provides easy access to specific decrypted user profile fields
 * while maintaining the privacy-first architecture.
 */
export function useDecryptedUserField<K extends keyof DecryptedUserProfile>(
  field: K
): DecryptedUserProfile[K] | null {
  const { user } = useDecryptedUser();
  return user ? user[field] : null;
}

/**
 * PRIVACY-FIRST: Hook for checking user permissions
 * 
 * This hook provides role-based access control using decrypted user data.
 */
export function useUserPermissions() {
  const { user } = useDecryptedUser();

  const hasRole = useCallback((role: string): boolean => {
    return user?.role === role;
  }, [user?.role]);

  const isPrivateUser = useCallback((): boolean => {
    return user?.role === 'private';
  }, [user?.role]);

  const isOffspring = useCallback((): boolean => {
    return user?.role === 'offspring';
  }, [user?.role]);

  const isAdult = useCallback((): boolean => {
    return user?.role === 'adult';
  }, [user?.role]);

  const isSteward = useCallback((): boolean => {
    return user?.role === 'steward';
  }, [user?.role]);

  const isGuardian = useCallback((): boolean => {
    return user?.role === 'guardian';
  }, [user?.role]);

  return {
    hasRole,
    isPrivateUser,
    isOffspring,
    isAdult,
    isSteward,
    isGuardian,
    role: user?.role || null
  };
}

/**
 * PRIVACY-FIRST: Hook for user profile display data
 * 
 * This hook provides commonly needed profile display data.
 */
export function useUserDisplayData() {
  const { user } = useDecryptedUser();

  return {
    username: user?.username || '',
    displayName: user?.display_name || user?.username || '',
    bio: user?.bio || '',
    picture: user?.picture || '',
    nip05: user?.nip05 || '',
    lightningAddress: user?.lightning_address || '',
    isActive: user?.is_active || false
  };
}
