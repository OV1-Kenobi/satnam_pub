/**
 * Environment variable getter for Netlify Functions (Node.js environment)
 * This is different from the browser version that uses import.meta.env
 */
export function getEnvVar(key: string): string | undefined {
  return process.env[key];
}

export function getRequiredEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Get DUID server secret for hashing operations
 */
export function getDuidServerSecret(): string | undefined {
  return process.env.DUID_SERVER_SECRET;
}
