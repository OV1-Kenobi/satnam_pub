/**
 * Authentication and Authorization Middleware for Express
 */

import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '../../config';

// Define user interface for authenticated requests
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    npub: string;
    role: string;
  };
}

/**
 * Middleware to authenticate user based on JWT token
 */
export const authenticateUser = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Unauthorized - No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const secretBuffer = Buffer.from(config.auth.jwtSecret, 'utf8');
    const decoded = jwt.verify(token, secretBuffer) as {
      id: string;
      npub: string;
      role: string;
    };

    // Add user info to request
    (req as AuthenticatedRequest).user = {
      id: decoded.id,
      npub: decoded.npub,
      role: decoded.role,
    };

    next();
  } catch (error) {
    res.status(401).json({ 
      success: false, 
      message: 'Unauthorized - Invalid token' 
    });
  }
};

/**
 * Middleware to authorize access to family resources
 */
export const authorizeFamily = (req: Request, res: Response, next: NextFunction): void => {
  const { familyId } = req.params;
  const user = (req as AuthenticatedRequest).user;

  if (!user) {
    res.status(401).json({ success: false, message: 'Unauthorized - User not authenticated' });
    return;
  }

  // In a real implementation, we would check if the user has access to this family
  // For now, we'll just pass through
  
  next();
};

/**
 * Middleware to authorize based on user roles
 */
export const authorizeRoles = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized - User not authenticated' });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({ success: false, message: 'Forbidden - Insufficient permissions' });
      return;
    }

    next();
  };
};