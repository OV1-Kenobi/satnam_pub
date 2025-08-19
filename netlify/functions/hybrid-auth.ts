// lib/hybrid-auth.ts
// Removed nostr-tools dependency to keep function lightweight and avoid bundle duplication
// Define a minimal local NostrEvent type for typing purposes
interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: any[];
  content: string;
  sig?: string;
}
import { sha256 } from "@noble/hashes/sha256";
import { schnorr } from "@noble/secp256k1";
import { bech32 } from "@scure/base";
import {
  extractNWCComponents,
  sanitizeNWCData,
  validateNWCUri,
} from "../utils/nwc-validation";

// Helpers
const te = new TextEncoder();
const hexToBytes = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) hex = "0" + hex;
  return new Uint8Array(
    (hex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16))
  );
};
const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const utf8ToBytes = (s: string): Uint8Array => te.encode(s);

// Minimal NIP-19 npub encode/decode
const npubEncode = (pubkeyHex: string): string => {
  const words = bech32.toWords(hexToBytes(pubkeyHex));
  return bech32.encode("npub", words);
};

// Event serialization & verification per Nostr spec
const serializeEvent = (ev: NostrEvent): Uint8Array =>
  utf8ToBytes(
    JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content])
  );
const getEventHashHex = (ev: NostrEvent): string =>
  bytesToHex(sha256(serializeEvent(ev)) as Uint8Array);
const verifyNostrEvent = async (ev: NostrEvent): Promise<boolean> => {
  try {
    if (!ev.sig) return false;
    const idHex = getEventHashHex(ev);
    if (ev.id && ev.id !== idHex) return false;
    return await schnorr.verify(ev.sig, idHex, ev.pubkey);
  } catch {
    return false;
  }
};

// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const supaMod: any = await import("./supabase");
    const mod = supaMod.default || supaMod;
    supabaseClient = mod.supabase || mod; // prefer named export
  }
  return supabaseClient;
};

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
  // Removed SimplePool dependency; no relay usage in this function
  constructor() {}

  async authenticateWithNostr(
    nostrEvent: NostrEvent,
    nip05?: string
  ): Promise<AuthResult> {
    try {
      // Verify the event signature (without nostr-tools)
      if (!(await verifyNostrEvent(nostrEvent))) {
        return {
          success: false,
          error: "Invalid event signature",
        };
      }

      // Check if the event is recent (within 5 minutes)
      const now = Math.floor(Date.now() / 1000);
      const eventAge = now - nostrEvent.created_at;
      if (eventAge > 300) {
        return {
          success: false,
          error: "Event is too old",
        };
      }

      // Extract npub from pubkey

      const npub = npubEncode(nostrEvent.pubkey);

      // Generate DUID index for secure database lookup (Phase 2)
      let modDuid: any;
      modDuid = await import("./security/duid-index-generator.mjs");
      const { generateDUIDIndexFromNpub } = modDuid;
      const duid_index = generateDUIDIndexFromNpub(npub);

      // Check if user exists in database using secure DUID index
      const supabase = await getSupabaseClient();
      const { data: existingUser, error: userError } = await supabase
        .from("user_identities")
        .select("*")
        .eq("id", duid_index)
        .single();

      if (userError && userError.code !== "PGRST116") {
        console.error("Database error:", userError);
        return {
          success: false,
          error: "Database error",
        };
      }

      let userData;
      if (!existingUser) {
        // Create new user with privacy-safe hashed ID
        const hashedUserId = await this.generatePrivacyHash(npub + Date.now());

        const { data: newUser, error: createError } = await supabase
          .from("user_identities")
          .insert([
            {
              hashed_user_id: hashedUserId,
              npub,
              nip05: nip05 || null,
              supabase_session: null as any,
              created_at: new Date().toISOString(),
            },
          ])
          .select()
          .single();

        if (createError) {
          console.error("Error creating user:", createError);
          return {
            success: false,
            error: "Failed to create user",
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
        nip05: userData.nip05,
      });

      return {
        success: true,
        data: {
          user: {
            id: userData.hashed_user_id,
            npub: userData.npub,
            username: userData.username || undefined,
            nip05: userData.nip05 || undefined,
            role: userData.role || undefined,
            is_active: userData.is_active ?? true,
          },
          authenticated: true,
          sessionToken: token,
          expiresAt: undefined,
        },
      };
    } catch (error) {
      console.error("Error in authenticateWithNostr:", error);
      return {
        success: false,
        error: "Authentication failed",
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
      const supabase = await getSupabaseClient();
      const { data: nwcConnection, error: nwcError } = await supabase
        .from("nwc_connections")
        .insert([
          {
            pubkey: nwcData.pubkey,
            relay: nwcData.relay,
            permissions: nwcData.permissions || [],
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (nwcError) {
        console.error("Error storing NWC connection:", nwcError);
        return {
          success: false,
          error: "Failed to store NWC connection",
        };
      }

      return {
        success: true,
        data: {
          connectionId: nwcConnection.id,
          pubkey: nwcConnection.pubkey,
        },
      };
    } catch (error) {
      console.error("Error in authenticateWithNWC:", error);
      return {
        success: false,
        error: "NWC authentication failed",
      };
    }
  }

  async sendOTP(npub: string, nip05?: string): Promise<OTPResult> {
    try {
      // Delegate to centralized event publishing service (server-managed keys)
      const svcMod: any = await import(
        "../../lib/central_event_publishing_service"
      );
      const svc = svcMod.central_event_publishing_service || svcMod.default;
      if (!svc || typeof svc.sendOTPDM !== "function") {
        throw new Error(
          "Central event publishing service not properly configured"
        );
      }
      const result = await svc.sendOTPDM(npub, nip05);
      if (!result?.success) {
        return { success: false, error: result?.error || "Failed to send OTP" };
      }
      return { success: true };
    } catch (error) {
      console.error("Error in sendOTP:", error);
      return { success: false, error: "Failed to send OTP" };
    }
  }

  async verifyOTP(otpKey: string, otp: string): Promise<AuthResult> {
    try {
      // Get OTP from database
      const supabase = await getSupabaseClient();
      const { data: otpData, error: otpError } = await supabase
        .from("otp_codes")
        .select("*")
        .eq("otp_key", otpKey)
        .eq("otp_code", otp)
        .single();

      if (otpError || !otpData) {
        return {
          success: false,
          error: "Invalid OTP",
        };
      }

      // Check if OTP is expired
      const now = new Date();
      const expiresAt = new Date(otpData.expires_at);
      if (now > expiresAt) {
        return {
          success: false,
          error: "OTP expired",
        };
      }

      // Delete used OTP
      await (await getSupabaseClient())
        .from("otp_codes")
        .delete()
        .eq("otp_key", otpKey);

      // Get user data using secure DUID index lookup
      let modDuid: any;
      try {
        modDuid = await import("./security/duid-index-generator.mjs");
      } catch (e) {
        modDuid = await import("./security/duid-index-generator.mjs");
      }
      const { generateDUIDIndexFromNpub } = modDuid;
      const duid_index = generateDUIDIndexFromNpub(otpData.npub);

      const { data: userData, error: userError } = await (
        await getSupabaseClient()
      )
        .from("user_identities")
        .select("*")
        .eq("id", duid_index)
        .single();

      if (userError || !userData) {
        return {
          success: false,
          error: "User not found",
        };
      }

      // Generate JWT token
      const token = await this.generateJWT({
        userId: userData.hashed_user_id,
        npub: userData.npub,
        nip05: userData.nip05,
      });

      return {
        success: true,
        data: {
          userId: userData.hashed_user_id,
          npub: userData.npub,
          nip05: userData.nip05,
        },
        token,
      };
    } catch (error) {
      console.error("Error in verifyOTP:", error);
      return {
        success: false,
        error: "OTP verification failed",
      };
    }
  }

  private async generateJWT(payload: any): Promise<string> {
    // Simplified JWT implementation for Netlify Functions
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payloadStr = btoa(
      JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
      })
    );

    return `${header}.${payloadStr}.signature`;
  }

  private async generatePrivacyHash(data: string): Promise<string> {
    // Use Web Crypto API for browser compatibility
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async createSession(userData: any, session: any): Promise<Session> {
    const sessionData: Session = {
      user_id: userData.hashed_user_id,
      npub: userData.npub,
      nip05: userData.nip05,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    };

    // Store session in database
    const { error } = await (await getSupabaseClient())
      .from("user_sessions")
      .insert([
        {
          ...sessionData,
          supabase_session: session as any,
        },
      ]);

    if (error) {
      console.error("Error creating session:", error);
      throw new Error("Failed to create session");
    }

    return sessionData;
  }
}
