/**
 * Type declarations for family-api.js
 * MASTER CONTEXT COMPLIANCE: Privacy-first architecture with encrypted data
 */

export interface FamilyMember {
  id: string;
  encrypted_name: string; // PRIVACY: Name stored encrypted
  encrypted_role: string; // PRIVACY: Role stored encrypted
  avatar?: string; // Non-sensitive avatar URL
  encrypted_lightning_balance?: string; // PRIVACY: Balance encrypted
  nipStatus?: "verified" | "pending" | "none";
  encryption_salt: string; // Required for decryption
  family_id_hash: string; // Hashed family ID for privacy
  [key: string]: any;
}

export interface DecryptedFamilyMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  lightningBalance?: number;
  nipStatus?: "verified" | "pending" | "none";
  [key: string]: any;
}

export interface FamilyWallet {
  id: string;
  family_id: string;
  balance: number;
  available_balance: number;
  created_at: string;
}

export declare class FamilyAPI {
  getFamilyMembers(): Promise<FamilyMember[]>;
  addFamilyMember(member: Omit<FamilyMember, "id">): Promise<FamilyMember>;
  updateFamilyMember(
    id: string,
    updates: Partial<FamilyMember>
  ): Promise<FamilyMember>;
  deleteFamilyMember(id: string): Promise<void>;
  getFamilyWallets(familyId: string): Promise<FamilyWallet[]>;
  createFamilyWallet(familyId: string): Promise<FamilyWallet>;
  updateFamilyWallet(
    id: string,
    updates: Partial<FamilyWallet>
  ): Promise<FamilyWallet>;
  deleteFamilyWallet(id: string): Promise<void>;
}

export declare const familyAPI: FamilyAPI;

export declare function getFamilyMember(
  username: string
): Promise<FamilyMember | null>;
export declare function getFamilyMembers(): Promise<FamilyMember[]>;
