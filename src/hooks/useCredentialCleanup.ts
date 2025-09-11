/**
 * Credential Cleanup Hook
 *
 * Handles client-side cleanup of expired credentials
 * Runs cleanup checks on app initialization and periodically
 */

import { useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";

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

  // If the schema isn't present in the target Supabase project, disable cleanup to avoid console errors.
  let cleanupDisabled = false;

  const cleanupExpiredCredentials = useCallback(async () => {
    try {
      if (cleanupDisabled) {
        return {
          success: true,
          cleanedCount: 0,
          message: "Cleanup disabled (schema not deployed)",
        };
      }

      console.log("🧹 Starting client-side credential cleanup...");

      // Prefer count-returning variant for observability; fall back to legacy name
      let rpcName = "cleanup_expired_nostr_credentials_count";
      let { data, error } = await supabase.rpc(rpcName);

      // Backward compatibility: if new RPC is missing, try the legacy function
      if (error) {
        const msg = error.message || "";
        const code = (error as any).code || "";
        const missing =
          code === "42P01" ||
          msg.includes("does not exist") ||
          msg.includes("relation") ||
          msg.includes("not found");
        if (missing) {
          // Try legacy RPC (may return void); if still missing, disable gracefully
          rpcName = "cleanup_expired_nostr_credentials";
          ({ data, error } = await supabase.rpc(rpcName));
        }
      }

      if (error) {
        // Gracefully disable if function/table is missing in current environment
        const msg = error.message || "";
        const code = (error as any).code || "";
        if (
          code === "42P01" ||
          msg.includes("does not exist") ||
          msg.includes("relation") ||
          msg.includes("not found")
        ) {
          console.warn(
            "⚠️ Credential cleanup disabled: schema/migration not deployed in this environment."
          );
          cleanupDisabled = true;
          return {
            success: true,
            cleanedCount: 0,
            message: "Cleanup disabled (schema not deployed)",
          };
        }

        console.error("❌ Cleanup failed:", error);
        return { success: false, message: `Cleanup failed: ${msg}` };
      }

      console.log("✅ Client-side cleanup completed");
      return {
        success: true,
        cleanedCount: (data as number) || 0,
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
    if (!enabled) return;

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

  return { cleanupExpiredCredentials, isCleaning: false };
};

export default useCredentialCleanup;
