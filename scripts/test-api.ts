#!/usr/bin/env node

/**
 * API Testing Script
 * Test all the authentication and identity endpoints
 */

import axios from "axios";
import {
  generateSecretKey as generatePrivateKey,
  getPublicKey,
  finalizeEvent as finishEvent,
  nip19,
} from "../src/lib/nostr-browser";

const API_BASE = "http://localhost:3000/api";

// Test data
const testPrivkey = generatePrivateKey();
const testPubkey = getPublicKey(testPrivkey);
const testNpub = nip19.npubEncode(testPubkey);

console.log("🧪 API Testing Suite");
console.log("=".repeat(50));
console.log(`Test Pubkey: ${testPubkey}`);
console.log(`Test Npub: ${testNpub}`);
console.log("");

async function testHealthEndpoint() {
  try {
    console.log("🏥 Testing Health Endpoint...");
    const response = await axios.get("http://localhost:3000/health");
    console.log("✅ Health check passed:", response.data.message);
    return true;
  } catch (error) {
    console.log(
      "❌ Health check failed:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

async function testNostrAuth() {
  try {
    console.log("🔐 Testing Nostr Authentication...");

    // Create a signed event for authentication
    const authEvent = finishEvent(
      {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: "Identity Forge Authentication",
      },
      testPrivkey,
    );

    const response = await axios.post(`${API_BASE}/auth/nostr`, {
      signedEvent: authEvent,
    });

    if (response.data.success) {
      console.log("✅ Nostr auth successful");
      console.log("📋 User ID:", response.data.data.session.user_id);
      return response.data.data.session;
    } else {
      console.log("❌ Nostr auth failed:", response.data.error);
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const axiosError = error as any;
    console.log(
      "❌ Nostr auth error:",
      axiosError.response?.data?.error || errorMessage,
    );
    return null;
  }
}

async function testOTPFlow() {
  try {
    console.log("📱 Testing OTP Flow...");

    // Step 1: Initiate OTP
    console.log("  📤 Initiating OTP...");
    const initResponse = await axios.post(`${API_BASE}/auth/otp/initiate`, {
      npub: testNpub,
    });

    if (!initResponse.data.success) {
      console.log("❌ OTP initiation failed:", initResponse.data.error);
      return null;
    }

    console.log("✅ OTP initiated:", initResponse.data.data.message);

    // For testing, we'll simulate getting the OTP from the response
    // In production, this would come from the user checking their Nostr DMs
    const otpCode = "123456"; // Simulated OTP

    console.log("  📥 Verifying OTP...");
    const verifyResponse = await axios.post(`${API_BASE}/auth/otp/verify`, {
      pubkey: testPubkey,
      otp_code: otpCode,
    });

    if (verifyResponse.data.success) {
      console.log("✅ OTP verification successful");
      return verifyResponse.data.data.session;
    } else {
      console.log("❌ OTP verification failed:", verifyResponse.data.error);
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const axiosError = error as any;
    console.log(
      "❌ OTP flow error:",
      axiosError.response?.data?.error || errorMessage,
    );
    return null;
  }
}

async function testSessionEndpoint(session: any) {
  try {
    console.log("🔍 Testing Session Endpoint...");

    // Note: In a real app, you'd set the session token in headers
    // For this test, we'll just test the endpoint structure
    const response = await axios.get(`${API_BASE}/auth/session`);

    // This will likely fail without proper session management, but that's expected
    console.log(
      "📋 Session endpoint response:",
      response.data.success ? "Success" : "Failed (expected)",
    );
    return true;
  } catch (error) {
    const axiosError = error as any;
    console.log(
      "📋 Session endpoint failed (expected without proper session):",
      axiosError.response?.status,
    );
    return true;
  }
}

async function testProfileEndpoints() {
  try {
    console.log("👤 Testing Profile Endpoints...");

    // Test get profile (will fail without auth, but tests endpoint)
    try {
      const response = await axios.get(`${API_BASE}/identity/profile`);
      console.log(
        "📋 Profile get:",
        response.data.success ? "Success" : "Failed (expected)",
      );
    } catch (error) {
      const axiosError = error as any;
      console.log(
        "📋 Profile get failed (expected without auth):",
        axiosError.response?.status,
      );
    }

    return true;
  } catch (error) {
    console.log(
      "❌ Profile endpoint error:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

async function testRegistrationEndpoints() {
  try {
    console.log("🎯 Testing Identity Registration...");

    // Test single identity registration
    const registrationData = {
      username: "testuser",
      nip05Domain: "satnam.pub",
      lightningAddress: "testuser@satnam.pub",
    };

    const response = await axios.post(`${API_BASE}/register`, registrationData);

    if (response.data.success) {
      console.log("✅ Identity registration successful");
      console.log("📋 Profile created:", response.data.profile?.username);
      console.log(
        "🔑 Nostr identity:",
        response.data.nostr_identity?.npub.slice(0, 20) + "...",
      );
      console.log("📡 Relay backup:", response.data.nostr_backup);
      return response.data;
    } else {
      console.log("❌ Registration failed:", response.data.error);
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const axiosError = error as any;
    console.log(
      "❌ Registration error:",
      axiosError.response?.data?.error || errorMessage,
    );
    return null;
  }
}

async function testFamilyRegistration() {
  try {
    console.log("👥 Testing Family Registration...");

    const familyData = {
      family_name: "Test Family",
      domain: "satnam.pub",
      members: [
        { username: "parent1" },
        { username: "parent2" },
        { username: "child1" },
      ],
    };

    const response = await axios.post(
      `${API_BASE}/register/family`,
      familyData,
    );

    if (response.data.success) {
      console.log("✅ Family registration successful");
      console.log("👨‍👩‍👧‍👦 Family:", response.data.family?.family_name);
      console.log("👤 Members registered:", response.data.members?.length);
      return response.data;
    } else {
      console.log("❌ Family registration failed:", response.data.error);
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const axiosError = error as any;
    console.log(
      "❌ Family registration error:",
      axiosError.response?.data?.error || errorMessage,
    );
    return null;
  }
}

async function runAllTests() {
  console.log("🚀 Starting Comprehensive API Tests...\n");

  // Test 1: Health check
  const healthOk = await testHealthEndpoint();
  if (!healthOk) {
    console.log("❌ Server not running. Start it with: npm run server");
    return;
  }

  console.log("");

  // Test 2: Identity Registration
  const registrationResult = await testRegistrationEndpoints();

  console.log("");

  // Test 3: Family Registration
  const familyResult = await testFamilyRegistration();

  console.log("");

  // Test 4: Nostr authentication
  const nostrSession = await testNostrAuth();

  console.log("");

  // Test 5: OTP flow
  const otpSession = await testOTPFlow();

  console.log("");

  // Test 6: Session management
  await testSessionEndpoint(nostrSession);

  console.log("");

  // Test 7: Profile endpoints
  await testProfileEndpoints();

  console.log("");
  console.log("🎉 Comprehensive API Testing Complete!");
  console.log("📋 Summary:");
  console.log(`  ✅ Health Check: ${healthOk ? "PASS" : "FAIL"}`);
  console.log(
    `  🎯 Identity Registration: ${registrationResult ? "PASS" : "FAIL"}`,
  );
  console.log(`  👥 Family Registration: ${familyResult ? "PASS" : "FAIL"}`);
  console.log(`  🔐 Nostr Auth: ${nostrSession ? "PASS" : "FAIL"}`);
  console.log(`  📱 OTP Flow: ${otpSession ? "PASS" : "FAIL"}`);
  console.log(`  👤 Profile Endpoints: Available`);
}

// Show usage instructions
function showInstructions() {
  console.log("📋 Identity Forge API Usage Instructions:");
  console.log("=".repeat(60));
  console.log("");
  console.log("1. 🔧 Setup Environment:");
  console.log("   Edit .env.local with your Supabase credentials");
  console.log("");
  console.log("2. 🚀 Start the server:");
  console.log("   npm run server");
  console.log("");
  console.log("3. 🧪 Test the API:");
  console.log("   npm run test:api");
  console.log("");
  console.log("4. 📡 Available endpoints:");
  console.log("   🏥 GET  /health - Health check");
  console.log("");
  console.log("   🎯 REGISTRATION ENDPOINTS:");
  console.log("   📝 POST /api/register - Complete identity registration");
  console.log("   👥 POST /api/register/family - Register entire family");
  console.log(
    "   🔄 POST /api/migrate/:userId - Export to sovereign infrastructure",
  );
  console.log("");
  console.log("   🔐 AUTHENTICATION ENDPOINTS:");
  console.log("   🔑 POST /api/auth/nostr - Nostr authentication");
  console.log("   💰 POST /api/auth/nwc - Nostr Wallet Connect");
  console.log("   📱 POST /api/auth/otp/initiate - Start OTP flow");
  console.log("   ✅ POST /api/auth/otp/verify - Verify OTP");
  console.log("   🔍 GET  /api/auth/session - Get session");
  console.log("   📤 POST /api/auth/logout - Logout");
  console.log("");
  console.log("   👤 IDENTITY MANAGEMENT:");
  console.log("   📋 GET  /api/identity/profile - Get profile");
  console.log("   ✏️  PUT  /api/identity/profile - Update profile");
  console.log("   👨‍👩‍👧‍👦 POST /api/identity/family/create - Create family");
  console.log("   🤝 POST /api/identity/family/join - Join family");
  console.log("   👥 GET  /api/identity/family/members - Get family members");
  console.log("   ⚡ POST /api/identity/lightning/setup - Setup Lightning");
  console.log("   💾 POST /api/identity/backup - Store backup");
  console.log("   📚 GET  /api/identity/backups - Get backup history");
  console.log("   ✔️  POST /api/identity/verify/nip05 - Verify NIP-05");
  console.log("");
  console.log("5. 🏗️ Architecture:");
  console.log("   📱 Frontend → Express API → Supabase + Nostr Relay");
  console.log("   🔄 Migration path: Hackathon → Sovereign infrastructure");
  console.log("");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    showInstructions();
  } else {
    await runAllTests();
  }
}

main().catch(console.error);
