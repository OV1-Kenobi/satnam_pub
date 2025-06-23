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
}

export interface FamilyFederationUser {
  npub: string;
  nip05?: string;
  federationRole: "parent" | "child" | "guardian";
  authMethod: "nwc" | "otp";
  isWhitelisted: boolean;
  votingPower: number;
  guardianApproved: boolean;
  sessionToken: string;
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
      federationRole: string | null;
      authMethod: string;
      isWhitelisted: boolean;
      votingPower: number;
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
      federationRole: "parent" | "child" | "guardian";
      authMethod: "nwc";
      isWhitelisted: boolean;
      votingPower: number;
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
  error: string | null;
  login: (authData: FamilyFederationUser) => void;
  logout: () => void;
  checkSession: () => Promise<boolean>;
}

// Individual Authentication Types
export interface IndividualUser {
  npub: string;
  nip05?: string;
  lightningAddress: string;
  authMethod: "lightning" | "cashu" | "nwc";
  walletType: "personal" | "child" | "guardian";
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
      walletType: "personal" | "child" | "guardian";
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
