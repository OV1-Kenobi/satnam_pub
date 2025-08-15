// Family Federation Authentication Types
// File: src/types/auth.ts

// NIP-07 Browser Extension Types (for signin modal)
export interface NostrExtension {
  getPublicKey(): Promise<string>;
  signEvent(event: any): Promise<any>;
  getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

export interface NIP07AuthChallenge {
  challenge: string;
  domain: string;
  timestamp: number;
  expiresAt: number;
  nonce?: string; // server-provided nonce for replay protection
}

// New hierarchical role system for Family Federations
export type FederationRole =
  | "private"
  | "offspring"
  | "adult"
  | "steward"
  | "guardian";

// Role hierarchy: Guardian > Steward > Adult > Offspring > Private (no hierarchy)
export interface RolePermissions {
  can_view_own_balance?: boolean;
  can_view_family_balances?: boolean;
  can_view_all_balances?: boolean;
  can_make_small_payments?: boolean;
  can_approve_offspring_payments?: boolean;
  can_approve_adult_payments?: boolean;
  can_approve_all_payments?: boolean;
  can_create_offspring?: boolean;
  can_create_adults?: boolean;
  can_create_any_role?: boolean;
  can_manage_offspring?: boolean;
  can_manage_adults?: boolean;
  can_manage_all_roles?: boolean;
  can_remove_stewards?: boolean;
  can_view_family_events?: boolean;
  can_view_federation_settings?: boolean;
  can_propose_changes?: boolean;
  can_manage_federation?: boolean;
  can_emergency_override?: boolean;
  // Private user permissions
  can_manage_own_funds?: boolean;
  can_set_own_spending_limits?: boolean;
  can_manage_own_custody?: boolean;
  no_rbac_restrictions?: boolean;
}

export interface RoleHierarchy {
  role: FederationRole;
  permissions: RolePermissions;
  can_promote_to: FederationRole[];
  can_demote_from: FederationRole[];
  can_remove: boolean;
  daily_spending_limit: number;
  requires_approval_for: string[];
}

export interface FamilyFederationUser {
  npub: string;
  nip05?: string;
  federationRole: FederationRole;
  authMethod: "nip05-password" | "nip07" | "otp" | "nsec";
  isWhitelisted: boolean;
  votingPower: number;
  stewardApproved: boolean;
  guardianApproved: boolean;
  sessionToken: string;
  createdBy?: string; // Hash of creator's npub
  rolePermissions?: RolePermissions;
}

// REMOVED: Duplicate HashedUserIdentity interface
// Now using the consolidated UserIdentity interface from src/lib/auth/user-identities-auth.ts
// This eliminates duplication and ensures single source of truth for user identity types

// MAXIMUM ENCRYPTION: Authentication credentials for hashed lookup
export interface HashedAuthCredentials {
  nip05: string; // Input plaintext (will be hashed for comparison)
  password: string; // Input plaintext (will be hashed for comparison)
}

export interface AuthResponse {
  success: boolean;
  data?: {
    message: string;
    otpKey: string;
    npub: string;
    nip05?: string;
    expiresIn: number;
    messageId: string;
    sentVia: string;
    sender: string;
  };
  error?: string;
  details?: string;
  meta: {
    timestamp: string;
    production?: boolean;
  };
}

export interface VerificationResponse {
  success: boolean;
  data?: {
    authenticated: boolean;
    sessionToken: string;
    userAuth: {
      npub: string;
      nip05?: string;
      federationRole: FederationRole | null;
      authMethod: string;
      isWhitelisted: boolean;
      votingPower: number;
      stewardApproved: boolean;
      guardianApproved: boolean;
    };
    message: string;
    verificationMethod: string;
    otpSender: string;
  };
  error?: string;
  attemptsRemaining?: number;
  meta: {
    timestamp: string;
  };
}

export interface FamilyFederationAuthHook {
  // Authentication state
  isAuthenticated: boolean;
  isLoading: boolean;
  user: FamilyFederationUser | null;

  // OTP operations
  sendOTP: (npub: string, nip05?: string) => Promise<void>;
  verifyOTP: (otpKey: string, otp: string) => Promise<void>;

  // Session management
  logout: () => void;
  refreshSession: () => Promise<void>;

  // Error handling
  error: string | null;
  clearError: () => void;
}

// NWC Authentication Response Types
export interface NWCAuthResponse {
  success: boolean;
  data?: {
    authenticated: boolean;
    sessionToken: string;
    userAuth: {
      npub: string;
      nip05: string;
      federationRole: FederationRole;
      authMethod: "nip05-password" | "nip07" | "otp" | "nsec";
      isWhitelisted: boolean;
      votingPower: number;
      stewardApproved: boolean;
      guardianApproved: boolean;
    };
    message: string;
  };
  error?: string;
  whitelisted?: boolean;
  nip05?: string;
  details?: string;
  meta?: {
    timestamp: string;
  };
}

// Generic API Response Type
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: string;
  meta?: {
    timestamp: string;
    production?: boolean;
  };
}

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userAuth: FamilyFederationUser | null;
  user: FamilyFederationUser | null; // Alias for userAuth
  error: string | null;
  login: (authData: FamilyFederationUser) => void;
  logout: () => void;
  checkSession: () => Promise<boolean>;

  // OTP operations for compatibility
  sendOTP: (npub: string, nip05?: string) => Promise<void>;
  verifyOTP: (otpKey: string, otp: string) => Promise<void>;
  clearError: () => void;
}

// Identity Forge Registration Types
export interface IdentityRegistrationRequest {
  username: string;
  password: string;
  confirmPassword: string;
  recoveryPhrase: string;
  nip05: string;
  lightningAddress?: string;
  generateInviteToken: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  nip05: string;
  createdAt: string;
  updatedAt: string;
}

export interface InviteToken {
  token: string;
  expiresAt: string;
  uses: number;
  maxUses: number;
}

export interface IdentityRegistrationResult {
  success: boolean;
  user: {
    id: string;
    username: string;
    npub: string;
    nip05: string;
    lightningAddress?: string;
    registeredAt: string;
    role: string;
    privacyLevel: string;
    zeroKnowledgeEnabled: boolean;
  };
  inviteToken?: InviteToken;
  message: string;
  error?: string;
  meta: {
    timestamp: string;
    architecture: string;
    tablesUpdated: string[];
  };
}

// Individual Authentication Types
export interface IndividualUser {
  npub: string;
  nip05?: string;
  lightningAddress: string;
  authMethod: "lightning" | "cashu" | "nwc";
  walletType: "personal" | "offspring" | "adult" | "steward" | "guardian";
  spendingLimits?: {
    daily: number;
    weekly: number;
    requiresApproval: number;
  };
  sessionToken: string;
  balance?: {
    lightning: number;
    cashu: number;
  };
}

export interface IndividualAuthResponse {
  success: boolean;
  data?: {
    authenticated: boolean;
    sessionToken: string;
    userAuth: {
      npub: string;
      nip05?: string;
      lightningAddress: string;
      authMethod: "lightning" | "cashu" | "nwc";
      walletType: "personal" | "offspring" | "adult" | "steward" | "guardian";
      spendingLimits?: {
        daily: number;
        weekly: number;
        requiresApproval: number;
      };
      balance?: {
        lightning: number;
        cashu: number;
      };
    };
    message: string;
    verificationMethod: string;
  };
  error?: string;
  details?: string;
  meta: {
    timestamp: string;
  };
}
