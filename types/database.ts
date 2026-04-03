/**
 * Database model interfaces for Privacy-First Identity System
 */

export interface UserIdentity {
  id: string; // DUID index for secure O(1) authentication
  user_salt: string;
  encrypted_nsec?: string;
  encrypted_nsec_iv?: string | null;
  encrypted_nsec_tag?: string | null;
  encrypted_username?: string;
  encrypted_username_iv?: string | null;
  encrypted_username_tag?: string | null;
  encrypted_bio?: string;
  encrypted_bio_iv?: string | null;
  encrypted_bio_tag?: string | null;
  encrypted_display_name?: string;
  encrypted_display_name_iv?: string | null;
  encrypted_display_name_tag?: string | null;
  encrypted_picture?: string;
  encrypted_picture_iv?: string | null;
  encrypted_picture_tag?: string | null;
  encrypted_nip05?: string;
  encrypted_nip05_iv?: string | null;
  encrypted_nip05_tag?: string | null;
  encrypted_lightning_address?: string;
  encrypted_lightning_address_iv?: string | null;
  encrypted_lightning_address_tag?: string | null;
  password_hash: string;
  password_salt: string;
  password_created_at: Date;
  password_updated_at: Date;
  failed_attempts: number;
  locked_until?: Date;
  requires_password_change: boolean;
  role: "private" | "offspring" | "adult" | "steward" | "guardian";
  spending_limits: any; // JSONB
  privacy_settings: any; // JSONB
  family_federation_id?: string;
  is_agent?: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FamilyFederation {
  id: string; // UUID
  federation_name: string;
  domain?: string;
  relay_url?: string;
  federation_duid: string; // Global salted federation identifier
  created_by?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FamilyMember {
  id: string; // UUID
  family_federation_id: string;
  user_duid: string; // References user_identities.id (DUID)
  family_role: "offspring" | "adult" | "steward" | "guardian";
  spending_approval_required: boolean;
  voting_power: number;
  joined_at: Date;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Nip05Record {
  id: string; // UUID
  name: string; // Temporary plaintext for migration
  pubkey: string; // Temporary plaintext for migration
  user_duid?: string; // Same value as user_identities.id
  pubkey_duid?: string;
  domain: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface NostrBackup {
  id: string; // UUID
  user_duid: string; // Updated to use DUID
  event_id: string;
  relay_url: string;
  backup_hash?: string;
  created_at: Date;
}

// Input types for creating records
export interface CreateUserIdentityInput {
  id: string; // DUID
  user_salt: string;
  encrypted_nsec?: string;
  encrypted_nsec_iv?: string | null;
  encrypted_nsec_tag?: string | null;
  encrypted_username?: string;
  encrypted_username_iv?: string | null;
  encrypted_username_tag?: string | null;
  encrypted_bio?: string;
  encrypted_bio_iv?: string | null;
  encrypted_bio_tag?: string | null;
  encrypted_display_name?: string;
  encrypted_display_name_iv?: string | null;
  encrypted_display_name_tag?: string | null;
  encrypted_picture?: string;
  encrypted_picture_iv?: string | null;
  encrypted_picture_tag?: string | null;
  encrypted_nip05?: string;
  encrypted_nip05_iv?: string | null;
  encrypted_nip05_tag?: string | null;
  encrypted_lightning_address?: string;
  encrypted_lightning_address_iv?: string | null;
  encrypted_lightning_address_tag?: string | null;
  password_hash: string;
  password_salt: string;
  role?: "private" | "offspring" | "adult" | "steward" | "guardian";
  spending_limits?: any;
  privacy_settings?: any;
  family_federation_id?: string;
  is_agent?: boolean;
}

export interface CreateFamilyFederationInput {
  federation_name: string;
  domain?: string;
  relay_url?: string;
  federation_duid: string;
}

export interface CreateFamilyMemberInput {
  family_federation_id: string;
  user_duid: string;
  family_role: "offspring" | "adult" | "steward" | "guardian";
  spending_approval_required?: boolean;
  voting_power?: number;
}

export interface CreateNip05RecordInput {
  name: string;
  pubkey: string;
  user_duid?: string; // Same value as user_identities.id
  pubkey_duid?: string;
  domain?: string;
}

export interface CreateNostrBackupInput {
  user_duid: string;
  event_id: string;
  relay_url?: string;
  backup_hash?: string;
}

// Update types (all fields optional except ID)
export interface UpdateUserIdentityInput {
  encrypted_nsec?: string;
  encrypted_nsec_iv?: string | null;
  encrypted_nsec_tag?: string | null;
  encrypted_username?: string;
  encrypted_username_iv?: string | null;
  encrypted_username_tag?: string | null;
  encrypted_bio?: string;
  encrypted_bio_iv?: string | null;
  encrypted_bio_tag?: string | null;
  encrypted_display_name?: string;
  encrypted_display_name_iv?: string | null;
  encrypted_display_name_tag?: string | null;
  encrypted_picture?: string;
  encrypted_picture_iv?: string | null;
  encrypted_picture_tag?: string | null;
  encrypted_nip05?: string;
  encrypted_nip05_iv?: string | null;
  encrypted_nip05_tag?: string | null;
  encrypted_lightning_address?: string;
  encrypted_lightning_address_iv?: string | null;
  encrypted_lightning_address_tag?: string | null;
  role?: "private" | "offspring" | "adult" | "steward" | "guardian";
  spending_limits?: any;
  privacy_settings?: any;
  family_federation_id?: string;
  is_agent?: boolean;
}

export interface UpdateFamilyFederationInput {
  federation_name?: string;
  domain?: string;
  relay_url?: string;
}

export interface UpdateFamilyMemberInput {
  family_role?: "offspring" | "adult" | "steward" | "guardian";
  spending_approval_required?: boolean;
  voting_power?: number;
  is_active?: boolean;
}

// Educational System Types
export interface EducationalInvitation {
  id: string;
  invite_token: string;
  invited_by: string;
  course_credits: number;
  used: boolean;
  used_at?: Date;
  expires_at?: Date;
  invitation_data?: any;
  created_at: Date;
  updated_at: Date;
}

export interface CourseCredit {
  id: string;
  user_id: string;
  credits_amount: number;
  activity_type: string;
  description: string;
  invite_token?: string;
  created_at: Date;
}

export interface CreateEducationalInvitationInput {
  invite_token: string;
  invited_by: string;
  course_credits: number;
  expires_at?: string;
  invitation_data?: any;
}

export interface CreateCourseCreditInput {
  user_id: string;
  credits_amount: number;
  activity_type: string;
  description: string;
  invite_token?: string;
}

// ============================================================================
// NIP-SKL: Agent Skill Registry
// ============================================================================

export interface SkillManifest {
  id: string; // UUID
  skill_scope_id: string; // "33400:<pubkey>:<d-tag>:<version>"
  manifest_event_id: string; // Nostr event id (version pin)
  version: string; // semver
  name: string;
  description?: string;
  input_schema: Record<string, unknown>; // JSONB
  output_schema: Record<string, unknown>; // JSONB
  runtime_constraints: string[]; // TEXT[]
  publisher_pubkey: string;
  attestation_status: "unverified" | "pending" | "verified" | "revoked";
  attestation_event_ids: string[]; // kind 1985 event ids
  revoked_at?: Date;
  relay_hint?: string;
  raw_event?: Record<string, unknown>; // JSONB - full Nostr event
  created_at: Date;
  updated_at: Date;
}

export type CreateSkillManifestInput = Omit<
  SkillManifest,
  "id" | "created_at" | "updated_at"
>;

export type UpdateSkillManifestInput = Partial<CreateSkillManifestInput>;

// ============================================================================
// NIP-SA: Sovereign Agents — Agent Wallet Policy
// ============================================================================

export interface AgentProfile {
  id: string; // UUID
  user_identity_id: string; // FK to user_identities
  is_agent: boolean;
  agent_username?: string;
  unified_address?: string; // e.g. agent-name@ai.satnam.pub
  created_by_user_id?: string;
  lnbits_creator_split_id?: string;

  // Monetization tracking
  total_platform_fees_paid_sats: number; // BIGINT
  free_tier_claimed: boolean;
  free_tier_allocation_number?: number;

  // Blind token balance
  event_tokens_balance: number;
  task_tokens_balance: number;
  contact_tokens_balance: number;
  dm_tokens_balance: number;

  // Reputation & scoring
  reputation_score: number;
  credit_limit_sats: number; // BIGINT
  total_settled_sats: number; // BIGINT
  settlement_success_count: number;
  settlement_default_count: number;

  // Performance bonds
  total_bonds_staked_sats: number; // BIGINT
  total_bonds_released_sats: number; // BIGINT
  total_bonds_slashed_sats: number; // BIGINT
  bond_slash_count: number;
  current_bonded_sats: number; // BIGINT

  // Work history metrics
  total_tasks_completed: number;
  total_tasks_failed: number;
  tier1_validations: number;
  tier2_validations: number;
  tier3_validations: number;

  // Communication preferences
  accepts_encrypted_dms: boolean;
  public_portfolio_enabled: boolean;
  coordination_relay_urls?: string[];

  // Wallet custody
  wallet_custody_type?: "self_custodial" | "lnbits_proxy" | "lightning_faucet";
  lightning_faucet_agent_key_encrypted?: string;

  // NIP-SA: Wallet Policy (added 2026-03-21)
  nip_sa_profile_event_id?: string; // kind 39200 event id
  max_single_spend_sats: number; // BIGINT, default 1000
  daily_limit_sats: number; // BIGINT, default 100000
  requires_approval_above_sats: number; // BIGINT, default 10000
  preferred_spend_rail: "lightning" | "cashu" | "fedimint"; // default 'lightning'
  allowed_mints: string[]; // Cashu mint URLs
  sweep_threshold_sats: number; // BIGINT, default 50000
  sweep_destination?: string; // Lightning address or on-chain address
  sweep_rail: "lightning" | "cashu" | "fedimint"; // default 'lightning'
  well_known_published_at?: Date;
  enabled_skill_scope_ids: string[]; // skill_scope_ids from NIP-SKL

  // OTS/SimpleProof Integration (added 2026-03-22)
  ots_proofs_storage_url?: string; // URL/path where agent's .ots proof files are stored
  simpleproof_api_key_encrypted?: string; // Encrypted SimpleProof API key
  simpleproof_enabled: boolean; // Feature flag for SimpleProof integration
  ots_attestation_count: number; // Total OTS proofs generated
  last_ots_attestation_at?: Date; // Most recent OTS proof timestamp

  created_at: Date;
  updated_at: Date;
}

export type CreateAgentProfileInput = Omit<
  AgentProfile,
  "id" | "created_at" | "updated_at"
>;

export type UpdateAgentProfileInput = Partial<CreateAgentProfileInput>;

// ============================================================================
// OTS/SimpleProof Integration — Proof Records
// ============================================================================

export interface OTSProofRecord {
  id: string; // UUID
  proof_hash: string; // SHA-256 hash of attested data
  ots_proof_file_url: string; // URL to .ots proof file
  bitcoin_block_height?: number; // Bitcoin block height where proof is anchored
  attestation_timestamp: Date;
  agent_pubkey: string; // Agent who created this proof
  nostr_event_id?: string; // NIP-03 kind 1040 event id (if published)
  simpleproof_proof_id?: string; // SimpleProof platform proof ID (future)

  // Link to attested Nostr event (if applicable)
  attested_event_kind?: number; // e.g. 1985, 39201, 39244
  attested_event_id?: string; // Nostr event id being timestamped

  // Proof status
  proof_status: "pending" | "confirmed" | "failed";
  confirmed_at?: Date; // When Bitcoin block confirmation occurred

  // Storage metadata
  storage_backend: "supabase" | "ipfs" | "agent_endpoint" | "simpleproof";
  storage_metadata: Record<string, unknown>; // JSONB

  created_at: Date;
  updated_at: Date;
}

export type CreateOTSProofRecordInput = Omit<
  OTSProofRecord,
  "id" | "created_at" | "updated_at"
>;

export type UpdateOTSProofRecordInput = Partial<CreateOTSProofRecordInput>;

// Supabase Database Schema Type
export interface Database {
  public: {
    Tables: {
      user_identities: {
        Row: UserIdentity;
        Insert: CreateUserIdentityInput;
        Update: UpdateUserIdentityInput;
      };
      family_federations: {
        Row: FamilyFederation;
        Insert: CreateFamilyFederationInput;
        Update: UpdateFamilyFederationInput;
      };
      family_members: {
        Row: FamilyMember;
        Insert: CreateFamilyMemberInput;
        Update: UpdateFamilyMemberInput;
      };
      nip05_records: {
        Row: Nip05Record;
        Insert: CreateNip05RecordInput;
        Update: Partial<CreateNip05RecordInput>;
      };
      nostr_backups: {
        Row: NostrBackup;
        Insert: CreateNostrBackupInput;
        Update: Partial<CreateNostrBackupInput>;
      };
      educational_invitations: {
        Row: EducationalInvitation;
        Insert: CreateEducationalInvitationInput;
        Update: Partial<CreateEducationalInvitationInput>;
      };
      course_credits: {
        Row: CourseCredit;
        Insert: CreateCourseCreditInput;
        Update: Partial<CreateCourseCreditInput>;
      };
      skill_manifests: {
        Row: SkillManifest;
        Insert: CreateSkillManifestInput;
        Update: UpdateSkillManifestInput;
      };
      agent_profiles: {
        Row: AgentProfile;
        Insert: CreateAgentProfileInput;
        Update: UpdateAgentProfileInput;
      };
      ots_proof_records: {
        Row: OTSProofRecord;
        Insert: CreateOTSProofRecordInput;
        Update: UpdateOTSProofRecordInput;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
