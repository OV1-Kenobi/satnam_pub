/**
 * Privacy-First Contacts System Types
 *
 * Type definitions for the encrypted contacts management system
 * that maintains privacy-first principles and data minimization.
 */

// Core contact interface matching the database schema
export interface EncryptedContact {
  id: string;
  owner_hash: string;
  encrypted_npub: string;
  nip05_hash?: string;
  display_name_hash: string;
  family_role?: "adult" | "child" | "guardian" | "advisor" | "friend";
  trust_level: "family" | "trusted" | "known" | "unverified";
  supports_gift_wrap: boolean;
  preferred_encryption: "gift-wrap" | "nip04" | "auto";
  tags_hash: string[];
  notes_encrypted?: string;
  added_at: string;
  last_contact_at?: string;
  contact_count: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Client-side contact interface (decrypted for UI use)
export interface Contact {
  id: string;
  npub: string;
  displayName: string;
  nip05?: string;
  familyRole?: "adult" | "child" | "guardian" | "advisor" | "friend";
  trustLevel: "family" | "trusted" | "known" | "unverified";
  supportsGiftWrap: boolean;
  preferredEncryption: "gift-wrap" | "nip04" | "auto";
  notes?: string;
  tags: string[];
  addedAt: Date;
  lastContact?: Date;
  contactCount: number;

  // Extended properties from joins
  nip05Verified?: boolean;
  pubkeyVerified?: boolean;
  giftWrapCapabilityVerified?: boolean;
  giftWrapSuccessRate?: number;
  messageReliabilityScore?: number;
  groupMembershipCount?: number;
}

// Contact interaction log entry
export interface ContactInteractionLog {
  id: number;
  contact_id: string;
  owner_hash: string;
  interaction_type:
    | "message_sent"
    | "message_received"
    | "gift_wrap_detected"
    | "nip05_verified"
    | "contact_updated";
  interaction_timestamp: string;
  session_hash?: string;
  encrypted_metadata: Record<string, any>;
  created_at: string;
}

// Trust metrics for contacts
export interface ContactTrustMetrics {
  id: number;
  contact_id: string;
  owner_hash: string;
  trust_score_encrypted: string;
  gift_wrap_success_rate: number;
  message_reliability_score: number;
  last_trust_calculation: string;
  calculation_metadata_encrypted: string;
  created_at: string;
  updated_at: string;
}

// Contact groups
export interface ContactGroup {
  id: string;
  owner_hash: string;
  group_name_hash: string;
  group_type: "family" | "work" | "friends" | "custom";
  privacy_level: "high" | "medium" | "low";
  encrypted_description?: string;
  member_count: number;
  created_at: string;
  updated_at: string;
}

// Client-side group interface (decrypted)
export interface Group {
  id: string;
  name: string;
  type: "family" | "work" | "friends" | "custom";
  privacyLevel: "high" | "medium" | "low";
  description?: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Group membership
export interface ContactGroupMembership {
  id: number;
  contact_id: string;
  group_id: string;
  owner_hash: string;
  added_at: string;
  role_in_group?: "member" | "admin" | "moderator";
}

// Privacy preferences per contact
export interface ContactPrivacyPreferences {
  id: number;
  contact_id: string;
  owner_hash: string;
  allow_identity_disclosure: boolean;
  require_gift_wrap: boolean;
  block_plain_text: boolean;
  auto_accept_gift_wrap: boolean;
  privacy_warning_shown: boolean;
  privacy_consent_given: boolean;
  consent_timestamp?: string;
  privacy_settings_encrypted?: string;
  created_at: string;
  updated_at: string;
}

// Contact verification status
export interface ContactVerificationStatus {
  id: number;
  contact_id: string;
  owner_hash: string;
  nip05_verified: boolean;
  nip05_verification_date?: string;
  pubkey_verified: boolean;
  pubkey_verification_date?: string;
  gift_wrap_capability_verified: boolean;
  gift_wrap_verification_date?: string;
  verification_proofs_encrypted?: string;
  last_verification_attempt?: string;
  verification_failure_count: number;
  created_at: string;
  updated_at: string;
}

// Contact summary view (for efficient querying)
export interface ContactSummary {
  id: string;
  owner_hash: string;
  display_name_hash: string;
  family_role?: string;
  trust_level: string;
  supports_gift_wrap: boolean;
  preferred_encryption: string;
  added_at: string;
  last_contact_at?: string;
  contact_count: number;
  nip05_verified?: boolean;
  pubkey_verified?: boolean;
  gift_wrap_capability_verified?: boolean;
  gift_wrap_success_rate?: number;
  message_reliability_score?: number;
  group_membership_count: number;
}

// Input types for creating/updating contacts
export interface CreateContactInput {
  npub: string;
  nip05?: string;
  displayName: string;
  familyRole?: "adult" | "child" | "guardian" | "advisor" | "friend";
  trustLevel: "family" | "trusted" | "known" | "unverified";
  preferredEncryption: "gift-wrap" | "nip04" | "auto";
  notes?: string;
  tags: string[];
}

export interface UpdateContactInput {
  id: string;
  displayName?: string;
  familyRole?: "adult" | "child" | "guardian" | "advisor" | "friend";
  trustLevel?: "family" | "trusted" | "known" | "unverified";
  preferredEncryption?: "gift-wrap" | "nip04" | "auto";
  notes?: string;
  tags?: string[];
}

// Group creation/update inputs
export interface CreateGroupInput {
  name: string;
  type: "family" | "work" | "friends" | "custom";
  privacyLevel: "high" | "medium" | "low";
  description?: string;
}

export interface UpdateGroupInput {
  id: string;
  name?: string;
  type?: "family" | "work" | "friends" | "custom";
  privacyLevel?: "high" | "medium" | "low";
  description?: string;
}

// Filter and sort options for contacts
export interface ContactFilters {
  trustLevel?: "family" | "trusted" | "known" | "unverified";
  familyRole?: "adult" | "child" | "guardian" | "advisor" | "friend";
  supportsGiftWrap?: boolean;
  verified?: boolean;
  groupId?: string;
  search?: string;
}

export interface ContactSortOptions {
  field:
    | "displayName"
    | "addedAt"
    | "lastContact"
    | "trustLevel"
    | "contactCount";
  direction: "asc" | "desc";
}

// API response types
export interface ContactsResponse {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
}

export interface GroupsResponse {
  groups: Group[];
  total: number;
  page: number;
  limit: number;
}

// Error types
export interface ContactError {
  code: string;
  message: string;
  field?: string;
}

// Privacy audit types
export interface ContactPrivacyAudit {
  contactId: string;
  action: "created" | "updated" | "deleted" | "anonymized" | "disclosed";
  timestamp: Date;
  privacyLevel: "high" | "medium" | "low";
  metadata?: Record<string, any>;
}

// Utility types for trust scoring
export interface TrustScoreComponents {
  interactionFrequency: number;
  messageReliability: number;
  giftWrapSuccess: number;
  verificationStatus: number;
  timeBasedDecay: number;
}

export interface TrustScoreResult {
  overall: number;
  components: TrustScoreComponents;
  lastCalculated: Date;
  confidence: number;
}

// Contact stats aggregations
export interface ContactStats {
  totalContacts: number;
  contactsByTrustLevel: Record<string, number>;
  contactsByFamilyRole: Record<string, number>;
  giftWrapSupportCount: number;
  verifiedContactsCount: number;
  averageContactsPerWeek: number;
  mostActiveContacts: Contact[];
  recentlyAddedContacts: Contact[];
}

// Export/import types for contact data portability
export interface ContactExportData {
  contacts: Contact[];
  groups: Group[];
  exportedAt: Date;
  format: "json" | "csv";
  privacyLevel: "full" | "minimal" | "anonymized";
}

export interface ContactImportData {
  contacts: CreateContactInput[];
  groups?: CreateGroupInput[];
  importedAt: Date;
  source: string;
}

// Privacy compliance types
export interface PrivacyComplianceRecord {
  contactId: string;
  consentGiven: boolean;
  consentTimestamp: Date;
  privacyPolicyVersion: string;
  dataProcessingPurposes: string[];
  retentionPeriod: number;
  rightToErasure: boolean;
}

// Search and discovery types
export interface ContactSearchResult {
  contact: Contact;
  matchType: "exact" | "partial" | "fuzzy";
  matchField: "displayName" | "nip05" | "notes" | "tags";
  relevanceScore: number;
}

export interface ContactDiscoveryResult {
  npub: string;
  nip05?: string;
  displayName?: string;
  mutualConnections: number;
  trustSignals: string[];
  suggestedTrustLevel: "family" | "trusted" | "known" | "unverified";
}
