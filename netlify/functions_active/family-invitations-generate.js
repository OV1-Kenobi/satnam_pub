/**
 * Family Federation Invitation Generation Netlify Function Wrapper
 *
 * This Netlify function proxies requests to the core handler in
 * api/family/invitations/generate.js so we keep all invitation logic
 * centralized in one place.
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Pure ESM (no CommonJS)
 * - Uses process.env only (no import.meta.env) in the Netlify layer
 * - Reuses existing JWT + privacy-first logic from the api/ handler
 */

import generateInvitationHandler from "../../api/family/invitations/generate.js";

/**
 * Netlify Function handler entrypoint
 * @param {import("@netlify/functions").HandlerEvent} event
 * @param {import("@netlify/functions").HandlerContext} context
 */
export const handler = async (event, context) => {
  try {
    // Delegate to the existing API handler implementation
    return await generateInvitationHandler(event, context);
  } catch (error) {
    console.error("Family invitation generate function error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};

