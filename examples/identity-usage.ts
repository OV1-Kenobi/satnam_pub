/**
 * Example usage of the Identity Service with Supabase schema
 * This demonstrates how to use the integrated database models
 */

import { IdentityService } from "../services/identity";
import db from "../lib/db";

async function exampleUsage() {
  try {
    console.log("🚀 Starting Identity Service example...");

    // Example 1: Create a new user profile (after Supabase auth)
    const newProfile = await IdentityService.createProfile({
      id: "user-uuid-from-supabase-auth", // This comes from Supabase auth.users
      username: "satoshi_nakamoto",
      npub: "npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9",
      nip05: "satoshi@satnam.pub",
      lightning_address: "satoshi@satnam.pub",
    });

    console.log("✓ Profile created:", newProfile);

    // Example 2: Create a family
    const family = await IdentityService.createFamily(
      {
        family_name: "The Nakamoto Family",
        domain: "nakamoto.family",
        relay_url: "wss://relay.nakamoto.family",
        federation_id: "nakamoto_fed_001",
      },
      newProfile.id,
    );

    console.log("✓ Family created:", family);

    // Example 3: Set up lightning address
    const lightningAddress = await IdentityService.setupLightningAddress({
      user_id: newProfile.id,
      address: "satoshi@voltage.cloud",
      voltage_node_id: "node_123456",
      active: true,
    });

    console.log("✓ Lightning address setup:", lightningAddress);

    // Example 4: Create nostr backup reference
    const backup = await IdentityService.createNostrBackup({
      user_id: newProfile.id,
      event_id: "event_abc123def456",
      relay_url: "wss://relay.citadel.academy",
      backup_hash: "sha256_hash_here",
    });

    console.log("✓ Nostr backup created:", backup);

    // Example 5: Get complete user identity
    const identity = await IdentityService.getUserIdentity(newProfile.id);
    console.log("✓ Complete identity:", identity);

    // Example 6: Get family dashboard
    const dashboard = await IdentityService.getFamilyDashboard(family.id);
    console.log("✓ Family dashboard:", dashboard);

    // Example 7: Search profiles
    const searchResults = await IdentityService.searchProfiles("satoshi");
    console.log("✓ Search results:", searchResults);
  } catch (error) {
    console.error("❌ Example failed:", error);
  } finally {
    // Close database connection
    db.end();
  }
}

// Run the example
if (require.main === module) {
  exampleUsage().catch(console.error);
}

export { exampleUsage };
