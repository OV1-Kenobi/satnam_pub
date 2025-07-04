#!/usr/bin/env tsx
/**
 * Privacy-Enhanced Lightning Payment Demo
 *
 * This demonstrates how to use the LNProxy privacy layer with
 * Satnam.pub family Lightning payments.
 *
 * Features demonstrated:
 * - Creating privacy-wrapped invoices
 * - Family payment workflows
 * - Privacy service health monitoring
 * - Fallback handling when privacy fails
 */

import { LightningClient } from "../lib/lightning-client";
import { createPrivacyLayer } from "../lib/privacy/lnproxy-privacy";

async function demonstratePrivacyLayer() {
  console.log("🔒 Satnam.pub Privacy Layer Demo");
  console.log("=".repeat(50));

  // Initialize Lightning client (includes privacy layer)
  const lightningClient = new LightningClient();

  // Also show direct privacy layer usage
  const privacyLayer = createPrivacyLayer();

  console.log("\n1. 🏥 Testing Privacy Service Health...");
  const health = await privacyLayer.testPrivacyConnection();
  console.log(
    `   Status: ${health.available ? "✅ Available" : "❌ Unavailable"}`
  );
  console.log(`   Response Time: ${health.responseTime}ms`);
  if (health.error) {
    console.log(`   Error: ${health.error}`);
  }

  console.log("\n2. 🧾 Creating Standard Invoice with Privacy...");
  try {
    const invoice = await lightningClient.createInvoice({
      amount: 1000, // 1000 sats
      description: "Test payment with privacy protection",
    });

    console.log("   ✅ Invoice created successfully!");
    console.log(`   Original: ${invoice.invoice.substring(0, 50)}...`);
    if (invoice.privacy) {
      console.log(`   Privacy Enabled: ${invoice.privacy.isPrivacyEnabled}`);
      console.log(`   Privacy Fee: ${invoice.privacy.privacyFee} sats`);
      console.log("   🎭 Your node identity is hidden from the payer!");
    }
  } catch (error) {
    console.error("   ❌ Failed to create invoice:", error);
  }

  console.log("\n3. 👨‍👩‍👧‍👦 Creating Family Payment Invoice...");
  try {
    const familyInvoice = await lightningClient.createFamilyInvoice(
      "daughter", // Family member
      2500, // 2500 sats
      "Weekly payment"
    );

    console.log("   ✅ Family invoice created!");
    console.log(`   Payment to: daughter@satnam.pub`);
    console.log(`   Amount: 2500 sats`);
    console.log(`   Privacy Fee: ${familyInvoice.privacy.privacyFee} sats`);
    console.log("   📤 Share this invoice with the payer:");
    console.log(`   ${familyInvoice.invoice}`);
  } catch (error) {
    console.error("   ❌ Failed to create family invoice:", error);
  }

  console.log("\n4. 🔧 Direct Privacy Layer Usage...");
  // Simulate an existing invoice from LNbits
  const existingInvoice =
    "lnbc25000n1pjg7mqpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqhp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqsnp4q0n326hr8v9zprg8gsvezcch06gfaqqhde2aj730yg0durunfhv66m5aegqoqd2xc";

  try {
    const wrappedPayment = await privacyLayer.wrapInvoiceForPrivacy(
      existingInvoice,
      "Payment to son@satnam.pub - video game purchase"
    );

    console.log("   ✅ Direct wrapping successful!");
    console.log(`   Privacy Enabled: ${wrappedPayment.isPrivacyEnabled}`);
    console.log(`   Privacy Fee: ${wrappedPayment.privacyFee} sats`);
    if (wrappedPayment.isPrivacyEnabled) {
      console.log("   🎭 Node identity hidden!");
      console.log("   📤 Give wrapped invoice to payer:");
      console.log(`   ${wrappedPayment.wrappedInvoice.substring(0, 80)}...`);
    } else {
      console.log("   ⚠️  Privacy unavailable, using original invoice");
    }
  } catch (error) {
    console.error("   ❌ Direct wrapping failed:", error);
  }

  console.log("\n5. ⚙️  Privacy Configuration...");
  const config = lightningClient.getPrivacyConfig();
  console.log(`   Service URL: ${config.serviceUrl}`);
  console.log(
    `   Default Routing Budget: ${config.defaultRoutingBudget} PPM (${
      config.defaultRoutingBudget / 10000
    }%)`
  );

  console.log("\n6. 💡 Privacy Best Practices:");
  console.log(
    "   • Always test privacy service health before important payments"
  );
  console.log("   • Privacy failures gracefully fallback to original invoices");
  console.log("   • Privacy adds a small fee (typically 0.1%) for anonymity");
  console.log("   • Family payments automatically use privacy protection");
  console.log("   • Monitor privacy service status in production");

  console.log("\n🎯 Integration Tips:");
  console.log("   • Set VITE_LNPROXY_URL env var for custom proxy service");
  console.log("   • Privacy layer works in both browser (Vite) and Node.js");
  console.log("   • All privacy operations are logged for audit purposes");
  console.log("   • Privacy protection is optional and degrades gracefully");

  console.log("\n✅ Demo completed successfully!");
}

// Run demo if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstratePrivacyLayer().catch(console.error);
}

export { demonstratePrivacyLayer };
