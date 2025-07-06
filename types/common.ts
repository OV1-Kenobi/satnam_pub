/**
 * @fileoverview Common TypeScript interfaces to replace any types
 * @description Comprehensive type definitions for the Citadel Identity Forge application
 */

// ==================== API Response Types ====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: Record<string, unknown>;
  timestamp?: string;
  requestId?: string;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// ==================== Configuration Types ====================

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  connectionTimeout?: number;
  queryTimeout?: number;
  pool?: {
    min: number;
    max: number;
    idle: number;
  };
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
}

export interface AppConfig {
  environment: "development" | "staging" | "production";
  port: number;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  encryption: {
    algorithm: string;
    keyLength: number;
    ivLength: number;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

// ==================== Lightning Network Types ====================

export interface LightningNodeInfo {
  nodeId: string;
  alias: string;
  color: string;
  version: string;
  blockHeight: number;
  networkGraph: {
    nodes: number;
    channels: number;
  };
  features: Record<string, boolean>;
}

export interface LightningChannel {
  channelId: string;
  fundingTxId: string;
  fundingOutput: number;
  capacity: number;
  localBalance: number;
  remoteBalance: number;
  commitFee: number;
  commitWeight: number;
  feePerKb: number;
  active: boolean;
  private: boolean;
  remotePubkey: string;
}

export interface LightningPayment {
  paymentHash: string;
  paymentPreimage?: string;
  paymentRequest: string;
  value: number;
  fee: number;
  status: "pending" | "succeeded" | "failed" | "cancelled";
  creationDate: string;
  settleDate?: string;
  failureReason?: string;
  htlcs: Array<{
    chanId: string;
    htlcIndex: number;
    amtToForward: number;
    feeToForward: number;
    expiryHeight: number;
    status: string;
  }>;
}

export interface LightningInvoice {
  memo: string;
  rPreimage: string;
  rHash: string;
  value: number;
  settled: boolean;
  creationDate: string;
  settleDate?: string;
  settleIndex?: number;
  expiry: number;
  fallbackAddr: string;
  cltvExpiry: number;
  routeHints: RouteHint[];
  private: boolean;
  addIndex: number;
  features: Record<string, boolean>;
}

export interface RouteHint {
  hopHints: Array<{
    nodeId: string;
    chanId: string;
    feeBaseMsat: number;
    feeProportionalMillionths: number;
    cltvExpiryDelta: number;
  }>;
}

// ==================== Fedimint Types ====================

export interface FedimintFederation {
  federationId: string;
  name: string;
  description: string;
  guardianCount: number;
  threshold: number;
  meta: {
    federationName: string;
    welcomeMessage: string;
    iconUrl?: string;
    sponsorUrl?: string;
  };
  modules: Record<string, ModuleConfig>;
  epochCount: number;
  status: "active" | "inactive" | "deprecated";
  createdAt: string;
  updatedAt: string;
}

export interface ModuleConfig {
  kind: string;
  version: number;
  config: Record<string, unknown>;
  consensus: Record<string, unknown>;
}

export interface GuardianInfo {
  id: string;
  name: string;
  pubkey: string;
  endpoint: string;
  status: "online" | "offline" | "unknown";
  lastSeen: string;
  version: string;
  latency?: number;
}

export interface EcashNote {
  denomination: number;
  noteId: string;
  signature: string;
  blindingFactor: string;
  timestamp: string;
  spendable: boolean;
}

// ==================== Nostr Types ====================

export interface NostrEvent {
  id: string;
  pubkey: string;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
  created_at: number;
}

export interface NostrProfile {
  name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
  lud06?: string;
  lud16?: string;
  nip05?: string;
  display_name?: string;
}

export interface NostrRelay {
  url: string;
  read: boolean;
  write: boolean;
  status: "connected" | "connecting" | "disconnected" | "error";
  lastConnected?: string;
  errorCount: number;
}

// ==================== Family Management Types ====================

export interface FamilyMember {
  id: string;
  userId: string;
  familyId: string;
  role: "offspring" | "adult" | "steward" | "guardian";
  permissions: FamilyPermissions;
  profile: {
    displayName: string;
    avatar?: string;
    dateOfBirth?: string;
    publicKey: string;
  };
  status: "active" | "pending" | "suspended";
  joinedAt: string;
  lastActive: string;
  deviceInfo?: DeviceInfo;
}

export interface FamilyPermissions {
  canMakePayments: boolean;
  canReceivePayments: boolean;
  maxPaymentAmount: number;
  canManageAllowance: boolean;
  canViewTransactions: boolean;
  canInviteMembers: boolean;
  canManageSettings: boolean;
  canAccessEmergencyFunds: boolean;
  spendingLimits: SpendingLimits;
}

export interface SpendingLimits {
  daily: number;
  weekly: number;
  monthly: number;
  perTransaction: number;
  categories: Record<string, number>;
}

export interface DeviceInfo {
  deviceId: string;
  deviceType: "mobile" | "desktop" | "tablet";
  platform: string;
  userAgent: string;
  ipAddress: string;
  lastUsed: string;
  trusted: boolean;
}

// ==================== Liquidity Management Types ====================

export interface LiquidityMetrics {
  utilization: {
    current: number;
    average: number;
    peak: number;
    trend: "increasing" | "decreasing" | "stable";
  };
  efficiency: {
    routingSuccess: number;
    averageFee: number;
    rebalanceFrequency: number;
    costPerTransaction: number;
  };
  reliability: {
    uptime: number;
    failureRate: number;
    responseTime: number;
    consistencyScore: number;
  };
  growth: {
    capacityGrowth: number;
    transactionGrowth: number;
    feeIncome: number;
    projectedGrowth: number;
  };
}

export interface LiquidityForecast {
  timeframe: "1d" | "7d" | "30d" | "90d";
  predictions: Array<{
    timestamp: string;
    expectedVolume: number;
    confidence: number;
    factors: string[];
  }>;
  riskFactors: Array<{
    factor: string;
    impact: "low" | "medium" | "high";
    probability: number;
    description: string;
  }>;
  recommendations: Array<{
    type:
      | "rebalance"
      | "increase_capacity"
      | "fee_adjustment"
      | "emergency_reserve";
    priority: "low" | "medium" | "high" | "critical";
    expectedBenefit: number;
    implementationCost: number;
    confidence: number;
    description: string;
  }>;
}

export interface OptimizationStrategy {
  id: string;
  name: string;
  description: string;
  totalCost: number;
  totalBenefit: number;
  netBenefit: number;
  implementationTime: number;
  successProbability: number;
  priority: number;
  actions: Array<{
    step: number;
    description: string;
    estimatedTime: number;
    dependencies: string[];
    resources: string[];
  }>;
}

// ==================== Zeus Integration Types ====================

export interface ZeusNodeConfig {
  nodeType: "lnd" | "clightning" | "eclair";
  host: string;
  port: number;
  tlsCert?: string;
  macaroon?: string;
  implementationSpecific: Record<string, unknown>;
  connectionTest: {
    lastTested: string;
    success: boolean;
    latency?: number;
    error?: string;
  };
}

export interface ChannelManagementConfig {
  autoRebalance: boolean;
  rebalanceThreshold: number;
  maxRebalanceFee: number;
  preferredPeers: string[];
  liquidityTargets: Array<{
    channelId: string;
    targetLocal: number;
    targetRemote: number;
    priority: number;
  }>;
}

export interface AllowanceAutomation {
  enabled: boolean;
  schedule: "daily" | "weekly" | "monthly";
  amount: number;
  familyMemberId: string;
  conditions: Array<{
    type: "balance_threshold" | "time_based" | "activity_based";
    value: unknown;
    operator: "gt" | "lt" | "eq" | "gte" | "lte";
  }>;
  notifications: {
    onSuccess: boolean;
    onFailure: boolean;
    recipients: string[];
  };
}

// ==================== Security Types ====================

export interface EncryptionConfig {
  algorithm: string;
  keyDerivation: {
    function: "pbkdf2" | "scrypt" | "argon2";
    iterations: number;
    saltLength: number;
    keyLength: number;
  };
  additionalData?: string;
}

export interface SecurityAuditLog {
  eventId: string;
  timestamp: string;
  eventType: "login" | "logout" | "payment" | "key_access" | "config_change";
  userId: string;
  ipAddress: string;
  userAgent: string;
  outcome: "success" | "failure" | "blocked";
  details: Record<string, unknown>;
  riskScore: number;
}

export interface ShamirSecretShare {
  id: string;
  threshold: number;
  totalShares: number;
  shareNumber: number;
  shareData: string;
  guardianId: string;
  createdAt: string;
  metadata: {
    algorithm: string;
    keyId: string;
    purpose: string;
  };
}

// ==================== Validation Types ====================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata?: Record<string, unknown>;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: "error" | "warning" | "info";
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
  suggestion?: string;
}

// ==================== Migration Types ====================

export interface MigrationRecord {
  id: string;
  version: string;
  description: string;
  executedAt: string;
  executionTime: number;
  success: boolean;
  rollbackData?: Record<string, unknown>;
  checksum: string;
}

export interface DatabaseMigration {
  version: string;
  description: string;
  up: string;
  down: string;
  dependencies: string[];
  metadata: Record<string, unknown>;
}

// ==================== Event Types ====================

export interface SystemEvent {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  data: Record<string, unknown>;
  metadata: {
    version: string;
    traceId: string;
    userId?: string;
    sessionId?: string;
  };
}

export interface WebhookEvent extends SystemEvent {
  webhookId: string;
  attempts: number;
  lastAttempt: string;
  nextAttempt?: string;
  status: "pending" | "delivered" | "failed" | "cancelled";
  response?: {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  };
}

// ==================== Testing Types ====================

export interface TestConfig {
  environment: "test" | "integration" | "e2e";
  database: {
    url: string;
    reset: boolean;
    seedData: boolean;
  };
  mocks: {
    lightning: boolean;
    fedimint: boolean;
    nostr: boolean;
  };
  timeout: number;
  retries: number;
}

export interface MockResponse<T = unknown> {
  data: T;
  status: number;
  delay?: number;
  error?: Error;
}

// ==================== Utility Types ====================

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalKeys<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

// ==================== Export all types ====================

export type * from "./database";
export type * from "./family";
export type * from "./index";
export type * from "./user";
