// examples/federation-management-demo.ts
import { FederationManager } from "../lib/fedimint/federation-manager";

async function demonstrateFederationManagement() {
  console.log("🚀 Starting Federation Management Demo");

  const manager = new FederationManager();

  try {
    // 1. Create a new federation
    console.log("\n1️⃣ Creating a new federation...");
    const federationId = await manager.createFederation(
      "Family Federation",
      "Sovereign family Bitcoin custody solution",
      [
        "https://guardian1.family.com",
        "https://guardian2.family.com",
        "https://guardian3.family.com",
      ],
      2, // 2-of-3 threshold
    );

    // 2. Create an invite for the federation
    console.log("\n2️⃣ Creating federation invite...");
    const inviteCode = await manager.createInvite(
      federationId,
      "family_admin",
      24 * 60 * 60 * 1000, // 24 hours expiry
    );
    console.log(`📋 Invite code: ${inviteCode}`);

    // 3. Validate the invite
    console.log("\n3️⃣ Validating invite...");
    const invite = await manager.validateInvite(inviteCode);
    if (invite) {
      console.log(`✅ Valid invite for: ${invite.name}`);
      console.log(`   Guardians: ${invite.guardianCount}`);
      console.log(`   Threshold: ${invite.threshold}`);
      console.log(`   Expires: ${invite.expiresAt?.toISOString() || "Never"}`);
    }

    // 4. Simulate someone joining via invite
    console.log("\n4️⃣ Joining federation via invite...");
    const joinedFederationId = await manager.joinFederation(inviteCode);
    console.log(`🤝 Successfully joined: ${joinedFederationId}`);

    // 5. Discover federations
    console.log("\n5️⃣ Discovering available federations...");
    const allFederations = await manager.discoverFederations();
    console.log(`Found ${allFederations.length} federations:`);
    allFederations.forEach((fed) => {
      console.log(`   - ${fed.name}: ${fed.description}`);
    });

    // 6. Search federations
    console.log("\n6️⃣ Searching federations with 'family' keyword...");
    const familyFederations = await manager.discoverFederations("family");
    console.log(`Found ${familyFederations.length} family-related federations`);

    // 7. Check guardian health
    console.log("\n7️⃣ Checking guardian health...");
    const guardianHealth = await manager.getGuardianHealth(federationId);
    console.log("Guardian status:");
    guardianHealth.forEach((guardian) => {
      console.log(
        `   - ${guardian.id}: ${guardian.status} (last seen: ${guardian.lastSeen.toISOString()})`,
      );
    });

    // 8. Get federation with health info
    console.log("\n8️⃣ Getting federation with health details...");
    const federationWithHealth =
      await manager.getFederationWithHealth(federationId);
    if (federationWithHealth) {
      console.log(`Federation: ${federationWithHealth.name}`);
      console.log(
        `Active guardians: ${federationWithHealth.guardianHealth.filter((g) => g.status === "online").length}/${federationWithHealth.guardianHealth.length}`,
      );
    }

    // 9. Connect to federation
    console.log("\n9️⃣ Connecting to federation...");
    const connected = await manager.connectToFederation(federationId);
    console.log(
      `Connection status: ${connected ? "✅ Connected" : "❌ Failed"}`,
    );

    // 10. List all federations with health
    console.log("\n🔟 Listing all federations with health info...");
    const allFederationsWithHealth =
      await manager.getAllFederationsWithHealth();
    allFederationsWithHealth.forEach((fed) => {
      const onlineGuardians = fed.guardianHealth.filter(
        (g) => g.status === "online",
      ).length;
      console.log(
        `   ${fed.name}: ${onlineGuardians}/${fed.guardianHealth.length} guardians online`,
      );
    });

    console.log("\n✅ Federation Management Demo completed successfully!");
  } catch (error) {
    console.error("❌ Demo failed:", error);
  }
}

async function demonstrateInviteLifecycle() {
  console.log("\n🔄 Testing Invite Lifecycle...");

  const manager = new FederationManager();

  // Create a federation
  const federationId = await manager.createFederation(
    "Test Federation",
    "Testing invite expiry",
    ["https://test1.com", "https://test2.com"],
    1,
  );

  // Create short-lived invite (2 seconds)
  const shortInvite = await manager.createInvite(
    federationId,
    "test_user",
    2000,
  );
  console.log(`📋 Created short-lived invite: ${shortInvite}`);

  // Validate immediately
  const validInvite = await manager.validateInvite(shortInvite);
  console.log(`✅ Immediate validation: ${validInvite ? "Valid" : "Invalid"}`);

  // Wait for expiry
  console.log("⏳ Waiting for invite to expire...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Try to validate expired invite
  const expiredInvite = await manager.validateInvite(shortInvite);
  console.log(
    `❌ After expiry validation: ${expiredInvite ? "Valid" : "Invalid"}`,
  );
}

// Run the demos
if (require.main === module) {
  demonstrateFederationManagement()
    .then(() => demonstrateInviteLifecycle())
    .catch(console.error);
}

export { demonstrateFederationManagement, demonstrateInviteLifecycle };
