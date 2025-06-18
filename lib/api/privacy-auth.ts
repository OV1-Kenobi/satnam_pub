// lib/api/privacy-auth.ts
import { PrivacyManager } from "../crypto/privacy-manager";
import { supabase } from "../supabase";

export class PrivacyAuth {
  /**
   * Authenticate user with their Nostr pubkey without storing it
   * Uses hash-based verification for maximum privacy
   */
  static async authenticateWithNostr(pubkey: string): Promise<{
    success: boolean;
    user?: {
      id: string;
      username: string;
      isDiscoverable: boolean;
    };
    error?: string;
  }> {
    try {
      // Find user by auth hash (not by pubkey)
      const authHash = PrivacyManager.createAuthHash(pubkey);

      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, username, is_discoverable")
        .eq("auth_hash", authHash)
        .limit(1);

      if (error || !profiles || profiles.length === 0) {
        return {
          success: false,
          error: "User not found or invalid credentials",
        };
      }

      const profile = profiles[0];

      return {
        success: true,
        user: {
          id: profile.id,
          username: profile.username,
          isDiscoverable: profile.is_discoverable,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: "Authentication failed",
      };
    }
  }

  /**
   * Get user's encrypted profile data
   * Only they can decrypt it with their key
   */
  static async getUserEncryptedData(userId: string): Promise<{
    success: boolean;
    encryptedData?: string;
    encryptionHint?: string;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("encrypted_profile, encryption_hint")
        .eq("id", userId)
        .single();

      if (error || !data) {
        return {
          success: false,
          error: "Profile not found",
        };
      }

      return {
        success: true,
        encryptedData: data.encrypted_profile,
        encryptionHint: data.encryption_hint,
      };
    } catch (error) {
      return {
        success: false,
        error: "Failed to retrieve encrypted data",
      };
    }
  }

  /**
   * Decrypt user data on client side (never send encryption key to server)
   * This method is for client-side use only
   */
  static decryptUserDataClientSide(
    encryptedData: string,
    userKey: string,
  ): any {
    return PrivacyManager.decryptUserData(encryptedData, userKey);
  }

  /**
   * Check if username is available (without revealing any user data)
   */
  static async isUsernameAvailable(username: string): Promise<{
    available: boolean;
    suggestion?: string;
  }> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .limit(1);

      const available = !data || data.length === 0;

      return {
        available,
        suggestion: available
          ? undefined
          : PrivacyManager.generateAnonymousUsername(),
      };
    } catch (error) {
      return {
        available: false,
        suggestion: PrivacyManager.generateAnonymousUsername(),
      };
    }
  }

  /**
   * Update user's discoverability setting
   */
  static async updateDiscoverability(
    userId: string,
    isDiscoverable: boolean,
    encryptedDisplayData?: string,
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Update main profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ is_discoverable: isDiscoverable })
        .eq("id", userId);

      if (profileError) throw profileError;

      // Handle discoverable profiles table
      if (isDiscoverable) {
        if (!encryptedDisplayData) {
          throw new Error(
            "encryptedDisplayData required when isDiscoverable=true",
          );
        }

        // Add to discoverable profiles
        const { error: discoverError } = await supabase
          .from("discoverable_profiles")
          .upsert({
            user_id: userId,
            encrypted_display_data: encryptedDisplayData,
            visibility_level: "users_only",
          });

        if (discoverError) throw discoverError;
      } else {
        // Remove from discoverable profiles
        await supabase
          .from("discoverable_profiles")
          .delete()
          .eq("user_id", userId);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: "Failed to update discoverability",
      };
    }
  }
}
