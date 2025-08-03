/**
 * PRIVACY-FIRST React Hook for Client-Side Decryption
 * 
 * This hook provides client-side decryption capabilities for already-fetched encrypted data.
 * It does NOT interact with the database - use existing supabase client for that.
 * 
 * CORRECT USAGE PATTERN:
 * 1. Fetch encrypted data using existing supabase client
 * 2. Use this hook to decrypt the data for display only
 * 3. Keep decrypted data only in memory during session
 * 4. Clear decrypted data on logout
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  decryptUserProfile, 
  decryptMultipleProfiles,
  clearDecryptionCache,
  type EncryptedUserData,
  type DecryptedUserProfile 
} from '../lib/client-decryption';

export interface UseClientDecryptionReturn {
  decryptProfile: (encryptedData: EncryptedUserData, knownValues?: any) => Promise<DecryptedUserProfile>;
  decryptMultipleProfiles: (encryptedData: EncryptedUserData[]) => Promise<DecryptedUserProfile[]>;
  isDecrypting: boolean;
  decryptionError: string | null;
  clearCache: () => void;
}

/**
 * PRIVACY-FIRST: Client-side decryption hook
 * 
 * Use this hook to decrypt already-fetched encrypted user data.
 * This maintains separation between database operations and decryption.
 */
export function useClientDecryption(): UseClientDecryptionReturn {
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionError, setDecryptionError] = useState<string | null>(null);

  /**
   * Decrypt a single user profile
   */
  const decryptProfile = useCallback(async (
    encryptedData: EncryptedUserData,
    knownValues?: Partial<{
      username: string;
      bio: string;
      display_name: string;
      picture: string;
      npub: string;
      nip05: string;
      lightning_address: string;
    }>
  ): Promise<DecryptedUserProfile> => {
    setIsDecrypting(true);
    setDecryptionError(null);

    try {
      console.log('🔓 Starting client-side profile decryption...');
      const decryptedProfile = await decryptUserProfile(encryptedData, knownValues);
      console.log('✅ Profile decryption completed successfully');
      return decryptedProfile;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown decryption error';
      console.error('❌ Profile decryption failed:', errorMessage);
      setDecryptionError(errorMessage);
      throw error;
    } finally {
      setIsDecrypting(false);
    }
  }, []);

  /**
   * Decrypt multiple user profiles
   */
  const decryptProfiles = useCallback(async (
    encryptedData: EncryptedUserData[]
  ): Promise<DecryptedUserProfile[]> => {
    setIsDecrypting(true);
    setDecryptionError(null);

    try {
      console.log(`🔓 Starting batch decryption of ${encryptedData.length} profiles...`);
      const decryptedProfiles = await decryptMultipleProfiles(encryptedData);
      console.log('✅ Batch decryption completed successfully');
      return decryptedProfiles;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown batch decryption error';
      console.error('❌ Batch decryption failed:', errorMessage);
      setDecryptionError(errorMessage);
      throw error;
    } finally {
      setIsDecrypting(false);
    }
  }, []);

  /**
   * Clear decryption cache (call on logout)
   */
  const clearCache = useCallback(() => {
    console.log('🧹 Clearing client-side decryption cache...');
    clearDecryptionCache();
    setDecryptionError(null);
  }, []);

  return {
    decryptProfile,
    decryptMultipleProfiles: decryptProfiles,
    isDecrypting,
    decryptionError,
    clearCache
  };
}

/**
 * PRIVACY-FIRST: Hook for decrypting current user profile
 * 
 * This hook fetches the current user's encrypted profile and decrypts it.
 * It uses the existing supabase client and then decrypts client-side.
 */
export function useDecryptedCurrentUser() {
  const [decryptedProfile, setDecryptedProfile] = useState<DecryptedUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { decryptProfile, clearCache } = useClientDecryption();

  /**
   * Fetch and decrypt current user profile
   */
  const fetchAndDecryptProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Import supabase client dynamically to avoid circular dependencies
      const { supabase } = await import('../lib/supabase');
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setDecryptedProfile(null);
        return;
      }

      // Fetch encrypted profile using existing supabase client
      console.log('🔍 Fetching encrypted user profile...');
      const { data: encryptedProfile, error: fetchError } = await supabase
        .from('user_identities')
        .select('*')
        .eq('id', user.id)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch profile: ${fetchError.message}`);
      }

      if (!encryptedProfile) {
        throw new Error('No profile found for current user');
      }

      // Decrypt the profile client-side
      console.log('🔓 Decrypting user profile client-side...');
      const decrypted = await decryptProfile(encryptedProfile as EncryptedUserData);
      setDecryptedProfile(decrypted);
      console.log('✅ Current user profile decrypted successfully');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Failed to fetch and decrypt current user profile:', errorMessage);
      setError(errorMessage);
      setDecryptedProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [decryptProfile]);

  /**
   * Logout and clear decrypted data
   */
  const logout = useCallback(async () => {
    try {
      // Import supabase client dynamically
      const { supabase } = await import('../lib/supabase');
      
      // Sign out from Supabase
      await supabase.auth.signOut();
      
      // Clear decrypted data from memory
      setDecryptedProfile(null);
      clearCache();
      
      console.log('✅ Logout completed - all decrypted data cleared');
    } catch (err) {
      console.error('❌ Logout error:', err);
    }
  }, [clearCache]);

  // Fetch profile on mount
  useEffect(() => {
    fetchAndDecryptProfile();
  }, [fetchAndDecryptProfile]);

  return {
    decryptedProfile,
    isLoading,
    error,
    refetch: fetchAndDecryptProfile,
    logout
  };
}

/**
 * PRIVACY-FIRST: Hook for decrypting user profile by ID
 */
export function useDecryptedUserProfile(userId: string | null) {
  const [decryptedProfile, setDecryptedProfile] = useState<DecryptedUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { decryptProfile } = useClientDecryption();

  /**
   * Fetch and decrypt user profile by ID
   */
  const fetchAndDecryptProfile = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Import supabase client dynamically
      const { supabase } = await import('../lib/supabase');
      
      // Fetch encrypted profile using existing supabase client
      console.log('🔍 Fetching encrypted user profile by ID:', id);
      const { data: encryptedProfile, error: fetchError } = await supabase
        .from('user_identities')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch profile: ${fetchError.message}`);
      }

      if (!encryptedProfile) {
        throw new Error(`No profile found for user: ${id}`);
      }

      // Decrypt the profile client-side
      console.log('🔓 Decrypting user profile client-side...');
      const decrypted = await decryptProfile(encryptedProfile as EncryptedUserData);
      setDecryptedProfile(decrypted);
      console.log('✅ User profile decrypted successfully');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Failed to fetch and decrypt user profile:', errorMessage);
      setError(errorMessage);
      setDecryptedProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [decryptProfile]);

  // Fetch profile when userId changes
  useEffect(() => {
    if (userId) {
      fetchAndDecryptProfile(userId);
    } else {
      setDecryptedProfile(null);
      setError(null);
      setIsLoading(false);
    }
  }, [userId, fetchAndDecryptProfile]);

  return {
    decryptedProfile,
    isLoading,
    error,
    refetch: userId ? () => fetchAndDecryptProfile(userId) : undefined
  };
}
