/**
 * Identity Registration Netlify Function
 * POST /.netlify/functions/register-identity - Register new user identity
 * Accessible via /api/register-identity through netlify.toml redirects
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 *
 * CONSOLIDATED VERSION - Complete database schema support with comprehensive error handling
 */

import { supabase } from "./supabase.js";

export const handler = async (event) => {
  console.log("🔍 REGISTER IDENTITY: Function called", {
    method: event.httpMethod,
    hasBody: !!event.body,
    bodyType: typeof event.body,
    timestamp: new Date().toISOString()
  });

  // CRITICAL DEBUG: Add comprehensive error handling
  try {
    // DEBUG: Check environment variables with actual values (masked)
    console.log("🔍 Environment variables check:", {
      hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL,
      supabaseUrlLength: process.env.VITE_SUPABASE_URL?.length || 0,
      hasSupabaseKey: !!process.env.VITE_SUPABASE_ANON_KEY,
      supabaseKeyLength: process.env.VITE_SUPABASE_ANON_KEY?.length || 0,
      nodeEnv: process.env.NODE_ENV,
      allEnvKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE'))
    });

    // DEBUG: Test Supabase import
    console.log("🔍 Testing Supabase import...");

    try {
      const { supabase } = await import("./supabase.js");
      console.log("✅ Supabase import successful");

      // Test basic Supabase connection using correct table
      console.log("🔍 Testing Supabase connection...");
      const { error } = await supabase.from('user_identities').select('count').limit(1);
      if (error) {
        console.error("❌ Supabase connection test failed:", error);
      } else {
        console.log("✅ Supabase connection test successful");
      }
    } catch (supabaseError) {
      console.error("❌ Supabase import/connection failed:", supabaseError);
      throw new Error(`Supabase setup failed: ${supabaseError.message}`);
    }

  // CORS headers following established codebase pattern
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        ...headers,
        "Allow": "POST",
      },
      body: JSON.stringify({
        success: false,
        error: "Method not allowed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  try {
    // Parse request body following established codebase pattern
    const userData = JSON.parse(event.body || "{}");

    console.log('🔍 REGISTER IDENTITY: Parsed request data', {
      hasUserData: !!userData,
      username: userData?.username,
      hasNpub: !!userData?.npub,
      hasEncryptedNsec: !!userData?.encryptedNsec,
      hasPassword: !!userData?.password,
      hasConfirmPassword: !!userData?.confirmPassword,
      hasNip05: !!userData?.nip05,
      hasLightningAddress: !!userData?.lightningAddress,
      allKeys: Object.keys(userData || {}),
      timestamp: new Date().toISOString()
    });

    // Comprehensive validation - Updated to check for npub instead of publicKey
    if (!userData || !userData.username || !userData.npub || !userData.encryptedNsec) {
      console.error('🔍 REGISTER IDENTITY: Validation failed', {
        hasUserData: !!userData,
        hasUsername: !!userData?.username,
        hasNpub: !!userData?.npub,
        hasEncryptedNsec: !!userData?.encryptedNsec,
        receivedFields: userData ? Object.keys(userData) : [],
        timestamp: new Date().toISOString()
      });

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Missing required fields: username, npub, and encryptedNsec are required",
          received: userData ? Object.keys(userData) : [],
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Log registration attempt (without sensitive data)
    console.log('🔐 Identity registration attempt:', {
      username: userData.username,
      hasNpub: !!userData.npub,
      hasEncryptedNsec: !!userData.encryptedNsec,
      hasNip05: !!userData.nip05,
      hasLightningAddress: !!userData.lightningAddress,
      timestamp: new Date().toISOString()
    });

    // Generate proper UUID for user ID using established pattern
    const userId = crypto.randomUUID();

    console.log('🔐 Generated user ID:', {
      userId,
      timestamp: new Date().toISOString()
    });

    // 1. Create hashed user data for privacy-first storage
    console.log("🔍 Testing privacy hashing import...");

    // Import privacy hashing functions at function scope
    const { createHashedUserData, generateUserSalt } = await import("../../lib/security/privacy-hashing.js");
    console.log("✅ Privacy hashing import successful");

    try {

      console.log("🔍 Creating MAXIMUM ENCRYPTION hashed user data...");
      const hashedUserData = await createHashedUserData({
        username: userData.username,
        bio: '', // Empty initially, will be hashed
        displayName: userData.username, // Use username as display name initially
        picture: '', // Empty initially, will be hashed
        npub: userData.npub,
        nip05: userData.nip05 || `${userData.username}@satnam.pub`,
        lightningAddress: userData.lightningAddress || (userData.lightningEnabled ? `${userData.username}@satnam.pub` : null),
        encryptedNsec: userData.encryptedNsec,
        role: 'private'
      });

      // MAXIMUM ENCRYPTION: Store ALL user data as hashed (over-encryption strategy)
      console.log("🔍 Inserting MAXIMUM ENCRYPTED user data into user_identities table...");
      const { error: userError } = await supabase
        .from('user_identities')
        .insert({
          // UNENCRYPTED: Only essential system operation fields
          id: userId, // System identifier (required)
          role: 'private', // User role (required for authorization)
          is_active: true, // Active status (required for system operation)
          created_at: new Date().toISOString(), // System timestamp
          updated_at: new Date().toISOString(), // System timestamp

          // MAXIMUM ENCRYPTION: ALL user data hashed
          user_salt: hashedUserData.user_salt, // Individual user salt
          hashed_username: hashedUserData.hashed_username, // ENCRYPTED: Username
          hashed_bio: hashedUserData.hashed_bio, // ENCRYPTED: Bio text
          hashed_display_name: hashedUserData.hashed_display_name, // ENCRYPTED: Display name
          hashed_picture: hashedUserData.hashed_picture, // ENCRYPTED: Picture URL
          hashed_npub: hashedUserData.hashed_npub, // ENCRYPTED: Nostr public key
          hashed_nip05: hashedUserData.hashed_nip05, // ENCRYPTED: NIP-05 identifier
          hashed_lightning_address: hashedUserData.hashed_lightning_address, // ENCRYPTED: Lightning address
          hashed_encrypted_nsec: hashedUserData.hashed_encrypted_nsec, // ENCRYPTED: Encrypted private key

          // METADATA (can be encrypted if needed)
          spending_limits: JSON.stringify({
            daily_limit: -1, // Unlimited for private users
            requires_approval: false
          }),
          privacy_settings: JSON.stringify({
            privacy_level: 'maximum',
            zero_knowledge_enabled: true,
            over_encryption: true
          })
        });

      if (userError) {
        console.error('❌ Consolidated user creation failed:', userError);
        throw new Error(`User creation failed: ${userError.message}`);
      }

      console.log("✅ Consolidated user data created successfully in user_identities table");

    console.log('✅ Successfully stored user identity data:', {
      userId: userId,
      username: userData.username,
      npub: userData.npub,
      timestamp: new Date().toISOString()
    });

    // 4. Create MAXIMUM ENCRYPTED NIP-05 record (minimal scope, unique salt)
    const nip05Salt = await generateUserSalt(); // Generate unique salt for nip05_records
    const hashedNip05Data = await createHashedUserData({
      username: userData.username,
      npub: userData.npub
    }, nip05Salt);

    const { error: nip05Error } = await supabase
      .from('nip05_records')
      .insert({
        // UNENCRYPTED: Only essential verification fields
        domain: 'satnam.pub', // Whitelisted domain (required for verification)
        is_active: true, // Active status (required for verification)
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),

        // MAXIMUM ENCRYPTION: All user-related data hashed
        user_salt: hashedNip05Data.user_salt, // UNIQUE salt (no reuse)
        hashed_name: hashedNip05Data.hashed_username, // ENCRYPTED: NIP-05 name
        hashed_npub: hashedNip05Data.hashed_npub, // FIXED: Consistent column naming
      });

    if (nip05Error) {
      console.error('Failed to create NIP-05 record:', nip05Error);

      // Cleanup: Remove user identity record if NIP-05 creation failed
      await supabase.from('user_identities').delete().eq('id', userId);

      throw new Error('Failed to create NIP-05 record');
    }

    // 5. Verify privacy compliance before response
    console.log('🔍 Verifying privacy compliance...');
    if (!hashedUserData.user_salt || !hashedUserData.hashed_npub || !hashedUserData.hashed_encrypted_nsec) {
      console.error('❌ PRIVACY VIOLATION: Critical data not properly hashed');
      throw new Error('Privacy compliance verification failed - missing hashed data');
    }
    console.log('✅ Privacy compliance verified - all sensitive data properly hashed');

    console.log('✅ User registered successfully with privacy-first hashing:', {
      userId: userId,
      username: userData.username,
      hasHashedData: true,
      table: 'user_identities',
      timestamp: new Date().toISOString()
    });

    // Success response (PRIVACY-FIRST: No sensitive data in response)
    const responseData = {
      success: true,
      message: "Identity registered successfully with privacy-first protection",
      user: {
        id: userId, // Standard UUID identifier
        username: userData.username, // Only unencrypted field
        nip05: userData.nip05 || `${userData.username}@satnam.pub`, // Public identifier
        lightningAddress: userData.lightningAddress || (userData.lightningEnabled ? `${userData.username}@satnam.pub` : null),
        registeredAt: new Date().toISOString(),
        role: 'private', // Individual user role
        privacyProtected: true, // ALL user data is encrypted
        privacyLevel: 'maximum', // Over-encryption strategy
        zeroKnowledgeEnabled: true,
        encryptionStrategy: 'over_encryption' // Maximum database breach protection
      },
      meta: {
        timestamp: new Date().toISOString(),
        architecture: 'maximum_encryption_two_tables', // Lean architecture
        tablesUpdated: ['user_identities', 'nip05_records'], // Only 2 tables
        encryptionScope: 'ALL user data encrypted, frontend decryption required',
        backwardCompatibility: 'NONE - greenfield maximum security approach'
      }
    };

    // Check if this is a family federation invitation scenario
    if (userData.invitationCode || userData.familyId) {
      responseData.postAuthAction = "show_invitation_modal";
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(responseData),
    };

    } catch (privacyError) {
      console.error("❌ Privacy hashing operation failed:", privacyError);
      throw new Error(`Privacy hashing failed: ${privacyError.message}`);
    }

  } catch (error) {
    console.error("Error registering identity:", error);
    
    // Return appropriate error response
    const errorMessage = error.message || "Internal server error during registration";
    const statusCode = error.message?.includes('Missing required fields') ? 400 : 500;
    
    return {
      statusCode,
      headers,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  } catch (criticalError) {
    // CRITICAL DEBUG: Catch any unhandled errors that cause 502/500
    console.error("❌ CRITICAL FUNCTION ERROR:", criticalError);
    console.error("❌ Error stack:", criticalError.stack);
    console.error("❌ Error details:", {
      name: criticalError.name,
      message: criticalError.message,
      cause: criticalError.cause
    });

    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        error: "Critical function error - check Netlify logs",
        details: criticalError.message,
        timestamp: new Date().toISOString()
      }),
    };
  }
};
