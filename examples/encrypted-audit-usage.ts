/**
 * Example usage of encrypted audit logging
 * Demonstrates how to use the new production-ready audit encryption
 */

import {
  createAuditLog,
  getUserAuditLogWithDetails,
} from "../services/privacy-auth";

/**
 * Example: Login attempt with audit logging
 */
async function handleLoginAttempt(
  userId: string | null,
  username: string,
  ipAddress: string,
  userAgent: string,
  success: boolean,
  errorMessage?: string
) {
  // Sensitive audit details that will be encrypted
  const auditDetails = {
    username: username,
    login_method: "privacy_first_auth",
    client_info: {
      user_agent: userAgent,
      ip_address: ipAddress, // This will be hashed separately
      timestamp: new Date().toISOString(),
    },
    error_details: errorMessage
      ? {
          error_message: errorMessage,
          error_code: "AUTH_FAILED",
          retry_count: 1,
        }
      : null,
    security_context: {
      session_type: "web",
      auth_method: "pubkey_hash",
      two_factor_enabled: false,
    },
  };

  // Create encrypted audit log entry
  const auditLog = await createAuditLog(
    userId,
    success ? "login_success" : "login_failed",
    success,
    auditDetails, // This will be encrypted automatically
    ipAddress, // This will be hashed
    userAgent // This will be hashed
  );

  console.log(`📝 Audit log created: ${auditLog.id}`);
  console.log(
    `🔐 Details encrypted: ${auditLog.encrypted_details ? "Yes" : "No"}`
  );

  return auditLog;
}

/**
 * Example: Profile update with sensitive data
 */
async function handleProfileUpdate(
  userId: string,
  changes: Record<string, any>,
  ipAddress: string
) {
  const auditDetails = {
    action: "profile_update",
    changed_fields: Object.keys(changes),
    old_values: changes, // In real implementation, this might contain sensitive data
    update_source: "user_initiated",
    validation_results: {
      username_valid: true,
      email_valid: true,
      profile_complete: true,
    },
  };

  const auditLog = await createAuditLog(
    userId,
    "profile_updated",
    true,
    auditDetails,
    ipAddress
  );

  return auditLog;
}

/**
 * Example: Security investigation - decrypt audit details
 * This should only be used by authorized security personnel
 */
async function investigateSecurityIncident(userId: string, incidentId: string) {
  console.log(`🔍 Starting security investigation for incident: ${incidentId}`);

  // Get audit logs with encrypted details (without decryption for general review)
  const auditLogs = await getUserAuditLogWithDetails(userId, false);

  console.log(`📊 Found ${auditLogs.length} audit entries for user`);

  // For security investigation, decrypt details (requires proper authorization)
  const detailedLogs = await getUserAuditLogWithDetails(userId, true);

  // Process the decrypted audit data
  for (const log of detailedLogs) {
    if (log.decrypted_details) {
      console.log(`🔓 Log ${log.id}:`, {
        action: log.action,
        success: log.success,
        created_at: new Date(log.created_at * 1000).toISOString(),
        details: log.decrypted_details,
      });
    }
  }

  return detailedLogs;
}

/**
 * Example: Bulk processing of encrypted audit data
 */
async function generateSecurityReport(userIds: string[]) {
  const reportData = [];

  for (const userId of userIds) {
    try {
      // Get audit logs without decryption for privacy
      const logs = await getUserAuditLogWithDetails(userId, false);

      // Extract non-sensitive statistics
      const stats = {
        userId,
        totalLogins: logs.filter((l) => l.action.includes("login")).length,
        failedLogins: logs.filter((l) => l.action === "login_failed").length,
        lastActivity: Math.max(...logs.map((l) => l.created_at)),
        profileUpdates: logs.filter((l) => l.action === "profile_updated")
          .length,
      };

      reportData.push(stats);
    } catch (error) {
      console.error(`Failed to process user ${userId}:`, error.message);
    }
  }

  return reportData;
}

/**
 * Example: Handling encryption failures gracefully
 */
async function handleAuditWithFallback(
  userId: string,
  action: string,
  details: Record<string, any>
) {
  try {
    // Attempt to create encrypted audit log
    return await createAuditLog(userId, action, true, details);
  } catch (error) {
    console.error("Primary audit logging failed:", error.message);

    // Fallback: Create audit log without details rather than losing the audit trail
    return await createAuditLog(userId, action, true, {
      error: "details_encryption_failed",
      timestamp: new Date().toISOString(),
    });
  }
}

export {
  generateSecurityReport,
  handleAuditWithFallback,
  handleLoginAttempt,
  handleProfileUpdate,
  investigateSecurityIncident,
};
