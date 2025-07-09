// lib/middleware/auth.ts
import { NextFunction, Request, Response } from "../../../types/netlify-functions";
import db from "../db";
import { supabase } from "../supabase";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string; // UUID from Supabase auth.users
  };
}

export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
  };
  error?: string;
}

export interface FamilyAccessResult {
  allowed: boolean;
  role?: "admin" | "member";
  error?: string;
}

/**
 * Helper function to validate JWT token from authorization header
 * Extracts and validates the token, returning user information or error
 */
async function validateToken(
  authHeader: string | undefined
): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      success: false,
      error: "Missing or invalid authorization header",
    };
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  // Verify JWT token with Supabase
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return {
      success: false,
      error: "Invalid or expired token",
    };
  }

  return {
    success: true,
    user: {
      id: user.id,
    },
  };
}

/**
 * Authentication middleware that extracts user ID from Supabase JWT token
 * This ensures userId comes from verified authentication, not request body
 */
export function authMiddleware(
  handler: (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => Promise<void>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authResult = await validateToken(req.headers.authorization);

      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          error: authResult.error,
        });
      }

      // Add authenticated user to request
      (req as AuthenticatedRequest).user = authResult.user;

      // Call the actual handler
      await handler(req as AuthenticatedRequest, res, next);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Authentication failed",
      });
    }
  };
}

/**
 * Optional auth middleware - allows both authenticated and anonymous requests
 * Sets req.user if token is valid, otherwise leaves it undefined
 */
export function optionalAuthMiddleware(
  handler: (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => Promise<void>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        const authResult = await validateToken(authHeader);

        if (authResult.success) {
          (req as AuthenticatedRequest).user = authResult.user;
        }
      }

      await handler(req as AuthenticatedRequest, res, next);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Authenticate a request and return user information
 * Used for manual authentication in API endpoints
 */
export async function authenticateRequest(req: Request): Promise<AuthResult> {
  try {
    return await validateToken(req.headers.authorization);
  } catch (error) {
    return {
      success: false,
      error: "Authentication failed",
    };
  }
}

/**
 * Check if a user has access to a specific family
 * Returns access status and user's role in the family
 */
export async function checkFamilyAccess(
  user: { id: string },
  familyId: string
): Promise<FamilyAccessResult> {
  try {
    if (!familyId) {
      return {
        allowed: false,
        error: "Family ID is required",
      };
    }

    // Check if user is a member of the family
    const result = await db.query(
      `SELECT fm.role, f.admin_id 
       FROM family_members fm
       JOIN families f ON fm.family_id = f.id
       WHERE fm.family_id = $1 AND fm.user_id = $2`,
      [familyId, user.id]
    );

    if (result.rows.length === 0) {
      return {
        allowed: false,
        error: "User is not a member of this family",
      };
    }

    const memberData = result.rows[0];

    return {
      allowed: true,
      role: memberData.role,
    };
  } catch (error) {
    console.error("Family access check error:", error);
    return {
      allowed: false,
      error: "Failed to verify family access",
    };
  }
}

/**
 * Check if a user has admin access to a specific family
 */
export async function checkFamilyAdminAccess(
  user: { id: string },
  familyId: string
): Promise<FamilyAccessResult> {
  try {
    const accessResult = await checkFamilyAccess(user, familyId);

    if (!accessResult.allowed) {
      return accessResult;
    }

    if (accessResult.role !== "admin") {
      return {
        allowed: false,
        error: "Admin access required",
      };
    }

    return accessResult;
  } catch (error) {
    console.error("Family admin access check error:", error);
    return {
      allowed: false,
      error: "Failed to verify family admin access",
    };
  }
}
