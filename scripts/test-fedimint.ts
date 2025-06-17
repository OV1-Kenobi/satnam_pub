// scripts/test-fedimint.ts
import { FederationManager } from "../lib/fedimint/federation-manager";

async function testFedimintIntegration() {
  console.log("🧪 Testing Fedimint Integration...\n");

  const manager = new FederationManager();

  try {
    // Test 1: Create federation
    console.log("1️⃣ Creating federation...");
    const federationId = await manager.createFederation(
      "Test Family Federation",
      "Bitcoin custody for the family",
      [
        "https://guardian1.test.com",
        "https://guardian2.test.com",
        "https://guardian3.test.com",
      ],
      2,
    );
    console.log(`✅ Federation created: ${federationId}\n`);

    // Test 2: Connect to federation
    console.log("2️⃣ Connecting to federation...");
    await manager.connectToFederation(federationId);
    console.log("✅ Connected successfully\n");

    // Test 3: Get client and check balance
    console.log("3️⃣ Checking balance...");
    const client = manager.getClient(federationId)!;
    const balance = await client.getBalance();
    console.log(`✅ Balance: ${balance} sats\n`);

    // Test 4: Issue e-cash
    console.log("4️⃣ Issuing e-cash...");
    const notes = await client.issueECash(1000);
    console.log(`✅ Issued ${notes.length} notes totaling 1000 sats\n`);

    // Test 5: Create Lightning invoice
    console.log("5️⃣ Creating Lightning invoice...");
    const invoice = await client.createLightningInvoice(500, "Test payment");
    console.log(`✅ Invoice created: ${invoice.substring(0, 50)}...\n`);

    console.log("🎉 All tests passed! Fedimint integration is working.");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
testFedimintIntegration();
