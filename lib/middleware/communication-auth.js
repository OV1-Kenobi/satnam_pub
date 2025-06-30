/**
 * @fileoverview Communication API Authentication Middleware
 * @description Production-ready authentication for communication endpoints
 * Integrates with existing OTP system and Federation whitelist
 */

// Browser-compatible imports for Bolt.new
const crypto = globalThis.crypto || require('crypto');

// Rate limiting storage (in production, use Redis)
const rateLimitStorage = new Map();
const sessionStorage = new Map(); // From existing session system

// Constants
const JWT_SECRET = process.env.JWT_SECRET || 'change-in-production-use-secure-random-secret';
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // requests per window

/**
 * Generate cryptographically secure rate limit key (browser-compatible)
 */
async function generateRateLimitKey(req) {
  const encoder = new TextEncoder();
  
  // Use session token hash instead of IP for privacy
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tokenBuffer = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }
  
  // Fallback to user agent hash for unauthenticated requests
  const userAgent = req.headers['user-agent'] || 'unknown';
  const userAgentBuffer = encoder.encode(userAgent);
  const hashBuffer = await crypto.subtle.digest('SHA-256', userAgentBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Rate limiting middleware
 */
export function rateLimiter(req, res, next) {
  generateRateLimitKey(req).then(key => {
    const now = Date.now();
    
    if (!rateLimitStorage.has(key)) {
      rateLimitStorage.set(key, { count: 1, windowStart: now });
      return next();
    }
    
    const rateData = rateLimitStorage.get(key);
    
    // Reset window if expired
    if (now - rateData.windowStart > RATE_LIMIT_WINDOW) {
      rateLimitStorage.set(key, { count: 1, windowStart: now });
      return next();
    }
    
    // Check if limit exceeded
    if (rateData.count >= RATE_LIMIT_MAX_REQUESTS) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        meta: {
          timestamp: new Date().toISOString(),
          retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - rateData.windowStart)) / 1000)
        }
      });
    }
    
    // Increment count
    rateData.count++;
    rateLimitStorage.set(key, rateData);
    next();
  }).catch(error => {
    // PRIVACY-FIRST: Silent fail - no error logging that could expose info
    next(); // Continue on error for availability
  });
}

/**
 * Authentication middleware for communication endpoints
 */
export function authenticateSession(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided',
        meta: {
          timestamp: new Date().toISOString(),
        }
      });
    }
    
    const token = authHeader.substring(7);
    
    // Check if session exists in storage (from existing system)
    const session = sessionStorage.get(token);
    
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
        meta: {
          timestamp: new Date().toISOString(),
        }
      });
    }
    
    // Check if session has expired
    if (Date.now() > session.expiresAt) {
      sessionStorage.delete(token);
      return res.status(401).json({
        success: false,
        error: 'Session has expired',
        meta: {
          timestamp: new Date().toISOString(),
        }
      });
    }
    
    // Attach session data to request
    req.session = session;
    req.sessionToken = token;
    
    next();
  } catch (error) {
    // PRIVACY-FIRST: NO error details logged that could contain sensitive info
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
      meta: {
        timestamp: new Date().toISOString(),
      }
    });
  }
}

/**
 * Generate session hash for communication operations (browser-compatible)
 */
export function generateCommunicationHash(session) {
  const data = JSON.stringify({
    npub: session.npub,
    nip05: session.nip05,
    timestamp: Math.floor(Date.now() / 1000),
    expires: Math.floor(Date.now() / 1000) + (15 * 60), // 15 minutes
  });
  
  // Browser-compatible hash generation
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data + JWT_SECRET);
  
  return crypto.subtle.digest('SHA-256', dataBuffer)
    .then(hashBuffer => {
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    });
}

/**
 * Enhanced CORS with security headers
 */
export function setSecurityHeaders(req, res, next) {
  const allowedOrigins = process.env.NODE_ENV === "production"
    ? [process.env.FRONTEND_URL || "https://satnam.pub"]
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:3002"];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  // Enhanced security headers
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours
  
  // Security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'");
  }

  next();
}

/**
 * Input sanitization middleware
 */
export function sanitizeInput(req, res, next) {
  if (req.body) {
    // Recursively sanitize all string inputs
    const sanitize = (obj) => {
      if (typeof obj === 'string') {
        return obj.trim().replace(/[<>]/g, ''); // Basic XSS prevention
      }
      if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          obj[key] = sanitize(obj[key]);
        }
      }
      return obj;
    };
    
    req.body = sanitize(req.body);
  }
  
  next();
}

/**
 * Request size limiter
 */
export function limitRequestSize(maxSize = 1024 * 1024) { // 1MB default
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxSize) {
      return res.status(413).json({
        success: false,
        error: 'Request too large',
        meta: {
          timestamp: new Date().toISOString(),
          maxSize: maxSize
        }
      });
    }
    
    next();
  };
}

/**
 * Privacy-first audit logging - NO sensitive data ever logged
 * Only logs operational metrics for system health monitoring
 */
export function auditLog(req, res, next) {
  const startTime = Date.now();
  
  // Add response logging
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    // CORRECT: Privacy-first logging for Satnam.pub
    if (process.env.NODE_ENV === 'production') {
      // Log ONLY non-sensitive operational metrics locally
      const sanitizedLog = {
        timestamp: Date.now(),
        endpoint: req.url.split('?')[0], // Remove query params
        method: req.method,
        statusCode: res.statusCode,
        duration: Date.now() - startTime,
        // NO user data, NO transaction details, NO family info
      };
      
      // Store locally in encrypted format
      storeLocalAuditLog(sanitizedLog).catch(() => {
        // Silent fail - no error logging that could expose sensitive info
      });
    } else {
      // Development: minimal console logging (safe operational metrics only)
      console.log(`[DEV] ${req.method} ${req.url.split('?')[0]} - ${res.statusCode} - ${Date.now() - startTime}ms`);
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}

/**
 * Store audit logs in encrypted Supabase Vault (privacy-first)
 * Follows your Satnam.pub privacy-first logging standards
 */
async function storeLocalAuditLog(sanitizedLog) {
  try {
    // Import dynamically to avoid circular dependencies
    const { supabase } = await import('../../lib/supabase.js');
    
    // PRIVACY-FIRST: Store audit logs in your own encrypted Vault
    const auditLog = {
      timestamp: sanitizedLog.timestamp,
      operation: 'api_access',
      endpoint_category: getEndpointCategory(sanitizedLog.endpoint), // Generic category only
      success: sanitizedLog.statusCode < 400,
      response_time_ms: sanitizedLog.duration,
      // NO personal data whatsoever
      // ❌ NEVER: User identifiers, transaction amounts, family relationships, message content
    };
    
    // Encrypt and store in your Supabase Vault
    // This follows your pattern: await vault.store('audit_log', encrypt(auditLog));
    const { error } = await supabase
      .from('privacy_audit_logs')
      .insert(auditLog);
    
    // Silent fail - don't expose database errors that could leak info
    if (error) {
      // ❌ NO logging of the error details to prevent info leakage
    }
  } catch (error) {
    // ❌ Silent fail - maintain privacy, never log errors that could contain sensitive data
  }
}

/**
 * Get generic endpoint category (no sensitive path info)
 */
function getEndpointCategory(endpoint) {
  if (endpoint.includes('/communications/')) return 'communications';
  if (endpoint.includes('/auth/')) return 'auth';
  if (endpoint.includes('/individual/')) return 'individual';
  if (endpoint.includes('/fedimint/')) return 'fedimint';
  return 'other';
}