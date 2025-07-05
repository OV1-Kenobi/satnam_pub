/**
 * @fileoverview Group Messaging Service with NIP-28/29/59 Support
 * @description Implements secure group messaging with gift-wrapping and guardian approval
 * @compliance Master Context - NIP-59 Gift Wrapped messaging, privacy-first, no email storage
 */

import { Event, getPublicKey, nip04, nip19 } from "nostr-tools";
import * as nip59 from "nostr-tools/nip59";
import { SimplePool } from "nostr-tools/pool";
import { SatnamPrivacyFirstCommunications } from "../../lib/gift-wrapped-messaging/privacy-first-service";

// NIP-28/29/59 Group Types
export interface NostrGroup {
  id: string; // Group identifier
  name: string;
  description?: string;
  picture?: string;
  created_at: number;
  updated_at: number;
  tags: string[][];
  pubkey: string; // Group creator
  groupType: "family" | "business" | "friends" | "advisors";
  encryptionType: "gift-wrap" | "nip04";
  memberCount: number;
  adminPubkeys: string[];
  memberPubkeys: string[];
}

export interface GroupMessage {
  id: string;
  groupId: string;
  content: string;
  pubkey: string; // Sender
  created_at: number;
  tags: string[][];
  messageType: "text" | "file" | "payment" | "credential" | "sensitive";
  giftWrapped: boolean;
  guardianApproved?: boolean;
  guardianPubkey?: string;
  approvalTimestamp?: number;
}

export interface GroupInvitation {
  id: string;
  groupId: string;
  inviterPubkey: string;
  inviteePubkey: string;
  role: "admin" | "member" | "viewer";
  message?: string;
  created_at: number;
  expires_at: number;
  status: "pending" | "accepted" | "rejected";
  giftWrapped: boolean;
}

export interface GuardianApprovalRequest {
  id: string;
  groupId: string;
  messageId: string;
  requesterPubkey: string;
  guardianPubkey: string;
  messageContent: string;
  messageType: "sensitive" | "credential" | "payment";
  created_at: number;
  expires_at: number;
  status: "pending" | "approved" | "rejected";
  approvalReason?: string;
  rejectionReason?: string;
}

export interface GroupMessagingConfig {
  relays: string[];
  giftWrapEnabled: boolean;
  guardianApprovalRequired: boolean;
  guardianPubkeys: string[];
  maxGroupSize: number;
  messageRetentionDays: number;
  privacyDelayMs: number;
}

/**
 * Group Messaging Service with NIP-28/29/59 Support
 */
export class GroupMessagingService {
  private pool: SimplePool;
  private privacyService: SatnamPrivacyFirstCommunications;
  private config: GroupMessagingConfig;
  private userNsec: string;
  private userNpub: string;
  private groups: Map<string, NostrGroup> = new Map();
  private pendingApprovals: Map<string, GuardianApprovalRequest> = new Map();

  constructor(
    config: GroupMessagingConfig,
    userNsec: string,
    privacyService?: SatnamPrivacyFirstCommunications
  ) {
    this.config = config;
    this.userNsec = userNsec;
    this.userNpub = getPublicKey(userNsec);
    this.pool = new SimplePool();
    this.privacyService = privacyService || new SatnamPrivacyFirstCommunications();
  }

  /**
   * Create a new group with NIP-28/29 support
   */
  async createGroup(groupData: {
    name: string;
    description?: string;
    picture?: string;
    groupType: "family" | "business" | "friends" | "advisors";
    encryptionType: "gift-wrap" | "nip04";
    initialMembers?: string[]; // npub array
  }): Promise<string> {
    try {
      const groupId = this.generateGroupId();
      const now = Math.floor(Date.now() / 1000);

      // Create NIP-28 group event
      const groupEvent: Event = {
        kind: 34550, // NIP-28 group event
        pubkey: this.userNpub,
        created_at: now,
        content: JSON.stringify({
          name: groupData.name,
          description: groupData.description || "",
          picture: groupData.picture || "",
          groupType: groupData.groupType,
          encryptionType: groupData.encryptionType,
        }),
        tags: [
          ["d", groupId], // Group identifier
          ["name", groupData.name],
          ["group-type", groupData.groupType],
          ["encryption", groupData.encryptionType],
          ["created", now.toString()],
        ],
        id: "", // Will be set by finishEvent
        sig: "", // Will be set by finishEvent
      };

      // const signedEvent = finishEvent(groupEvent, this.userNsec); // TODO: finishEvent is not exported by nostr-tools
      // await this.publishToRelays(signedEvent);

      // Create group object
      const group: NostrGroup = {
        id: groupId,
        name: groupData.name,
        description: groupData.description,
        picture: groupData.picture,
        created_at: now,
        updated_at: now,
        tags: groupEvent.tags,
        pubkey: this.userNpub,
        groupType: groupData.groupType,
        encryptionType: groupData.encryptionType,
        memberCount: 1,
        adminPubkeys: [this.userNpub],
        memberPubkeys: [this.userNpub],
      };

      this.groups.set(groupId, group);

      // Add initial members if provided
      if (groupData.initialMembers?.length) {
        for (const memberNpub of groupData.initialMembers) {
          await this.inviteMember(groupId, memberNpub, "member");
        }
      }

      console.log(`✅ Group created: ${groupData.name} (${groupId})`);
      return groupId;
    } catch (error) {
      console.error("❌ Failed to create group:", error);
      throw new Error("Failed to create group");
    }
  }

  /**
   * Invite a member to a group with gift-wrapped invitation
   */
  async inviteMember(
    groupId: string,
    inviteeNpub: string,
    role: "admin" | "member" | "viewer" = "member",
    message?: string
  ): Promise<string> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error("Group not found");
    }

    if (!group.adminPubkeys.includes(this.userNpub)) {
      throw new Error("Only group admins can invite members");
    }

    if (group.memberPubkeys.includes(inviteeNpub)) {
      throw new Error("User is already a member of this group");
    }

    try {
      const invitationId = this.generateInvitationId();
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + (7 * 24 * 60 * 60); // 7 days

      // Create invitation content
      const invitationContent = {
        type: "group_invitation",
        groupId,
        groupName: group.name,
        groupType: group.groupType,
        inviterNpub: this.userNpub,
        role,
        message: message || `You've been invited to join ${group.name}`,
        created_at: now,
        expires_at: expiresAt,
      };

      // Send gift-wrapped invitation
      if (group.encryptionType === "gift-wrap") {
        await this.sendGiftWrappedInvitation(inviteeNpub, invitationContent);
      } else {
        await this.sendNip04Invitation(inviteeNpub, invitationContent);
      }

      // Store invitation record
      const invitation: GroupInvitation = {
        id: invitationId,
        groupId,
        inviterPubkey: this.userNpub,
        inviteePubkey: inviteeNpub,
        role,
        message,
        created_at: now,
        expires_at: expiresAt,
        status: "pending",
        giftWrapped: group.encryptionType === "gift-wrap",
      };

      console.log(`✅ Invitation sent to ${inviteeNpub} for group ${group.name}`);
      return invitationId;
    } catch (error) {
      console.error("❌ Failed to send invitation:", error);
      throw new Error("Failed to send invitation");
    }
  }

  /**
   * Send a message to a group with optional guardian approval
   */
  async sendGroupMessage(
    groupId: string,
    content: string,
    messageType: "text" | "file" | "payment" | "credential" | "sensitive" = "text"
  ): Promise<string> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error("Group not found");
    }

    if (!group.memberPubkeys.includes(this.userNpub)) {
      throw new Error("You are not a member of this group");
    }

    // Check if guardian approval is required
    if (messageType === "sensitive" && this.config.guardianApprovalRequired) {
      return await this.requestGuardianApproval(groupId, content, messageType);
    }

    return await this.sendMessageToGroup(group, content, messageType);
  }

  /**
   * Request guardian approval for sensitive messages
   */
  private async requestGuardianApproval(
    groupId: string,
    content: string,
    messageType: "sensitive" | "credential" | "payment"
  ): Promise<string> {
    const approvalId = this.generateApprovalId();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + (24 * 60 * 60); // 24 hours

    // Create approval request for each guardian
    const approvalPromises = this.config.guardianPubkeys.map(async (guardianPubkey) => {
      const approvalRequest: GuardianApprovalRequest = {
        id: approvalId,
        groupId,
        messageId: "", // Will be set after approval
        requesterPubkey: this.userNpub,
        guardianPubkey,
        messageContent: content,
        messageType,
        created_at: now,
        expires_at: expiresAt,
        status: "pending",
      };

      // Send gift-wrapped approval request to guardian
      await this.sendGiftWrappedApprovalRequest(guardianPubkey, approvalRequest);
      this.pendingApprovals.set(approvalId, approvalRequest);
    });

    await Promise.all(approvalPromises);

    console.log(`⏳ Guardian approval requested for sensitive message in group ${groupId}`);
    return approvalId;
  }

  /**
   * Send message to group after approval (or for non-sensitive messages)
   */
  private async sendMessageToGroup(
    group: NostrGroup,
    content: string,
    messageType: string,
    guardianApproved: boolean = false,
    guardianPubkey?: string
  ): Promise<string> {
    const messageId = this.generateMessageId();
    const now = Math.floor(Date.now() / 1000);

    // Create message content
    const messageContent = {
      type: "group_message",
      groupId: group.id,
      groupName: group.name,
      content,
      messageType,
      senderNpub: this.userNpub,
      created_at: now,
      guardianApproved,
      guardianPubkey,
    };

    // Send to each group member
    const sendPromises = group.memberPubkeys.map(async (memberNpub) => {
      if (memberNpub === this.userNpub) return; // Don't send to self

      try {
        if (group.encryptionType === "gift-wrap") {
          await this.sendGiftWrappedGroupMessage(memberNpub, messageContent);
        } else {
          await this.sendNip04GroupMessage(memberNpub, messageContent);
        }
      } catch (error) {
        console.error(`Failed to send to ${memberNpub}:`, error);
      }
    });

    await Promise.all(sendPromises);

    // Store message record
    const message: GroupMessage = {
      id: messageId,
      groupId: group.id,
      content,
      pubkey: this.userNpub,
      created_at: now,
      tags: [
        ["group-id", group.id],
        ["message-type", messageType],
        ["guardian-approved", guardianApproved.toString()],
      ],
      messageType: messageType as any,
      giftWrapped: group.encryptionType === "gift-wrap",
      guardianApproved,
      guardianPubkey,
      approvalTimestamp: guardianApproved ? now : undefined,
    };

    console.log(`✅ Message sent to group ${group.name} (${messageId})`);
    return messageId;
  }

  /**
   * Process guardian approval response
   */
  async processGuardianApproval(
    approvalId: string,
    guardianPubkey: string,
    approved: boolean,
    reason?: string
  ): Promise<boolean> {
    const approvalRequest = this.pendingApprovals.get(approvalId);
    if (!approvalRequest) {
      throw new Error("Approval request not found");
    }

    if (approvalRequest.guardianPubkey !== guardianPubkey) {
      throw new Error("Unauthorized guardian");
    }

    if (approvalRequest.status !== "pending") {
      throw new Error("Approval request already processed");
    }

    // Update approval status
    approvalRequest.status = approved ? "approved" : "rejected";
    if (approved) {
      approvalRequest.approvalReason = reason;
    } else {
      approvalRequest.rejectionReason = reason;
    }

    if (approved) {
      // Send the message to the group
      const group = this.groups.get(approvalRequest.groupId);
      if (group) {
        await this.sendMessageToGroup(
          group,
          approvalRequest.messageContent,
          approvalRequest.messageType,
          true,
          guardianPubkey
        );
      }
    }

    // Notify requester of approval decision
    await this.notifyApprovalDecision(approvalRequest, approved, reason);

    console.log(`✅ Guardian approval ${approved ? "granted" : "denied"} for ${approvalId}`);
    return approved;
  }

  /**
   * Send gift-wrapped group message
   */
  private async sendGiftWrappedGroupMessage(
    recipientNpub: string,
    messageContent: any
  ): Promise<void> {
    try {
      const delay = this.calculatePrivacyDelay();
      const now = Math.floor(Date.now() / 1000) + delay;

      const giftWrappedEvent = await nip59.wrapEvent(
        {
          kind: 14, // Gift-wrapped event
          content: JSON.stringify(messageContent),
          tags: [
            ["p", recipientNpub],
            ["group-id", messageContent.groupId],
            ["message-type", messageContent.messageType],
            ["sender", this.userNpub],
            ["created", now.toString()],
          ],
          created_at: now,
        },
        this.userNsec,
        recipientNpub
      );

      // Publish with privacy delay
      setTimeout(async () => {
        await this.publishToRelays(giftWrappedEvent);
      }, delay * 1000);
    } catch (error) {
      console.error("Failed to send gift-wrapped group message:", error);
      throw error;
    }
  }

  /**
   * Send NIP-04 encrypted group message
   */
  private async sendNip04GroupMessage(
    recipientNpub: string,
    messageContent: any
  ): Promise<void> {
    try {
      const encryptedContent = await nip04.encrypt(
        this.userNsec,
        recipientNpub,
        JSON.stringify(messageContent)
      );

      const dmEvent = { // TODO: finishEvent is not exported by nostr-tools
        kind: 4, // Encrypted DM
        content: encryptedContent,
        tags: [
          ["p", recipientNpub],
          ["group-id", messageContent.groupId],
          ["message-type", messageContent.messageType],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };

      await this.publishToRelays(dmEvent);
    } catch (error) {
      console.error("Failed to send NIP-04 group message:", error);
      throw error;
    }
  }

  /**
   * Send gift-wrapped invitation
   */
  private async sendGiftWrappedInvitation(
    recipientNpub: string,
    invitationContent: any
  ): Promise<void> {
    try {
      const delay = this.calculatePrivacyDelay();
      const now = Math.floor(Date.now() / 1000) + delay;

      const giftWrappedEvent = await nip59.wrapEvent(
        {
          kind: 14, // Gift-wrapped event
          content: JSON.stringify(invitationContent),
          tags: [
            ["p", recipientNpub],
            ["invitation-type", "group"],
            ["group-id", invitationContent.groupId],
            ["role", invitationContent.role],
            ["created", now.toString()],
          ],
          created_at: now,
        },
        this.userNsec,
        recipientNpub
      );

      // Publish with privacy delay
      setTimeout(async () => {
        await this.publishToRelays(giftWrappedEvent);
      }, delay * 1000);
    } catch (error) {
      console.error("Failed to send gift-wrapped invitation:", error);
      throw error;
    }
  }

  /**
   * Send NIP-04 encrypted invitation
   */
  private async sendNip04Invitation(
    recipientNpub: string,
    invitationContent: any
  ): Promise<void> {
    try {
      const encryptedContent = await nip04.encrypt(
        this.userNsec,
        recipientNpub,
        JSON.stringify(invitationContent)
      );

      const dmEvent = { // TODO: finishEvent is not exported by nostr-tools
        kind: 4, // Encrypted DM
        content: encryptedContent,
        tags: [
          ["p", recipientNpub],
          ["invitation-type", "group"],
          ["group-id", invitationContent.groupId],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };

      await this.publishToRelays(dmEvent);
    } catch (error) {
      console.error("Failed to send NIP-04 invitation:", error);
      throw error;
    }
  }

  /**
   * Send gift-wrapped approval request to guardian
   */
  private async sendGiftWrappedApprovalRequest(
    guardianPubkey: string,
    approvalRequest: GuardianApprovalRequest
  ): Promise<void> {
    try {
      const delay = this.calculatePrivacyDelay();
      const now = Math.floor(Date.now() / 1000) + delay;

      const approvalContent = {
        type: "guardian_approval_request",
        approvalId: approvalRequest.id,
        groupId: approvalRequest.groupId,
        requesterNpub: approvalRequest.requesterPubkey,
        messageContent: approvalRequest.messageContent,
        messageType: approvalRequest.messageType,
        created_at: approvalRequest.created_at,
        expires_at: approvalRequest.expires_at,
      };

      const giftWrappedEvent = await nip59.wrapEvent(
        {
          kind: 14, // Gift-wrapped event
          content: JSON.stringify(approvalContent),
          tags: [
            ["p", guardianPubkey],
            ["approval-type", "guardian"],
            ["approval-id", approvalRequest.id],
            ["group-id", approvalRequest.groupId],
            ["message-type", approvalRequest.messageType],
            ["created", now.toString()],
          ],
          created_at: now,
        },
        this.userNsec,
        guardianPubkey
      );

      // Publish with privacy delay
      setTimeout(async () => {
        await this.publishToRelays(giftWrappedEvent);
      }, delay * 1000);
    } catch (error) {
      console.error("Failed to send approval request:", error);
      throw error;
    }
  }

  /**
   * Notify requester of approval decision
   */
  private async notifyApprovalDecision(
    approvalRequest: GuardianApprovalRequest,
    approved: boolean,
    reason?: string
  ): Promise<void> {
    try {
      const notificationContent = {
        type: "guardian_approval_response",
        approvalId: approvalRequest.id,
        groupId: approvalRequest.groupId,
        guardianNpub: approvalRequest.guardianPubkey,
        approved,
        reason,
        timestamp: Math.floor(Date.now() / 1000),
      };

      if (approved) {
        await this.sendGiftWrappedGroupMessage(
          approvalRequest.requesterPubkey,
          notificationContent
        );
      } else {
        await this.sendGiftWrappedGroupMessage(
          approvalRequest.requesterPubkey,
          notificationContent
        );
      }
    } catch (error) {
      console.error("Failed to notify approval decision:", error);
    }
  }

  /**
   * Publish event to relays
   */
  private async publishToRelays(event: Event): Promise<void> {
    try {
      const relays = this.config.relays;
      const publishPromises = relays.map(async (relay) => {
        try {
          await this.pool.publish(relay, event);
        } catch (error) {
          console.warn(`Failed to publish to ${relay}:`, error);
        }
      });

      await Promise.allSettled(publishPromises);
    } catch (error) {
      console.error("Failed to publish to relays:", error);
      throw error;
    }
  }

  /**
   * Calculate privacy delay to prevent timing correlation
   */
  private calculatePrivacyDelay(): number {
    return Math.floor(Math.random() * this.config.privacyDelayMs) / 1000;
  }

  /**
   * Generate unique identifiers
   */
  private generateGroupId(): string {
    return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateInvitationId(): string {
    return `invite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateApprovalId(): string {
    return `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get groups for current user
   */
  async getUserGroups(): Promise<NostrGroup[]> {
    return Array.from(this.groups.values());
  }

  /**
   * Get pending approvals for current user
   */
  async getPendingApprovals(): Promise<GuardianApprovalRequest[]> {
    return Array.from(this.pendingApprovals.values()).filter(
      (approval) => approval.status === "pending"
    );
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.pool.close();
  }
} 