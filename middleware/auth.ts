import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { rateLimitMiddleware } from "./rateLimit";
import { z } from "zod";

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string;
    npub: string;
    role: string;
  };
}

// Define JWT payload schema for validation with Nostr-native fields
const jwtPayloadSchema = z.object({
  id: z.string(),
  npub: z.string(), // Nostr public key (bech32 encoded)
  role: z.string(),
  exp: z.number().optional(),
  iat: z.number().optional(),
});

// Create auth-specific rate limiter
const authRateLimit = {
  limit: 5, // 5 attempts
  window: 900, // 15 minutes (in seconds)
  keyGenerator: (req: NextRequest) => {
    const ip = req.ip || req.headers.get("x-forwarded-for") || "unknown";
    return `auth-limit:${ip}`;
  },
};

/**
 * Authentication middleware for Next.js API routes
 * Verifies JWT token from Authorization header
 * Includes rate limiting to prevent brute force attacks
 */
export async function authMiddleware(
  req: NextRequest,
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>,
): Promise<NextResponse> {
  // Apply rate limiting for authentication attempts
  return rateLimitMiddleware(
    req,
    async (req: NextRequest) => {
      try {
        // Get token from Authorization header
        const authHeader = req.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return NextResponse.json(
            { error: "Unauthorized - No token provided" },
            { status: 401 },
          );
        }

        const token = authHeader.split(" ")[1];

        // Verify token
        const secretBuffer = Buffer.from(config.auth.jwtSecret, "utf8");
        const rawDecoded = jwt.verify(token, secretBuffer);
        const validationResult = jwtPayloadSchema.safeParse(rawDecoded);

        if (!validationResult.success) {
          throw new Error("Invalid token payload structure");
        }

        const decoded = validationResult.data;

        // Add user info to request
        const authenticatedReq = req as AuthenticatedRequest;
        authenticatedReq.user = decoded;

        // Call the handler with the authenticated request
        return handler(authenticatedReq);
      } catch (error) {
        console.error("Authentication error:", error);

        // Provide more specific error message for validation failures
        const errorMessage =
          error instanceof Error &&
          error.message === "Invalid token payload structure"
            ? "Unauthorized - Invalid token structure"
            : "Unauthorized - Invalid token";

        return NextResponse.json({ error: errorMessage }, { status: 401 });
      }
    },
    authRateLimit,
  );
}

/**
 * Role-based authorization middleware
 * Checks if the authenticated user has the required role
 */
export function authorizeRoles(roles: string[]) {
  return async function (
    req: AuthenticatedRequest,
    handler: (req: AuthenticatedRequest) => Promise<NextResponse>,
  ): Promise<NextResponse> {
    if (!req.user) {
      return NextResponse.json(
        { error: "Unauthorized - User not authenticated" },
        { status: 401 },
      );
    }

    if (!roles.includes(req.user.role)) {
      return NextResponse.json(
        { error: "Forbidden - Insufficient permissions" },
        { status: 403 },
      );
    }

    return handler(req);
  };
}

/**
 * Specialized rate limiting middleware for authentication endpoints
 * This can be used directly on login/signup endpoints to prevent brute force attacks
 */
export async function authRateLimitMiddleware(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>,
): Promise<NextResponse> {
  return rateLimitMiddleware(req, handler, authRateLimit);
}

/**
 * Middleware to verify Nostr event signatures
 * Used for endpoints that accept signed Nostr events
 */
export async function nostrSignatureMiddleware(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    // Parse request body
    const body = await req.json();

    // Check if body contains a signed Nostr event
    if (!body.signed_event) {
      return NextResponse.json(
        { error: "Bad Request - Missing signed Nostr event" },
        { status: 400 },
      );
    }

    const event = body.signed_event;

    // Validate event structure
    if (!event.id || !event.pubkey || !event.sig || !event.created_at) {
      return NextResponse.json(
        { error: "Bad Request - Invalid Nostr event structure" },
        { status: 400 },
      );
    }

    // Import verification function dynamically to avoid circular dependencies
    const { verifySignature, getEventHash } = await import("nostr-tools");

    // Verify signature
    const isValid = verifySignature(event);
    if (!isValid) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid signature" },
        { status: 401 },
      );
    }

    // Verify event hash
    const computedHash = getEventHash(event);
    if (computedHash !== event.id) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid event hash" },
        { status: 401 },
      );
    }

    // Check if event is recent (within last 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (now - event.created_at > 300) {
      return NextResponse.json(
        { error: "Unauthorized - Event too old" },
        { status: 401 },
      );
    }

    // In Next.js, we don't need to clone the request as NextRequest is already
    // properly typed and has all the necessary properties

    // Call the handler with the original NextRequest
    return handler(req);
  } catch (error) {
    console.error("Nostr signature verification error:", error);
    return NextResponse.json(
      { error: "Bad Request - Invalid request format" },
      { status: 400 },
    );
  }
}
