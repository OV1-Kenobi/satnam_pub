/**
 * TypeScript Type Definitions for BIFROST
 * 
 * Provides type safety for BIFROST integration with Satnam Family Federations
 */

/**
 * BIFROST Group Package
 * Contains the group configuration and public key information
 */
export interface BifrostGroupPackage {
  threshold: number;
  members: number;
  groupPublicKey: string;
  memberPublicKeys: string[];
}

/**
 * BIFROST Share Package
 * Contains individual share information for a federation member
 */
export interface BifrostSharePackage {
  memberId: number;
  share: string;
  commitment: string[];
}

/**
 * BIFROST Node Configuration
 */
export interface BifrostNodeConfig {
  debug?: boolean;
  cache?: {
    ecdh?: Map<string, string>;
  };
  middleware?: {
    ecdh?: (node: any, msg: any) => any;
    sign?: (node: any, msg: any) => any;
  };
  policies?: Array<[string, boolean, boolean]>;
}

/**
 * BIFROST Signing Options
 */
export interface BifrostSigningOptions {
  content?: any;
  peers?: string[];
  stamp?: number;
  type?: string;
  tweaks?: string[];
}

/**
 * BIFROST Signing Request
 */
export interface BifrostSigningRequest {
  message: string;
  options?: BifrostSigningOptions;
}

/**
 * BIFROST Signing Response
 */
export interface BifrostSigningResponse {
  ok: boolean;
  data?: string;
  error?: string;
}

/**
 * BIFROST ECDH Request
 */
export interface BifrostECDHRequest {
  ecdhPk: string;
  peerPks: string[];
}

/**
 * BIFROST ECDH Response
 */
export interface BifrostECDHResponse {
  ok: boolean;
  data?: string;
  error?: string;
}

/**
 * BIFROST Node Events
 */
export interface BifrostNodeEvents {
  '*': [string, ...any[]];
  'ready': any;
  'closed': any;
  'message': any;
  'bounced': [string, any];
  '/ecdh/sender/req': any;
  '/ecdh/sender/res': any[];
  '/ecdh/sender/rej': [string, any];
  '/ecdh/sender/sec': [string, any[]];
  '/ecdh/sender/err': [string, any[]];
  '/ecdh/handler/req': any;
  '/ecdh/handler/res': any;
  '/ecdh/handler/rej': [string, any];
  '/sign/sender/req': any;
  '/sign/sender/res': any[];
  '/sign/sender/rej': [string, any];
  '/sign/sender/sig': [string, any[]];
  '/sign/sender/err': [string, any[]];
  '/sign/handler/req': any;
  '/sign/handler/res': any;
  '/sign/handler/rej': [string, any];
}

/**
 * BIFROST Federation Member
 */
export interface BifrostFederationMember {
  memberId: number;
  publicKey: string;
  sharePkg: string;
  role: 'guardian' | 'steward' | 'adult' | 'offspring' | 'private';
}

/**
 * BIFROST Federation Configuration
 */
export interface BifrostFederationConfig {
  federationId: string;
  threshold: number;
  members: number;
  groupPkg: string;
  relays: string[];
  members: BifrostFederationMember[];
}

/**
 * BIFROST Federation Status
 */
export interface BifrostFederationStatus {
  federationId: string;
  isInitialized: boolean;
  isReady: boolean;
  relayCount: number;
  hasGroupPkg: boolean;
  hasSharePkg: boolean;
  memberCount?: number;
  threshold?: number;
}

/**
 * BIFROST Dealer Package Result
 */
export interface BifrostDealerPackageResult {
  group: BifrostGroupPackage;
  shares: BifrostSharePackage[];
}

/**
 * BIFROST Share Generation Result
 */
export interface BifrostShareGenerationResult {
  groupPkg: string;
  sharePkgs: string[];
  threshold: number;
  members: number;
}

/**
 * BIFROST Operation Result
 */
export interface BifrostOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: number;
}

/**
 * BIFROST Signing Operation Result
 */
export interface BifrostSigningOperationResult extends BifrostOperationResult<string> {
  signature?: string;
  messageHash?: string;
}

/**
 * BIFROST ECDH Operation Result
 */
export interface BifrostECDHOperationResult extends BifrostOperationResult<string> {
  sharedSecret?: string;
  peerCount?: number;
}

/**
 * BIFROST Federation Event
 */
export interface BifrostFederationEvent {
  type: 'signing' | 'ecdh' | 'relay' | 'error';
  federationId: string;
  timestamp: number;
  data: any;
}

/**
 * BIFROST Relay Configuration
 */
export interface BifrostRelayConfig {
  url: string;
  read: boolean;
  write: boolean;
  timeout?: number;
}

/**
 * BIFROST Policy
 */
export interface BifrostPolicy {
  pubkey: string;
  allowSend: boolean;
  allowRecv: boolean;
}

/**
 * BIFROST Node Request Interface
 */
export interface BifrostNodeRequest {
  sign(message: string, options?: BifrostSigningOptions): Promise<BifrostSigningResponse>;
  ecdh(ecdhPk: string, peerPks: string[]): Promise<BifrostECDHResponse>;
}

/**
 * BIFROST Node Interface
 */
export interface BifrostNodeInterface {
  req: BifrostNodeRequest;
  on(event: keyof BifrostNodeEvents, callback: (...args: any[]) => void): void;
  connect(): Promise<void>;
  close(): Promise<void>;
}

