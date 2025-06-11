/**
 * Pubky Domain Models
 * 
 * This module defines TypeScript interfaces for Pubky-related database entities.
 */

export interface PubkyDomain {
  id: string;
  domainRecordId: string;
  publicKey: string;
  privateKeyEncrypted: string;
  homeserverUrl?: string;
  pkarrRelayUrl?: string;
  registrationStatus: 'pending' | 'registered' | 'failed' | 'revoked';
  lastVerifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PubkyKeypair {
  id: string;
  familyId: string;
  name: string;
  publicKey: string;
  privateKeyEncrypted: string;
  keyType: 'ed25519' | 'secp256k1';
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DomainMigration {
  id: string;
  domainRecordId: string;
  sourceProvider: string;
  targetProvider: string;
  migrationStatus: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  migrationData?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PkarrRecord {
  id: string;
  pubkyDomainId: string;
  recordType: string;
  recordName: string;
  recordValue: string;
  ttl: number;
  lastPublishedAt?: Date;
  publishStatus: 'pending' | 'published' | 'failed';
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SovereigntyScore {
  id: string;
  domainRecordId: string;
  score: number;
  scoreBreakdown: {
    providerIndependence: number;
    keyOwnership: number;
    censorship: number;
    privacy: number;
    portability: number;
    [key: string]: number;
  };
  calculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PubkyUserProfile {
  userId: string;
  pubkyUrl?: string;
  pubkyPublicKey?: string;
  pubkyPrivateKeyEncrypted?: string;
}

export interface PubkyFamilyProfile {
  familyId: string;
  pubkyUrl?: string;
  pubkyPublicKey?: string;
  pubkyHomeserverUrl?: string;
  pubkyRelayUrl?: string;
  pubkyEnabled: boolean;
}

export interface PubkyGuardianBackup {
  guardianId: string;
  pubkyBackupStatus: 'none' | 'pending' | 'active' | 'failed';
  pubkyBackupUrl?: string;
  pubkyBackupLastUpdated?: Date;
}

export interface PubkyDomainEvent {
  eventType: 'registration' | 'verification' | 'update' | 'migration' | 'record_change';
  domainId: string;
  publicKey?: string;
  details: Record<string, unknown>;
  timestamp: Date;
}

export interface SovereigntyScoreEvent {
  domainId: string;
  domainName: string;
  score: number;
  previousScore?: number;
  scoreBreakdown: Record<string, number>;
  calculatedAt: Date;
}

export interface PubkySubscription {
  url: string;
  clientId: string;
  subscriptionType: 'domain' | 'family' | 'user';
  entityId: string;
  createdAt: Date;
}