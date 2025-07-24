/**
 * Secure Nsec Hook
 * 
 * Manages secure nsec operations with client-side encryption and temporary storage
 * Implements privacy-first principles with automatic cleanup
 */

import { useState, useCallback, useEffect } from 'react';
import { EnhancedNostrManager } from '../../lib/enhanced-nostr-manager.js';

interface SecureNsecState {
  isStored: boolean;
  credentialId: string | null;
  expiresAt: Date | null;
  accessCount: number;
  isExpired: boolean;
}

interface UseSecureNsecReturn {
  // State
  state: SecureNsecState;
  
  // Actions
  storeNsec: (nsec: string, password: string, expirationHours?: number) => Promise<{
    success: boolean;
    credentialId?: string;
    message: string;
  }>;
  
  retrieveNsec: (password: string) => Promise<{
    success: boolean;
    nsec?: string;
    message: string;
  }>;
  
  clearNsec: () => Promise<void>;
  
  // Status
  isLoading: boolean;
  error: string | null;
}

export const useSecureNsec = (userId: string): UseSecureNsecReturn => {
  const [state, setState] = useState<SecureNsecState>({
    isStored: false,
    credentialId: null,
    expiresAt: null,
    accessCount: 0,
    isExpired: false,
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const nostrManager = new EnhancedNostrManager();

  // Check for existing stored credentials on mount
  useEffect(() => {
    const checkExistingCredentials = async () => {
      try {
        // This would check the database for existing credentials
        // For now, we'll assume no existing credentials
        setState(prev => ({
          ...prev,
          isStored: false,
          credentialId: null,
          expiresAt: null,
          accessCount: 0,
          isExpired: false,
        }));
      } catch (error) {
        console.error('Failed to check existing credentials:', error);
      }
    };

    checkExistingCredentials();
  }, [userId]);

  // Auto-cleanup expired credentials
  useEffect(() => {
    const cleanupExpired = async () => {
      if (state.credentialId && state.expiresAt && new Date() > state.expiresAt) {
        await clearNsec();
      }
    };

    const interval = setInterval(cleanupExpired, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [state.credentialId, state.expiresAt]);

  const storeNsec = useCallback(async (
    nsec: string,
    password: string,
    expirationHours: number = 24
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await nostrManager.storeNsecCredentialSecurely(
        userId,
        nsec,
        password,
        expirationHours
      );

      if (result.success) {
        const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
        
        setState({
          isStored: true,
          credentialId: result.credentialId,
          expiresAt,
          accessCount: 0,
          isExpired: false,
        });

        return {
          success: true,
          credentialId: result.credentialId,
          message: result.message,
        };
      } else {
        setError(result.message);
        return {
          success: false,
          message: result.message,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to store nsec';
      setError(errorMessage);
      return {
        success: false,
        message: errorMessage,
      };
    } finally {
      setIsLoading(false);
    }
  }, [userId, nostrManager]);

  const retrieveNsec = useCallback(async (password: string) => {
    if (!state.credentialId) {
      return {
        success: false,
        message: 'No stored credential found',
      };
    }

    if (state.isExpired) {
      return {
        success: false,
        message: 'Credential has expired',
      };
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await nostrManager.retrieveNsecCredentialTemporarily(
        userId,
        password,
        state.credentialId
      );

      if (result.success) {
        setState(prev => ({
          ...prev,
          accessCount: prev.accessCount + 1,
        }));

        return {
          success: true,
          nsec: result.nsec,
          message: result.message,
        };
      } else {
        setError(result.message);
        return {
          success: false,
          message: result.message,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve nsec';
      setError(errorMessage);
      return {
        success: false,
        message: errorMessage,
      };
    } finally {
      setIsLoading(false);
    }
  }, [userId, state.credentialId, state.isExpired, nostrManager]);

  const clearNsec = useCallback(async () => {
    if (!state.credentialId) return;

    try {
      await nostrManager.removeExpiredCredential(userId, state.credentialId);
      
      setState({
        isStored: false,
        credentialId: null,
        expiresAt: null,
        accessCount: 0,
        isExpired: false,
      });
      
      setError(null);
    } catch (error) {
      console.error('Failed to clear nsec:', error);
      setError('Failed to clear stored credential');
    }
  }, [userId, state.credentialId, nostrManager]);

  // Update expiration status
  useEffect(() => {
    if (state.expiresAt) {
      const isExpired = new Date() > state.expiresAt;
      if (isExpired !== state.isExpired) {
        setState(prev => ({
          ...prev,
          isExpired,
        }));
      }
    }
  }, [state.expiresAt, state.isExpired]);

  return {
    state,
    storeNsec,
    retrieveNsec,
    clearNsec,
    isLoading,
    error,
  };
};

export default useSecureNsec; 