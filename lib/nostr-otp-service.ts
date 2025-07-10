/**
 * @fileoverview Nostr OTP Service for Secure Authentication
 * @description Provides OTP generation, verification, and Nostr integration
 * @compliance Master Context - Privacy-first, Bitcoin-only, sovereign family banking
 */

import { generateSecretKey } from '@noble/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import { nip19 } from 'nostr-tools';

// --- TYPES ---

export interface OTPConfig {
  secret: string;
  digits: number;
  period: number;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
}

export interface OTPResult {
  code: string;
  expiresAt: number;
  attempts: number;
  maxAttempts: number;
}

export interface NostrOTPRequest {
  npub: string;
  identifier: string;
  method: 'email' | 'nostr_dm' | 'sms';
  expiresIn: number;
}

export interface NostrOTPResponse {
  success: boolean;
  messageId: string;
  expiresAt: number;
  method: string;
  identifier: string;
}

// --- NOSTR OTP SERVICE ---

export class NostrOTPService {
  private static instance: NostrOTPService;
  private otpStore: Map<string, OTPResult> = new Map();

  private constructor() {}

  static getInstance(): NostrOTPService {
    if (!NostrOTPService.instance) {
      NostrOTPService.instance = new NostrOTPService();
    }
    return NostrOTPService.instance;
  }

  /**
   * Generate OTP for user
   */
  async generateOTP(npub: string, identifier: string, method: string): Promise<NostrOTPResponse> {
    try {
      // Generate OTP secret
      const secret = bytesToHex(generateSecretKey());
      const code = await this.generateTOTPCode(secret);
      const expiresIn = 300; // 5 minutes
      const expiresAt = Date.now() + (expiresIn * 1000);
      
      // Store OTP data
      const messageId = bytesToHex(generateSecretKey()).substring(0, 16);
      const otpData: OTPResult = {
        code,
        expiresAt,
        attempts: 0,
        maxAttempts: 3
      };
      
      this.otpStore.set(messageId, otpData);
      
      // Send OTP via specified method
      await this.sendOTP(identifier, code, method);
      
      return {
        success: true,
        messageId,
        expiresAt,
        method,
        identifier
      };
    } catch (error) {
      console.error('Failed to generate OTP:', error);
      return {
        success: false,
        messageId: '',
        expiresAt: 0,
        method,
        identifier
      };
    }
  }

  /**
   * Verify OTP code
   */
  async verifyOTP(messageId: string, code: string): Promise<boolean> {
    const otpData = this.otpStore.get(messageId);
    
    if (!otpData) {
      return false;
    }
    
    // Check if expired
    if (Date.now() > otpData.expiresAt) {
      this.otpStore.delete(messageId);
      return false;
    }
    
    // Check attempts
    if (otpData.attempts >= otpData.maxAttempts) {
      this.otpStore.delete(messageId);
      return false;
    }
    
    // Increment attempts
    otpData.attempts++;
    
    // Verify code
    if (otpData.code === code) {
      this.otpStore.delete(messageId);
      return true;
    }
    
    return false;
  }

  /**
   * Generate TOTP code
   */
  private async generateTOTPCode(secret: string): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const counter = Math.floor(timestamp / 30); // 30-second window
    
    // Simple TOTP implementation
    const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(secret + counter));
    const hashArray = Array.from(new Uint8Array(hash));
    const offset = hashArray[hashArray.length - 1] & 0xf;
    
    const code = (
      ((hashArray[offset] & 0x7f) << 24) |
      ((hashArray[offset + 1] & 0xff) << 16) |
      ((hashArray[offset + 2] & 0xff) << 8) |
      (hashArray[offset + 3] & 0xff)
    ) % 1000000;
    
    return code.toString().padStart(6, '0');
  }

  /**
   * Send OTP via specified method
   */
  private async sendOTP(identifier: string, code: string, method: string): Promise<void> {
    switch (method) {
      case 'email':
        await this.sendEmailOTP(identifier, code);
        break;
      case 'nostr_dm':
        await this.sendNostrDMOTP(identifier, code);
        break;
      case 'sms':
        await this.sendSMSOTP(identifier, code);
        break;
      default:
        throw new Error(`Unsupported OTP method: ${method}`);
    }
  }

  /**
   * Send OTP via email
   */
  private async sendEmailOTP(email: string, code: string): Promise<void> {
    // In production, integrate with email service
    console.log(`OTP ${code} sent to email: ${email}`);
  }

  /**
   * Send OTP via Nostr DM
   */
  private async sendNostrDMOTP(npub: string, code: string): Promise<void> {
    // In production, send via Nostr relay
    console.log(`OTP ${code} sent to Nostr npub: ${npub}`);
  }

  /**
   * Send OTP via SMS
   */
  private async sendSMSOTP(phone: string, code: string): Promise<void> {
    // In production, integrate with SMS service
    console.log(`OTP ${code} sent to phone: ${phone}`);
  }

  /**
   * Clean up expired OTPs
   */
  cleanupExpiredOTPs(): void {
    const now = Date.now();
    for (const [messageId, otpData] of this.otpStore.entries()) {
      if (now > otpData.expiresAt) {
        this.otpStore.delete(messageId);
      }
    }
  }

  /**
   * Get OTP status
   */
  getOTPStatus(messageId: string): OTPResult | null {
    return this.otpStore.get(messageId) || null;
  }
}

// --- EXPORT INSTANCE ---

export const nostrOTPService = NostrOTPService.getInstance(); 