/**
 * Unified Authentication System - Main Export
 *
 * This file exports all components and utilities from the unified authentication system.
 * Use these exports instead of the deprecated usePrivacyFirstAuth hook or direct
 * userIdentitiesAuth usage.
 */

// Main authentication system
export { PROTECTED_AREAS, useUnifiedAuth } from "./unified-auth-system";
export type {
  ProtectedArea,
  UnifiedAuthActions,
  UnifiedAuthState,
} from "./unified-auth-system";

// React components and providers
export {
  AuthGuard,
  IdentityForgeIntegration,
  NostrichSigninIntegration,
  SessionMonitor,
} from "../../components/auth/AuthIntegration";
export {
  AuthProvider,
  AuthStatus,
  useAuth,
  useIdentityForge,
  useNostrichSignin,
  withAuth,
} from "../../components/auth/AuthProvider";
export { ProtectedRoute } from "../../components/auth/ProtectedRoute";

// Route protection utilities
export {
  CommunicationsProtection,
  FamilyFinanceProtection,
  IndividualFinanceProtection,
  LightningNodeProtection,
  N424FeaturesProtection,
  PeerInvitationsProtection,
  PrivacySettingsProtection,
  ProfileSettingsProtection,
  ROUTE_PROTECTION_CONFIG,
  UserSovereigntyProtection,
  createProtectedRoutes,
  getProtectionAreaForRoute,
  useRouteProtection,
} from "./route-protection";

// Legacy compatibility exports removed - use unified auth system instead

// Core authentication types and utilities (for advanced usage)
export { userIdentitiesAuth } from "./user-identities-auth";
export type {
  AuthAttempt,
  AuthCredentials,
  AuthResult,
  UserIdentity,
} from "./user-identities-auth";

/**
 * Migration Guide:
 *
 * 1. Replace usePrivacyFirstAuth with useAuth:
 *    - Old: import { usePrivacyFirstAuth } from '../hooks/usePrivacyFirstAuth'
 *    - New: import { useAuth } from '../lib/auth'
 *
 * 2. Replace direct userIdentitiesAuth usage with unified hooks:
 *    - Old: import { userIdentitiesAuth } from '../lib/auth/user-identities-auth'
 *    - New: Use useAuth() hook methods instead
 *
 * 3. Add route protection:
 *    - Import protection components: import { CommunicationsProtection } from '../lib/auth'
 *    - Wrap components: <CommunicationsProtection><YourComponent /></CommunicationsProtection>
 *
 * 4. Set up application-wide authentication:
 *    - Wrap your app: import { AuthProvider } from '../lib/auth'
 *    - Add provider: <AuthProvider><App /></AuthProvider>
 */
