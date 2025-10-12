/**
 * resolvePlatformLightningDomain
 *
 * Centralized resolver for the platform Lightning Address domain used in UI and client code.
 * Purpose: remove duplicated fallback logic and make rebranding a one-line config change.
 *
 * Rebrand guidance:
 * - Set VITE_PLATFORM_LIGHTNING_DOMAIN in your environment to the new domain
 * - This helper returns that value if set, or falls back to 'my.satnam.pub'
 * - Do NOT import this helper inside Netlify Functions; use the server-only helper instead
 */
import { clientConfig } from './env.client';

export const resolvePlatformLightningDomain = (): string =>
  clientConfig.domains.platformLightning || 'my.satnam.pub';

