/**
 * Enhanced Nostr Manager for Individual & Family Operations
 *
 * Provides unified interface for both individual and family Nostr operations
 * with coordinated identity management, relay strategies, and federated authentication
 *
 * @fileoverview Enhanced Nostr dual-mode management system
 */

import {
  Filter,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  Event as NostrEvent,
  SimplePool,
} from "nostr-tools";
import { config } from "../config";

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
  nsec: string;
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
  role: "parent" | "teen" | "child";
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
    const defaultRelays = config.nostr?.relayUrl
      ? Array.isArray(config.nostr.relayUrl)
        ? config.nostr.relayUrl
        : [config.nostr.relayUrl]
      : ["wss://relay.damus.io", "wss://nos.lol"];

    defaultRelays.forEach((url) => {
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
      : generateSecretKey();
    const privKeyHex = Buffer.from(privKey).toString("hex");
    const pubKey = getPublicKey(privKey);

    const account: IndividualNostrAccount = {
      userId,
      username,
      privateKey: privKeyHex, // Should be encrypted in production
      publicKey: pubKey,
      npub: nip19.npubEncode(pubKey),
      nsec: nip19.nsecEncode(privKey),
      relays: Array.from(this.relayConnections.keys()),
      profile: {
        name: username,
        nip05: `${username}@${config.nip05?.domain || "satnam.family"}`,
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
      role: "parent" | "teen" | "child";
      permissions?: Partial<FamilyNostrMember["permissions"]>;
      restrictions?: FamilyNostrMember["restrictions"];
    }>
  ): Promise<FamilyNostrFederation> {
    const familyMembers: FamilyNostrMember[] = members.map((member) => ({
      ...member,
      npub: nip19.npubEncode(member.publicKey),
      permissions: {
        canPublishEvents: member.role === "parent",
        canManageRelays: member.role === "parent",
        canModerate: member.role === "parent",
        requiresApproval: member.role !== "parent",
        ...member.permissions,
      },
      restrictions:
        member.role === "child"
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
      let account: IndividualNostrAccount | null = null;
      let federation: FamilyNostrFederation | null = null;
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
      const operationId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
        Buffer.from(account.privateKey, "hex")
      );

      // Publish to relays
      const relays =
        context.mode === "family" ? federation!.sharedRelays : account.relays;

      await this.pool.publish(relays, signedEvent);

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
      const operationId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
        message: `Event publication failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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
        Buffer.from(account.privateKey, "hex")
      );

      // Publish to family relays
      await this.pool.publish(federation.sharedRelays, signedEvent);

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
        message: `Event approval failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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
      Buffer.from(account.privateKey, "hex")
    );
    await this.pool.publish(account.relays, signedEvent);
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
    filters: Filter[],
    onEvent: (event: NostrEvent) => void
  ): Promise<string> {
    const relays =
      context.mode === "individual"
        ? this.individualAccounts.get(context.userId)?.relays || []
        : this.familyFederations.get(context.familyId!)?.sharedRelays || [];

    const subscription = this.pool.subscribeMany(relays, filters, {
      onevent: onEvent,
      oneose: () => {
        console.log(`Subscription completed for ${context.mode} mode`);
      },
    });

    return subscription.toString();
  }

  /**
   * Close relay connections
   */
  async close(): Promise<void> {
    this.pool.close();
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
