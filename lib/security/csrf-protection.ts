// Browser-compatible CSRF protection using Web Crypto API
// NO Node.js dependencies - uses Web Crypto API for token generation

import { generateSecureToken } from '../privacy/encryption';

// CSRF token interface
export interface CSRFToken {
  token: string;
  expiresAt: number;
  createdAt: number;
}

// CSRF protection class
export class CSRFProtection {
  private tokenKey = 'satnam_csrf_token';
  private tokenTimeout = 30 * 60 * 1000; // 30 minutes

  /**
   * Generate a new CSRF token
   */
  generateToken(): CSRFToken {
    const token = generateSecureToken(32);
    const now = Date.now();
    
    const csrfToken: CSRFToken = {
      token,
      expiresAt: now + this.tokenTimeout,
      createdAt: now
    };

    // Store token in session storage
    sessionStorage.setItem(this.tokenKey, JSON.stringify(csrfToken));
    
    return csrfToken;
  }

  /**
   * Get current CSRF token
   */
  getToken(): CSRFToken | null {
    try {
      const stored = sessionStorage.getItem(this.tokenKey);
      if (!stored) {
        return null;
      }

      const token: CSRFToken = JSON.parse(stored);
      
      // Check if token is expired
      if (Date.now() > token.expiresAt) {
        this.clearToken();
        return null;
      }

      return token;
    } catch (error) {
      console.error('Failed to get CSRF token:', error);
      this.clearToken();
      return null;
    }
  }

  /**
   * Validate CSRF token
   */
  validateToken(token: string): boolean {
    const currentToken = this.getToken();
    if (!currentToken) {
      return false;
    }

    return currentToken.token === token;
  }

  /**
   * Clear CSRF token
   */
  clearToken(): void {
    sessionStorage.removeItem(this.tokenKey);
  }

  /**
   * Refresh CSRF token
   */
  refreshToken(): CSRFToken {
    this.clearToken();
    return this.generateToken();
  }

  /**
   * Get token for form submission
   */
  getTokenForForm(): string {
    const token = this.getToken();
    if (!token) {
      return this.generateToken().token;
    }
    return token.token;
  }

  /**
   * Verify token from request
   */
  verifyTokenFromRequest(requestToken: string): boolean {
    if (!requestToken) {
      return false;
    }

    return this.validateToken(requestToken);
  }
}

// Export singleton instance
export const csrfProtection = new CSRFProtection();
export default csrfProtection; 