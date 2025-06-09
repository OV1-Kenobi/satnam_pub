/**
 * Configuration Entry Point
 * 
 * This file exports all configuration settings for use throughout the application.
 */

/**
 * API configuration
 */
export const apiConfig = {
  baseUrl: process.env.API_BASE_URL || 'https://api.satnam.pub',
  timeout: 30000, // 30 seconds
};

/**
 * Authentication configuration
 */
export const authConfig = {
  tokenStorageKey: 'satnam_auth_token',
  refreshTokenStorageKey: 'satnam_refresh_token',
};

/**
 * Feature flags
 */
export const featureFlags = {
  enableFamilyDashboard: true,
  enableIdentityForge: true,
  enableNostrEcosystem: true,
  enableEducationPlatform: true,
};
