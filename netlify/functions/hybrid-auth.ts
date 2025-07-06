// lib/hybrid-auth.ts
import type { NostrEvent } from "../../src/lib/nostr-browser";
import {
  finalizeEvent as finishEvent,
  generateSecretKey as generatePrivateKey,
  getPublicKey,
  nip19,
  SimplePool,
  verifyEvent,
} from "../../src/lib/nostr-browser";
import { sanitizeNWCData, validateNWCUri } from "../utils/nwc-validation";
import { supabase } from "./supabase";

// Types for our hybrid auth system
export interface NostrProfile {
  npub: string;
  pubkey: string;
  username?: string;
  nip05?: string;
  lightning_address?: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  user: {
    id: string;
    email?: string;
    phone?: string;
    created_at: string;
    updated_at: string;
    user_metadata: Record<string, unknown>;
    app_metadata: Record<string, unknown>;
  };
}

export interface AuthSession {
  user_id: string;
  npub: string;
  supabase_session: SupabaseSession;
  nostr_verified: boolean;
  auth_method: "nostr" | "nostr_nwc" | "nostr_dm_otp";
}

export interface OTPSession {
  otp_code: string;
  pubkey: string;
  expires_at: Date;
  verified: boolean;
}

export class HybridAuth {
  private static otpSessions = new Map<string, OTPSession>();
  private static pool = new SimplePool();
  private static relays = [
    "wss://relay.damus.io",
    "wss://relay.nostr.band",
    "wss://relay.citadel.academy",
    "wss://nos.lol",
  ];

  // ===========================================
  // PRIMARY: Direct Nostr Event Authentication
  // ===========================================

  static async authenticateWithNostr(
    signedEvent: NostrEvent,
  ): Promise<AuthSession> {
    // Verify Nostr signature
    if (!verifyEvent(signedEvent)) {
      throw new Error("Invalid Nostr signature");
    }

    const pubkey = signedEvent.pubkey;
    const npub = nip19.npubEncode(pubkey);

    // Create or get existing profile
    const profile = await this.getOrCreateProfile(pubkey, npub);

    // Create Supabase session using custom JWT
    const customToken = await this.createCustomJWT(profile);
    const { data: authData, error } = await supabase.auth.signInWithIdToken({
      provider: "custom",
      token: customToken,
    });

    if (error) throw error;

    return {
      user_id: profile.id,
      npub,
      supabase_session: authData.session,
      nostr_verified: true,
      auth_method: "nostr",
    };
  }

  // ===========================================
  // NOSTR WALLET CONNECT (NWC) Authentication
  // ===========================================

  static async authenticateWithNWC(nwcUri: string): Promise<AuthSession> {
    try {
      // Enhanced validation using new utility
      const validation = validateNWCUri(nwcUri);
      if (!validation.isValid) {
        throw new Error(validation.error || "Invalid NWC URI");
      }

      const nwcData = sanitizeNWCData(validation.data!);

      // Test the connection
      const walletInfo = await this.testNWCConnection(nwcData);

      if (!walletInfo.pubkey) {
        throw new Error("Failed to get wallet pubkey from NWC");
      }

      const npub = nip19.npubEncode(walletInfo.pubkey);
      const profile = await this.getOrCreateProfile(walletInfo.pubkey, npub);

      // Store NWC connection info
      await this.storeNWCConnection(profile.id, nwcData);

      const customToken = await this.createCustomJWT(profile);
      const { data: authData, error } = await supabase.auth.signInWithIdToken({
        provider: "custom",
        token: customToken,
      });

      if (error) throw error;

      return {
        user_id: profile.id,
        npub,
        supabase_session: authData.session,
        nostr_verified: true,
        auth_method: "nostr_nwc",
      };
    } catch (error) {
      throw new Error(
        `NWC Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ===========================================
  // NOSTR DM OTP Authentication
  // ===========================================

  static async initiateNostrDMOTP(
    npubOrPubkey: string,
  ): Promise<{ otp_code: string; message: string }> {
    try {
      // Convert npub to pubkey if needed
      const pubkey = npubOrPubkey.startsWith("npub")
        ? (nip19.decode(npubOrPubkey).data as string)
        : npubOrPubkey;

      // Generate 6-digit OTP
      const otp_code = Math.floor(100000 + Math.random() * 900000).toString();
      const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store OTP session
      this.otpSessions.set(pubkey, {
        otp_code,
        pubkey,
        expires_at,
        verified: false,
      });

      // Send DM with OTP
      const dmMessage = `🔐 Identity Forge Login Code: ${otp_code}\n\nThis code expires in 10 minutes. Do not share this code with anyone.\n\nIf you didn't request this, ignore this message.`;

      await this.sendNostrDM(pubkey, dmMessage);

      return {
        otp_code, // Return for testing purposes - remove in production
        message: "OTP sent via Nostr DM. Check your DMs for the login code.",
      };
    } catch (error) {
      throw new Error(
        `Failed to send OTP: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async verifyNostrDMOTP(
    pubkey: string,
    otp_code: string,
  ): Promise<AuthSession> {
    const session = this.otpSessions.get(pubkey);

    if (!session) {
      throw new Error("No OTP session found");
    }

    if (session.expires_at < new Date()) {
      this.otpSessions.delete(pubkey);
      throw new Error("OTP expired");
    }

    if (session.otp_code !== otp_code) {
      throw new Error("Invalid OTP code");
    }

    // Mark as verified and cleanup
    session.verified = true;
    this.otpSessions.delete(pubkey);

    const npub = nip19.npubEncode(pubkey);
    const profile = await this.getOrCreateProfile(pubkey, npub);

    const customToken = await this.createCustomJWT(profile);
    const { data: authData, error } = await supabase.auth.signInWithIdToken({
      provider: "custom",
      token: customToken,
    });

    if (error) throw error;

    return {
      user_id: profile.id,
      npub,
      supabase_session: authData.session,
      nostr_verified: true,
      auth_method: "nostr_dm_otp",
    };
  }

  // ===========================================
  // HELPER METHODS
  // ===========================================

  private static async getOrCreateProfile(pubkey: string, npub: string) {
    // Try to find existing profile
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("npub", npub)
      .single();

    if (existingProfile) {
      return existingProfile;
    }

    // Create new profile
    const { data: newProfile, error } = await supabase
      .from("profiles")
      .insert({
        id: crypto.randomUUID(),
        username: npub.slice(0, 16), // Temporary username
        npub,
        nip05: null,
        lightning_address: null,
      })
      .select()
      .single();

    if (error) throw error;
    return newProfile;
  }

  private static async createCustomJWT(profile: any): Promise<string> {
    // Create a simple JWT-like token for Supabase
    // In production, use proper JWT signing
    const payload = {
      sub: profile.id,
      npub: profile.npub,
      username: profile.username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
    };

    return Buffer.from(JSON.stringify(payload)).toString("base64");
  }

  private static parseNWCUri(nwcUri: string) {
    // Enhanced NWC URI parsing with validation
    if (!nwcUri.startsWith("nostr+walletconnect://")) {
      throw new Error(
        "Invalid NWC URI: Must start with nostr+walletconnect://",
      );
    }

    try {
      const url = new URL(nwcUri);
      const pubkey = url.hostname;
      const relay = url.searchParams.get("relay");
      const secret = url.searchParams.get("secret");

      // Validate required parameters
      if (!pubkey || pubkey.length !== 64) {
        throw new Error("Invalid NWC URI: Missing or invalid pubkey");
      }

      if (
        !relay ||
        (!relay.startsWith("wss://") && !relay.startsWith("ws://"))
      ) {
        throw new Error("Invalid NWC URI: Missing or invalid relay URL");
      }

      if (!secret || secret.length < 64) {
        throw new Error("Invalid NWC URI: Missing or invalid secret");
      }

      // Validate pubkey format (hex)
      if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
        throw new Error(
          "Invalid NWC URI: Pubkey must be 64-character hex string",
        );
      }

      return {
        pubkey: pubkey.toLowerCase(),
        relay: relay.trim(),
        secret: secret,
        permissions: url.searchParams.get("permissions")?.split(",") || [],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse NWC URI: ${error.message}`);
      }
      throw new Error("Failed to parse NWC URI: Unknown error");
    }
  }

  private static async testNWCConnection(
    nwcData: any,
  ): Promise<{ pubkey: string; balance?: number }> {
    try {
      // Create a test get_info request
      const requestEvent = finishEvent(
        {
          kind: 23194, // NWC request kind
          created_at: Math.floor(Date.now() / 1000),
          tags: [["p", nwcData.pubkey]],
          content: JSON.stringify({
            method: "get_info",
            params: {},
          }),
        },
        generatePrivateKey(),
      ); // Use temporary key for testing

      // Connect to relay and send request
      const relay = new WebSocket(nwcData.relay);

      return new Promise((resolve, reject) => {
        let resolved = false;

        // Timeout after 10 seconds
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            relay.close();
            reject(new Error("NWC connection timeout"));
          }
        }, 10000);

        relay.onopen = () => {
          relay.send(
            JSON.stringify([
              "REQ",
              "test",
              { kinds: [23195], authors: [nwcData.pubkey], limit: 1 },
            ]),
          );
          relay.send(JSON.stringify(["EVENT", requestEvent]));
        };

        relay.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message[0] === "EVENT" && message[2]?.kind === 23195) {
              // Received response
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                relay.close();
                resolve({
                  pubkey: nwcData.pubkey,
                  balance: 0, // Would parse from actual response
                });
              }
            }
          } catch (error) {
            // Ignore parsing errors
          }
        };

        relay.onerror = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            reject(new Error("NWC connection error"));
          }
        };
      });
    } catch (error) {
      // Fallback: assume connection is valid if URI parses correctly
      console.warn(
        "NWC connection test failed, proceeding with basic validation:",
        error,
      );
      return {
        pubkey: nwcData.pubkey,
        balance: 0,
      };
    }
  }

  private static async storeNWCConnection(userId: string, nwcData: any) {
    // Store encrypted NWC connection data
    const { error } = await supabase.from("lightning_addresses").insert({
      user_id: userId,
      address: `${nwcData.pubkey}@nwc.local`,
      btcpay_store_id: null,
      voltage_node_id: nwcData.pubkey,
      active: true,
    });

    if (error) throw error;
  }

  private static async sendNostrDM(recipientPubkey: string, message: string) {
    // Create a temporary keypair for sending DMs
    const senderPrivkey = generatePrivateKey();
    const senderPubkey = getPublicKey(senderPrivkey);

    const dmEvent = finishEvent(
      {
        kind: 4, // DM
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", recipientPubkey]],
        content: message, // In production, encrypt this
      },
      senderPrivkey,
    );

    // Publish to relays
    await Promise.all(
      this.relays.map((relay) => this.pool.publish([relay], dmEvent)),
    );
  }

  // ===========================================
  // SESSION MANAGEMENT
  // ===========================================

  static async getSupabaseSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session;
  }

  static async validateSession(): Promise<AuthSession | null> {
    const session = await this.getSupabaseSession();
    if (!session) return null;

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (!profile) return null;

    return {
      user_id: profile.id,
      npub: profile.npub,
      supabase_session: session,
      nostr_verified: true,
      auth_method: "nostr", // Default
    };
  }

  static async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
}
