/**
 * Secure Credential Manager
 * 
 * Manages secure storage and retrieval of sensitive credentials
 * Implements AES-256-GCM encryption with PBKDF2 key derivation
 * Follows privacy-first principles with automatic expiration
 */

import { supabase } from '../supabase';

export interface EncryptedCredential {
  credentialId: string;
  salt: string;
  encryptedData: string;
  iv: string;
  tag: string;
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  isRevoked: boolean;
}

export interface CredentialStatus {
  credentialId: string;
  isActive: boolean;
  expiresAt: Date;
  accessCount: number;
  isExpired: boolean;
  isRevoked: boolean;
}

/**
 * Secure Credential Manager Class
 */
export class SecureCredentialManager {
  private static instance: SecureCredentialManager;

  private constructor() {}

  static getInstance(): SecureCredentialManager {
    if (!SecureCredentialManager.instance) {
      SecureCredentialManager.instance = new SecureCredentialManager();
    }
    return SecureCredentialManager.instance;
  }

  /**
   * Store credential securely with encryption
   */
  async storeCredential(
    userId: string,
    data: string,
    password: string,
    expirationHours: number = 24
  ): Promise<{
    success: boolean;
    credentialId?: string;
    message: string;
  }> {
    try {
      // Generate unique credential ID and salt
      const credentialId = crypto.randomUUID();
      const salt = await this.generateSecureSalt();
      
      // Create encryption key from password and salt
      const encryptionKey = await this.deriveKeyFromPassword(password, salt);
      
      // Encrypt the data using AES-256-GCM
      const encryptedData = await this.encryptData(data, encryptionKey);
      
      // Set expiration time
      const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
      
      // Store in database
      const { error } = await supabase.from('secure_nostr_credentials').insert({
        user_id: userId,
        credential_id: credentialId,
        salt: salt,
        encrypted_nsec: encryptedData.encrypted,
        iv: encryptedData.iv,
        tag: encryptedData.tag,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        access_count: 0,
        is_revoked: false,
      });

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      return {
        success: true,
        credentialId,
        message: 'Credential stored securely',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to store credential: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Retrieve and decrypt credential
   */
  async retrieveCredential(
    userId: string,
    credentialId: string,
    password: string
  ): Promise<{
    success: boolean;
    data?: string;
    message: string;
  }> {
    try {
      // Get credential from database
      const { data: credentials, error } = await supabase
        .from('secure_nostr_credentials')
        .select('*')
        .eq('user_id', userId)
        .eq('credential_id', credentialId)
        .single();

      if (error || !credentials) {
        return {
          success: false,
          message: 'Credential not found',
        };
      }

      // Check if expired
      if (new Date(credentials.expires_at) < new Date()) {
        await this.removeCredential(userId, credentialId);
        return {
          success: false,
          message: 'Credential has expired',
        };
      }

      // Check if revoked
      if (credentials.is_revoked) {
        return {
          success: false,
          message: 'Credential has been revoked',
        };
      }

      // Derive key from password and salt
      const encryptionKey = await this.deriveKeyFromPassword(password, credentials.salt);
      
      // Decrypt the data
      const decryptedData = await this.decryptData(
        credentials.encrypted_nsec,
        encryptionKey,
        credentials.iv,
        credentials.tag
      );

      // Update access metadata
      await this.updateAccessMetadata(userId, credentialId);

      return {
        success: true,
        data: decryptedData,
        message: 'Credential retrieved successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to retrieve credential: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get credential status
   */
  async getCredentialStatus(
    userId: string,
    credentialId: string
  ): Promise<CredentialStatus | null> {
    try {
      const { data: credentials, error } = await supabase
        .from('secure_nostr_credentials')
        .select('*')
        .eq('user_id', userId)
        .eq('credential_id', credentialId)
        .single();

      if (error || !credentials) {
        return null;
      }

      const expiresAt = new Date(credentials.expires_at);
      const isExpired = expiresAt < new Date();

      return {
        credentialId: credentials.credential_id,
        isActive: !isExpired && !credentials.is_revoked,
        expiresAt,
        accessCount: credentials.access_count,
        isExpired,
        isRevoked: credentials.is_revoked,
      };
    } catch (error) {
      console.error('Failed to get credential status:', error);
      return null;
    }
  }

  /**
   * Remove credential
   */
  async removeCredential(userId: string, credentialId: string): Promise<void> {
    try {
      await supabase
        .from('secure_nostr_credentials')
        .delete()
        .eq('user_id', userId)
        .eq('credential_id', credentialId);
    } catch (error) {
      console.error('Failed to remove credential:', error);
    }
  }

  /**
   * Revoke credential
   */
  async revokeCredential(
    userId: string,
    credentialId: string,
    reason: string = 'User requested revocation'
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('secure_nostr_credentials')
        .update({
          is_revoked: true,
          revoked_at: new Date().toISOString(),
          revocation_reason: reason,
        })
        .eq('user_id', userId)
        .eq('credential_id', credentialId);

      return !error;
    } catch (error) {
      console.error('Failed to revoke credential:', error);
      return false;
    }
  }

  /**
   * Clean up expired credentials
   */
  async cleanupExpiredCredentials(): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('secure_nostr_credentials')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select('credential_id');

      if (error) {
        console.error('Failed to cleanup expired credentials:', error);
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error('Failed to cleanup expired credentials:', error);
      return 0;
    }
  }

  /**
   * Generate secure salt
   */
  private async generateSecureSalt(): Promise<string> {
    const saltBytes = new Uint8Array(32);
    crypto.getRandomValues(saltBytes);
    return Array.from(saltBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Derive encryption key from password and salt using PBKDF2
   */
  private async deriveKeyFromPassword(password: string, salt: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    const saltBuffer = encoder.encode(salt);

    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000, // High iteration count for security
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private async encryptData(data: string, key: CryptoKey): Promise<{
    encrypted: string;
    iv: string;
    tag: string;
  }> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBuffer
    );

    // Extract the authentication tag (last 16 bytes)
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const tag = encryptedArray.slice(-16);
    const encrypted = encryptedArray.slice(0, -16);

    return {
      encrypted: Array.from(encrypted, byte => byte.toString(16).padStart(2, '0')).join(''),
      iv: Array.from(iv, byte => byte.toString(16).padStart(2, '0')).join(''),
      tag: Array.from(tag, byte => byte.toString(16).padStart(2, '0')).join(''),
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private async decryptData(
    encrypted: string,
    key: CryptoKey,
    iv: string,
    tag: string
  ): Promise<string> {
    const encryptedBytes = new Uint8Array(
      encrypted.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    const ivBytes = new Uint8Array(
      iv.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    const tagBytes = new Uint8Array(
      tag.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    // Combine encrypted data with authentication tag
    const combinedData = new Uint8Array(encryptedBytes.length + tagBytes.length);
    combinedData.set(encryptedBytes);
    combinedData.set(tagBytes, encryptedBytes.length);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      combinedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }

  /**
   * Update access metadata
   */
  private async updateAccessMetadata(userId: string, credentialId: string): Promise<void> {
    try {
      // Get current access count and increment
      const { data: currentCredential } = await supabase
        .from('secure_nostr_credentials')
        .select('access_count')
        .eq('user_id', userId)
        .eq('credential_id', credentialId)
        .single();

      if (currentCredential) {
        await supabase
          .from('secure_nostr_credentials')
          .update({
            last_accessed_at: new Date().toISOString(),
            access_count: (currentCredential.access_count || 0) + 1,
          })
          .eq('user_id', userId)
          .eq('credential_id', credentialId);
      }
    } catch (error) {
      console.error('Failed to update access metadata:', error);
    }
  }
}

// Export singleton instance
export const secureCredentialManager = SecureCredentialManager.getInstance(); 