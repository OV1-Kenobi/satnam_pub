// lib/api/identity-endpoints.ts
import { CitadelDatabase, supabase } from "../supabase";
import { HybridAuth } from "../hybrid-auth";
import { SecureStorage } from "../secure-storage";
import type { APIResponse } from "./auth-endpoints";

// Helper function to safely extract error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unknown error occurred";
}

export class IdentityAPI {
  // ===========================================
  // ACCOUNT REGISTRATION
  // ===========================================

  /**
   * POST /api/identity/register
   * Create a new Nostr identity with encrypted nsec backup
   */
  static async registerNewAccount(registrationData: {
    username: string;
    password: string;
    nip05?: string;
    lightning_address?: string;
  }): Promise<APIResponse> {
    try {
      // Generate new Nostr keypair
      const keyPair = SecureStorage.generateNewAccountKeyPair();

      // Create profile in database
      const { data: newProfile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          username: registrationData.username,
          npub: keyPair.npub,
          nip05: registrationData.nip05 || null,
          lightning_address: registrationData.lightning_address || null,
        })
        .select()
        .single();

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      // Store encrypted nsec with user's password
      const encryptionSuccess = await SecureStorage.storeEncryptedNsec(
        newProfile.id,
        keyPair.nsec,
        registrationData.password,
      );

      if (!encryptionSuccess) {
        // Cleanup: delete the profile if encryption failed
        await supabase.from("profiles").delete().eq("id", newProfile.id);
        throw new Error("Failed to securely store private key");
      }

      return {
        success: true,
        data: {
          profile: newProfile,
          // Return the nsec ONCE during registration for user to backup
          nsec: keyPair.nsec,
          npub: keyPair.npub,
          message:
            "IMPORTANT: Save your nsec safely! This is the only time it will be shown.",
        },
        message: "Account created successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * POST /api/identity/recover-nsec
   * Recover nsec using password (for account restoration)
   */
  static async recoverNsec(recoveryData: {
    npub: string;
    password: string;
  }): Promise<APIResponse> {
    try {
      // Find user by npub
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("npub", recoveryData.npub)
        .single();

      if (profileError || !profile) {
        return {
          success: false,
          error: "Account not found",
        };
      }

      // Attempt to decrypt nsec with provided password
      const decryptedNsec = await SecureStorage.retrieveDecryptedNsec(
        profile.id,
        recoveryData.password,
      );

      if (!decryptedNsec) {
        return {
          success: false,
          error: "Invalid password or unable to decrypt private key",
        };
      }

      return {
        success: true,
        data: {
          nsec: decryptedNsec,
          npub: recoveryData.npub,
          message: "Private key recovered successfully",
        },
        message: "Account recovery successful",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================
  // PROFILE MANAGEMENT
  // ===========================================

  /**
   * GET /api/identity/profile
   * Get current user's complete identity profile
   */
  static async getProfile(): Promise<APIResponse> {
    try {
      const session = await HybridAuth.validateSession();
      if (!session) {
        return { success: false, error: "Authentication required" };
      }

      const profile = await CitadelDatabase.getUserIdentity(session.user_id);

      return {
        success: true,
        data: profile,
        message: "Profile retrieved successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * PUT /api/identity/profile
   * Update user profile information
   */
  static async updateProfile(updates: {
    username?: string;
    nip05?: string;
    lightning_address?: string;
  }): Promise<APIResponse> {
    try {
      const session = await HybridAuth.validateSession();
      if (!session) {
        return { success: false, error: "Authentication required" };
      }

      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", session.user_id)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data,
        message: "Profile updated successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================
  // FAMILY MANAGEMENT
  // ===========================================

  /**
   * POST /api/identity/family/create
   * Create a new family
   */
  static async createFamily(familyData: {
    family_name: string;
    domain?: string;
    relay_url?: string;
    federation_id?: string;
  }): Promise<APIResponse> {
    try {
      const session = await HybridAuth.validateSession();
      if (!session) {
        return { success: false, error: "Authentication required" };
      }

      const family = await CitadelDatabase.createFamily(familyData);

      // Auto-join the creator to the family
      await CitadelDatabase.joinFamily(session.user_id, family.id);

      return {
        success: true,
        data: family,
        message: "Family created successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * POST /api/identity/family/join
   * Join an existing family
   */
  static async joinFamily(familyId: string): Promise<APIResponse> {
    try {
      const session = await HybridAuth.validateSession();
      if (!session) {
        return { success: false, error: "Authentication required" };
      }

      const result = await CitadelDatabase.joinFamily(
        session.user_id,
        familyId,
      );

      return {
        success: true,
        data: result,
        message: "Joined family successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * GET /api/identity/family/members
   * Get family members
   */
  static async getFamilyMembers(): Promise<APIResponse> {
    try {
      const session = await HybridAuth.validateSession();
      if (!session) {
        return { success: false, error: "Authentication required" };
      }

      const profile = await CitadelDatabase.getUserIdentity(session.user_id);

      if (!profile.family_id) {
        return {
          success: false,
          error: "User is not part of a family",
        };
      }

      const members = await CitadelDatabase.getFamilyMembers(profile.family_id);

      return {
        success: true,
        data: members,
        message: "Family members retrieved successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================
  // LIGHTNING MANAGEMENT
  // ===========================================

  /**
   * POST /api/identity/lightning/setup
   * Set up lightning address
   */
  static async setupLightning(addressData: {
    address: string;
    btcpay_store_id?: string;
    voltage_node_id?: string;
  }): Promise<APIResponse> {
    try {
      const session = await HybridAuth.validateSession();
      if (!session) {
        return { success: false, error: "Authentication required" };
      }

      const lightning = await CitadelDatabase.setupLightningAddress({
        user_id: session.user_id,
        ...addressData,
      });

      return {
        success: true,
        data: lightning,
        message: "Lightning address set up successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================
  // NOSTR BACKUP MANAGEMENT
  // ===========================================

  /**
   * POST /api/identity/backup
   * Store reference to Nostr encrypted backup
   */
  static async storeBackup(eventId: string): Promise<APIResponse> {
    try {
      const session = await HybridAuth.validateSession();
      if (!session) {
        return { success: false, error: "Authentication required" };
      }

      const backup = await CitadelDatabase.storeNostrBackup(
        session.user_id,
        eventId,
      );

      return {
        success: true,
        data: backup,
        message: "Backup reference stored successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * GET /api/identity/backups
   * Get user's backup history
   */
  static async getBackups(): Promise<APIResponse> {
    try {
      const session = await HybridAuth.validateSession();
      if (!session) {
        return { success: false, error: "Authentication required" };
      }

      const { data: backups, error } = await supabase
        .from("nostr_backups")
        .select("*")
        .eq("user_id", session.user_id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return {
        success: true,
        data: backups,
        message: "Backups retrieved successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================
  // IDENTITY VERIFICATION
  // ===========================================

  /**
   * POST /api/identity/verify/nip05
   * Verify NIP-05 domain association
   */
  static async verifyNIP05(nip05: string): Promise<APIResponse> {
    try {
      const session = await HybridAuth.validateSession();
      if (!session) {
        return { success: false, error: "Authentication required" };
      }

      // Extract domain and local part
      const [localPart, domain] = nip05.split("@");

      // Fetch the .well-known/nostr.json file
      const response = await fetch(`https://${domain}/.well-known/nostr.json`);
      const nostrJson = await response.json();

      // Verify the pubkey matches
      const expectedPubkey = session.npub.replace("npub", "");
      if (nostrJson.names[localPart] !== expectedPubkey) {
        throw new Error("NIP-05 verification failed: pubkey mismatch");
      }

      // Update profile with verified NIP-05
      await supabase
        .from("profiles")
        .update({ nip05 })
        .eq("id", session.user_id);

      return {
        success: true,
        data: { nip05, verified: true },
        message: "NIP-05 verified successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }
}
