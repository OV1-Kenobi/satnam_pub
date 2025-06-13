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
