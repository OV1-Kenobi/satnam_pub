/**
 * resolvePlatformLightningDomainServer
 *
 * Server-only helper for Netlify Functions to resolve the platform Lightning Address domain.
 *
 * IMPORTANT:
 * - Do NOT import client-side config here. Netlify Functions must access process.env directly.
 * - Checks VITE_PLATFORM_LIGHTNING_DOMAIN first, then legacy PLATFORM_LIGHTNING_DOMAIN, then falls back to 'my.satnam.pub'.
 */
export const resolvePlatformLightningDomainServer = (): string =>
  process.env.VITE_PLATFORM_LIGHTNING_DOMAIN ||
  process.env.PLATFORM_LIGHTNING_DOMAIN ||
  "my.satnam.pub";
