/**
 * Rate Limit Cleanup Script
 *
 * This script cleans up expired rate limit records from the database.
 * It can be run as a scheduled job (e.g., via cron or GitHub Actions)
 * to maintain database performance and storage efficiency.
 */

import { supabase } from "../lib/supabase.js";
import { defaultLogger as logger } from "../utils/logger.js";

/**
 * Clean up expired rate limit records
 */
async function cleanupExpiredRateLimits(): Promise<void> {
  try {
    logger.info("Starting rate limit cleanup...");

    const { data, error } = await supabase.rpc("cleanup_expired_rate_limits");

    if (error) {
      logger.error("Error during rate limit cleanup:", error);
      throw error;
    }

    const deletedCount = data as number;
    logger.info(
      `Rate limit cleanup completed. Deleted ${deletedCount} expired records.`
    );
  } catch (error) {
    logger.error("Failed to cleanup expired rate limits:", error as any);
    throw error;
  }
}

/**
 * Get rate limit statistics
 */
async function getRateLimitStats(): Promise<void> {
  try {
    logger.info("Fetching rate limit statistics...");

    // Get total count of rate limit records
    const { count: totalRecords, error: countError } = await supabase
      .from("rate_limits")
      .select("*", { count: "exact", head: true });

    if (countError) {
      logger.error("Error fetching total count:", countError);
      return;
    }

    // Get count of expired records
    const { count: expiredRecords, error: expiredError } = await supabase
      .from("rate_limits")
      .select("*", { count: "exact", head: true })
      .lt("reset_time", new Date().toISOString());

    if (expiredError) {
      logger.error("Error fetching expired count:", expiredError);
      return;
    }

    // Get count of active records
    const activeRecords = (totalRecords || 0) - (expiredRecords || 0);

    logger.info("Rate limit statistics:", {
      totalRecords: totalRecords || 0,
      activeRecords,
      expiredRecords: expiredRecords || 0,
      cleanupRecommended: (expiredRecords || 0) > 100,
    });
  } catch (error) {
    logger.error("Failed to fetch rate limit statistics:", error as any);
  }
}

/**
 * Main execution function
 */
async function main() {
  const command = process.argv[2];

  try {
    switch (command) {
      case "cleanup":
        await cleanupExpiredRateLimits();
        break;
      case "stats":
        await getRateLimitStats();
        break;
      case "both":
        await getRateLimitStats();
        await cleanupExpiredRateLimits();
        break;
      default:
        console.log("Usage: npm run cleanup-rate-limits [cleanup|stats|both]");
        console.log("  cleanup - Remove expired rate limit records");
        console.log("  stats   - Show rate limit statistics");
        console.log("  both    - Show stats then cleanup");
        process.exit(1);
    }
  } catch (error) {
    logger.error("Script execution failed:", error as any);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

export { cleanupExpiredRateLimits, getRateLimitStats };
