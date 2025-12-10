/**
 * Family Federation Invitation Validation Netlify Function Wrapper
 *
 * This Netlify function proxies requests to the core handler in
 * api/family/invitations/validate.js so we keep all invitation logic
 * centralized in one place.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Pure ESM (no CommonJS)
 * - Uses process.env only (no import.meta.env) in the Netlify layer
 * - Reuses existing privacy-first logic from the api/ handler
 */

import validateInvitationHandler from "../../api/family/invitations/validate.js";

/**
 * Netlify Function handler entrypoint
 * @param {import("@netlify/functions").HandlerEvent} event
 * @param {import("@netlify/functions").HandlerContext} context
 */
export const handler = async (event, context) => {
  try {
    // Delegate to the existing API handler implementation
    return await validateInvitationHandler(event, context);
  } catch (error) {
    console.error("Family invitation validate function error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: JSON.stringify({
        valid: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
