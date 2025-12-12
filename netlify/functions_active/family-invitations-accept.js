/**
 * Family Federation Invitation Acceptance Netlify Function
 * POST /api/family/invitations/accept
 *
 * Thin wrapper around the core API handler in api/family/invitations/accept.js
 * so we keep all business logic centralized while exposing a Netlify Function
 * entrypoint for production.
 */

import acceptInvitationHandler from "../../api/family/invitations/accept.js";

/**
 * Netlify Function handler entrypoint
 * @param {import("@netlify/functions").HandlerEvent} event
 * @param {import("@netlify/functions").HandlerContext} context
 */
export const handler = async (event, context) => {
  try {
    // Delegate to existing API implementation (handles JWT + privacy logic)
    return await acceptInvitationHandler(event, context);
  } catch (error) {
    console.error("Family invitation accept function error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin":
          event.headers?.origin || event.headers?.Origin ||
          process.env.ALLOWED_ORIGIN ||
          process.env.VITE_APP_URL ||
          "https://www.satnam.pub",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({
        success: false,
        error: "Internal server error",
        message:
          error instanceof Error ? error.message : "Unknown error during acceptance",
      }),
    };
  }
};

