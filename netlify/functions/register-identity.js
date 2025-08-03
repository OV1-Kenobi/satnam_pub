/**
 * Identity Registration Netlify Function
 * POST /.netlify/functions/register-identity - Register new user identity
 * Accessible via /api/register-identity through netlify.toml redirects
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 *
 * CONSOLIDATED VERSION - Complete database schema support with comprehensive error handling
 */

import { createHashedUserData } from "../../lib/security/privacy-hashing.js";
import { supabase } from "./supabase.js";

export const handler = async (event) => {
  console.log("🔍 REGISTER IDENTITY: Function called", {
    method: event.httpMethod,
    hasBody: !!event.body,
    bodyType: typeof event.body,
    timestamp: new Date().toISOString()
  });

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
    const hashedProfileData = await createHashedUserData({
      username: userData.username,
      npub: userData.npub,
      nip05: userData.nip05 || `${userData.username}@satnam.pub`,
      role: 'private'
    });

    // Store user profile in profiles table (PRIVACY-FIRST: hashed sensitive data)
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId, // Same ID for consistency across tables
        username: hashedProfileData.username, // Unencrypted for user management
        display_name: hashedProfileData.username, // Use username as display name initially
        bio: '', // Empty bio initially
        picture: '', // Empty picture initially
        user_salt: hashedProfileData.user_salt, // Individual user salt
        hashed_npub: hashedProfileData.hashed_npub, // HASHED: No plaintext npub
        hashed_nip05: hashedProfileData.hashed_nip05, // HASHED: No plaintext nip05
        lightning_address: userData.lightningAddress || (userData.lightningEnabled ? `${userData.username}@satnam.pub` : null),
        is_active: true,
        created_at: hashedProfileData.created_at,
        updated_at: hashedProfileData.updated_at
      });

    if (profileError) {
      console.error('Failed to store user profile:', profileError);
      throw new Error('Failed to store user profile');
    }

    // 2. Create comprehensive hashed identity data with UNIQUE salt
    const hashedIdentityData = await createHashedUserData({
      username: userData.username,
      npub: userData.npub,
      nip05: userData.nip05 || `${userData.username}@satnam.pub`,
      encryptedNsec: userData.encryptedNsec,
      role: 'private'
    }); // SECURITY FIX: Generate unique salt (no reuse)

    // Store user identity in user_identities table (PRIVACY-FIRST: all sensitive data hashed)
    const { error: userError } = await supabase
      .from('user_identities')
      .insert({
        id: userId, // Same ID as profile for consistency
        username: hashedIdentityData.username, // Unencrypted for user management
        user_salt: hashedIdentityData.user_salt, // Individual user salt
        hashed_npub: hashedIdentityData.hashed_npub, // HASHED: No plaintext npub
        hashed_nip05: hashedIdentityData.hashed_nip05, // HASHED: No plaintext nip05
        hashed_encrypted_nsec: hashedIdentityData.hashed_encrypted_nsec, // HASHED: No plaintext encrypted nsec
        lightning_address: userData.lightningAddress || (userData.lightningEnabled ? `${userData.username}@satnam.pub` : null),
        role: hashedIdentityData.role, // Default role for individual users
        spending_limits: JSON.stringify({
          daily_limit: -1, // Unlimited for private users
          requires_approval: false
        }),
        privacy_settings: JSON.stringify({
          privacy_level: 'enhanced',
          zero_knowledge_enabled: true
        }),
        is_active: hashedIdentityData.is_active,
        created_at: hashedIdentityData.created_at,
        updated_at: hashedIdentityData.updated_at
      });

    if (userError) {
      console.error('Failed to store user identity:', userError);

      // Cleanup: Remove the profile if identity creation failed
      await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      throw new Error('Failed to store user identity');
    }

    console.log('✅ Successfully stored user identity data:', {
      userId: userId,
      username: userData.username,
      npub: userData.npub,
      timestamp: new Date().toISOString()
    });

    // 4. Create NIP-05 record with UNIQUE salt (SECURITY FIX: No salt reuse)
    const nip05Salt = await generateUserSalt(); // Generate unique salt for nip05_records
    const hashedNip05Data = await createHashedUserData({
      username: userData.username,
      npub: userData.npub
    }, nip05Salt);

    const { error: nip05Error } = await supabase
      .from('nip05_records')
      .insert({
        name: userData.username, // Unencrypted for NIP-05 resolution
        user_salt: hashedNip05Data.user_salt, // UNIQUE salt (no reuse)
        hashed_npub: hashedNip05Data.hashed_npub, // HASHED with unique salt (CONSISTENT NAMING)
        domain: 'satnam.pub',
        is_active: true,
        created_at: hashedNip05Data.created_at,
        updated_at: hashedNip05Data.updated_at
      });

    if (nip05Error) {
      console.error('Failed to create NIP-05 record:', nip05Error);

      // Cleanup: Remove user identity record if NIP-05 creation failed
      await supabase.from('user_identities').delete().eq('id', userId);

      throw new Error('Failed to create NIP-05 record');
    }

    // 5. Verify privacy compliance before response
    const { verifyPrivacyCompliance } = privacyModule;
    const privacyCompliant = verifyPrivacyCompliance(hashedIdentityData);
    if (!privacyCompliant) {
      console.error('❌ PRIVACY VIOLATION: Sensitive data not properly hashed');
      throw new Error('Privacy compliance verification failed');
    }

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
        privacyProtected: true, // Indicates all sensitive data is hashed
        privacyLevel: 'enhanced',
        zeroKnowledgeEnabled: true
      },
      meta: {
        timestamp: new Date().toISOString(),
        architecture: 'user_identities', // Existing table architecture
        tablesUpdated: ['user_identities', 'nip05_records'] // Established architecture
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
};
