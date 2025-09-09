// JWT Secret helper for Netlify Functions
// Derive JWT secret deterministically from DUID_SERVER_SECRET

import crypto from 'node:crypto';
import { getEnvVar } from './env';

/**
 * Deterministically derive JWT secret from DUID_SERVER_SECRET
 * HMAC-SHA256(DUID_SERVER_SECRET, "jwt_secret|v1") -> hex
 */
export function getJwtSecret() {
  const duidSecret = getEnvVar('DUID_SERVER_SECRET');
  if (!duidSecret) {
    throw new Error('DUID_SERVER_SECRET is required to derive JWT secret');
  }
  const hmac = crypto.createHmac('sha256', duidSecret);
  hmac.update('jwt_secret|v1');
  return hmac.digest('hex');
}

