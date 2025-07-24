/**
 * Credential Cleanup Hook
 *
 * Handles client-side cleanup of expired credentials
 * Runs cleanup checks on app initialization and periodically
 */

import { useCallback, useEffect } from "react";

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("../lib/supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

interface UseCredentialCleanupReturn {
  cleanupExpiredCredentials: () => Promise<{
    success: boolean;
    cleanedCount?: number;
    message: string;
  }>;
  isCleaning: boolean;
}

interface UseCredentialCleanupOptions {
  enabled?: boolean; // Only run cleanup when enabled (after authentication)
  autoRun?: boolean; // Whether to run cleanup automatically on mount
}

export const useCredentialCleanup = (
  options: UseCredentialCleanupOptions = {}
): UseCredentialCleanupReturn => {
  const { enabled = false, autoRun = false } = options;
  const cleanupExpiredCredentials = useCallback(async () => {
    try {
      console.log("🧹 Starting client-side credential cleanup...");

      // Call the database cleanup function using lazy client
      const client = await getSupabaseClient();
      const { data, error } = await client.rpc(
        "cleanup_expired_nostr_credentials"
      );

      if (error) {
        console.error("❌ Cleanup failed:", error);
        return {
          success: false,
          message: `Cleanup failed: ${error.message}`,
        };
      }

      console.log("✅ Client-side cleanup completed");
      return {
        success: true,
        cleanedCount: data || 0,
        message: "Expired credentials cleaned successfully",
      };
    } catch (error) {
      console.error("❌ Unexpected error during cleanup:", error);
      return {
        success: false,
        message: `Cleanup error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }, []);

  // Run cleanup on app initialization (only if enabled and autoRun is true)
  useEffect(() => {
    if (enabled && autoRun) {
      console.log("🔄 Auto-running credential cleanup (authenticated user)");
      cleanupExpiredCredentials();
    }
  }, [cleanupExpiredCredentials, enabled, autoRun]);

  // Set up periodic cleanup (every 30 minutes) - only when enabled
  useEffect(() => {
    if (!enabled) {
      return;
    }

    console.log("⏰ Setting up periodic credential cleanup (30 minutes)");
    const interval = setInterval(() => {
      console.log("🔄 Running periodic credential cleanup");
      cleanupExpiredCredentials();
    }, 30 * 60 * 1000); // 30 minutes

    return () => {
      console.log("🛑 Clearing periodic credential cleanup");
      clearInterval(interval);
    };
  }, [cleanupExpiredCredentials, enabled]);

  return {
    cleanupExpiredCredentials,
    isCleaning: false, // Could be enhanced with state management
  };
};

export default useCredentialCleanup;
