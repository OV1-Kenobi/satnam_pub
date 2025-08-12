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

function getSecurePepper(): string {
  const pepper =
    process.env.DUID_SERVER_SECRET ||
    process.env.GLOBAL_SALT ||
    process.env.VITE_DUID_SERVER_SECRET; // dev fallback if provided

  if (!pepper) {
    throw new Error("No secure pepper configured in environment");
  }
  return pepper;
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

