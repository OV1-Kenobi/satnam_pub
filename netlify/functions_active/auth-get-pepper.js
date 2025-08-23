/**
 * Get Pepper Netlify Function
 * Provides secure pepper for HMAC-SHA256 identifier protection
 * 
 * MASTER CONTEXT COMPLIANCE:
 * - Uses DUID_SERVER_SECRET for pepper generation
 * - Browser-compatible CORS headers
 * - Privacy-first error handling
 */

// CORS helper for browser compatibility
function corsHeaders(origin) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

/**
 * Get secure pepper from environment variables
 * Priority: DUID_SERVER_SECRET > VITE_DUID_SERVER_SECRET > GLOBAL_SALT
 */
function getSecurePepper() {
  const pepper = 
    process.env.DUID_SERVER_SECRET ||
    process.env.VITE_DUID_SERVER_SECRET ||
    process.env.GLOBAL_SALT;

  if (!pepper) {
    // Development-only fallback for local testing
    if (process.env.NODE_ENV === "development" || process.env.NETLIFY_LOCAL === "true") {
      console.warn("[auth-get-pepper] Using development fallback pepper. Set DUID_SERVER_SECRET in production.");
      return "dev-only-unsafe-pepper-change-in-production";
    }
    throw new Error("No secure pepper configured in environment");
  }
  
  return pepper;
}

/**
 * Main handler function
 */
export const handler = async (event, context) => {
  const headers = corsHeaders(event.headers?.origin);

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { 
      statusCode: 200, 
      headers, 
      body: "" 
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: "Method not allowed" 
      }),
    };
  }

  try {
    const pepper = getSecurePepper();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        pepper,
        meta: { 
          timestamp: new Date().toISOString() 
        },
      }),
    };
  } catch (error) {
    console.error("Get pepper error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Failed to retrieve secure pepper",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      }),
    };
  }
};

export default handler;
