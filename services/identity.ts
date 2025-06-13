/**
 * Identity service using the integrated database models
 * Demonstrates how to use the new Supabase schema with your existing PostgreSQL setup
 */

import db from "../lib/db";
import {
  Profile,
  Family,
  CreateProfileInput,
  CreateFamilyInput,
  CreateLightningAddressInput,
  CreateNostrBackupInput,
} from "../types/database";

export class IdentityService {
  /**
   * Create a new user profile after Supabase auth
   * This should be called after successful Supabase authentication
   */
  static async createProfile(
    profileData: CreateProfileInput,
  ): Promise<Profile> {
    try {
      const profile = await db.models.profiles.create(profileData);
      console.log(`✓ Profile created for user: ${profile.username}`);
      return profile;
    } catch (error) {
      console.error("Failed to create profile:", error);
      throw error;
    }
  }

  /**
   * Get complete user identity including family and lightning info
   */
  static async getUserIdentity(userId: string) {
    try {
      const profile = await db.models.profiles.getById(userId);
      if (!profile) {
        throw new Error("Profile not found");
      }

      // Get family info if user belongs to one
      let family = null;
      if (profile.family_id) {
        family = await db.models.families.getById(profile.family_id);
      }

      // Get lightning addresses
      const lightningAddresses =
        await db.models.lightningAddresses.getByUserId(userId);

      // Get nostr backups
      const nostrBackups = await db.models.nostrBackups.getByUserId(userId);

      return {
        profile,
        family,
        lightningAddresses,
        nostrBackups,
      };
    } catch (error) {
      console.error("Failed to get user identity:", error);
      throw error;
    }
  }

  /**
   * Create a family and add the creator as the first member
   */
  static async createFamily(
    familyData: CreateFamilyInput,
    creatorUserId: string,
  ): Promise<Family> {
    try {
      return await db.transaction(async (client) => {
        // Create the family
        const familyResult = await client.query(
          `
          INSERT INTO families (family_name, domain, relay_url, federation_id)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `,
          [
            familyData.family_name,
            familyData.domain,
            familyData.relay_url,
            familyData.federation_id,
          ],
        );

        const family = familyResult.rows[0];

        // Add creator to the family
        await client.query(
          `
          UPDATE profiles SET family_id = $1 WHERE id = $2
        `,
          [family.id, creatorUserId],
        );

        console.log(
          `✓ Family "${family.family_name}" created with creator ${creatorUserId}`,
        );
        return family;
      });
    } catch (error) {
      console.error("Failed to create family:", error);
      throw error;
    }
  }

  /**
   * Join an existing family
   */
  static async joinFamily(userId: string, familyId: string): Promise<void> {
    try {
      // Verify family exists
      const family = await db.models.families.getById(familyId);
      if (!family) {
        throw new Error("Family not found");
      }

      // Update user's family_id
      await db.models.profiles.update(userId, { family_id: familyId });

      console.log(`✓ User ${userId} joined family ${family.family_name}`);
    } catch (error) {
      console.error("Failed to join family:", error);
      throw error;
    }
  }

  /**
   * Set up lightning address for user
   */
  static async setupLightningAddress(addressData: CreateLightningAddressInput) {
    try {
      // Deactivate existing addresses for this user
      await db.query(
        `
        UPDATE lightning_addresses 
        SET active = false 
        WHERE user_id = $1
      `,
        [addressData.user_id],
      );

      // Create new active address
      const lightningAddress = await db.models.lightningAddresses.create({
        ...addressData,
        active: true,
      });

      console.log(
        `✓ Lightning address ${lightningAddress.address} setup for user ${addressData.user_id}`,
      );
      return lightningAddress;
    } catch (error) {
      console.error("Failed to setup lightning address:", error);
      throw error;
    }
  }

  /**
   * Create nostr backup reference
   */
  static async createNostrBackup(backupData: CreateNostrBackupInput) {
    try {
      const backup = await db.models.nostrBackups.create(backupData);
      console.log(`✓ Nostr backup reference created: ${backup.event_id}`);
      return backup;
    } catch (error) {
      console.error("Failed to create nostr backup:", error);
      throw error;
    }
  }

  /**
   * Get family dashboard data
   */
  static async getFamilyDashboard(familyId: string) {
    try {
      const family = await db.models.families.getById(familyId);
      if (!family) {
        throw new Error("Family not found");
      }

      const members = await db.models.families.getMembers(familyId);

      // Get lightning addresses for all family members
      const memberIds = members.map((m) => m.id);
      const lightningData = await Promise.all(
        memberIds.map(async (memberId) => {
          const addresses =
            await db.models.lightningAddresses.getByUserId(memberId);
          return { memberId, addresses };
        }),
      );

      return {
        family,
        members,
        lightningData,
      };
    } catch (error) {
      console.error("Failed to get family dashboard:", error);
      throw error;
    }
  }

  /**
   * Search profiles by username or npub
   */
  static async searchProfiles(query: string) {
    try {
      const result = await db.query(
        `
        SELECT id, username, npub, nip05 
        FROM profiles 
        WHERE username ILIKE $1 OR npub ILIKE $1
        LIMIT 20
      `,
        [`%${query}%`],
      );

      return result.rows;
    } catch (error) {
      console.error("Failed to search profiles:", error);
      throw error;
    }
  }
}
