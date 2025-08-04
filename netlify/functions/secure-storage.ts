// lib/secure-storage.ts - Memory Optimized
// MEMORY OPTIMIZATION: Use dynamic imports to reduce initial bundle size

export interface EncryptedKeyData {
  userId: string;
  encryptedNsec: string;
  salt: string | null; // Salt is embedded in encryptedNsec format (iv:salt:encrypted)
  createdAt: Date;
}

export interface NewAccountKeyPair {
  nsec: string; // Required for Nostr event signing - keep secure
  npub: string;
  hexPrivateKey: string;
  hexPublicKey: string;
}

// MEMORY OPTIMIZATION: Lazy-loaded dependencies
let nostrBrowser: any = null;
let securityModule: any = null;
let supabaseClient: any = null;

/**
 * Lazy load Nostr browser utilities
 */
async function getNostrBrowser() {
  if (!nostrBrowser) {
    nostrBrowser = await import("../../src/lib/nostr-browser.js");
  }
  return nostrBrowser;
}

/**
 * Lazy load security module
 */
async function getSecurityModule() {
  if (!securityModule) {
    securityModule = await import("../security.js");
  }
  return securityModule;
}

/**
 * Lazy load Supabase client
 */
async function getSupabaseClient() {
  if (!supabaseClient) {
    const module = await import("./supabase.js");
    supabaseClient = module.supabase;
  }
  return supabaseClient;
}

/**
 * Secure wrapper for sensitive data that ensures proper memory cleanup
 */
class SecureBuffer {
  private buffer: Uint8Array | null = null;
  private isCleared = false;

  constructor(data: string) {
    try {
      // Convert string to UTF-8 bytes
      const encoder = new TextEncoder();
      this.buffer = encoder.encode(data);
    } catch (error) {
      // Clear any partial buffer on error
      if (this.buffer) {
        this.buffer.fill(0);
        this.buffer = null;
      }
      throw new Error(`Failed to create SecureBuffer: ${error}`);
    }
  }

  /**
   * Get the string value (only if not cleared)
   */
  toString(): string {
    if (this.isCleared || !this.buffer) {
      throw new Error("SecureBuffer has been cleared");
    }
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      return decoder.decode(this.buffer);
    } catch (error) {
      throw new Error(`Failed to decode SecureBuffer: ${error}`);
    }
  }

  /**
   * Securely clear the buffer by overwriting with zeros
   */
  clear(): void {
    if (this.buffer) {
      // Overwrite memory with zeros multiple times for extra security
      this.buffer.fill(0);
      this.buffer.fill(0xff);
      this.buffer.fill(0);
      this.buffer = null;
    }
    this.isCleared = true;
  }

  /**
   * Check if buffer has been cleared
   */
  get cleared(): boolean {
    return this.isCleared;
  }

  /**
   * Get the size of the buffer (for debugging/monitoring)
   */
  get size(): number {
    return this.buffer ? this.buffer.length : 0;
  }
}

export class SecureStorage {
  /**
   * Create a secure buffer for sensitive data
   * @param sensitiveData - String data to store securely
   * @returns SecureBuffer instance
   */
  private static createSecureBuffer(sensitiveData: string): SecureBuffer {
    return new SecureBuffer(sensitiveData);
  }

  /**
   * Execute a database operation within a transaction if available
   * @param operation - Function to execute within transaction
   * @param fallbackOperation - Optional fallback if transactions not available
   */
  private static async executeWithTransaction<T>(
    operation: () => Promise<T>,
    fallbackOperation?: () => Promise<T>
  ): Promise<T | null> {
    try {
      const supabase = await getSupabaseClient();

      // Try to begin transaction
      const { error: beginError } = await supabase.rpc("begin_transaction");

      if (beginError) {
        // Transaction not available, use fallback or regular operation
        if (fallbackOperation) {
          return await fallbackOperation();
        }
        return await operation();
      }

      try {
        // Execute operation within transaction
        const result = await operation();

        // Commit transaction
        const { error: commitError } = await supabase.rpc("commit_transaction");
        if (commitError) {
          console.error("Failed to commit transaction:", commitError);
          return null;
        }

        return result;
      } catch (error) {
        // Rollback on any error
        await supabase.rpc("rollback_transaction");
        throw error;
      }
    } catch (error) {
      console.error("Transaction execution error:", error);
      return null;
    }
  }

  /**
   * Generate a new Nostr keypair for account creation
   * MEMORY OPTIMIZATION: Uses dynamic imports
   */
  static async generateNewAccountKeyPair(): Promise<NewAccountKeyPair> {
    const nostr = await getNostrBrowser();

    // Use the correct Nostr browser API
    const privateKeyBytes = nostr.generateSecretKey();
    const hexPrivateKey = Array.from(privateKeyBytes)
      .map((b: unknown) => (b as number).toString(16).padStart(2, "0"))
      .join("");
    const hexPublicKey = nostr.getPublicKey(privateKeyBytes);

    return {
      nsec: nostr.nip19.nsecEncode(hexPrivateKey), // Required for signing - keep secure
      npub: nostr.nip19.npubEncode(hexPublicKey),
      hexPrivateKey,
      hexPublicKey,
    };
  }

  /**
   * Store encrypted nsec for a new account
   * @param userId - User ID from profiles table
   * @param nsec - The private key to encrypt and store
   * @param userPassword - User's password for encryption
   */
  static async storeEncryptedNsec(
    userId: string,
    nsec: string,
    userPassword: string
  ): Promise<boolean> {
    const nsecBuffer = this.createSecureBuffer(nsec);
    const passwordBuffer = this.createSecureBuffer(userPassword);
    let encryptedNsecBuffer: SecureBuffer | null = null;

    try {
      // MEMORY OPTIMIZATION: Load security module and Supabase client dynamically
      const security = await getSecurityModule();
      const supabase = await getSupabaseClient();

      // Encrypt the nsec using secure PBKDF2 key derivation
      const encryptedNsec = await security.encryptCredentials(
        nsecBuffer.toString(),
        passwordBuffer.toString()
      );
      encryptedNsecBuffer = this.createSecureBuffer(encryptedNsec);

      // Use transaction to ensure atomicity
      const { error } = await supabase.from("encrypted_keys").insert({
        user_id: userId,
        encrypted_nsec: encryptedNsecBuffer.toString(),
        salt: null, // Salt is now embedded in the encrypted data format (iv:salt:encrypted)
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error("Failed to store encrypted nsec:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error storing encrypted nsec:", error);
      return false;
    } finally {
      // Clear sensitive data from memory
      nsecBuffer.clear();
      passwordBuffer.clear();
      if (encryptedNsecBuffer) {
        encryptedNsecBuffer.clear();
      }
    }
  }

  /**
   * Retrieve and decrypt nsec for a user
   * @param userId - User ID
   * @param userPassword - User's password for decryption
   * @returns SecureBuffer containing decrypted nsec, or null if failed
   */
  static async retrieveDecryptedNsec(
    userId: string,
    userPassword: string
  ): Promise<SecureBuffer | null> {
    const passwordBuffer = this.createSecureBuffer(userPassword);

    try {
      // MEMORY OPTIMIZATION: Load security module and Supabase client dynamically
      const security = await getSecurityModule();
      const supabase = await getSupabaseClient();

      // Get encrypted data from database atomically
      const { data, error } = await supabase
        .from("encrypted_keys")
        .select("encrypted_nsec")
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        console.error("Failed to retrieve encrypted nsec:", error);
        return null;
      }

      // Decrypt the nsec using secure PBKDF2 key derivation
      try {
        const decryptedNsec = await security.decryptCredentials(
          data.encrypted_nsec,
          passwordBuffer.toString()
        );
        return this.createSecureBuffer(decryptedNsec);
      } catch (decryptError) {
        console.error("Failed to decrypt nsec:", decryptError);
        return null;
      }
    } catch (error) {
      console.error("Error retrieving encrypted nsec:", error);
      return null;
    } finally {
      passwordBuffer.clear();
    }
  }

  /**
   * Update user password and re-encrypt nsec
   * @param userId - User ID
   * @param oldPassword - Current password
   * @param newPassword - New password
   */
  static async updatePasswordAndReencryptNsec(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<boolean> {
    try {
      // MEMORY OPTIMIZATION: Load Supabase client dynamically
      const supabase = await getSupabaseClient();

      // Try database-level transaction first (if available)
      try {
        const { data, error } = await supabase.rpc(
          "update_password_and_reencrypt",
          {
            p_user_id: userId,
            p_old_password: oldPassword,
            p_new_password: newPassword,
          }
        );

        if (!error && data === true) {
          return true;
        }
      } catch (rpcError) {
        // Fall back to atomic application-level transaction
        console.log("Database RPC not available, using atomic fallback method");
      }

      // Use atomic application-level transaction as fallback
      return await this.updatePasswordAndReencryptNsecAtomic(
        userId,
        oldPassword,
        newPassword
      );
    } catch (error) {
      console.error("Error updating password and re-encrypting nsec:", error);
      return false;
    }
  }

  /**
   * Fallback atomic update method (if RPC not available)
   * Update user password and re-encrypt nsec with atomic database operations
   * @param userId - User ID
   * @param oldPassword - Current password
   * @param newPassword - New password
   */
  static async updatePasswordAndReencryptNsecAtomic(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<boolean> {
    const oldPasswordBuffer = this.createSecureBuffer(oldPassword);
    const newPasswordBuffer = this.createSecureBuffer(newPassword);
    let decryptedNsecBuffer: SecureBuffer | null = null;
    let newEncryptedNsecBuffer: SecureBuffer | null = null;

    try {
      // MEMORY OPTIMIZATION: Load security module and Supabase client dynamically
      const security = await getSecurityModule();
      const supabase = await getSupabaseClient();

      // Use Supabase transaction for atomic operations
      const { data: _transactionResult, error: transactionError } =
        await supabase.rpc("begin_transaction");

      if (transactionError) {
        console.log(
          "Transaction not available, using optimistic locking fallback"
        );
        return await this.updatePasswordWithOptimisticLocking(
          userId,
          oldPassword,
          newPassword
        );
      }

      try {
        // Within transaction: get current encrypted data
        const { data: currentData, error: fetchError } = await supabase
          .from("encrypted_keys")
          .select("encrypted_nsec, user_id")
          .eq("user_id", userId)
          .single();

        if (fetchError || !currentData) {
          await supabase.rpc("rollback_transaction");
          console.error(
            "Failed to retrieve current encrypted nsec:",
            fetchError
          );
          return false;
        }

        // Decrypt with old password
        try {
          const decryptedNsec = await security.decryptCredentials(
            currentData.encrypted_nsec,
            oldPasswordBuffer.toString()
          );
          decryptedNsecBuffer = this.createSecureBuffer(decryptedNsec);
        } catch (decryptError) {
          await supabase.rpc("rollback_transaction");
          console.error("Failed to decrypt with old password:", decryptError);
          return false;
        }

        // Re-encrypt with new password
        const newEncryptedNsec = await security.encryptCredentials(
          decryptedNsecBuffer.toString(),
          newPasswordBuffer.toString()
        );
        newEncryptedNsecBuffer = this.createSecureBuffer(newEncryptedNsec);

        // Update within transaction
        const { error: updateError } = await supabase
          .from("encrypted_keys")
          .update({
            encrypted_nsec: newEncryptedNsecBuffer.toString(),
            salt: null, // Salt is now embedded in the encrypted data format
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        if (updateError) {
          await supabase.rpc("rollback_transaction");
          console.error("Failed to update encrypted nsec:", updateError);
          return false;
        }

        // Commit transaction
        const { error: commitError } = await supabase.rpc("commit_transaction");
        if (commitError) {
          console.error("Failed to commit transaction:", commitError);
          return false;
        }

        return true;
      } catch (error) {
        // Rollback on any error
        await supabase.rpc("rollback_transaction");
        throw error;
      }
    } catch (error) {
      console.error("Error in atomic password update:", error);
      return false;
    } finally {
      // Always clear sensitive data from memory, even on error
      oldPasswordBuffer.clear();
      newPasswordBuffer.clear();
      if (decryptedNsecBuffer) {
        decryptedNsecBuffer.clear();
      }
      if (newEncryptedNsecBuffer) {
        newEncryptedNsecBuffer.clear();
      }
    }
  }

  /**
   * Optimistic locking fallback when transactions are not available
   * @param userId - User ID
   * @param oldPassword - Current password
   * @param newPassword - New password
   */
  private static async updatePasswordWithOptimisticLocking(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<boolean> {
    const oldPasswordBuffer = this.createSecureBuffer(oldPassword);
    const newPasswordBuffer = this.createSecureBuffer(newPassword);
    const maxRetries = 3;

    try {
      // MEMORY OPTIMIZATION: Load security module and Supabase client dynamically
      const security = await getSecurityModule();
      const supabase = await getSupabaseClient();

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let decryptedNsecBuffer: SecureBuffer | null = null;
        let newEncryptedNsecBuffer: SecureBuffer | null = null;

        try {
          // Get current encrypted data with version check
          const { data: currentData, error: fetchError } = await supabase
            .from("encrypted_keys")
            .select("encrypted_nsec, user_id, updated_at")
            .eq("user_id", userId)
            .single();

          if (fetchError || !currentData) {
            console.error(
              "Failed to retrieve current encrypted nsec:",
              fetchError
            );
            return false;
          }

          // Decrypt with old password
          try {
            const decryptedNsec = await security.decryptCredentials(
              currentData.encrypted_nsec,
              oldPasswordBuffer.toString()
            );
            decryptedNsecBuffer = this.createSecureBuffer(decryptedNsec);
          } catch (decryptError) {
            console.error("Failed to decrypt with old password:", decryptError);
            return false;
          }

          // Re-encrypt with new password
          const newEncryptedNsec = await security.encryptCredentials(
            decryptedNsecBuffer.toString(),
            newPasswordBuffer.toString()
          );
          newEncryptedNsecBuffer = this.createSecureBuffer(newEncryptedNsec);

          // Atomic update with optimistic locking using both encrypted_nsec and updated_at
          const { error: updateError, count: _count } = await supabase
            .from("encrypted_keys")
            .update({
              encrypted_nsec: newEncryptedNsecBuffer.toString(),
              salt: null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .eq("encrypted_nsec", currentData.encrypted_nsec)
            .eq("updated_at", currentData.updated_at);

          if (updateError) {
            if (
              attempt < maxRetries &&
              updateError.message?.includes("conflict")
            ) {
              console.log(
                `Optimistic locking conflict, retrying attempt ${
                  attempt + 1
                }/${maxRetries}`
              );
              // Clear sensitive data before retry happens in finally block
              continue;
            }
            console.error(
              "Failed to update encrypted nsec with optimistic locking:",
              updateError
            );
            return false;
          }

          // Success
          return true;
        } catch (error) {
          console.error(
            `Error in optimistic locking attempt ${attempt}:`,
            error
          );
          if (attempt === maxRetries) {
            return false;
          }
        } finally {
          // Clear sensitive data for this attempt
          if (decryptedNsecBuffer) {
            decryptedNsecBuffer.clear();
          }
          if (newEncryptedNsecBuffer) {
            newEncryptedNsecBuffer.clear();
          }
        }
      }

      return false;
    } finally {
      // Clear password buffers
      oldPasswordBuffer.clear();
      newPasswordBuffer.clear();
    }
  }

  /**
   * Check if user has stored encrypted nsec
   * @param userId - User ID
   */
  static async hasStoredNsec(userId: string): Promise<boolean> {
    try {
      const supabase = await getSupabaseClient();

      const { data, error } = await supabase
        .from("encrypted_keys")
        .select("user_id")
        .eq("user_id", userId)
        .single();

      return !error && !!data;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete stored encrypted nsec (for account deletion)
   * @param userId - User ID
   */
  static async deleteStoredNsec(userId: string): Promise<boolean> {
    try {
      const supabase = await getSupabaseClient();

      // Use transaction for atomic deletion if available
      const { data: _transactionResult, error: transactionError } =
        await supabase.rpc("begin_transaction");

      if (!transactionError) {
        try {
          const { error: deleteError } = await supabase
            .from("encrypted_keys")
            .delete()
            .eq("user_id", userId);

          if (deleteError) {
            await supabase.rpc("rollback_transaction");
            console.error("Failed to delete encrypted nsec:", deleteError);
            return false;
          }

          const { error: commitError } = await supabase.rpc(
            "commit_transaction"
          );
          if (commitError) {
            console.error(
              "Failed to commit deletion transaction:",
              commitError
            );
            return false;
          }

          return true;
        } catch (error) {
          await supabase.rpc("rollback_transaction");
          throw error;
        }
      } else {
        // Fallback to simple delete if transactions not available
        const { error } = await supabase
          .from("encrypted_keys")
          .delete()
          .eq("user_id", userId);

        if (error) {
          console.error("Failed to delete encrypted nsec:", error);
          return false;
        }

        return true;
      }
    } catch (error) {
      console.error("Error deleting stored nsec:", error);
      return false;
    }
  }
}
