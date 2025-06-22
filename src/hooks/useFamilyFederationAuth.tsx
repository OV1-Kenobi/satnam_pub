// Family Federation Authentication Hook with OTP Operations
// File: src/hooks/useFamilyFederationAuth.tsx

import { useState } from 'react';
import { useAuth } from '../components/auth/FamilyFederationAuth';
import { AuthResponse, FamilyFederationAuthHook, FamilyFederationUser, VerificationResponse } from '../types/auth';

export const useFamilyFederationAuth = (): FamilyFederationAuthHook => {
  const { isAuthenticated, isLoading, userAuth, login, logout, checkSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const sendOTP = async (npub: string, nip05?: string): Promise<void> => {
    setError(null);
    
    try {
      const response = await fetch('/api/auth/otp/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          npub: npub.trim(),
          nip05: nip05?.trim() || undefined
        })
      });
      
      const result: AuthResponse = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send OTP');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error. Please check your connection and try again.';
      setError(errorMessage);
      throw error;
    }
  };

  const verifyOTP = async (otpKey: string, otp: string): Promise<void> => {
    setError(null);
    
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          otpKey,
          otp: otp.trim()
        })
      });
      
      const result: VerificationResponse = await response.json();
      
      if (result.success && result.data?.authenticated) {
        const authData: FamilyFederationUser = {
          npub: result.data.userAuth.npub,
          nip05: result.data.userAuth.nip05,
          federationRole: result.data.userAuth.federationRole as 'parent' | 'child' | 'guardian',
          authMethod: result.data.userAuth.authMethod as 'nwc' | 'otp',
          isWhitelisted: result.data.userAuth.isWhitelisted,
          votingPower: result.data.userAuth.votingPower,
          guardianApproved: result.data.userAuth.guardianApproved,
          sessionToken: result.data.sessionToken
        };
        
        login(authData);
      } else {
        const errorMessage = result.error || 'Verification failed';
        if (result.attemptsRemaining !== undefined) {
          throw new Error(`${errorMessage} (${result.attemptsRemaining} attempts remaining)`);
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error during verification. Please try again.';
      setError(errorMessage);
      throw error;
    }
  };

  const refreshSession = async (): Promise<void> => {
    setError(null);
    
    try {
      const isValid = await checkSession();
      if (!isValid) {
        logout();
        throw new Error('Session expired. Please sign in again.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh session';
      setError(errorMessage);
      throw error;
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    isAuthenticated,
    isLoading,
    user: userAuth,
    sendOTP,
    verifyOTP,
    logout,
    refreshSession,
    error,
    clearError,
  };
};