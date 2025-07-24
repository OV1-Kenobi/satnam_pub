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
import {
  extractNWCComponents,
  sanitizeNWCData,
  validateNWCUri,
} from "../utils/nwc-validation";
import { supabase } from "./supabase";

// Types for our hybrid auth system
export interface NostrProfile {
  npub: string;
  nip05?: string;
  name?: string;
  picture?: string;
}

export interface AuthResult {
  success: boolean;
  data?: any;
  error?: string;
  token?: string;
}

export interface OTPResult {
  success: boolean;
  otpKey?: string;
  error?: string;
}

export interface Session {
  user_id: string;
  npub: string;
  nip05?: string;
  created_at: string;
  expires_at: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email?: string;
  };
}

export class HybridAuth {
  private pool: SimplePool;
  private relays: string[];

  constructor() {
    this.pool = new SimplePool();
    this.relays = process.env.NOSTR_RELAYS?.split(',') || ['wss://relay.damus.io', 'wss://nos.lol'];
  }

  async authenticateWithNostr(nostrEvent: NostrEvent, nip05?: string): Promise<AuthResult> {
    try {
      // Verify the event signature
      if (!(verifyEvent as any)(nostrEvent)) {
        return {
          success: false,
          error: "Invalid event signature"
        };
      }

      // Check if the event is recent (within 5 minutes)
      const now = Math.floor(Date.now() / 1000);
      const eventAge = now - nostrEvent.created_at;
      if (eventAge > 300) {
        return {
          success: false,
          error: "Event is too old"
        };
      }

      // Extract npub from pubkey
      const npub = nip19.npubEncode(nostrEvent.pubkey);

      // Check if user exists in database
      const { data: existingUser, error: userError } = await supabase
        .from("user_identities")
        .select("*")
        .eq("npub", npub)
        .single();

      if (userError && userError.code !== 'PGRST116') {
        console.error("Database error:", userError);
        return {
          success: false,
          error: "Database error"
        };
      }

      let userData;
      if (!existingUser) {
        // Create new user with privacy-safe hashed ID
        const hashedUserId = await this.generatePrivacyHash(npub + Date.now());
        
        const { data: newUser, error: createError } = await supabase
          .from("user_identities")
          .insert([{
            hashed_user_id: hashedUserId,
            npub,
            nip05: nip05 || null,
            supabase_session: null as any,
            created_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (createError) {
          console.error("Error creating user:", createError);
          return {
            success: false,
            error: "Failed to create user"
          };
        }

        userData = newUser;
      } else {
        userData = existingUser;
      }

      // Generate JWT token
      const token = await this.generateJWT({
        userId: userData.hashed_user_id,
        npub: userData.npub,
        nip05: userData.nip05
      });

      return {
        success: true,
        data: {
          userId: userData.hashed_user_id,
          npub: userData.npub,
          nip05: userData.nip05
        },
        token
      };

    } catch (error) {
      console.error("Error in authenticateWithNostr:", error);
      return {
        success: false,
        error: "Authentication failed"
      };
    }
  }

  async authenticateWithNWC(nwcUri: string): Promise<AuthResult> {
    try {
      // Enhanced validation using new utility
      const isValid = validateNWCUri(nwcUri);
      if (!isValid) {
        throw new Error("Invalid NWC URI");
      }

      const nwcComponents = extractNWCComponents(nwcUri);
      if (!nwcComponents) {
        throw new Error("Failed to extract NWC components");
      }

      const nwcData = sanitizeNWCData(nwcComponents);

      // Store NWC connection securely
      const { data: nwcConnection, error: nwcError } = await supabase
        .from("nwc_connections")
        .insert([{
          pubkey: nwcData.pubkey,
          relay: nwcData.relay,
          permissions: nwcData.permissions || [],
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (nwcError) {
        console.error("Error storing NWC connection:", nwcError);
        return {
          success: false,
          error: "Failed to store NWC connection"
        };
      }

      return {
        success: true,
        data: {
          connectionId: nwcConnection.id,
          pubkey: nwcConnection.pubkey
        }
      };

    } catch (error) {
      console.error("Error in authenticateWithNWC:", error);
      return {
        success: false,
        error: "NWC authentication failed"
      };
    }
  }

  async sendOTP(npub: string, nip05?: string): Promise<OTPResult> {
    try {
      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpKey = await this.generatePrivacyHash(npub + Date.now());

      // Store OTP in database (with expiration)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      
      const { error: storeError } = await supabase
        .from("otp_codes")
        .insert([{
          otp_key: otpKey,
          npub,
          otp_code: otp,
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString()
        }]);

      if (storeError) {
        console.error("Error storing OTP:", storeError);
        return {
          success: false,
          error: "Failed to generate OTP"
        };
      }

      // Send OTP via Nostr DM
      await this.sendNostrDM(npub, `Your Satnam.pub OTP code is: ${otp}`);

      return {
        success: true,
        otpKey
      };

    } catch (error) {
      console.error("Error in sendOTP:", error);
      return {
        success: false,
        error: "Failed to send OTP"
      };
    }
  }

  async verifyOTP(otpKey: string, otp: string): Promise<AuthResult> {
    try {
      // Get OTP from database
      const { data: otpData, error: otpError } = await supabase
        .from("otp_codes")
        .select("*")
        .eq("otp_key", otpKey)
        .eq("otp_code", otp)
        .single();

      if (otpError || !otpData) {
        return {
          success: false,
          error: "Invalid OTP"
        };
      }

      // Check if OTP is expired
      const now = new Date();
      const expiresAt = new Date(otpData.expires_at);
      if (now > expiresAt) {
        return {
          success: false,
          error: "OTP expired"
        };
      }

      // Delete used OTP
      await supabase
        .from("otp_codes")
        .delete()
        .eq("otp_key", otpKey);

      // Get user data
      const { data: userData, error: userError } = await supabase
        .from("user_identities")
        .select("*")
        .eq("npub", otpData.npub)
        .single();

      if (userError || !userData) {
        return {
          success: false,
          error: "User not found"
        };
      }

      // Generate JWT token
      const token = await this.generateJWT({
        userId: userData.hashed_user_id,
        npub: userData.npub,
        nip05: userData.nip05
      });

      return {
        success: true,
        data: {
          userId: userData.hashed_user_id,
          npub: userData.npub,
          nip05: userData.nip05
        },
        token
      };

    } catch (error) {
      console.error("Error in verifyOTP:", error);
      return {
        success: false,
        error: "OTP verification failed"
      };
    }
  }

  private async sendNostrDM(recipientNpub: string, message: string): Promise<void> {
    try {
      // Generate temporary keys for sending DM
      const senderPrivkey = (generatePrivateKey as any)();
      const senderPubkey = (getPublicKey as any)(senderPrivkey);

      const dmEvent = (finishEvent as any)({
        kind: 4,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', nip19.decode(recipientNpub).data as string]],
        content: message,
      }, senderPrivkey);

      // Publish to relays
      await this.pool.publish(this.relays, dmEvent);

    } catch (error) {
      console.error("Error sending Nostr DM:", error);
    }
  }

  private async generateJWT(payload: any): Promise<string> {
    // Simplified JWT implementation for Netlify Functions
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadStr = btoa(JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
    }));

    return `${header}.${payloadStr}.signature`;
  }

  private async generatePrivacyHash(data: string): Promise<string> {
    // Use Node.js crypto for Netlify Functions
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async createSession(userData: any, session: any): Promise<Session> {
    const sessionData: Session = {
      user_id: userData.hashed_user_id,
      npub: userData.npub,
      nip05: userData.nip05,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    };

    // Store session in database
    const { error } = await supabase
      .from("user_sessions")
      .insert([{
        ...sessionData,
        supabase_session: session as any,
      }]);

    if (error) {
      console.error("Error creating session:", error);
      throw new Error("Failed to create session");
    }

    return sessionData;
  }
}
