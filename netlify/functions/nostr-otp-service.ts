// Secure Nostr OTP DM service using Rebuilding Camelot account
// File: lib/nostr-otp-service.ts
import crypto from "crypto";
import {
  Event,
  finalizeEvent,
  getPublicKey,
  nip04,
  nip19,
  SimplePool,
} from "nostr-tools";
import { supabase } from "./supabase";

interface OTPDMConfig {
  relays: string[];
  otpLength: number;
  expiryMinutes: number;
}

interface OTPResult {
  success: boolean;
  otp: string;
  messageId: string;
  expiresAt: Date;
  error?: string;
}

interface OTPVerificationResult {
  valid: boolean;
  expired: boolean;
  error?: string;
}

class RebuildingCamelotOTPService {
  private pool: SimplePool;
  private config: OTPDMConfig;

  constructor() {
    this.pool = new SimplePool();
    this.config = {
      relays: [
        "wss://relay.damus.io",
        "wss://relay.satnam.pub",
        "wss://nos.lol",
      ],
      otpLength: 6,
      expiryMinutes: 10,
    };
  }

  // Generate and send OTP DM from Rebuilding Camelot account
  async sendOTPDM(
    recipientNpub: string,
    userNip05?: string
  ): Promise<OTPResult> {
    try {
      // Retrieve Rebuilding Camelot credentials from Vault
      const { data: nsecData, error: nsecError } = await supabase.rpc(
        "get_rebuilding_camelot_nsec"
      );
      const { data: nip05Data, error: nip05Error } = await supabase.rpc(
        "get_rebuilding_camelot_nip05"
      );

      if (nsecError || nip05Error || !nsecData || !nip05Data) {
        console.error("Failed to retrieve Rebuilding Camelot credentials:", {
          nsecError,
          nip05Error,
        });
        throw new Error(
          "Failed to retrieve Rebuilding Camelot credentials from vault"
        );
      }

      // Generate OTP
      const otp = this.generateOTP();
      const expiresAt = new Date(
        Date.now() + this.config.expiryMinutes * 60 * 1000
      );

      // Create encrypted DM content
      const dmContent = this.createOTPMessage(
        otp,
        userNip05 || recipientNpub,
        expiresAt
      );

      // Convert npub to hex pubkey for encryption
      const recipientPubkey = this.npubToHex(recipientNpub);

      // Encrypt DM using NIP-04
      const encryptedContent = await nip04.encrypt(
        nsecData,
        recipientPubkey,
        dmContent
      );

      // Create and sign DM event
      const dmEvent = await this.createSignedDMEvent(
        nsecData,
        recipientPubkey,
        encryptedContent
      );

      // Publish to relays
      await this.publishToRelays(dmEvent);

      // Store OTP for verification
      await this.storeOTPForVerification(recipientNpub, otp, expiresAt);

      return {
        success: true,
        otp,
        messageId: dmEvent.id,
        expiresAt,
      };
    } catch (error) {
      console.error("OTP DM sending failed:", error);
      return {
        success: false,
        otp: "",
        messageId: "",
        expiresAt: new Date(),
        error: error instanceof Error ? error.message : "Failed to send OTP DM",
      };
    }
  }

  // Generate secure OTP
  private generateOTP(): string {
    const digits = "0123456789";
    let otp = "";
    const randomBytes = crypto.randomBytes(this.config.otpLength);

    for (let i = 0; i < this.config.otpLength; i++) {
      const randomIndex = randomBytes[i] % digits.length;
      otp += digits[randomIndex];
    }

    return otp;
  }

  // Create OTP message content
  private createOTPMessage(
    otp: string,
    userIdentifier: string,
    expiresAt: Date
  ): string {
    return `🔐 Satnam.pub Family Federation Authentication

Your OTP code: ${otp}

This code is for: ${userIdentifier}
Expires: ${expiresAt.toLocaleString()}

⚠️ SECURITY NOTICE:
- This message is from RebuildingCamelot@satnam.pub
- Never share this code with anyone
- Code expires in ${this.config.expiryMinutes} minutes
- Only use for Satnam.pub Family Financials access

If you didn't request this code, please ignore this message.

🏰 Rebuilding Camelot - Sovereign Family Banking`;
  }

  // Convert npub to hex pubkey
  private npubToHex(npub: string): string {
    try {
      const { type, data } = nip19.decode(npub);
      if (type !== "npub") {
        throw new Error("Invalid npub format");
      }
      return Buffer.from(data).toString("hex");
    } catch (error) {
      throw new Error(
        `Failed to decode npub: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Create and sign DM event
  private async createSignedDMEvent(
    nsec: string,
    recipientPubkey: string,
    encryptedContent: string
  ): Promise<Event> {
    const senderPubkey = getPublicKey(nsec);

    const event = {
      kind: 4, // DM event kind
      pubkey: senderPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", recipientPubkey]],
      content: encryptedContent,
    };

    return finalizeEvent(event, nsec);
  }

  // Publish to multiple relays for reliability
  private async publishToRelays(event: Event): Promise<boolean[]> {
    const publishPromises = this.config.relays.map((relay) =>
      this.pool.publish([relay], event)
    );
    return Promise.all(publishPromises);
  }

  // Store OTP for later verification
  private async storeOTPForVerification(
    recipientNpub: string,
    otp: string,
    expiresAt: Date
  ): Promise<void> {
    const otpHash = await this.hashOTP(otp);

    const { error } = await supabase.from("family_otp_verification").insert({
      recipient_npub: recipientNpub,
      otp_hash: otpHash, // Store hash, not plaintext
      expires_at: expiresAt.toISOString(),
      used: false,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to store OTP: ${error.message}`);
    }
  }

  // Hash OTP for secure storage
  private async hashOTP(otp: string): Promise<string> {
    const salt = process.env.OTP_SALT;
    if (!salt) {
      throw new Error("OTP_SALT environment variable is required");
    }
    const hash = crypto.createHash("sha256");
    hash.update(otp + salt);
    return hash.digest("hex");
  }

  // Verify OTP during authentication
  async verifyOTP(
    recipientNpub: string,
    providedOTP: string
  ): Promise<OTPVerificationResult> {
    try {
      const otpHash = await this.hashOTP(providedOTP);

      const { data: otpRecord, error } = await supabase
        .from("family_otp_verification")
        .select("*")
        .eq("recipient_npub", recipientNpub)
        .eq("otp_hash", otpHash)
        .eq("used", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !otpRecord) {
        return { valid: false, expired: false, error: "Invalid OTP" };
      }

      const now = new Date();
      const expiresAt = new Date(otpRecord.expires_at);

      if (now > expiresAt) {
        return { valid: false, expired: true, error: "OTP has expired" };
      }

      // Mark OTP as used
      const { error: updateError } = await supabase
        .from("family_otp_verification")
        .update({ used: true, used_at: now.toISOString() })
        .eq("id", otpRecord.id);

      if (updateError) {
        console.error("Failed to mark OTP as used:", updateError);
      }

      return { valid: true, expired: false };
    } catch (error) {
      console.error("OTP verification error:", error);
      return {
        valid: false,
        expired: false,
        error: error instanceof Error ? error.message : "Verification failed",
      };
    }
  }

  // Get count of OTPs (for testing purposes)
  async getOTPCount(): Promise<{ total: number; expired: number }> {
    try {
      const now = new Date().toISOString();

      // Get total count
      const { count: totalCount, error: totalError } = await supabase
        .from("family_otp_verification")
        .select("*", { count: "exact", head: true });

      if (totalError) {
        throw new Error(`Failed to count total OTPs: ${totalError.message}`);
      }

      // Get expired count
      const { count: expiredCount, error: expiredError } = await supabase
        .from("family_otp_verification")
        .select("*", { count: "exact", head: true })
        .lt("expires_at", now);

      if (expiredError) {
        throw new Error(
          `Failed to count expired OTPs: ${expiredError.message}`
        );
      }

      return {
        total: totalCount || 0,
        expired: expiredCount || 0,
      };
    } catch (error) {
      console.error("OTP count error:", error);
      return { total: 0, expired: 0 };
    }
  }

  // Create expired test OTPs (for testing purposes only)
  async createTestExpiredOTPs(count: number = 2): Promise<void> {
    try {
      const testOTPs = [];
      const expiredTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

      for (let i = 0; i < count; i++) {
        const testOTP = this.generateOTP();
        const otpHash = await this.hashOTP(testOTP);

        testOTPs.push({
          recipient_npub: `npub1test${i}expired`,
          otp_hash: otpHash,
          expires_at: expiredTime.toISOString(),
          used: false,
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        });
      }

      const { error } = await supabase
        .from("family_otp_verification")
        .insert(testOTPs);

      if (error) {
        throw new Error(`Failed to create test expired OTPs: ${error.message}`);
      }
    } catch (error) {
      console.error("Create test expired OTPs error:", error);
      throw error;
    }
  }

  // Cleanup expired OTPs
  async cleanupExpiredOTPs(): Promise<number> {
    try {
      // First count expired OTPs
      const { expired: expiredCount } = await this.getOTPCount();

      const { error } = await supabase
        .from("family_otp_verification")
        .delete()
        .lt("expires_at", new Date().toISOString());

      if (error) {
        console.error("Failed to cleanup expired OTPs:", error);
        throw new Error(`Failed to cleanup expired OTPs: ${error.message}`);
      }

      return expiredCount;
    } catch (error) {
      console.error("OTP cleanup error:", error);
      throw error;
    }
  }
}

export { RebuildingCamelotOTPService };
export type { OTPResult, OTPVerificationResult };
