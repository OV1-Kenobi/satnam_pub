/**
 * Unified Authentication System - Main Export
 * 
 * This file exports all components and utilities from the unified authentication system.
 * Use these exports instead of the deprecated usePrivacyFirstAuth hook or direct
 * userIdentitiesAuth usage.
 */

// Main authentication system
export { useUnifiedAuth, PROTECTED_AREAS } from './unified-auth-system';
export type { UnifiedAuthState, UnifiedAuthActions, ProtectedArea } from './unified-auth-system';

// React components and providers
export { AuthProvider, useAuth, useIdentityForge, useNostrichSignin, withAuth, AuthStatus } from '../../components/auth/AuthProvider';
export { ProtectedRoute } from '../../components/auth/ProtectedRoute';
export { 
  IdentityForgeIntegration, 
  NostrichSigninIntegration, 
  SessionMonitor, 
  AuthGuard 
} from '../../components/auth/AuthIntegration';

// Route protection utilities
export {
  CommunicationsProtection,
  FamilyFinanceProtection,
  IndividualFinanceProtection,
  PrivacySettingsProtection,
  UserSovereigntyProtection,
  LightningNodeProtection,
  N424FeaturesProtection,
  ProfileSettingsProtection,
  PeerInvitationsProtection,
  useRouteProtection,
  createProtectedRoutes,
  getProtectionAreaForRoute,
  ROUTE_PROTECTION_CONFIG
} from './route-protection';

// Legacy compatibility (deprecated)
export { usePrivacyFirstAuth } from '../../hooks/usePrivacyFirstAuth';
export type { PrivacyUser, SecureSession } from '../../hooks/usePrivacyFirstAuth';

// Core authentication types and utilities (for advanced usage)
export { userIdentitiesAuth } from './user-identities-auth';
export type { 
  AuthCredentials, 
  AuthResult, 
  UserIdentity, 
  AuthAttempt 
} from './user-identities-auth';

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
