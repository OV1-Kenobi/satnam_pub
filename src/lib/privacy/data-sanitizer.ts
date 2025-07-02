// Privacy-Safe Data Sanitization for Satnam.pub
// File: src/lib/privacy/data-sanitizer.ts
// Implements role-based data filtering and PII protection

interface PrivacySafeData<T> {
  data: T;
  privacyLevel: "public" | "family" | "private";
  sanitized: boolean;
}

interface SanitizationRule {
  field: string;
  roles: string[];
  action: "hide" | "mask" | "obfuscate" | "limit";
  threshold?: number;
}

interface PrivacySafeTransaction {
  id: string;
  amount: number | "HIDDEN";
  type: "lightning" | "ecash" | "internal";
  timestamp: Date;
  privacyRouted: boolean;
  destination: string | "PRIVATE";
  memo?: string | "HIDDEN";
  status: "pending" | "completed" | "failed";
}

interface PrivacySafeFamilyTreasury {
  totalBalance: number;
  individualBalances: Record<string, number | "HIDDEN">;
  recentTransactions: PrivacySafeTransaction[];
  phoenixdStatus: PublicNodeStatus;
  federationHealth: PrivacySafeFederationStatus;
  privacyMetrics: PrivacyMetrics;
}

interface PublicNodeStatus {
  isOnline: boolean;
  lastSeen: Date;
  privacyRouting: boolean;
  torEnabled: boolean;
  // Sensitive node info removed
}

interface PrivacySafeFederationStatus {
  memberCount: number;
  healthScore: number;
  lastSync: Date;
  privacyCompliant: boolean;
  // Guardian details hidden
}

interface PrivacyMetrics {
  transactionsRouted: number;
  privacyScore: number;
  lnproxyUsage: number;
  cashuPrivacy: number;
}

export class DataSanitizer {
  // Privacy level thresholds
  private static readonly CHILD_TRANSACTION_LIMIT = 50000; // 50k sats
  private static readonly PRIVACY_OBFUSCATION_THRESHOLD = 100000; // 100k sats

  // Sanitization rules by context
  private static readonly SANITIZATION_RULES: Record<
    string,
    SanitizationRule[]
  > = {
    "family-dashboard": [
      { field: "individualBalances", roles: ["child"], action: "hide" },
      { field: "guardianInfo", roles: ["child"], action: "hide" },
      { field: "externalTransactions", roles: ["child"], action: "obfuscate" },
      { field: "nodeDetails", roles: ["child", "guardian"], action: "mask" },
    ],
    "individual-dashboard": [
      { field: "familyBalances", roles: ["child"], action: "hide" },
      { field: "adultTransactions", roles: ["child"], action: "hide" },
      { field: "spendingLimits", roles: ["child"], action: "limit" },
    ],
    "enhanced-dashboard": [
      { field: "sensitiveNodeInfo", roles: ["guardian"], action: "mask" },
      { field: "advancedMetrics", roles: ["child"], action: "hide" },
    ],
  };

  static sanitizeForDisplay<T>(
    data: T,
    userRole: string,
    context: string
  ): PrivacySafeData<T> {
    const rules = this.SANITIZATION_RULES[context] || [];
    const sanitized = this.applySanitizationRules(data, userRole, rules);

    return {
      data: sanitized,
      privacyLevel: this.determinePrivacyLevel(data, context),
      sanitized: true,
    };
  }

  private static applySanitizationRules<T>(
    data: T,
    userRole: string,
    rules: SanitizationRule[]
  ): T {
    if (!data || typeof data !== "object") return data;

    const sanitized = JSON.parse(JSON.stringify(data)); // Deep clone

    // Apply role-based filtering
    rules.forEach((rule) => {
      if (rule.roles.includes(userRole)) {
        this.applyRule(sanitized, rule);
      }
    });

    // Apply privacy-specific sanitization
    if (sanitized && typeof sanitized === "object") {
      this.sanitizeTransactions(sanitized, userRole);
      this.sanitizeBalances(sanitized, userRole);
      this.sanitizeNodeInfo(sanitized, userRole);
    }

    return sanitized;
  }

  private static applyRule(data: any, rule: SanitizationRule): void {
    if (!data || typeof data !== "object") return;

    const fieldPath = rule.field.split(".");
    let current = data;

    // Navigate to parent of target field
    for (let i = 0; i < fieldPath.length - 1; i++) {
      current = current[fieldPath[i]];
      if (!current) return;
    }

    const fieldName = fieldPath[fieldPath.length - 1];

    switch (rule.action) {
      case "hide":
        delete current[fieldName];
        break;
      case "mask":
        if (typeof current[fieldName] === "string") {
          current[fieldName] = this.maskString(current[fieldName]);
        }
        break;
      case "obfuscate":
        current[fieldName] = "PRIVATE";
        break;
      case "limit":
        if (typeof current[fieldName] === "number" && rule.threshold) {
          current[fieldName] = Math.min(current[fieldName], rule.threshold);
        }
        break;
    }
  }

  private static sanitizeTransactions(data: any, userRole: string): void {
    if (data.transactions || data.recentTransactions) {
      const transactions = data.transactions || data.recentTransactions;

      if (Array.isArray(transactions)) {
        transactions.forEach((tx: any) => {
          // Hide large transactions from child accounts
          if (
            userRole === "child" &&
            tx.amount > this.CHILD_TRANSACTION_LIMIT
          ) {
            tx.amount = "HIDDEN";
          }

          // Obfuscate external destinations for privacy
          if (
            tx.destination &&
            !tx.destination.includes("internal") &&
            !tx.privacyRouted
          ) {
            tx.destination = this.obfuscateAddress(tx.destination);
          }

          // Hide sensitive memos
          if (tx.memo && tx.amount > this.PRIVACY_OBFUSCATION_THRESHOLD) {
            tx.memo =
              userRole === "child" ? "HIDDEN" : this.maskString(tx.memo);
          }

          // Always show privacy routing status
          tx.privacyRouted = tx.privacyRouted || false;
        });
      }
    }
  }

  private static sanitizeBalances(data: any, userRole: string): void {
    // Hide individual family member balances from children
    if (userRole === "child" && data.individualBalances) {
      const balances = data.individualBalances;
      Object.keys(balances).forEach((memberId) => {
        if (memberId !== userRole) {
          // Keep own balance visible
          balances[memberId] = "HIDDEN";
        }
      });
    }

    // Apply spending limits visibility
    if (userRole === "child" && data.spendingLimits) {
      data.spendingLimits = {
        daily: data.spendingLimits.daily || 10000,
        weekly: data.spendingLimits.weekly || 50000,
        requiresApproval: data.spendingLimits.requiresApproval || 25000,
      };
    }
  }

  private static sanitizeNodeInfo(data: any, userRole: string): void {
    if (data.phoenixdStatus || data.nodeStatus) {
      const nodeStatus = data.phoenixdStatus || data.nodeStatus;

      // Keep only essential public info for non-parents
      if (userRole !== "adult" && userRole !== "guardian") {
        const publicInfo = {
          isOnline: nodeStatus.isOnline || false,
          lastSeen: nodeStatus.lastSeen || new Date(),
          privacyRouting: nodeStatus.privacyRouting || false,
          torEnabled: nodeStatus.torEnabled || false,
        };

        if (data.phoenixdStatus) {
          data.phoenixdStatus = publicInfo;
        } else {
          data.nodeStatus = publicInfo;
        }
      }
    }

    // Hide federation guardian details
    if (data.federationHealth && userRole === "child") {
      data.federationHealth = {
        memberCount: data.federationHealth.memberCount || 0,
        healthScore: data.federationHealth.healthScore || 0,
        lastSync: data.federationHealth.lastSync || new Date(),
        privacyCompliant: data.federationHealth.privacyCompliant || true,
      };
    }
  }

  private static maskString(str: string): string {
    if (str.length <= 4) return "***";
    return (
      str.substring(0, 2) +
      "*".repeat(str.length - 4) +
      str.substring(str.length - 2)
    );
  }

  private static obfuscateAddress(address: string): string {
    if (address.includes("@")) {
      // Lightning address
      const parts = address.split("@");
      return this.maskString(parts[0]) + "@" + parts[1];
    } else if (address.startsWith("ln")) {
      // Lightning invoice
      return "ln***" + address.substring(address.length - 6);
    } else {
      // Generic address
      return this.maskString(address);
    }
  }

  private static determinePrivacyLevel(
    data: any,
    context: string
  ): "public" | "family" | "private" {
    if (context.includes("individual")) return "private";
    if (context.includes("family")) return "family";
    return "public";
  }

  // Privacy metrics calculation
  static calculatePrivacyScore(transactions: any[]): number {
    if (!transactions?.length) return 100;

    let privacyScore = 0;
    transactions.forEach((tx) => {
      if (tx.privacyRouted) privacyScore += 20;
      if (tx.type === "ecash") privacyScore += 15;
      if (tx.destination === "PRIVATE") privacyScore += 10;
    });

    return Math.min(100, privacyScore / transactions.length);
  }

  // Generate privacy metrics
  static generatePrivacyMetrics(data: any): PrivacyMetrics {
    const transactions = data.transactions || data.recentTransactions || [];

    return {
      transactionsRouted: transactions.filter((tx: any) => tx.privacyRouted)
        .length,
      privacyScore: this.calculatePrivacyScore(transactions),
      lnproxyUsage: transactions.filter(
        (tx: any) => tx.type === "lightning" && tx.privacyRouted
      ).length,
      cashuPrivacy: transactions.filter((tx: any) => tx.type === "ecash")
        .length,
    };
  }
}

export type {
  PrivacyMetrics,
  PrivacySafeData,
  PrivacySafeFamilyTreasury,
  PrivacySafeTransaction,
};
