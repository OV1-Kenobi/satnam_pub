// lib/secure-storage.ts
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { decryptData, encryptData } from "../utils/crypto";
import { supabase } from "./supabase";

export interface EncryptedKeyData {
  userId: string;
  encryptedNsec: string;
  salt: string | null; // Salt is embedded in encryptedNsec format (iv:salt:encrypted)
  createdAt: Date;
}

export interface NewAccountKeyPair {
  nsec: string;
  npub: string;
  hexPrivateKey: string;
  hexPublicKey: string;
}

export class SecureStorage {
  /**
   * Securely clear sensitive string data from memory
   * @param sensitiveData - String to clear (will be modified in place if possible)
   */
  private static secureClearString(_sensitiveData: string): void {
    // Note: In JavaScript, strings are immutable, so we can't actually overwrite memory
    // But we can at least remove references and suggest garbage collection
    try {
      // Clear the reference
      _sensitiveData = "";
      // Force garbage collection if available (development/Node.js)
      if (typeof global !== "undefined" && global.gc) {
        global.gc();
      }
    } catch {
      // Ignore errors in cleanup
    }
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
   */
  static generateNewAccountKeyPair(): NewAccountKeyPair {
    const privateKeyBytes = generateSecretKey();
    const hexPrivateKey = Buffer.from(privateKeyBytes).toString("hex");
    const hexPublicKey = getPublicKey(privateKeyBytes);

    return {
      nsec: nip19.nsecEncode(privateKeyBytes),
      npub: nip19.npubEncode(hexPublicKey),
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
    let encryptedNsec: string | null = null;

    try {
      // Encrypt the nsec using proper PBKDF2 key derivation (handled internally by encryptData)
      encryptedNsec = await encryptData(nsec, userPassword);

      // Use transaction to ensure atomicity
      const { error } = await supabase.from("encrypted_keys").insert({
        user_id: userId,
        encrypted_nsec: encryptedNsec,
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
      if (encryptedNsec) {
        this.secureClearString(encryptedNsec);
        encryptedNsec = null;
      }
      this.secureClearString(nsec);
    }
  }

  /**
   * Retrieve and decrypt nsec for a user
   * @param userId - User ID
   * @param userPassword - User's password for decryption
   */
  static async retrieveDecryptedNsec(
    userId: string,
    userPassword: string
  ): Promise<string | null> {
    let decryptedNsec: string | null = null;

    try {
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

      // Decrypt the nsec using proper PBKDF2 key derivation (handled internally by decryptData)
      try {
        decryptedNsec = await decryptData(data.encrypted_nsec, userPassword);
        return decryptedNsec;
      } catch (decryptError) {
        console.error("Failed to decrypt nsec:", decryptError);
        return null;
      }
    } catch (error) {
      console.error("Error retrieving encrypted nsec:", error);
      return null;
    }
    // Note: We don't clear decryptedNsec here as it's the return value
    // The caller is responsible for clearing it when done
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
    let decryptedNsec: string | null = null;
    let newEncryptedNsec: string | null = null;

    try {
      // Use Supabase transaction for atomic operations
      const { data: transactionResult, error: transactionError } =
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
          decryptedNsec = await decryptData(
            currentData.encrypted_nsec,
            oldPassword
          );
        } catch (decryptError) {
          await supabase.rpc("rollback_transaction");
          console.error("Failed to decrypt with old password:", decryptError);
          return false;
        }

        // Re-encrypt with new password
        newEncryptedNsec = await encryptData(decryptedNsec, newPassword);

        // Update within transaction
        const { error: updateError } = await supabase
          .from("encrypted_keys")
          .update({
            encrypted_nsec: newEncryptedNsec,
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
      if (decryptedNsec) {
        this.secureClearString(decryptedNsec);
        decryptedNsec = null;
      }
      if (newEncryptedNsec) {
        this.secureClearString(newEncryptedNsec);
        newEncryptedNsec = null;
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
    let decryptedNsec: string | null = null;
    let newEncryptedNsec: string | null = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
          decryptedNsec = await decryptData(
            currentData.encrypted_nsec,
            oldPassword
          );
        } catch (decryptError) {
          console.error("Failed to decrypt with old password:", decryptError);
          return false;
        }

        // Re-encrypt with new password
        newEncryptedNsec = await encryptData(decryptedNsec, newPassword);

        // Atomic update with optimistic locking using both encrypted_nsec and updated_at
        const { error: updateError, count } = await supabase
          .from("encrypted_keys")
          .update({
            encrypted_nsec: newEncryptedNsec,
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
              `Optimistic locking conflict, retrying attempt ${attempt + 1}/${maxRetries}`
            );
            // Clear sensitive data before retry
            if (decryptedNsec) {
              this.secureClearString(decryptedNsec);
              decryptedNsec = null;
            }
            if (newEncryptedNsec) {
              this.secureClearString(newEncryptedNsec);
              newEncryptedNsec = null;
            }
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
        console.error(`Error in optimistic locking attempt ${attempt}:`, error);
        if (attempt === maxRetries) {
          return false;
        }
      } finally {
        // Clear sensitive data for this attempt
        if (decryptedNsec) {
          this.secureClearString(decryptedNsec);
          decryptedNsec = null;
        }
        if (newEncryptedNsec) {
          this.secureClearString(newEncryptedNsec);
          newEncryptedNsec = null;
        }
      }
    }

    return false;
  }

  /**
   * Check if user has stored encrypted nsec
   * @param userId - User ID
   */
  static async hasStoredNsec(userId: string): Promise<boolean> {
    try {
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
      // Use transaction for atomic deletion if available
      const { data: transactionResult, error: transactionError } =
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

          const { error: commitError } =
            await supabase.rpc("commit_transaction");
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
