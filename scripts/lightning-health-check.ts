#!/usr/bin/env tsx
// Lightning Health Check Script - Critical for Production Monitoring

import { LightningClient } from "../lib/lightning-client";

interface HealthMetrics {
  timestamp: string;
  nodeStatus: "healthy" | "degraded" | "down";
  responseTime: number;
  walletCount: number;
  totalBalance: number;
  errors: string[];
  warnings: string[];
  privacyHealth?: {
    available: boolean;
    responseTime: number;
    error?: string;
  };
}

class LightningHealthMonitor {
  private lightningClient: LightningClient;

  constructor() {
    this.lightningClient = new LightningClient();
  }

  async checkNodeHealth(): Promise<HealthMetrics> {
    const startTime = Date.now();
    const metrics: HealthMetrics = {
      timestamp: new Date().toISOString(),
      nodeStatus: "down",
      responseTime: 0,
      walletCount: 0,
      totalBalance: 0,
      errors: [],
      warnings: [],
    };

    try {
      // Test node connectivity
      const nodeStatus = await this.lightningClient.getNodeStatus();
      const responseTime = Date.now() - startTime;

      metrics.responseTime = responseTime;

      if (!nodeStatus.connected) {
        metrics.errors.push("Lightning node is not connected");
        return metrics;
      }

      if (responseTime > 5000) {
        metrics.warnings.push(`High response time: ${responseTime}ms`);
        metrics.nodeStatus = "degraded";
      } else {
        metrics.nodeStatus = "healthy";
      }

      // Test wallet operations
      try {
        const wallets = await this.lightningClient.getFamilyWallets();
        metrics.walletCount = wallets.length;
        metrics.totalBalance = wallets.reduce(
          (sum, wallet) => sum + wallet.balance,
          0,
        );

        if (wallets.length === 0) {
          metrics.warnings.push("No wallets found");
        }

        // Check for low balances
        const lowBalanceWallets = wallets.filter((w) => w.balance < 1000); // Less than 1000 sats
        if (lowBalanceWallets.length > 0) {
          metrics.warnings.push(
            `${lowBalanceWallets.length} wallets have low balance (<1000 sats)`,
          );
        }
      } catch (error) {
        metrics.errors.push(
          `Wallet operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        metrics.nodeStatus = "degraded";
      }

      // Test privacy service health
      try {
        const privacyHealth = await this.lightningClient.checkPrivacyHealth();
        metrics.privacyHealth = privacyHealth;

        if (!privacyHealth.available) {
          metrics.warnings.push(
            "Privacy service (LNProxy) is not available - payments will not have privacy protection",
          );
        } else if (privacyHealth.responseTime > 3000) {
          metrics.warnings.push(
            `Privacy service slow response: ${privacyHealth.responseTime}ms`,
          );
        }
      } catch (error) {
        metrics.warnings.push(
          `Privacy health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    } catch (error) {
      metrics.errors.push(
        `Node health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      metrics.responseTime = Date.now() - startTime;
    }

    return metrics;
  }

  async runHealthCheck(verbose: boolean = false): Promise<void> {
    console.log("⚡ Lightning Network Health Check");
    console.log("=".repeat(50));
    console.log(`🕒 Started at: ${new Date().toLocaleString()}`);

    const metrics = await this.checkNodeHealth();

    // Status display
    const statusEmoji =
      metrics.nodeStatus === "healthy"
        ? "🟢"
        : metrics.nodeStatus === "degraded"
          ? "🟡"
          : "🔴";

    console.log(
      `${statusEmoji} Node Status: ${metrics.nodeStatus.toUpperCase()}`,
    );
    console.log(`⏱️  Response Time: ${metrics.responseTime}ms`);
    console.log(`💰 Total Wallets: ${metrics.walletCount}`);
    console.log(`🪙 Total Balance: ${metrics.totalBalance} sats`);

    // Privacy service status
    if (metrics.privacyHealth) {
      const privacyEmoji = metrics.privacyHealth.available ? "🟢" : "🔴";
      console.log(
        `${privacyEmoji} Privacy Service: ${metrics.privacyHealth.available ? "Available" : "Unavailable"} (${metrics.privacyHealth.responseTime}ms)`,
      );
    }

    // Errors
    if (metrics.errors.length > 0) {
      console.log("\n❌ ERRORS:");
      metrics.errors.forEach((error) => console.log(`   • ${error}`));
    }

    // Warnings
    if (metrics.warnings.length > 0) {
      console.log("\n⚠️  WARNINGS:");
      metrics.warnings.forEach((warning) => console.log(`   • ${warning}`));
    }

    // Detailed metrics if verbose
    if (verbose) {
      console.log("\n📊 Detailed Metrics:");
      console.log(JSON.stringify(metrics, null, 2));
    }

    // Recommendations
    console.log("\n📋 Recommendations:");
    if (metrics.nodeStatus === "down") {
      console.log("   • Check Lightning node configuration and connectivity");
      console.log("   • Verify API credentials and network access");
      console.log("   • DO NOT PROCESS PAYMENTS until node is healthy");
    } else if (metrics.nodeStatus === "degraded") {
      console.log("   • Monitor closely - some issues detected");
      console.log("   • Consider reducing payment limits temporarily");
      console.log("   • Review warnings above");
    } else {
      console.log("   • System is healthy and ready for production use");
      console.log("   • Continue regular monitoring");
    }

    // Exit code for monitoring systems
    if (metrics.nodeStatus === "down") {
      process.exit(1);
    } else if (metrics.nodeStatus === "degraded") {
      process.exit(2);
    } else {
      process.exit(0);
    }
  }
}

// CLI usage (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  const verbose =
    process.argv.includes("--verbose") || process.argv.includes("-v");
  const monitor = new LightningHealthMonitor();
  monitor.runHealthCheck(verbose).catch(console.error);
}

export { LightningHealthMonitor };
