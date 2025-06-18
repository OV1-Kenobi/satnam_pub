// lib/middleware/auth.ts
import { NextFunction, Request, Response } from "express";
import { supabase } from "../supabase";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string; // UUID from Supabase auth.users
    email?: string;
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
    next: NextFunction,
  ) => Promise<void>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract JWT token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          error: "Missing or invalid authorization header",
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify JWT token with Supabase
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({
          success: false,
          error: "Invalid or expired token",
        });
      }

      // Add authenticated user to request
      (req as AuthenticatedRequest).user = {
        id: user.id, // This is the secure UUID from auth.users
        email: user.email,
      };

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
    next: NextFunction,
  ) => Promise<void>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser(token);

        if (!error && user) {
          (req as AuthenticatedRequest).user = {
            id: user.id,
            email: user.email,
          };
        }
      }

      await handler(req as AuthenticatedRequest, res, next);
    } catch (error) {
      next(error);
    }
  };
}
