// Secure Nostr OTP DM service using Rebuilding Camelot account
// File: lib/nostr-otp-service.ts
import {
  NostrEvent,
  finalizeEvent,
  getPublicKey,
  nip04,
  nip19,
  nip59,
  SimplePool,
} from "../../src/lib/nostr-browser";
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
  messageType?: "gift-wrap" | "nip04";
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

      // Create OTP message content (will be updated with correct type after encryption)
      let dmContent = this.createOTPMessage(
        otp,
        userNip05 || recipientNpub,
        expiresAt
      );

      // Convert npub to hex pubkey for encryption
      const recipientPubkey = this.npubToHex(recipientNpub);

      // Convert nsec to Uint8Array for encryption
      const privateKeyBytes = this.nsecToBytes(nsecData);

      // Try gift-wrapped messaging first, fallback to NIP-04
      let dmEvent: NostrEvent;
      let messageType: "gift-wrap" | "nip04" = "nip04";

      try {
        // Attempt gift-wrapped messaging (NIP-59)
        dmContent = this.createOTPMessage(otp, userNip05 || recipientNpub, expiresAt, "gift-wrap");
        dmEvent = await this.createGiftWrappedOTPEvent(
          privateKeyBytes,
          recipientPubkey,
          dmContent
        );
        messageType = "gift-wrap";
        console.log(`Gift-wrapped OTP sent to ${recipientNpub}`);
      } catch (giftWrapError) {
        console.warn(`Gift-wrap failed for ${recipientNpub}, falling back to NIP-04:`, giftWrapError);
        
        // Fallback to NIP-04 encryption
        dmContent = this.createOTPMessage(otp, userNip05 || recipientNpub, expiresAt, "nip04");
        const encryptedContent = await nip04.encrypt(
          dmContent,
          recipientPubkey,
          privateKeyBytes
        );

        dmEvent = await this.createSignedDMEvent(
          privateKeyBytes,
          recipientPubkey,
          encryptedContent
        );
        messageType = "nip04";
      }

      // Publish to relays
      await this.publishToRelays(dmEvent);

      // Store OTP for verification
      await this.storeOTPForVerification(recipientNpub, otp, expiresAt);

      return {
        success: true,
        otp,
        messageId: dmEvent.id,
        expiresAt,
        messageType, // Include message type for tracking
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

  // Generate secure OTP using Web Crypto API
  private generateOTP(): string {
    const digits = "0123456789";
    let otp = "";
    const randomBytes = crypto.getRandomValues(new Uint8Array(this.config.otpLength));

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
    expiresAt: Date,
    messageType: "gift-wrap" | "nip04" = "nip04"
  ): string {
    const encryptionNotice = messageType === "gift-wrap" 
      ? "🎁 This message is gift-wrapped for enhanced privacy"
      : "🔒 This message is encrypted with standard Nostr encryption";

    return `🔐 Satnam.pub Family Federation Authentication

Your OTP code: ${otp}

This code is for: ${userIdentifier}
Expires: ${expiresAt.toLocaleString()}

⚠️ SECURITY NOTICE:
- This message is from RebuildingCamelot@satnam.pub
- Never share this code with anyone
- Code expires in ${this.config.expiryMinutes} minutes
- Only use for Satnam.pub Family Financials access

${encryptionNotice}

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
      return data as string; // nip19.decode returns the hex string directly
    } catch (error) {
      throw new Error(
        `Failed to decode npub: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Convert nsec to Uint8Array
  private nsecToBytes(nsec: string): Uint8Array {
    try {
      const { type, data } = nip19.decode(nsec);
      if (type !== "nsec") {
        throw new Error("Invalid nsec format");
      }
      // Convert hex string to Uint8Array
      const hex = data as string;
      return new Uint8Array(hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    } catch (error) {
      throw new Error(
        `Failed to decode nsec: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Create gift-wrapped OTP event (NIP-59)
  private async createGiftWrappedOTPEvent(
    privateKeyBytes: Uint8Array,
    recipientPubkey: string,
    content: string
  ): Promise<NostrEvent> {
    const senderPubkey = getPublicKey(privateKeyBytes);

    // Create the base event for gift-wrapping
    const baseEvent = {
      kind: 4, // DM event kind
      pubkey: senderPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", recipientPubkey],
        ["message-type", "otp"],
        ["encryption", "gift-wrap"],
      ],
      content: content,
    };

    // Wrap the event using NIP-59
    const giftWrappedEvent = await nip59.wrapEvent(
      baseEvent,
      recipientPubkey,
      privateKeyBytes
    );

    return giftWrappedEvent;
  }

  // Create and sign DM event
  private async createSignedDMEvent(
    privateKeyBytes: Uint8Array,
    recipientPubkey: string,
    encryptedContent: string
  ): Promise<NostrEvent> {
    const senderPubkey = getPublicKey(privateKeyBytes);

    const event = {
      kind: 4, // DM event kind
      pubkey: senderPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", recipientPubkey]],
      content: encryptedContent,
    };

    return finalizeEvent(event, privateKeyBytes);
  }

  // Publish to multiple relays for reliability
  private async publishToRelays(event: NostrEvent): Promise<boolean[]> {
    const publishPromises = this.config.relays.map(async (relay) => {
      try {
        await this.pool.publish(relay, event);
        return true;
      } catch (error) {
        console.warn(`Failed to publish to ${relay}:`, error);
        return false;
      }
    });
    return Promise.all(publishPromises);
  }

  // Store OTP for later verification
  private async storeOTPForVerification(
    recipientNpub: string,
    otp: string,
    expiresAt: Date
  ): Promise<void> {
    const { hash: otpHash, salt: otpSalt } = await this.hashOTP(otp);

    const { error } = await supabase.from("family_otp_verification").insert({
      recipient_npub: recipientNpub,
      otp_hash: otpHash, // Store hash, not plaintext
      otp_salt: otpSalt, // Store salt for verification
      expires_at: expiresAt.toISOString(),
      used: false,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to store OTP: ${error.message}`);
    }
  }

  // Hash OTP for secure storage using Web Crypto API with unique salt
  private async hashOTP(otp: string, salt?: string): Promise<{ hash: string; salt: string }> {
    // Generate unique salt for each OTP to prevent rainbow table attacks
    const uniqueSalt = salt || Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    
    const encoder = new TextEncoder();
    const data = encoder.encode(otp + uniqueSalt + "satnam-otp-2024");
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return { hash, salt: uniqueSalt };
  }

  // Verify OTP during authentication
  async verifyOTP(
    recipientNpub: string,
    providedOTP: string
  ): Promise<OTPVerificationResult> {
    try {
      // Get the most recent unused OTP for this recipient
      const { data: otpRecords, error } = await supabase
        .from("family_otp_verification")
        .select("*")
        .eq("recipient_npub", recipientNpub)
        .eq("used", false)
        .order("created_at", { ascending: false })
        .limit(5); // Check last 5 OTPs

      if (error || !otpRecords || otpRecords.length === 0) {
        return { valid: false, expired: false, error: "No OTP found" };
      }

      // Try to match the provided OTP against stored hashes
      let validOTP = null;
      for (const otpRecord of otpRecords) {
        try {
          // Recreate the hash using the stored salt
          const { hash: otpHash } = await this.hashOTP(providedOTP, otpRecord.otp_salt);
          if (otpHash === otpRecord.otp_hash) {
            validOTP = otpRecord;
            break;
          }
        } catch (hashError) {
          console.warn("Hash verification failed for OTP record:", hashError);
          continue;
        }
      }

      if (!validOTP) {
        return { valid: false, expired: false, error: "Invalid OTP" };
      }

      const now = new Date();
      const expiresAt = new Date(validOTP.expires_at);

      if (now > expiresAt) {
        return { valid: false, expired: true, error: "OTP has expired" };
      }

      // Mark OTP as used
      const { error: updateError } = await supabase
        .from("family_otp_verification")
        .update({ used: true, used_at: now.toISOString() })
        .eq("id", validOTP.id);

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
        const { hash: otpHash, salt: otpSalt } = await this.hashOTP(testOTP);

        testOTPs.push({
          recipient_npub: `npub1test${i}expired`,
          otp_hash: otpHash,
          otp_salt: otpSalt,
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
