/**
 * Database model interfaces for Identity Forge
 */

export interface Profile {
  id: string; // UUID from auth.users
  username: string;
  npub: string;
  nip05?: string;
  lightning_address?: string;
  family_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Family {
  id: string; // UUID
  family_name: string;
  domain?: string;
  relay_url?: string;
  federation_id?: string;
  created_at: Date;
}

export interface NostrBackup {
  id: string; // UUID
  user_id: string;
  event_id: string;
  relay_url: string;
  backup_hash?: string;
  created_at: Date;
}

export interface LightningAddress {
  id: string; // UUID
  user_id: string;
  address: string;
  btcpay_store_id?: string;
  voltage_node_id?: string;
  active: boolean;
  created_at: Date;
}

// Input types for creating records
export interface CreateProfileInput {
  id: string;
  username: string;
  npub: string;
  nip05?: string;
  lightning_address?: string;
  family_id?: string;
}

export interface CreateFamilyInput {
  family_name: string;
  domain?: string;
  relay_url?: string;
  federation_id?: string;
}

export interface CreateNostrBackupInput {
  user_id: string;
  event_id: string;
  relay_url?: string;
  backup_hash?: string;
}

export interface CreateLightningAddressInput {
  user_id: string;
  address: string;
  btcpay_store_id?: string;
  voltage_node_id?: string;
  active?: boolean;
}

// Update types (all fields optional except ID)
export interface UpdateProfileInput {
  username?: string;
  npub?: string;
  nip05?: string;
  lightning_address?: string;
  family_id?: string;
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
      profiles: {
        Row: Profile;
        Insert: CreateProfileInput;
        Update: UpdateProfileInput;
      };
      families: {
        Row: Family;
        Insert: CreateFamilyInput;
        Update: Partial<CreateFamilyInput>;
      };
      nostr_backups: {
        Row: NostrBackup;
        Insert: CreateNostrBackupInput;
        Update: Partial<CreateNostrBackupInput>;
      };
      lightning_addresses: {
        Row: LightningAddress;
        Insert: CreateLightningAddressInput;
        Update: Partial<CreateLightningAddressInput>;
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
