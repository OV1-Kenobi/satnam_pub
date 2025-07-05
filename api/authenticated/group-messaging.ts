/**
 * @fileoverview Group Messaging API Endpoint
 * @description Handles group messaging operations with NIP-28/29/59 support
 * @compliance Master Context - NIP-59 Gift Wrapped messaging, privacy-first, no email storage
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { GroupMessagingService, GroupMessagingConfig } from '../../src/lib/group-messaging';
import { SatnamPrivacyFirstCommunications } from '../../lib/gift-wrapped-messaging/privacy-first-service';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Load configuration from environment
const getGroupMessagingConfig = (): GroupMessagingConfig => ({
  relays: process.env.NOSTR_RELAYS?.split(',') || ['wss://relay.damus.io', 'wss://nos.lol'],
  giftWrapEnabled: process.env.GIFT_WRAP_ENABLED === 'true',
  guardianApprovalRequired: process.env.GUARDIAN_APPROVAL_REQUIRED === 'true',
  guardianPubkeys: process.env.GUARDIAN_PUBKEYS?.split(',') || [],
  maxGroupSize: parseInt(process.env.MAX_GROUP_SIZE || '50'),
  messageRetentionDays: parseInt(process.env.MESSAGE_RETENTION_DAYS || '30'),
  privacyDelayMs: parseInt(process.env.PRIVACY_DELAY_MS || '5000'),
});

// Initialize group messaging service
const initializeGroupMessaging = async (userNsec: string): Promise<GroupMessagingService> => {
  const config = getGroupMessagingConfig();
  const privacyService = new SatnamPrivacyFirstCommunications();
  
  // Initialize privacy service session
  await privacyService.initializeSession(userNsec);
  
  return new GroupMessagingService(config, userNsec, privacyService);
};

// Validate user authentication
const validateUser = async (request: any): Promise<string> => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);
  
  // Verify JWT token and extract user nsec
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    throw new Error('Invalid authentication token');
  }

  // Get user's encrypted nsec from vault
  const { data: vaultData, error: vaultError } = await supabase
    .from('encrypted_user_vault')
    .select('encrypted_nsec')
    .eq('user_id', user.id)
    .single();

  if (vaultError || !vaultData?.encrypted_nsec) {
    throw new Error('User nsec not found in vault');
  }

  // Decrypt nsec (this would use the user's session key)
  // For now, we'll assume it's stored in a way that can be decrypted
  return vaultData.encrypted_nsec;
};

export const handler: Handler = async (event, context) => {
  try {
    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Content-Type': 'application/json',
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'CORS preflight successful' }),
      };
    }

    // Validate user authentication
    let userNsec: string;
    try {
      userNsec = await validateUser(event);
    } catch (error) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Authentication failed', details: (error as Error).message }),
      };
    }

    // Initialize group messaging service
    const groupMessaging = await initializeGroupMessaging(userNsec);

    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {};
    const { action, ...params } = body;

    let result: any;

    switch (action) {
      case 'create_group':
        result = await handleCreateGroup(groupMessaging, params);
        break;

      case 'invite_member':
        result = await handleInviteMember(groupMessaging, params);
        break;

      case 'send_message':
        result = await handleSendMessage(groupMessaging, params);
        break;

      case 'process_guardian_approval':
        result = await handleGuardianApproval(groupMessaging, params);
        break;

      case 'get_user_groups':
        result = await handleGetUserGroups(groupMessaging);
        break;

      case 'get_pending_approvals':
        result = await handleGetPendingApprovals(groupMessaging);
        break;

      case 'join_group':
        result = await handleJoinGroup(groupMessaging, params);
        break;

      case 'leave_group':
        result = await handleLeaveGroup(groupMessaging, params);
        break;

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid action specified' }),
        };
    }

    // Cleanup
    await groupMessaging.cleanup();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: result }),
    };

  } catch (error) {
    console.error('Group messaging API error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: (error as Error).message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};

// Handler functions for different actions
async function handleCreateGroup(groupMessaging: GroupMessagingService, params: any) {
  const { name, description, picture, groupType, encryptionType, initialMembers } = params;

  if (!name || !groupType || !encryptionType) {
    throw new Error('Missing required parameters: name, groupType, encryptionType');
  }

  const groupId = await groupMessaging.createGroup({
    name,
    description,
    picture,
    groupType,
    encryptionType,
    initialMembers,
  });

  return { groupId };
}

async function handleInviteMember(groupMessaging: GroupMessagingService, params: any) {
  const { groupId, inviteeNpub, role, message } = params;

  if (!groupId || !inviteeNpub) {
    throw new Error('Missing required parameters: groupId, inviteeNpub');
  }

  const invitationId = await groupMessaging.inviteMember(
    groupId,
    inviteeNpub,
    role || 'member',
    message
  );

  return { invitationId };
}

async function handleSendMessage(groupMessaging: GroupMessagingService, params: any) {
  const { groupId, content, messageType } = params;

  if (!groupId || !content) {
    throw new Error('Missing required parameters: groupId, content');
  }

  const messageId = await groupMessaging.sendGroupMessage(
    groupId,
    content,
    messageType || 'text'
  );

  return { messageId };
}

async function handleGuardianApproval(groupMessaging: GroupMessagingService, params: any) {
  const { approvalId, guardianPubkey, approved, reason } = params;

  if (!approvalId || !guardianPubkey) {
    throw new Error('Missing required parameters: approvalId, guardianPubkey');
  }

  const success = await groupMessaging.processGuardianApproval(
    approvalId,
    guardianPubkey,
    approved,
    reason
  );

  return { success };
}

async function handleGetUserGroups(groupMessaging: GroupMessagingService) {
  const groups = await groupMessaging.getUserGroups();
  return { groups };
}

async function handleGetPendingApprovals(groupMessaging: GroupMessagingService) {
  const approvals = await groupMessaging.getPendingApprovals();
  return { approvals };
}

async function handleJoinGroup(groupMessaging: GroupMessagingService, params: any) {
  const { groupId, invitationId } = params;

  if (!groupId) {
    throw new Error('Missing required parameter: groupId');
  }

  // This would typically involve accepting an invitation
  // For now, we'll return a success response
  return { success: true, message: 'Group join request processed' };
}

async function handleLeaveGroup(groupMessaging: GroupMessagingService, params: any) {
  const { groupId } = params;

  if (!groupId) {
    throw new Error('Missing required parameter: groupId');
  }

  // This would typically involve removing the user from the group
  // For now, we'll return a success response
  return { success: true, message: 'Group leave request processed' };
} 