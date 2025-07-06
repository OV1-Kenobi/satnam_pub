/**
 * Credential Cleanup Hook
 * 
 * Handles client-side cleanup of expired credentials
 * Runs cleanup checks on app initialization and periodically
 */

import { useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface UseCredentialCleanupReturn {
  cleanupExpiredCredentials: () => Promise<{
    success: boolean;
    cleanedCount?: number;
    message: string;
  }>;
  isCleaning: boolean;
}

export const useCredentialCleanup = (): UseCredentialCleanupReturn => {
  const cleanupExpiredCredentials = useCallback(async () => {
    try {
      console.log('🧹 Starting client-side credential cleanup...');

      // Call the database cleanup function
      const { data, error } = await supabase.rpc('cleanup_expired_nostr_credentials');

      if (error) {
        console.error('❌ Cleanup failed:', error);
        return {
          success: false,
          message: `Cleanup failed: ${error.message}`,
        };
      }

      console.log('✅ Client-side cleanup completed');
      return {
        success: true,
        cleanedCount: data || 0,
        message: 'Expired credentials cleaned successfully',
      };
    } catch (error) {
      console.error('❌ Unexpected error during cleanup:', error);
      return {
        success: false,
        message: `Cleanup error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }, []);

  // Run cleanup on app initialization
  useEffect(() => {
    cleanupExpiredCredentials();
  }, [cleanupExpiredCredentials]);

  // Set up periodic cleanup (every 30 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      cleanupExpiredCredentials();
    }, 30 * 60 * 1000); // 30 minutes

    return () => clearInterval(interval);
  }, [cleanupExpiredCredentials]);

  return {
    cleanupExpiredCredentials,
    isCleaning: false, // Could be enhanced with state management
  };
};

export default useCredentialCleanup; 