/**
 * Route Protection Configuration
 * 
 * Defines which routes require authentication and provides
 * easy-to-use components for protecting specific application areas.
 */

import { type FC, type ReactElement, type ReactNode } from 'react';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { PROTECTED_AREAS, ProtectedArea } from './unified-auth-system';

// Route protection configuration
export const ROUTE_PROTECTION_CONFIG = {
  // Communication features
  '/communications': PROTECTED_AREAS.COMMUNICATIONS,
  '/communications/*': PROTECTED_AREAS.COMMUNICATIONS,
  '/messaging': PROTECTED_AREAS.COMMUNICATIONS,
  '/messaging/*': PROTECTED_AREAS.COMMUNICATIONS,

  // Family financial management
  '/family/finance': PROTECTED_AREAS.FAMILY_FINANCE,
  '/family/finance/*': PROTECTED_AREAS.FAMILY_FINANCE,
  '/family/foundry': PROTECTED_AREAS.FAMILY_FOUNDRY,
  '/family/foundry/*': PROTECTED_AREAS.FAMILY_FOUNDRY,

  // Individual finance
  '/finance': PROTECTED_AREAS.INDIVIDUAL_FINANCE,
  '/finance/*': PROTECTED_AREAS.INDIVIDUAL_FINANCE,
  '/wallet': PROTECTED_AREAS.INDIVIDUAL_FINANCE,
  '/wallet/*': PROTECTED_AREAS.INDIVIDUAL_FINANCE,

  // Privacy settings
  '/privacy': PROTECTED_AREAS.PRIVACY_SETTINGS,
  '/privacy/*': PROTECTED_AREAS.PRIVACY_SETTINGS,
  '/settings/privacy': PROTECTED_AREAS.PRIVACY_SETTINGS,

  // User sovereignty
  '/sovereignty': PROTECTED_AREAS.USER_SOVEREIGNTY,
  '/sovereignty/*': PROTECTED_AREAS.USER_SOVEREIGNTY,
  '/identity': PROTECTED_AREAS.USER_SOVEREIGNTY,
  '/identity/*': PROTECTED_AREAS.USER_SOVEREIGNTY,

  // Lightning node management
  '/lightning': PROTECTED_AREAS.LN_NODE_MANAGEMENT,
  '/lightning/*': PROTECTED_AREAS.LN_NODE_MANAGEMENT,
  '/node': PROTECTED_AREAS.LN_NODE_MANAGEMENT,
  '/node/*': PROTECTED_AREAS.LN_NODE_MANAGEMENT,

  // N424 features
  '/n424': PROTECTED_AREAS.N424_FEATURES,
  '/n424/*': PROTECTED_AREAS.N424_FEATURES,
  '/nip424': PROTECTED_AREAS.N424_FEATURES,
  '/nip424/*': PROTECTED_AREAS.N424_FEATURES,

  // Profile and settings
  '/profile': PROTECTED_AREAS.PROFILE_SETTINGS,
  '/profile/*': PROTECTED_AREAS.PROFILE_SETTINGS,
  '/settings': PROTECTED_AREAS.PROFILE_SETTINGS,
  '/settings/*': PROTECTED_AREAS.PROFILE_SETTINGS,

  // Invitations and peer management
  '/invitations': PROTECTED_AREAS.PEER_INVITATIONS,
  '/invitations/*': PROTECTED_AREAS.PEER_INVITATIONS,
  '/peers': PROTECTED_AREAS.PEER_INVITATIONS,
  '/peers/*': PROTECTED_AREAS.PEER_INVITATIONS,
} as const;

// Helper function to get protection area for a route
export const getProtectionAreaForRoute = (pathname: string): ProtectedArea | null => {
  // Direct match first
  if (pathname in ROUTE_PROTECTION_CONFIG) {
    return ROUTE_PROTECTION_CONFIG[pathname as keyof typeof ROUTE_PROTECTION_CONFIG];
  }

  // Check for wildcard matches
  for (const [route, area] of Object.entries(ROUTE_PROTECTION_CONFIG)) {
    if (route.endsWith('/*')) {
      const baseRoute = route.slice(0, -2);
      if (pathname.startsWith(baseRoute)) {
        return area;
      }
    }
  }

  return null;
};

// Specific protection components for different areas
interface ProtectionProps {
  children: ReactNode;
  fallbackPath?: string;
  showAuthPrompt?: boolean;
}

/**
 * Communications Protection
 * Protects messaging and communication features
 */
export const CommunicationsProtection: FC<ProtectionProps> = ({
  children,
  fallbackPath = '/',
  showAuthPrompt = true
}) => (
  <ProtectedRoute
    area={PROTECTED_AREAS.COMMUNICATIONS}
    fallbackPath={fallbackPath}
    showAuthPrompt={showAuthPrompt}
  >
    {children}
  </ProtectedRoute>
);

/**
 * Family Finance Protection
 * Protects family financial management features
 */
export const FamilyFinanceProtection: FC<ProtectionProps> = ({
  children,
  fallbackPath = '/',
  showAuthPrompt = true
}) => (
  <ProtectedRoute
    area={PROTECTED_AREAS.FAMILY_FINANCE}
    fallbackPath={fallbackPath}
    showAuthPrompt={showAuthPrompt}
  >
    {children}
  </ProtectedRoute>
);

/**
 * Individual Finance Protection
 * Protects personal financial features
 */
export const IndividualFinanceProtection: FC<ProtectionProps> = ({
  children,
  fallbackPath = '/',
  showAuthPrompt = true
}) => (
  <ProtectedRoute
    area={PROTECTED_AREAS.INDIVIDUAL_FINANCE}
    fallbackPath={fallbackPath}
    showAuthPrompt={showAuthPrompt}
  >
    {children}
  </ProtectedRoute>
);

/**
 * Privacy Settings Protection
 * Protects privacy configuration features
 */
export const PrivacySettingsProtection: FC<ProtectionProps> = ({
  children,
  fallbackPath = '/',
  showAuthPrompt = true
}) => (
  <ProtectedRoute
    area={PROTECTED_AREAS.PRIVACY_SETTINGS}
    fallbackPath={fallbackPath}
    showAuthPrompt={showAuthPrompt}
  >
    {children}
  </ProtectedRoute>
);

/**
 * User Sovereignty Protection
 * Protects identity and sovereignty features
 */
export const UserSovereigntyProtection: FC<ProtectionProps> = ({
  children,
  fallbackPath = '/',
  showAuthPrompt = true
}) => (
  <ProtectedRoute
    area={PROTECTED_AREAS.USER_SOVEREIGNTY}
    fallbackPath={fallbackPath}
    showAuthPrompt={showAuthPrompt}
  >
    {children}
  </ProtectedRoute>
);

/**
 * Lightning Node Protection
 * Protects Lightning node management features
 */
export const LightningNodeProtection: FC<ProtectionProps> = ({
  children,
  fallbackPath = '/',
  showAuthPrompt = true
}) => (
  <ProtectedRoute
    area={PROTECTED_AREAS.LN_NODE_MANAGEMENT}
    fallbackPath={fallbackPath}
    showAuthPrompt={showAuthPrompt}
  >
    {children}
  </ProtectedRoute>
);

/**
 * N424 Features Protection
 * Protects NIP-424 creation and programming features
 */
export const N424FeaturesProtection: FC<ProtectionProps> = ({
  children,
  fallbackPath = '/',
  showAuthPrompt = true
}) => (
  <ProtectedRoute
    area={PROTECTED_AREAS.N424_FEATURES}
    fallbackPath={fallbackPath}
    showAuthPrompt={showAuthPrompt}
  >
    {children}
  </ProtectedRoute>
);

/**
 * Profile Settings Protection
 * Protects user profile and general settings
 */
export const ProfileSettingsProtection: FC<ProtectionProps> = ({
  children,
  fallbackPath = '/',
  showAuthPrompt = true
}) => (
  <ProtectedRoute
    area={PROTECTED_AREAS.PROFILE_SETTINGS}
    fallbackPath={fallbackPath}
    showAuthPrompt={showAuthPrompt}
  >
    {children}
  </ProtectedRoute>
);

/**
 * Peer Invitations Protection
 * Protects invitation and peer management features
 */
export const PeerInvitationsProtection: FC<ProtectionProps> = ({
  children,
  fallbackPath = '/',
  showAuthPrompt = true
}) => (
  <ProtectedRoute
    area={PROTECTED_AREAS.PEER_INVITATIONS}
    fallbackPath={fallbackPath}
    showAuthPrompt={showAuthPrompt}
  >
    {children}
  </ProtectedRoute>
);

/**
 * Generic route protection hook
 */
export const useRouteProtection = () => {
  const getCurrentProtectionArea = (pathname: string) => {
    return getProtectionAreaForRoute(pathname);
  };

  const isProtectedRoute = (pathname: string) => {
    return getCurrentProtectionArea(pathname) !== null;
  };

  return {
    getCurrentProtectionArea,
    isProtectedRoute,
    PROTECTED_AREAS,
    ROUTE_PROTECTION_CONFIG
  };
};

/**
 * Route protection middleware for React Router
 */
export const createProtectedRoutes = (routes: Array<{
  path: string;
  element: ReactElement;
  area?: ProtectedArea;
  fallbackPath?: string;
  showAuthPrompt?: boolean;
}>) => {
  return routes.map(route => {
    const protectionArea = route.area || getProtectionAreaForRoute(route.path);

    if (protectionArea) {
      return {
        ...route,
        element: (
          <ProtectedRoute
            area={protectionArea}
            fallbackPath={route.fallbackPath}
            showAuthPrompt={route.showAuthPrompt}
          >
            {route.element}
          </ProtectedRoute>
        )
      };
    }

    return route;
  });
};

export default {
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
  getProtectionAreaForRoute
};
