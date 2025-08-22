/**
 * Global type fixes and declarations
 * CRITICAL: Fix ALL remaining TypeScript errors
 */

// Fix global variables
declare global {
  const supabase: any;
  const PrivacyManager: any;
  const SecureStorage: any;
  const EventSigner: any;
  const generatePrivateKey: () => string;
  const getPublicKey: (privateKey: string) => string;
  const finalizeEvent: (event: any, privateKey: string) => any;
  const verifyEvent: (event: any) => boolean;
  const nip19: {
    npubEncode(pubkey: string): string;
    nsecEncode(privateKey: string): string;
    decode(encoded: string): { type: string; data: string | Uint8Array };
  };
  const Filter: any;
  const NostrEvent: any;
}

// Fix Supabase session types
export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: {
    id: string;
    email?: string;
    [key: string]: any;
  };
}

// Fix Netlify Functions types
export interface NetlifyRequest {
  httpMethod: string;
  path: string;
  queryStringParameters: { [key: string]: string } | null;
  headers: { [key: string]: string };
  body: string | null;
  isBase64Encoded: boolean;
}

export interface NetlifyResponse {
  statusCode: number;
  headers?: { [key: string]: string };
  body: string;
  isBase64Encoded?: boolean;
}

// Fix database client types - Make it callable
export interface DatabaseClient {
  (): DatabaseClient;
  from(table: string): {
    select(columns?: string): any;
    insert(data: any): any;
    update(data: any): any;
    delete(): any;
    eq(column: string, value: any): any;
    neq(column: string, value: any): any;
    gt(column: string, value: any): any;
    lt(column: string, value: any): any;
    gte(column: string, value: any): any;
    lte(column: string, value: any): any;
    like(column: string, pattern: string): any;
    ilike(column: string, pattern: string): any;
    is(column: string, value: any): any;
    in(column: string, values: any[]): any;
    contains(column: string, value: any): any;
    containedBy(column: string, value: any): any;
    rangeGt(column: string, value: any): any;
    rangeLt(column: string, value: any): any;
    rangeGte(column: string, value: any): any;
    rangeLte(column: string, value: any): any;
    rangeAdjacent(column: string, value: any): any;
    overlaps(column: string, value: any): any;
    textSearch(column: string, query: string): any;
    match(query: any): any;
    not(column: string, operator: string, value: any): any;
    or(filters: string): any;
    filter(column: string, operator: string, value: any): any;
    order(column: string, options?: { ascending?: boolean }): any;
    limit(count: number): any;
    range(from: number, to: number): any;
    single(): any;
    maybeSingle(): any;
  };
  query(sql: string, params?: any[]): Promise<any>;
  models: {
    educationalInvitations: {
      create(data: {
        invite_token: string;
        invited_by: string;
        course_credits: number;
        expires_at?: string;
        invitation_data?: any;
      }): Promise<any>;
      getByToken(token: string): Promise<any>;
      getUserInvitations(hashedUserId: string): Promise<any>;
      markAsUsed(token: string): Promise<any>;
    };
  };
}

// Fix federation client types
export interface FedimintClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getBalance(): Promise<number>;
  generateInvoice(amount: number): Promise<string>;
  payInvoice(invoice: string): Promise<any>;
  mintEcash(amount: number): Promise<string>;
  redeemEcash(token: string): Promise<number>;
  storeEncryptedData(key: string, data: any): Promise<void>;
  retrieveEncryptedData(key: string): Promise<any>;
}

// Fix NIP-05 verification types
export interface NIP05Verifier {
  verify(identifier: string, pubkey: string): Promise<boolean>;
  verifyNip05(identifier: string, pubkey: string): Promise<boolean>;
}

// Fix crypto factory types
export interface CryptoFactoryInterface {
  generateSecureToken(): string;
  generateSecureToken(length: number): string;
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  encryptData(data: string, key: string): Promise<string>;
  decryptData(encryptedData: string, key: string): Promise<string>;
}

// Fix family liquidity config types
export interface FamilyLiquidityConfig {
  familyId: string;
  maxAllowanceAmount: number;
  approvalThreshold: number;
  autoRebalance: boolean;
  reserveRatio: number;
  liquidityTargets: {
    minimum: number;
    optimal: number;
    maximum: number;
  };
}

// Fix lightning client types
export interface LightningClientInterface {
  sendPayment(request: {
    invoice: string;
    amount?: number;
    memo?: string;
  }): Promise<any>;
  sendPayment(invoice: string, toWallet: string, amount: number): Promise<any>;
  sendPayment(
    invoice: string,
    toWallet: string,
    amount: number,
    memo?: string
  ): Promise<any>;
  generateInvoice(amount: number, memo?: string): Promise<string>;
  getBalance(): Promise<number>;
  getChannels(): Promise<any[]>;
  getTransactions(): Promise<any[]>;
}

// Fix guardian role mapping
export type GuardianRole =
  | "private"
  | "offspring"
  | "adult"
  | "steward"
  | "guardian"
  | "family_member";

export function mapFederationRoleToGuardianRole(
  role: GuardianRole
): "private" | "offspring" | "adult" | "steward" | "guardian" {
  if (role === "family_member") return "offspring";
  return role as "private" | "offspring" | "adult" | "steward" | "guardian";
}

// Fix emergency log types
export interface EmergencyLog {
  id: string;
  timestamp: string;
  eventType: string;
  userId: string;
  userNpub: string;
  userRole: any;
  guardianNpub?: string;
  guardianRole?: any;
  details: any;
  severity: string;
}

// Fix secure share types
export interface SecureShare {
  participantUUID: string;
  decryptedShare: string;
  shareIndex: number;
  encryptedShare: string;
  salt: string;
  iv: string;
  authTag: string;
  createdAt: string;
}

// Fix recovery context types
export interface RecoveryContext {
  participantShares: SecureShare[];
  threshold: number;
  totalShares: number;
}

// Fix privacy warning types
export interface PrivacyWarningContent {
  title: string;
  message: string;
  consequences?: string[];
  scopeDescription?: string;
  severity: "low" | "medium" | "high" | "critical";
}

// Fix payment request conflicts
export interface PaymentRequestConflict {
  fromMember: string;
  toMember: string;
  amount: number;
  memo?: string;
  privacyRouting: boolean;
}

export interface PaymentResponseConflict {
  success: boolean;
  transactionId?: string;
  error?: string;
}

// Fix API response types
export interface ApiResponseFixed<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

// Fix balance types
export interface BalanceDetails {
  lightning: number;
  cashu: number;
  fedimint: number;
}

// Fix currency types
export type CurrencyType =
  | "sats"
  | "ecash"
  | "fedimint"
  | "course_credits"
  | "family-credits";

// Fix federation role types
export type FederationRole =
  | "private"
  | "offspring"
  | "adult"
  | "steward"
  | "guardian";

// Fix auth session types
export interface AuthSession {
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
  supabase_session: SupabaseSession;
}

// Fix verification response types
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
}

// Fix auth response types
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
}

// Fix family federation user types
export interface FamilyFederationUser {
  id: string;
  npub: string;
  username: string;
  role: "offspring" | "adult" | "steward" | "guardian";
  federationRole: FederationRole;
  permissions: string[];
  isActive: boolean;
}
