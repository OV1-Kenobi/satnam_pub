import type { Handler } from "@netlify/functions";

// CORS helper
function corsHeaders(origin?: string) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  } as const;
}

let DEV_PEPPER_CACHE: string | null = null;

function getSecurePepper(): string {
  const pepper =
    process.env.DUID_SERVER_SECRET ||
    process.env.GLOBAL_SALT ||
    process.env.VITE_DUID_SERVER_SECRET || // dev fallback if provided
    process.env.DEV_DUID_SERVER_SECRET; // explicit dev-only override

  if (pepper) return pepper;

  // Development-only safe fallback to keep local dev server running
  const isLocal =
    process.env.NETLIFY_LOCAL === "true" ||
    process.env.NODE_ENV === "development";
  if (isLocal) {
    if (!DEV_PEPPER_CACHE) {
      DEV_PEPPER_CACHE = "dev-only-unsafe-pepper";
      // Note: do not log the actual pepper
      console.warn(
        "[auth-get-pepper] Using development fallback pepper. Set DUID_SERVER_SECRET in your env for parity."
      );
    }
    return DEV_PEPPER_CACHE;
  }

  throw new Error("No secure pepper configured in environment");
}

export const handler: Handler = async (event) => {
  const headers = corsHeaders(event.headers?.origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
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
        meta: { timestamp: new Date().toISOString() },
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
