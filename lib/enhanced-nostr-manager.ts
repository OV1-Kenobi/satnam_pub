/**
 * Enhanced Nostr Manager for Individual & Family Operations
 *
 * Provides unified interface for both individual and family Nostr operations
 * with coordinated identity management, relay strategies, and federated authentication
 *
 * @fileoverview Enhanced Nostr dual-mode management system
 */

import {
  SimplePool,
  finalizeEvent,
  generatePrivateKey,
  getPublicKey,
  nip19,
} from "nostr-tools";
import { config } from "../config";
import { resolvePlatformLightningDomain } from "../src/config/domain.client";

// Operation Context Types (matching PhoenixD manager)
type OperationMode = "individual" | "family";

interface NostrOperationContext {
  mode: OperationMode;
  userId: string;
  familyId?: string;

  parentUserId?: string;
}

// Individual Nostr Account Types
interface IndividualNostrAccount {
  userId: string;
  username: string;
  privateKey: string; // Encrypted at rest
  publicKey: string;
  npub: string;
  nsec?: string; // Optional - should not be stored for security
  relays: string[];
  profile: {
    name?: string;
    about?: string;
    picture?: string;
    website?: string;
    nip05?: string;
    lud16?: string; // Lightning address
  };
  preferences: {
    autoPublishProfile: boolean;
    defaultRelays: string[];
    privacyMode: boolean;
    encryptDMs: boolean;
  };
  metadata: {
    createdAt: Date;
    lastActiveAt: Date;
    eventCount: number;
  };
  // Secure credential storage
  encryptedCredentials?: {
    credentialId: string; // Unique UUID for this credential
    salt: string; // Unique salt for this credential
    encryptedNsec: string; // AES-256-GCM encrypted nsec
    iv: string; // Initialization vector
    tag: string; // Authentication tag
    createdAt: Date;
    expiresAt: Date; // Temporary storage with expiration
  };
}

// Family Nostr Account Types
interface FamilyNostrFederation {
  familyId: string;
  familyName: string;
  parentUserId: string;
  sharedRelays: string[];
  members: FamilyNostrMember[];
  coordination: {
    crossSigning: boolean;
    sharedReputationScore: number;
    coordinatedEventPublishing: boolean;
    familyAuthEnabled: boolean;
  };
  policies: {
    memberEventModeration: boolean;
    parentalControls: boolean;
    contentFiltering: boolean;
    allowDirectMessages: boolean;
  };
}

interface FamilyNostrMember {
  userId: string;
  username: string;
  publicKey: string;
  npub: string;
  role: "private" | "offspring" | "adult" | "steward" | "guardian";
  permissions: {
    canPublishEvents: boolean;
    canManageRelays: boolean;
    canModerate: boolean;
    requiresApproval: boolean;
  };
  restrictions?: {
    contentFilter: "none" | "basic" | "strict";
    timeRestrictions?: {
      allowedHours: { start: number; end: number };
      allowedDays: number[]; // 0-6, Sunday-Saturday
    };
    interactionLimits?: {
      maxFollows: number;
      maxDMsPerDay: number;
    };
  };
}

// Nostr Event Management Types
interface NostrEventOperation {
  id: string;
  context: NostrOperationContext;
  eventType: number;
  content: string;
  tags: string[][];
  status: "draft" | "pending" | "published" | "failed";
  requiresApproval?: boolean;
  approvedBy?: string;
  createdAt: Date;
  publishedAt?: Date;
  errorMessage?: string;
}

interface RelayConnection {
  url: string;
  status: "connected" | "disconnected" | "connecting" | "error";
  lastConnected?: Date;
  messageCount: number;
  latency?: number;
}

/**
 * Enhanced Nostr Manager supporting both individual and family operations
 */
export class EnhancedNostrManager {
  private pool: SimplePool;
  private individualAccounts: Map<string, IndividualNostrAccount> = new Map();
  private familyFederations: Map<string, FamilyNostrFederation> = new Map();
  private eventOperations: Map<string, NostrEventOperation> = new Map();
  private relayConnections: Map<string, RelayConnection> = new Map();

  constructor() {
    this.pool = new SimplePool();
    this.initializeDefaultRelays();
  }

  /**
   * Initialize default relay connections
   */
  private initializeDefaultRelays(): void {
    const defaultRelays = (config as any).nostr?.relays ||
      config.nostr?.relays || ["wss://relay.damus.io", "wss://nos.lol"];

    defaultRelays.forEach((url: string) => {
      this.relayConnections.set(url, {
        url,
        status: "disconnected",
        messageCount: 0,
      });
    });
  }

  /**
   * Initialize individual Nostr account
   */
  async initializeIndividualAccount(
    userId: string,
    username: string,
    privateKey?: string,
    preferences?: Partial<IndividualNostrAccount["preferences"]>
  ): Promise<IndividualNostrAccount> {
    // Generate or use provided private key
    const privKey = privateKey
      ? Buffer.from(privateKey, "hex")
      : generatePrivateKey();
    const privKeyHex = Buffer.from(privKey as any).toString("hex");
    const pubKey = getPublicKey(privKey as any);

    const account: IndividualNostrAccount = {
      userId,
      username,
      privateKey: privKeyHex, // Should be encrypted in production
      publicKey: pubKey,
      npub: nip19.npubEncode(pubKey),
      // nsec removed for security - never store secret keys in plain text
      relays: Array.from(this.relayConnections.keys()),
      profile: {
        name: username,
        nip05: `${username}@${resolvePlatformLightningDomain()}`,
      },
      preferences: {
        autoPublishProfile: true,
        defaultRelays: Array.from(this.relayConnections.keys()),
        privacyMode: true,
        encryptDMs: true,
        ...preferences,
      },
      metadata: {
        createdAt: new Date(),
        lastActiveAt: new Date(),
        eventCount: 0,
      },
    };

    this.individualAccounts.set(userId, account);

    // Auto-publish profile if enabled
    if (account.preferences.autoPublishProfile) {
      await this.publishProfile(account);
    }

    return account;
  }

  /**
   * Initialize family Nostr federation
   */
  async initializeFamilyFederation(
    familyId: string,
    familyName: string,
    parentUserId: string,
    members: Array<{
      userId: string;
      username: string;
      publicKey: string;
      role: "private" | "offspring" | "adult" | "steward" | "guardian";
      permissions?: Partial<FamilyNostrMember["permissions"]>;
      restrictions?: FamilyNostrMember["restrictions"];
    }>
  ): Promise<FamilyNostrFederation> {
    const familyMembers: FamilyNostrMember[] = members.map((member) => ({
      ...member,
      npub: nip19.npubEncode(member.publicKey),
      permissions: {
        canPublishEvents:
          member.role === "adult" ||
          member.role === "steward" ||
          member.role === "guardian",
        canManageRelays:
          member.role === "adult" ||
          member.role === "steward" ||
          member.role === "guardian",
        canModerate:
          member.role === "adult" ||
          member.role === "steward" ||
          member.role === "guardian",
        requiresApproval:
          member.role === "offspring" || member.role === "private",
        ...member.permissions,
      },
      restrictions:
        member.role === "offspring"
          ? {
              contentFilter: "strict",
              timeRestrictions: {
                allowedHours: { start: 8, end: 20 }, // 8 AM to 8 PM
                allowedDays: [1, 2, 3, 4, 5], // Monday to Friday
              },
              interactionLimits: {
                maxFollows: 50,
                maxDMsPerDay: 10,
              },
              ...member.restrictions,
            }
          : member.restrictions,
    }));

    const federation: FamilyNostrFederation = {
      familyId,
      familyName,
      parentUserId,
      sharedRelays: Array.from(this.relayConnections.keys()),
      members: familyMembers,
      coordination: {
        crossSigning: true,
        sharedReputationScore: 0,
        coordinatedEventPublishing: true,
        familyAuthEnabled: true,
      },
      policies: {
        memberEventModeration: true,
        parentalControls: true,
        contentFiltering: true,
        allowDirectMessages: true,
      },
    };

    this.familyFederations.set(familyId, federation);
    return federation;
  }

  /**
   * Publish Nostr event with dual-mode support
   */
  async publishEvent(
    context: NostrOperationContext,
    eventType: number,
    content: string,
    tags: string[][] = []
  ): Promise<{
    success: boolean;
    eventId?: string;
    operationId?: string;
    message: string;
  }> {
    try {
      let account: IndividualNostrAccount | undefined = undefined;
      let federation: FamilyNostrFederation | undefined = undefined;
      let requiresApproval = false;

      // Get account information based on context
      if (context.mode === "individual") {
        account = this.individualAccounts.get(context.userId);
        if (!account) {
          throw new Error("Individual account not found");
        }
      } else {
        federation = this.familyFederations.get(context.familyId!);
        if (!federation) {
          throw new Error("Family federation not found");
        }

        const member = federation.members.find(
          (m) => m.userId === context.userId
        );
        if (!member) {
          throw new Error("User not found in family federation");
        }

        if (!member.permissions.canPublishEvents) {
          throw new Error("User does not have permission to publish events");
        }

        requiresApproval = member.permissions.requiresApproval;

        // Get individual account for signing
        account = this.individualAccounts.get(context.userId);
        if (!account) {
          throw new Error("Individual account required for signing");
        }
      }

      // Create operation record
      const operationId = `evt_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const operation: NostrEventOperation = {
        id: operationId,
        context,
        eventType,
        content,
        tags,
        status: requiresApproval ? "pending" : "draft",
        requiresApproval,
        createdAt: new Date(),
      };

      this.eventOperations.set(operationId, operation);

      // If requires approval, don't publish yet
      if (requiresApproval) {
        return {
          success: true,
          operationId,
          message: "Event created and pending approval",
        };
      }

      // Create and sign event
      const event = {
        kind: eventType,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content,
        pubkey: account.publicKey,
      };

      const signedEvent = finalizeEvent(
        event,
        new Uint8Array(
          account.privateKey
            .match(/.{1,2}/g)
            ?.map((byte) => parseInt(byte, 16)) || []
        ) as any
      );

      // Publish to relays
      const relays =
        context.mode === "family" ? federation!.sharedRelays : account.relays;

      // Publish to each relay individually
      for (const relay of relays) {
        await this.pool.publish([relay], signedEvent);
      }

      // Update operation status
      operation.status = "published";
      operation.publishedAt = new Date();
      this.eventOperations.set(operationId, operation);

      // Update account metadata
      account.metadata.lastActiveAt = new Date();
      account.metadata.eventCount++;

      return {
        success: true,
        eventId: signedEvent.id,
        operationId,
        message: "Event published successfully",
      };
    } catch (error) {
      const operationId = `evt_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const operation: NostrEventOperation = {
        id: operationId,
        context,
        eventType,
        content,
        tags,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        createdAt: new Date(),
      };

      this.eventOperations.set(operationId, operation);

      return {
        success: false,
        operationId,
        message: `Event publication failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Approve pending family member event
   */
  async approveEvent(
    familyId: string,
    operationId: string,
    approverId: string
  ): Promise<{
    success: boolean;
    eventId?: string;
    message: string;
  }> {
    const operation = this.eventOperations.get(operationId);
    if (!operation) {
      return {
        success: false,
        message: "Operation not found",
      };
    }

    if (operation.status !== "pending") {
      return {
        success: false,
        message: "Operation is not pending approval",
      };
    }

    const federation = this.familyFederations.get(familyId);
    if (!federation) {
      return {
        success: false,
        message: "Family federation not found",
      };
    }

    const approver = federation.members.find((m) => m.userId === approverId);
    if (!approver || !approver.permissions.canModerate) {
      return {
        success: false,
        message: "Approver does not have moderation permissions",
      };
    }

    // Get account for signing
    const account = this.individualAccounts.get(operation.context.userId);
    if (!account) {
      return {
        success: false,
        message: "Account not found for signing",
      };
    }

    try {
      // Create and sign event
      const event = {
        kind: operation.eventType,
        created_at: Math.floor(Date.now() / 1000),
        tags: operation.tags,
        content: operation.content,
        pubkey: account.publicKey,
      };

      const signedEvent = finalizeEvent(
        event,
        new Uint8Array(Buffer.from(account.privateKey, "hex")) as any
      );

      // Publish to family relays
      for (const relay of federation.sharedRelays) {
        await this.pool.publish([relay], signedEvent);
      }

      // Update operation
      operation.status = "published";
      operation.approvedBy = approverId;
      operation.publishedAt = new Date();
      this.eventOperations.set(operationId, operation);

      return {
        success: true,
        eventId: signedEvent.id,
        message: "Event approved and published successfully",
      };
    } catch (error) {
      operation.status = "failed";
      operation.errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.eventOperations.set(operationId, operation);

      return {
        success: false,
        message: `Event approval failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Publish user profile
   */
  private async publishProfile(account: IndividualNostrAccount): Promise<void> {
    const profileContent = JSON.stringify(account.profile);

    const event = {
      kind: 0, // Profile metadata
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: profileContent,
      pubkey: account.publicKey,
    };

    const signedEvent = finalizeEvent(
      event,
      new Uint8Array(Buffer.from(account.privateKey, "hex")) as any
    );
    for (const relay of account.relays) {
      await this.pool.publish([relay], signedEvent);
    }
  }

  /**
   * Get account information based on context
   */
  getAccountInfo(
    context: NostrOperationContext
  ): IndividualNostrAccount | FamilyNostrFederation | null {
    if (context.mode === "individual") {
      return this.individualAccounts.get(context.userId) || null;
    } else {
      return this.familyFederations.get(context.familyId!) || null;
    }
  }

  /**
   * Generate nsec for temporary use (DO NOT STORE)
   * This method generates the nsec encoding only when needed for operations
   * and should never be stored permanently for security reasons
   */
  generateNsecForOperation(userId: string): string | null {
    const account = this.individualAccounts.get(userId);
    if (!account) return null;

    // Generate nsec only for the operation, don't store it
    return nip19.nsecEncode(account.privateKey);
  }

  /**
   * Securely store nsec credential with encryption and temporary expiration
   * This is used during sign-up when users provide their nsec
   */
  async storeNsecCredentialSecurely(
    userId: string,
    nsec: string,
    userPassword: string,
    expirationHours: number = 24
  ): Promise<{
    success: boolean;
    credentialId: string;
    message: string;
  }> {
    try {
      const account = this.individualAccounts.get(userId);
      if (!account) {
        return {
          success: false,
          credentialId: "",
          message: "Account not found",
        };
      }

      // Generate unique credential ID and salt
      const credentialId = crypto.randomUUID();
      const salt = await this.generateSecureSalt();

      // Create encryption key from user password and salt
      const encryptionKey = await this.deriveKeyFromPassword(
        userPassword,
        salt
      );

      // Encrypt the nsec using AES-256-GCM
      const encryptedData = await this.encryptNsec(nsec, encryptionKey);

      // Set expiration time
      const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

      // Store encrypted credential in account
      account.encryptedCredentials = {
        credentialId,
        salt,
        encryptedNsec: encryptedData.encrypted,
        iv: encryptedData.iv,
        tag: encryptedData.tag,
        createdAt: new Date(),
        expiresAt,
      };

      // Store in database with encrypted data
      await this.storeEncryptedCredentialInDatabase(
        userId,
        account.encryptedCredentials
      );

      // Clear any plain text nsec from memory
      account.nsec = undefined;

      return {
        success: true,
        credentialId,
        message: "Nsec credential stored securely",
      };
    } catch (error) {
      return {
        success: false,
        credentialId: "",
        message: `Failed to store nsec credential: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Retrieve and decrypt nsec credential for temporary use
   * This should only be used for specific operations and immediately cleared
   */
  async retrieveNsecCredentialTemporarily(
    userId: string,
    userPassword: string,
    credentialId: string
  ): Promise<{
    success: boolean;
    nsec?: string;
    message: string;
  }> {
    try {
      const account = this.individualAccounts.get(userId);
      if (!account?.encryptedCredentials) {
        return {
          success: false,
          message: "No encrypted credentials found",
        };
      }

      const credentials = account.encryptedCredentials;

      // Check if credential has expired
      if (new Date() > credentials.expiresAt) {
        // Clean up expired credential
        await this.removeExpiredCredential(userId, credentialId);
        return {
          success: false,
          message: "Credential has expired",
        };
      }

      // Verify credential ID matches
      if (credentials.credentialId !== credentialId) {
        return {
          success: false,
          message: "Invalid credential ID",
        };
      }

      // Derive key from password and salt
      const encryptionKey = await this.deriveKeyFromPassword(
        userPassword,
        credentials.salt
      );

      // Decrypt the nsec
      const decryptedNsec = await this.decryptNsec(
        credentials.encryptedNsec,
        encryptionKey,
        credentials.iv,
        credentials.tag
      );

      return {
        success: true,
        nsec: decryptedNsec,
        message: "Nsec retrieved successfully",
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to retrieve nsec: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Remove expired or used credentials
   */
  async removeExpiredCredential(
    userId: string,
    credentialId: string
  ): Promise<void> {
    const account = this.individualAccounts.get(userId);
    if (account?.encryptedCredentials?.credentialId === credentialId) {
      // Clear from memory
      account.encryptedCredentials = undefined;

      // Remove from database
      await this.removeCredentialFromDatabase(userId, credentialId);
    }
  }

  /**
   * Generate secure salt for credential encryption
   */
  private async generateSecureSalt(): Promise<string> {
    const saltBytes = new Uint8Array(32);
    crypto.getRandomValues(saltBytes);
    return Array.from(saltBytes, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  }

  /**
   * Derive encryption key from password and salt using PBKDF2
   */
  private async deriveKeyFromPassword(
    password: string,
    salt: string
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    const saltBuffer = encoder.encode(salt);

    const baseKey = await crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );

    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: 100000, // High iteration count for security
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypt nsec using AES-256-GCM
   */
  private async encryptNsec(
    nsec: string,
    key: CryptoKey
  ): Promise<{
    encrypted: string;
    iv: string;
    tag: string;
  }> {
    const encoder = new TextEncoder();
    const data = encoder.encode(nsec);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );

    // Extract the authentication tag (last 16 bytes)
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const tag = encryptedArray.slice(-16);
    const encrypted = encryptedArray.slice(0, -16);

    return {
      encrypted: Array.from(encrypted, (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join(""),
      iv: Array.from(iv, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      tag: Array.from(tag, (byte) => byte.toString(16).padStart(2, "0")).join(
        ""
      ),
    };
  }

  /**
   * Decrypt nsec using AES-256-GCM
   */
  private async decryptNsec(
    encrypted: string,
    key: CryptoKey,
    iv: string,
    tag: string
  ): Promise<string> {
    const encryptedBytes = new Uint8Array(
      encrypted.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );
    const ivBytes = new Uint8Array(
      iv.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );
    const tagBytes = new Uint8Array(
      tag.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    // Combine encrypted data with authentication tag
    const combinedData = new Uint8Array(
      encryptedBytes.length + tagBytes.length
    );
    combinedData.set(encryptedBytes);
    combinedData.set(tagBytes, encryptedBytes.length);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      key,
      combinedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }

  /**
   * Store encrypted credential in database
   */
  private async storeEncryptedCredentialInDatabase(
    userId: string,
    credentials: IndividualNostrAccount["encryptedCredentials"]
  ): Promise<void> {
    if (!credentials) return;

    // Import supabase for database operations
    const { supabase } = await import("../src/lib/supabase");

    await supabase.from("secure_nostr_credentials").insert({
      user_id: userId,
      credential_id: credentials.credentialId,
      salt: credentials.salt,
      encrypted_nsec: credentials.encryptedNsec,
      iv: credentials.iv,
      tag: credentials.tag,
      created_at: credentials.createdAt.toISOString(),
      expires_at: credentials.expiresAt.toISOString(),
    });
  }

  /**
   * Remove credential from database
   */
  private async removeCredentialFromDatabase(
    userId: string,
    credentialId: string
  ): Promise<void> {
    const { supabase } = await import("../src/lib/supabase");

    await supabase
      .from("secure_nostr_credentials")
      .delete()
      .eq("user_id", userId)
      .eq("credential_id", credentialId);
  }

  /**
   * Get event operations for context
   */
  getEventOperations(context: NostrOperationContext): NostrEventOperation[] {
    return Array.from(this.eventOperations.values()).filter(
      (op) =>
        op.context.userId === context.userId &&
        op.context.mode === context.mode &&
        (context.mode === "individual" ||
          op.context.familyId === context.familyId)
    );
  }

  /**
   * Get pending events requiring approval (family mode only)
   */
  getPendingEvents(familyId: string): NostrEventOperation[] {
    return Array.from(this.eventOperations.values()).filter(
      (op) =>
        op.context.mode === "family" &&
        op.context.familyId === familyId &&
        op.status === "pending"
    );
  }

  /**
   * Subscribe to events with context-aware filtering
   */
  async subscribeToEvents(
    context: NostrOperationContext,
    filters: any[],
    onEvent: (event: any) => void
  ): Promise<string> {
    const relays =
      context.mode === "individual"
        ? this.individualAccounts.get(context.userId)?.relays || []
        : this.familyFederations.get(context.familyId!)?.sharedRelays || [];

    const subscription = this.pool.subscribeMany(relays, filters, {
      onevent: () => {},
      oneose: () => {},
    });

    return subscription.toString();
  }

  /**
   * Close relay connections
   */
  async close(): Promise<void> {
    (this.pool as any).close();
  }
}

export type {
  FamilyNostrFederation,
  FamilyNostrMember,
  IndividualNostrAccount,
  NostrEventOperation,
  NostrOperationContext,
  OperationMode,
  RelayConnection,
};
