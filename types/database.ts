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
