/**
 * @fileoverview NFC Authentication Module for NTAG424 DNA
 * @description Hardware security integration for tap-to-sign, tap-to-spend, and guardian approval
 * @compliance Master Context - Privacy-first, Bitcoin-only, browser-compatible
 * @roadmap Future implementation with NTAG424 DNA chips
 */

// NFC Web API types
interface NFCReader {
  addEventListener(event: string, listener: EventListener): void;
  removeEventListener(event: string, listener: EventListener): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface NFCReadingEvent extends Event {
  message: NFCNDEFMessage;
  serialNumber?: string;
}

interface NFCNDEFMessage {
  records: NFCNDEFRecord[];
}

interface NFCNDEFRecord {
  recordType: string;
  mediaType?: string;
  id?: Uint8Array;
  data?: Uint8Array;
}

// NTAG424 DNA specific types
interface NTAG424DNAConfig {
  familyId: string;
  applicationId: string;
  keyId: number;
  keyVersion: number;
  maxReadAttempts: number;
  privacyDelayMs: number;
}

interface NTAG424DNAAuth {
  uid: string;
  familyId: string;
  applicationId: string;
  keyId: number;
  keyVersion: number;
  signature: string;
  timestamp: number;
  nonce: string;
}

interface GuardianApprovalRequest {
  requestId: string;
  guardianNpub: string;
  operation: 'spend' | 'sign' | 'recovery' | 'emergency';
  amount?: number;
  recipient?: string;
  memo?: string;
  timestamp: number;
  expiresAt: number;
}

interface GuardianApprovalResponse {
  requestId: string;
  guardianNpub: string;
  approved: boolean;
  signature: string;
  timestamp: number;
  reason?: string;
}

interface TapToSpendRequest {
  amount: number;
  recipient: string;
  memo?: string;
  requiresGuardianApproval: boolean;
  guardianThreshold: number;
  privacyLevel: 'standard' | 'enhanced' | 'maximum';
}

interface TapToSignRequest {
  message: string;
  purpose: 'transaction' | 'communication' | 'recovery' | 'identity';
  requiresGuardianApproval: boolean;
  guardianThreshold: number;
}

/**
 * NFC Authentication Service for NTAG424 DNA
 * Provides tap-to-sign, tap-to-spend, and guardian approval via NFC
 */
export class NFCAuthService {
  private reader: NFCReader | null = null;
  private isListening: boolean = false;
  private config: NTAG424DNAConfig;
  private authCallbacks: Map<string, (auth: NTAG424DNAAuth) => void> = new Map();
  private guardianApprovalCallbacks: Map<string, (response: GuardianApprovalResponse) => void> = new Map();

  constructor(config?: Partial<NTAG424DNAConfig>) {
    this.config = {
      familyId: 'satnam.pub',
      applicationId: 'nfc-auth-v1',
      keyId: 0,
      keyVersion: 1,
      maxReadAttempts: 3,
      privacyDelayMs: 2000,
      ...config
    };
  }

  /**
   * Initialize NFC reader for browser compatibility
   */
  async initializeNFC(): Promise<boolean> {
    try {
      // Check if NFC is supported
      if (!('NDEFReader' in window)) {
        console.warn('⚠️ NFC not supported in this browser');
        return false;
      }

      // Initialize NDEF reader
      this.reader = new (window as any).NDEFReader();
      console.log('🔐 NFC reader initialized for NTAG424 DNA');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize NFC:', error);
      return false;
    }
  }

  /**
   * Start listening for NFC tags
   */
  async startListening(): Promise<void> {
    if (!this.reader || this.isListening) return;

    try {
      await this.reader.start();
      this.isListening = true;
      console.log('👂 NFC listening started');

      // Add event listeners
      this.reader.addEventListener('reading', (event: Event) => this.handleNFCTag(event as NFCReadingEvent));
      this.reader.addEventListener('readingerror', this.handleNFCError.bind(this));
    } catch (error) {
      console.error('❌ Failed to start NFC listening:', error);
      throw error;
    }
  }

  /**
   * Stop listening for NFC tags
   */
  async stopListening(): Promise<void> {
    if (!this.reader || !this.isListening) return;

    try {
      await this.reader.stop();
      this.isListening = false;
      console.log('🛑 NFC listening stopped');
    } catch (error) {
      console.error('❌ Failed to stop NFC listening:', error);
    }
  }

  /**
   * Handle NFC tag detection
   */
  private async handleNFCTag(event: NFCReadingEvent): Promise<void> {
    try {
      console.log('📱 NFC tag detected:', event.serialNumber);

      // Parse NTAG424 DNA data
      const ntagData = await this.parseNTAG424DNA(event.message);
      if (!ntagData) {
        console.warn('⚠️ Invalid NTAG424 DNA data');
        return;
      }

      // Validate family and application IDs
      if (!this.validateNTAG424DNA(ntagData)) {
        console.warn('⚠️ NTAG424 DNA validation failed');
        return;
      }

      // Process authentication
      await this.processNTAG424DNAAuth(ntagData, event.serialNumber);

    } catch (error) {
      console.error('❌ Error processing NFC tag:', error);
    }
  }

  /**
   * Handle NFC reading errors
   */
  private handleNFCError(event: Event): void {
    console.error('❌ NFC reading error:', event);
  }

  /**
   * Parse NTAG424 DNA data from NDEF message
   */
  private async parseNTAG424DNA(message: NFCNDEFMessage): Promise<NTAG424DNAAuth | null> {
    try {
      // Look for NTAG424 DNA record
      const ntagRecord = message.records.find(record => 
        record.recordType === 'application/vnd.ntag424.dna'
      );

      if (!ntagRecord || !ntagRecord.data) {
        return null;
      }

      // Parse NTAG424 DNA structure
      const data = new Uint8Array(ntagRecord.data);
      
      // Extract UID (first 7 bytes)
      const uid = Array.from(data.slice(0, 7))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Extract family ID (next 4 bytes)
      const familyId = new TextDecoder().decode(data.slice(7, 11));

      // Extract application ID (next 4 bytes)
      const applicationId = new TextDecoder().decode(data.slice(11, 15));

      // Extract key ID (1 byte)
      const keyId = data[15];

      // Extract key version (1 byte)
      const keyVersion = data[16];

      // Extract signature (32 bytes)
      const signature = Array.from(data.slice(17, 49))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Extract timestamp (8 bytes)
      const timestamp = new DataView(data.slice(49, 57).buffer).getBigUint64(0, false);

      // Extract nonce (16 bytes)
      const nonce = Array.from(data.slice(57, 73))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      return {
        uid,
        familyId,
        applicationId,
        keyId,
        keyVersion,
        signature,
        timestamp: Number(timestamp),
        nonce
      };

    } catch (error) {
      console.error('❌ Error parsing NTAG424 DNA:', error);
      return null;
    }
  }

  /**
   * Validate NTAG424 DNA data
   */
  private validateNTAG424DNA(auth: NTAG424DNAAuth): boolean {
    // Validate family ID
    if (auth.familyId !== this.config.familyId) {
      console.warn('⚠️ Invalid family ID:', auth.familyId);
      return false;
    }

    // Validate application ID
    if (auth.applicationId !== this.config.applicationId) {
      console.warn('⚠️ Invalid application ID:', auth.applicationId);
      return false;
    }

    // Validate key version
    if (auth.keyVersion !== this.config.keyVersion) {
      console.warn('⚠️ Invalid key version:', auth.keyVersion);
      return false;
    }

    // Validate timestamp (not too old)
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    if (now - auth.timestamp > maxAge) {
      console.warn('⚠️ NTAG424 DNA timestamp too old');
      return false;
    }

    return true;
  }

  /**
   * Process NTAG424 DNA authentication
   */
  private async processNTAG424DNAAuth(auth: NTAG424DNAAuth, serialNumber?: string): Promise<void> {
    try {
      // Verify signature using Web Crypto API
      const isValid = await this.verifyNTAG424DNASignature(auth);
      if (!isValid) {
        console.warn('⚠️ NTAG424 DNA signature verification failed');
        return;
      }

      console.log('✅ NTAG424 DNA authentication successful');

      // Trigger callbacks
      const callback = this.authCallbacks.get(auth.uid);
      if (callback) {
        callback(auth);
      }

      // Add privacy delay
      await this.privacyDelay();

    } catch (error) {
      console.error('❌ Error processing NTAG424 DNA auth:', error);
    }
  }

  /**
   * Verify NTAG424 DNA signature using Web Crypto API
   */
  private async verifyNTAG424DNASignature(auth: NTAG424DNAAuth): Promise<boolean> {
    try {
      // Convert signature from hex to bytes
      const signature = new Uint8Array(
        auth.signature.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
      );

      // Create message to verify
      const message = `${auth.uid}${auth.familyId}${auth.applicationId}${auth.keyId}${auth.keyVersion}${auth.timestamp}${auth.nonce}`;
      const messageBytes = new TextEncoder().encode(message);

      // Import public key (this would be stored securely)
      const publicKey = await this.getNTAG424DNAPublicKey(auth.keyId);

      // Verify signature
      const isValid = await crypto.subtle.verify(
        'ECDSA',
        publicKey,
        signature,
        messageBytes
      );

      return isValid;

    } catch (error) {
      console.error('❌ Error verifying NTAG424 DNA signature:', error);
      return false;
    }
  }

  /**
   * Get NTAG424 DNA public key for verification
   */
  private async getNTAG424DNAPublicKey(keyId: number): Promise<CryptoKey> {
    // This would retrieve the public key from secure storage
    // For now, return a placeholder
    throw new Error('NTAG424 DNA public key retrieval not implemented');
  }

  /**
   * Add privacy delay to prevent timing attacks
   */
  private async privacyDelay(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, this.config.privacyDelayMs));
  }

  /**
   * Register callback for NTAG424 DNA authentication
   */
  registerAuthCallback(uid: string, callback: (auth: NTAG424DNAAuth) => void): void {
    this.authCallbacks.set(uid, callback);
  }

  /**
   * Unregister callback for NTAG424 DNA authentication
   */
  unregisterAuthCallback(uid: string): void {
    this.authCallbacks.delete(uid);
  }

  /**
   * Tap-to-Spend functionality
   */
  async tapToSpend(request: TapToSpendRequest): Promise<boolean> {
    try {
      console.log('💳 Tap-to-Spend initiated:', request);

      // Check if guardian approval is required
      if (request.requiresGuardianApproval) {
        const approved = await this.requestGuardianApproval({
          requestId: crypto.randomUUID(),
          guardianNpub: '', // Would be set based on family configuration
          operation: 'spend',
          amount: request.amount,
          recipient: request.recipient,
          memo: request.memo,
          timestamp: Date.now(),
          expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
        });

        if (!approved) {
          console.warn('⚠️ Guardian approval required for tap-to-spend');
          return false;
        }
      }

      // Start listening for NFC tag
      await this.startListening();

      // Wait for NFC authentication
      const authPromise = new Promise<NTAG424DNAAuth>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('NFC authentication timeout'));
        }, 30000); // 30 seconds

        this.registerAuthCallback('any', (auth) => {
          clearTimeout(timeout);
          resolve(auth);
        });
      });

      const auth = await authPromise;
      console.log('✅ NFC authentication for tap-to-spend successful');

      // Execute the spend operation
      const success = await this.executeSpendOperation(request, auth);
      
      // Stop listening
      await this.stopListening();
      
      return success;

    } catch (error) {
      console.error('❌ Tap-to-Spend failed:', error);
      await this.stopListening();
      return false;
    }
  }

  /**
   * Tap-to-Sign functionality
   */
  async tapToSign(request: TapToSignRequest): Promise<string | null> {
    try {
      console.log('✍️ Tap-to-Sign initiated:', request);

      // Check if guardian approval is required
      if (request.requiresGuardianApproval) {
        const approved = await this.requestGuardianApproval({
          requestId: crypto.randomUUID(),
          guardianNpub: '', // Would be set based on family configuration
          operation: 'sign',
          timestamp: Date.now(),
          expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
        });

        if (!approved) {
          console.warn('⚠️ Guardian approval required for tap-to-sign');
          return null;
        }
      }

      // Start listening for NFC tag
      await this.startListening();

      // Wait for NFC authentication
      const authPromise = new Promise<NTAG424DNAAuth>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('NFC authentication timeout'));
        }, 30000); // 30 seconds

        this.registerAuthCallback('any', (auth) => {
          clearTimeout(timeout);
          resolve(auth);
        });
      });

      const auth = await authPromise;
      console.log('✅ NFC authentication for tap-to-sign successful');

      // Generate signature
      const signature = await this.generateSignature(request.message, auth);
      
      // Stop listening
      await this.stopListening();
      
      return signature;

    } catch (error) {
      console.error('❌ Tap-to-Sign failed:', error);
      await this.stopListening();
      return null;
    }
  }

  /**
   * Execute spend operation after NFC authentication
   */
  private async executeSpendOperation(request: TapToSpendRequest, auth: NTAG424DNAAuth): Promise<boolean> {
    try {
      // This would integrate with the payment system
      console.log('💰 Executing spend operation:', {
        amount: request.amount,
        recipient: request.recipient,
        nfcAuth: auth.uid,
        privacyLevel: request.privacyLevel
      });

      // For now, return success
      return true;

    } catch (error) {
      console.error('❌ Spend operation failed:', error);
      return false;
    }
  }

  /**
   * Generate signature after NFC authentication
   */
  private async generateSignature(message: string, auth: NTAG424DNAAuth): Promise<string> {
    try {
      // This would use the authenticated NFC key to sign
      console.log('✍️ Generating signature with NFC key:', {
        message: message.substring(0, 50) + '...',
        nfcAuth: auth.uid
      });

      // For now, return a placeholder signature
      return 'placeholder_signature_' + Date.now();

    } catch (error) {
      console.error('❌ Signature generation failed:', error);
      throw error;
    }
  }

  /**
   * Request guardian approval for NFC operations
   */
  private async requestGuardianApproval(request: GuardianApprovalRequest): Promise<boolean> {
    try {
      console.log('🛡️ Requesting guardian approval:', request);

      // This would send the request to guardians via Nostr
      // For now, simulate approval
      const approved = Math.random() > 0.5; // 50% chance for demo

      if (approved) {
        console.log('✅ Guardian approval granted');
      } else {
        console.log('❌ Guardian approval denied');
      }

      return approved;

    } catch (error) {
      console.error('❌ Guardian approval request failed:', error);
      return false;
    }
  }

  /**
   * Register callback for guardian approval responses
   */
  registerGuardianApprovalCallback(requestId: string, callback: (response: GuardianApprovalResponse) => void): void {
    this.guardianApprovalCallbacks.set(requestId, callback);
  }

  /**
   * Unregister callback for guardian approval responses
   */
  unregisterGuardianApprovalCallback(requestId: string): void {
    this.guardianApprovalCallbacks.delete(requestId);
  }

  /**
   * Cleanup NFC resources
   */
  async cleanup(): Promise<void> {
    await this.stopListening();
    this.authCallbacks.clear();
    this.guardianApprovalCallbacks.clear();
    console.log('🧹 NFC Auth Service cleaned up');
  }

  /**
   * Register and program an NTAG424 tag in-app using Web NFC API
   * @param pin User-chosen PIN (string)
   * @param nsec Encrypted nsec or other protected data (string)
   * @returns { tagUID, aesKey, pinHash }
   */
  async registerAndProgramTag(pin: string, nsec: string): Promise<{ tagUID: string | null, aesKey: string, pinHash: string }> {
    if (!('NDEFWriter' in window)) {
      throw new Error('NFC writing not supported in this browser');
    }
    // 1. Generate AES-256 key
    const aesKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const rawKey = await window.crypto.subtle.exportKey('raw', aesKey);
    const aesKeyB64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
    // 2. Hash PIN
    const pinHashBuffer = await window.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(pin)
    );
    const pinHash = btoa(String.fromCharCode(...new Uint8Array(pinHashBuffer)));
    // 3. Prompt user to tap tag and write data
    const writer = new (window as any).NDEFWriter();
    const protectedData = JSON.stringify({ nsec, pinHash });
    await writer.write({ records: [{ recordType: 'text', data: protectedData }] });
    // 4. Try to read tag UID (not always available)
    let tagUID: string | null = null;
    if ('NDEFReader' in window) {
      try {
        const reader = new (window as any).NDEFReader();
        await reader.scan();
        await new Promise<void>((resolve, reject) => {
          reader.onreading = (event: any) => {
            tagUID = event.serialNumber || null;
            resolve();
          };
          reader.onerror = (event: any) => reject(event.error);
        });
      } catch {
        tagUID = null;
      }
    }
    return { tagUID, aesKey: aesKeyB64, pinHash };
  }
}

/**
 * NFC Hardware Security Manager
 * Manages multiple NFC devices and provides unified interface
 */
export class NFCHardwareSecurityManager {
  private nfcServices: Map<string, NFCAuthService> = new Map();
  private defaultService: NFCAuthService | null = null;

  /**
   * Register NFC device
   */
  registerNFCDevice(deviceId: string, config?: Partial<NTAG424DNAConfig>): NFCAuthService {
    const service = new NFCAuthService(config);
    this.nfcServices.set(deviceId, service);
    
    if (!this.defaultService) {
      this.defaultService = service;
    }

    console.log('📱 NFC device registered:', deviceId);
    return service;
  }

  /**
   * Get NFC service by device ID
   */
  getNFCService(deviceId: string): NFCAuthService | null {
    return this.nfcServices.get(deviceId) || null;
  }

  /**
   * Get default NFC service
   */
  getDefaultNFCService(): NFCAuthService | null {
    return this.defaultService;
  }

  /**
   * Initialize all NFC devices
   */
  async initializeAllDevices(): Promise<void> {
    const promises = Array.from(this.nfcServices.values()).map(service => 
      service.initializeNFC()
    );
    
    const results = await Promise.allSettled(promises);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
    
    console.log(`🔐 ${successCount}/${this.nfcServices.size} NFC devices initialized`);
  }

  /**
   * Tap-to-Spend with any available NFC device
   */
  async tapToSpend(request: TapToSpendRequest): Promise<boolean> {
    if (!this.defaultService) {
      throw new Error('No NFC devices registered');
    }

    return this.defaultService.tapToSpend(request);
  }

  /**
   * Tap-to-Sign with any available NFC device
   */
  async tapToSign(request: TapToSignRequest): Promise<string | null> {
    if (!this.defaultService) {
      throw new Error('No NFC devices registered');
    }

    return this.defaultService.tapToSign(request);
  }

  /**
   * Cleanup all NFC devices
   */
  async cleanup(): Promise<void> {
    const promises = Array.from(this.nfcServices.values()).map(service => 
      service.cleanup()
    );
    
    await Promise.allSettled(promises);
    this.nfcServices.clear();
    this.defaultService = null;
    
    console.log('🧹 All NFC devices cleaned up');
  }
}

// Export types for external use
export type {
  NTAG424DNAConfig,
  NTAG424DNAAuth,
  GuardianApprovalRequest,
  GuardianApprovalResponse,
  TapToSpendRequest,
  TapToSignRequest
}; 