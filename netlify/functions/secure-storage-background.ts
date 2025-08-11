// netlify/functions/secure-storage-background.ts
// Background Function variant for long-running password re-encryption workflows
// Runs up to 15 minutes on Netlify; use for conflict-heavy or bulk operations

import type { Handler } from "@netlify/functions";

// Dynamic imports to keep bundle size small
async function getSecureStorage() {
  const mod = await import("./secure-storage.js");
  return mod.SecureStorage;
}

async function getLogger() {
  const mod = await import("../../utils/privacy-logger.js");
  return mod;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const handler: Handler = async (event) => {
  const { log, error } = await getLogger();

  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  } as const;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  }

  try {
    const parsed = JSON.parse(event.body || "{}");
    const { userId, oldPassword, newPassword } = parsed || {};

    if (!userId || !oldPassword || !newPassword) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: "Missing required fields" }),
      };
    }

    log("🔄 Background re-encryption started", {
      timestamp: new Date().toISOString(),
      operation: "reencrypt_nsec",
    });

    const SecureStorage = await getSecureStorage();

    // Background functions can afford broader retry windows
    const maxRetries = 5;
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      const ok = await SecureStorage.updatePasswordAndReencryptNsec(
        userId,
        oldPassword,
        newPassword
      );
      if (ok) {
        log("✅ Background re-encryption complete", {
          timestamp: new Date().toISOString(),
          operation: "reencrypt_nsec",
          status: "ok",
        });
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true }),
        };
      }
      // Exponential backoff between attempts
      await sleep(Math.min(1000 * 2 ** attempt, 10000));
    }

    error("❌ Background re-encryption failed after retries", {
      timestamp: new Date().toISOString(),
      operation: "reencrypt_nsec",
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: "Re-encryption failed" }),
    };
  } catch (e) {
    const { error: logError } = await getLogger();
    logError("Background function error", {
      timestamp: new Date().toISOString(),
      error: e instanceof Error ? e.message : "Unknown error",
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: "Internal error" }),
    };
  }
};

