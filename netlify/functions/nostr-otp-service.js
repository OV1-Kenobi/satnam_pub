import { bytesToHex } from "@noble/hashes/utils";
import {
    finalizeEvent,
    getPublicKey,
    nip04,
    nip19,
    nip59,
    SimplePool,
} from "nostr-tools";
import { vault } from "../../lib/vault.js";
// Timeout helpers and backoff
/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [label]
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, label = 'op') {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then((v) => { clearTimeout(id); resolve(v); }).catch((e) => { clearTimeout(id); reject(e); });
  });
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

import { supabase } from "./supabase.js";

function getEnvVar(key) {
  return process.env[key];
}

/**
 * @typedef {Object} OTPDMConfig
 * @property {string[]} relays
 * @property {number} otpLength
 * @property {number} expiryMinutes
 * @property {boolean} preferGiftWrap
 * @property {string[]} fallbackRelays
 */

/**
 * @typedef {Object} OTPResult
 * @property {boolean} success
 * @property {string} otp
 * @property {string} messageId
 * @property {Date} expiresAt
 * @property {"gift-wrap"|"nip04"} [messageType]
 * @property {string} [error]
 */

/**
 * @typedef {Object} OTPVerificationResult
 * @property {boolean} valid
 * @property {boolean} expired
 * @property {string} [error]
 */

class RebuildingCamelotOTPService {
  constructor() {
    this.pool = new SimplePool();
    this.config = null;
  }

  async getConfig() {
    if (this.config) {
      return this.config;
    }

    try {
      const vaultRelays = await vault.getCredentials("nostr_relays");
      const vaultOtpConfig = await vault.getCredentials("otp_config");

      let relays = [
        "wss://relay.damus.io",
        "wss://relay.satnam.pub",
        "wss://nos.lol",
      ];

      let otpLength = 6;
      let expiryMinutes = 10;
      let preferGiftWrap = true;

      if (vaultRelays) {
        try {
          relays = JSON.parse(vaultRelays);
        } catch (e) {
          // Use default relays if parsing fails
        }
      }

      if (vaultOtpConfig) {
        try {
          const config = JSON.parse(vaultOtpConfig);
          otpLength = config.otpLength || 6;
          expiryMinutes = config.expiryMinutes || 10;
          preferGiftWrap = config.preferGiftWrap !== false;
        } catch (e) {
          // Use defaults if parsing fails
        }
      }

      this.config = {
        relays,
        otpLength,
        expiryMinutes,
        preferGiftWrap,
        fallbackRelays: [
          "wss://relay.nostr.band",
          "wss://relay.primal.net",
        ],
      };
    } catch (error) {
      // Vault not available, use defaults
      this.config = {
        relays: [
          "wss://relay.damus.io",
          "wss://relay.satnam.pub",
          "wss://nos.lol",
        ],
        otpLength: 6,
        expiryMinutes: 10,
        preferGiftWrap: true,
        fallbackRelays: [
          "wss://relay.nostr.band",
          "wss://relay.primal.net",
        ],
      };
    }

    return this.config;
  }

  /**
   * @param {string} recipientNpub
   * @param {string} [userNip05]
   * @returns {Promise<OTPResult>}
   */
  async sendOTPDM(recipientNpub, userNip05) {
    const start = Date.now();
    const MAX_BUDGET_MS = 15000;
    try {
      const config = await this.getConfig();

      // Retrieve Rebuilding Camelot credentials from Vault (10s timeout)
      let nsecData, nip05Data;

      try {
        nsecData = await withTimeout(
          vault.getCredentials("rebuilding_camelot_nsec"),
          10000,
          "vault_get_nsec"
        );
        nip05Data = await withTimeout(
          vault.getCredentials("rebuilding_camelot_nip05"),
          10000,
          "vault_get_nip05"
        );
      } catch (vaultError) {
        // Fallback to Supabase if Vault is not available (10s timeout each)
        const nsecResp = await withTimeout(
          (async () => await supabase.rpc("get_rebuilding_camelot_nsec"))(),
          10000,
          "rpc_get_nsec"
        );
        const nip05Resp = await withTimeout(
          (async () => await supabase.rpc("get_rebuilding_camelot_nip05"))(),
          10000,
          "rpc_get_nip05"
        );
        const { data: nsecResult, error: nsecError } = nsecResp || {};
        const { data: nip05Result, error: nip05Error } = nip05Resp || {};

        if (nsecError || nip05Error || !nsecResult || !nip05Result) {
          throw new Error("Failed to retrieve Rebuilding Camelot credentials");
        }

        nsecData = nsecResult;
        nip05Data = nip05Result;
      }

      if (!nsecData || !nip05Data) {
        throw new Error("Failed to retrieve Rebuilding Camelot credentials from vault");
      }

      // Generate OTP
      const otp = this.generateOTP(config.otpLength);
      const expiresAt = new Date(Date.now() + config.expiryMinutes * 60 * 1000);

      // Convert npub to hex pubkey for encryption
      const recipientPubkey = this.npubToHex(recipientNpub);

      // Convert nsec to Uint8Array for encryption
      const privateKeyBytes = this.nsecToBytes(nsecData);

      // Try gift-wrapped messaging first if preferred, fallback to NIP-04
      let dmEvent;
      /** @type {"gift-wrap"|"nip04"} */
      let messageType = "nip04";

      if (config.preferGiftWrap) {
        try {
          // Attempt gift-wrapped messaging (NIP-59)
          const dmContent = this.createOTPMessage(
            otp,
            userNip05 || recipientNpub,
            expiresAt,
            "gift-wrap"
          );

          dmEvent = await this.createGiftWrappedOTPEvent(
            privateKeyBytes,
            recipientPubkey,
            dmContent
          );
          messageType = "gift-wrap";
        } catch (giftWrapError) {
          // Fallback to NIP-04 encryption
          const dmContent = this.createOTPMessage(
            otp,
            userNip05 || recipientNpub,
            expiresAt,
            "nip04"
          );

          const privateKeyHex = bytesToHex(privateKeyBytes);
          const encryptedContent = await nip04.encrypt(
            privateKeyHex,
            recipientPubkey,
            dmContent
          );

          dmEvent = await this.createSignedDMEvent(
            privateKeyBytes,
            recipientPubkey,
            encryptedContent
          );
          messageType = "nip04";
        }
      } else {
        // Use NIP-04 directly if gift-wrap is disabled
        const dmContent = this.createOTPMessage(
          otp,
          userNip05 || recipientNpub,
          expiresAt,
          "nip04"
        );

        const privateKeyHex = bytesToHex(privateKeyBytes);
        const encryptedContent = await nip04.encrypt(
          privateKeyHex,
          recipientPubkey,
          dmContent
        );

        dmEvent = await this.createSignedDMEvent(
          privateKeyBytes,
          recipientPubkey,
          encryptedContent
        );
        messageType = "nip04";
      }

      // Publish to relays
      await this.publishToRelays(dmEvent, config);

      // Store OTP for verification
      await this.storeOTPForVerification(recipientNpub, otp, expiresAt);

      return {
        success: true,
        otp,
        messageId: dmEvent.id,
        expiresAt,
        messageType,
      };
    } catch (error) {
      return {
        success: false,
        otp: "",
        messageId: "",
        expiresAt: new Date(),
        error: error instanceof Error ? error.message : "Failed to send OTP DM",
      };
    }
  }

  generateOTP(length = 6) {
    const digits = "0123456789";
    let otp = "";
    const randomBytes = crypto.getRandomValues(new Uint8Array(length));

    for (let i = 0; i < length; i++) {
      const randomIndex = randomBytes[i] % digits.length;
      otp += digits[randomIndex];
    }

    return otp;
  }

  createOTPMessage(otp, userIdentifier, expiresAt, messageType = "nip04") {
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
- Code expires in ${Math.floor((expiresAt.getTime() - Date.now()) / (60 * 1000))} minutes
- Only use for Satnam.pub Family Financials access

${encryptionNotice}

If you didn't request this code, please ignore this message.

🏰 Rebuilding Camelot - Sovereign Family Banking`;
  }

  /**
   * @param {string} npub
   * @returns {string}
   */
  npubToHex(npub) {
    try {
      const decoded = nip19.decode(npub);
      if (decoded.type !== "npub") {
        throw new Error("Invalid npub format");
      }
      // Return the hex string - nip19.decode for npub returns hex string in data
      return /** @type {string} */ (decoded.data);
    } catch (error) {
      throw new Error(
        `Failed to decode npub: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * @param {string} nsec
   * @returns {Uint8Array}
   */
  nsecToBytes(nsec) {
    try {
      const decoded = nip19.decode(nsec);
      if (decoded.type !== "nsec") {
        throw new Error("Invalid nsec format");
      }
      // For nsec, data should be Uint8Array
      const data = /** @type {Uint8Array} */ (decoded.data);
      if (data instanceof Uint8Array) {
        return data;
      }
      // Fallback: if it's a hex string, convert it
      const hexString = String(data);
      return new Uint8Array(hexString.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    } catch (error) {
      throw new Error(
        `Failed to decode nsec: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async createGiftWrappedOTPEvent(privateKeyBytes, recipientPubkey, content) {
    const privateKeyHex = bytesToHex(privateKeyBytes);
    const senderPubkey = getPublicKey(privateKeyBytes);

    const baseEvent = {
      kind: 4,
      pubkey: senderPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", recipientPubkey],
        ["message-type", "otp"],
        ["encryption", "gift-wrap"],
      ],
      content: content,
    };

    const giftWrappedEvent = await nip59.wrapEvent(
      baseEvent,
      recipientPubkey,
      privateKeyHex
    );

    return giftWrappedEvent;
  }

  async createSignedDMEvent(privateKeyBytes, recipientPubkey, encryptedContent) {
    const senderPubkey = getPublicKey(privateKeyBytes);

    const eventTemplate = {
      kind: 4,
      pubkey: senderPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", recipientPubkey]],
      content: encryptedContent,
    };

    return finalizeEvent(eventTemplate, privateKeyBytes);
  }

  async publishToRelays(event, config) {
    const allRelays = [...config.relays, ...config.fallbackRelays];
    const perRelayTimeout = 5000; // 5s per relay publish
    const results = [];
    for (const relay of allRelays) {
      let success = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await withTimeout(Promise.all(this.pool.publish([relay], event)), perRelayTimeout, `publish_${relay}`);
          success = true;
          break;
        } catch {}
        // exponential backoff: 200ms, 400ms
        await new Promise((r) => setTimeout(r, 200 * (2 ** attempt)));
      }
      results.push(success);
    }
    return results;
  }

  async storeOTPForVerification(recipientNpub, otp, expiresAt) {
    const { hash: otpHash, salt: otpSalt } = await this.hashOTP(otp);

    const { error } = await supabase.from("family_otp_verification").insert({
      recipient_npub: recipientNpub,
      otp_hash: otpHash,
      otp_salt: otpSalt,
      expires_at: expiresAt.toISOString(),
      used: false,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to store OTP: ${error.message}`);
    }
  }

  async hashOTP(otp, salt) {
    const uniqueSalt = salt || Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const encoder = new TextEncoder();
    const data = encoder.encode(otp + uniqueSalt + "satnam-otp-2024");
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return { hash, salt: uniqueSalt };
  }

  async verifyOTP(recipientNpub, providedOTP) {
    try {
      const { data: otpRecords, error } = await supabase
        .from("family_otp_verification")
        .select("*")
        .eq("recipient_npub", recipientNpub)
        .eq("used", false)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error || !otpRecords || otpRecords.length === 0) {
        return { valid: false, expired: false, error: "No OTP found" };
      }

      let validOTP = null;
      for (const otpRecord of otpRecords) {
        try {
          const { hash: otpHash } = await this.hashOTP(providedOTP, otpRecord.otp_salt);
          if (otpHash === otpRecord.otp_hash) {
            validOTP = otpRecord;
            break;
          }
        } catch (hashError) {
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

      const { error: updateError } = await supabase
        .from("family_otp_verification")
        .update({ used: true, used_at: now.toISOString() })
        .eq("id", validOTP.id);

      if (updateError) {
        // Continue even if update fails
      }

      return { valid: true, expired: false };
    } catch (error) {
      return {
        valid: false,
        expired: false,
        error: error instanceof Error ? error.message : "Verification failed",
      };
    }
  }

  async cleanupExpiredOTPs() {
    try {
      const { error } = await supabase
        .from("family_otp_verification")
        .delete()
        .lt("expires_at", new Date().toISOString());

      if (error) {
        throw new Error(`Failed to cleanup expired OTPs: ${error.message}`);
      }

      return true;
    } catch (error) {
      return false;
    }
  }
}

export { RebuildingCamelotOTPService };

