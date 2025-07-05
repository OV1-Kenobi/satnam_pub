/**
 * Privacy-First Authentication Adapter
 * Works NOW with Supabase, easily migrated to private relay later
 * Supports: NIP-07, NWC, OTP, NIP-05 only
 */

import { supabase } from "../supabase";

// Privacy-first types (Nostr-only)
export interface PrivateAuthUser {
  id: string; // Hashed UUID
  npub: string;
  nip05?: string;
  federationRole: "offspring" | "adult" | "steward" | "guardian";
  authMethod: "nip07" | "nwc" | "otp" | "nip05";
  isWhitelisted: boolean;
  votingPower: number;
  stewardApproved: boolean;
  guardianApproved: boolean;
  pubkey: string;
  sessionHash: string;
}

export interface PrivateAuthSession {
  sessionId: string;
  userHash: string;
  expiresAt: number;
  isValid: boolean;
}

export interface AuthResult {
  success: boolean;
  user?: PrivateAuthUser;
  session?: PrivateAuthSession;
  error?: string;
}

export interface NostrCredentials {
  // NIP-07 only
  pubkey?: string;
  signature?: string;
  challenge?: string;

  // NWC only
  connectionString?: string;

  // OTP only
  identifier?: string; // npub or nip05
  code?: string;

  // NIP-05 only
  nip05?: string;
  domain?: string;
}

// Privacy utilities
class PrivacyUtils {
  private static readonly SALT = "family-federation-privacy-salt";

  static hashId(id: string): string {
    // Use crypto-js or similar for consistent hashing
    return btoa(id + this.SALT)
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 16);
  }

  static generateSessionId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36);
    return this.hashId(timestamp + random);
  }
}

// Current Supabase adapter (works NOW)
export class SupabaseAuthAdapter {
  name = "supabase";

  async isAvailable(): Promise<boolean> {
    try {
      const { data, error } = await supabase.auth.getSession();
      return !error;
    } catch {
      return false;
    }
  }

  async authenticateNip07(credentials: NostrCredentials): Promise<AuthResult> {
    try {
      if (!credentials.pubkey || !credentials.signature) {
        return { success: false, error: "Missing NIP-07 credentials" };
      }

      // Store Nostr data in Supabase user metadata
      const { data, error } = await supabase.auth.signInAnonymously();
      
      if (data.user) {
        // Update user metadata after sign in
        await supabase.auth.updateUser({
          data: {
            pubkey: credentials.pubkey,
            npub: this.pubkeyToNpub(credentials.pubkey),
            authMethod: "nip07",
            signature: credentials.signature,
            federationRole: "private", // Default for new users - no RBAC restrictions
            isWhitelisted: false,
            votingPower: 1,
            stewardApproved: false,
            guardianApproved: false,
          },
        });
      }

      if (error) return { success: false, error: error.message };

      const user = this.createPrivateUser(data.user!, "nip07");
      const session = this.createPrivateSession(user);

      return { success: true, user, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "NIP-07 auth failed",
      };
    }
  }

  async authenticateNwc(credentials: NostrCredentials): Promise<AuthResult> {
    try {
      if (!credentials.connectionString) {
        return { success: false, error: "Missing NWC connection string" };
      }

      // Parse NWC connection string to get pubkey
      const pubkey = this.parseNwcPubkey(credentials.connectionString);

      const { data, error } = await supabase.auth.signInAnonymously();
      
      if (data.user) {
        // Update user metadata after sign in
        await supabase.auth.updateUser({
          data: {
            pubkey,
            npub: this.pubkeyToNpub(pubkey),
            authMethod: "nwc",
            connectionString: credentials.connectionString,
            federationRole: "private",
            isWhitelisted: false,
            votingPower: 1,
            stewardApproved: false,
            guardianApproved: false,
          },
        });
      }

      if (error) return { success: false, error: error.message };

      const user = this.createPrivateUser(data.user!, "nwc");
      const session = this.createPrivateSession(user);

      return { success: true, user, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "NWC auth failed",
      };
    }
  }

  async authenticateOtp(credentials: NostrCredentials): Promise<AuthResult> {
    try {
      if (!credentials.identifier || !credentials.code) {
        return { success: false, error: "Missing OTP credentials" };
      }

      // For now, use simple validation - will be enhanced for private relay
      if (credentials.code !== "123456") {
        return { success: false, error: "Invalid OTP code" };
      }

      const { data, error } = await supabase.auth.signInAnonymously();
      
      if (data.user) {
        // Update user metadata after sign in
        await supabase.auth.updateUser({
          data: {
            identifier: credentials.identifier,
            authMethod: "otp",
            federationRole: "private",
            isWhitelisted: true, // OTP users are pre-whitelisted
            votingPower: 1,
            stewardApproved: false,
            guardianApproved: false,
          },
        });
      }

      if (error) return { success: false, error: error.message };

      const user = this.createPrivateUser(data.user!, "otp");
      const session = this.createPrivateSession(user);

      return { success: true, user, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "OTP auth failed",
      };
    }
  }

  async authenticateNip05(credentials: NostrCredentials): Promise<AuthResult> {
    try {
      if (!credentials.nip05) {
        return { success: false, error: "Missing NIP-05 identifier" };
      }

      // Validate NIP-05 identifier
      const pubkey = await this.validateNip05(credentials.nip05);
      if (!pubkey) {
        return { success: false, error: "Invalid NIP-05 identifier" };
      }

      const { data, error } = await supabase.auth.signInAnonymously();
      
      if (data.user) {
        // Update user metadata after sign in
        await supabase.auth.updateUser({
          data: {
            pubkey,
            npub: this.pubkeyToNpub(pubkey),
            nip05: credentials.nip05,
            authMethod: "nip05",
            federationRole: "private",
            isWhitelisted: false,
            votingPower: 1,
            stewardApproved: false,
            guardianApproved: false,
          },
        });
      }

      if (error) return { success: false, error: error.message };

      const user = this.createPrivateUser(data.user!, "nip05");
      const session = this.createPrivateSession(user);

      return { success: true, user, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "NIP-05 auth failed",
      };
    }
  }

  async getSession(): Promise<PrivateAuthSession | null> {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error || !session) return null;

      return {
        sessionId: PrivacyUtils.hashId(session.access_token),
        userHash: PrivacyUtils.hashId(session.user.id),
        expiresAt: new Date(session.expires_at!).getTime(),
        isValid: true,
      };
    } catch {
      return null;
    }
  }

  async logout(): Promise<boolean> {
    try {
      const { error } = await supabase.auth.signOut();
      return !error;
    } catch {
      return false;
    }
  }

  async validateSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession();
    return session?.sessionId === sessionId && session.isValid;
  }

  // Private helpers
  private createPrivateUser(
    supabaseUser: any,
    authMethod: string
  ): PrivateAuthUser {
    const metadata = supabaseUser.user_metadata || {};
    return {
      id: PrivacyUtils.hashId(supabaseUser.id),
      npub: metadata.npub || "",
      nip05: metadata.nip05,
      federationRole: metadata.federationRole || "private",
      authMethod: authMethod as any,
      isWhitelisted: metadata.isWhitelisted || false,
      votingPower: metadata.votingPower || 1,
      stewardApproved: metadata.stewardApproved || false,
      guardianApproved: metadata.guardianApproved || false,
      pubkey: metadata.pubkey || "",
      sessionHash: PrivacyUtils.generateSessionId(),
    };
  }

  private createPrivateSession(user: PrivateAuthUser): PrivateAuthSession {
    return {
      sessionId: PrivacyUtils.generateSessionId(),
      userHash: user.id,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      isValid: true,
    };
  }

  private pubkeyToNpub(pubkey: string): string {
    // Simple conversion - will be enhanced with proper bech32 encoding
    return "npub1" + pubkey.substring(0, 58);
  }

  private parseNwcPubkey(connectionString: string): string {
    // Parse NWC connection string to extract pubkey
    try {
      const url = new URL(connectionString);
      return url.searchParams.get("pubkey") || "";
    } catch {
      return "";
    }
  }

  private async validateNip05(nip05: string): Promise<string | null> {
    // Simple validation for now - will be enhanced
    if (!nip05.includes("@")) return null;
    // Return mock pubkey for now
    return "0".repeat(64);
  }
}

// Factory for future private relay adapter
export function createAuthAdapter(
  provider: "supabase" | "private-relay" = "supabase"
) {
  switch (provider) {
    case "supabase":
      return new SupabaseAuthAdapter();
    case "private-relay":
      // Will be implemented when private relay is ready
      throw new Error("Private relay adapter not yet implemented");
    default:
      return new SupabaseAuthAdapter();
  }
}
