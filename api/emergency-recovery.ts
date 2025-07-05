/**
 * Emergency Recovery API Endpoint
 * 
 * Handles emergency recovery requests, guardian consensus workflows,
 * and recovery execution for lost keys, eCash recovery, and emergency liquidity.
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { verifyAuthToken } from '../lib/auth';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RecoveryRequest {
  action: 'initiate_recovery' | 'get_status' | 'execute_recovery' | 'get_guardians' | 'approve_recovery' | 'reject_recovery';
  userId: string;
  userNpub: string;
  userRole: string;
  familyId?: string;
  requestType?: 'nsec_recovery' | 'ecash_recovery' | 'emergency_liquidity' | 'account_restoration';
  reason?: 'lost_key' | 'compromised_key' | 'emergency_funds' | 'account_lockout' | 'guardian_request';
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  requestedAmount?: number;
  recoveryMethod?: 'password' | 'multisig' | 'shamir' | 'guardian_consensus';
  recoveryRequestId?: string;
  executorNpub?: string;
  executorRole?: string;
  guardianNpub?: string;
  approval?: 'approved' | 'rejected' | 'abstained';
}

export const handler: Handler = async (event) => {
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

  try {
    // Verify authentication
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized - Missing or invalid token' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const user = await verifyAuthToken(token);
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized - Invalid token' }),
      };
    }

    const body: RecoveryRequest = JSON.parse(event.body || '{}');
    const { action } = body;

    switch (action) {
      case 'initiate_recovery':
        return await handleInitiateRecovery(body, user);
      
      case 'get_status':
        return await handleGetStatus(body, user);
      
      case 'execute_recovery':
        return await handleExecuteRecovery(body, user);
      
      case 'get_guardians':
        return await handleGetGuardians(body, user);
      
      case 'approve_recovery':
        return await handleApproveRecovery(body, user);
      
      case 'reject_recovery':
        return await handleRejectRecovery(body, user);
      
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid action' }),
        };
    }
  } catch (error) {
    console.error('Emergency recovery API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

async function handleInitiateRecovery(body: RecoveryRequest, user: any) {
  const {
    userId,
    userNpub,
    userRole,
    requestType,
    reason,
    urgency,
    description,
    requestedAmount,
    recoveryMethod,
    familyId
  } = body;

  // Validate required fields
  if (!requestType || !reason || !urgency || !description || !recoveryMethod) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing required fields' }),
    };
  }

  try {
    // Get family guardians for consensus
    const { data: guardians, error: guardianError } = await supabase
      .from('family_members')
      .select('*')
      .eq('family_id', familyId)
      .in('role', ['guardian', 'steward'])
      .eq('is_active', true);

    if (guardianError) {
      throw new Error('Failed to fetch guardians');
    }

    const requiredApprovals = Math.ceil(guardians.length * 0.75); // 75% consensus required

    // Create recovery request
    const { data: recoveryRequest, error: createError } = await supabase
      .from('emergency_recovery_requests')
      .insert({
        user_id: userId,
        user_npub: userNpub,
        user_role: userRole,
        family_id: familyId,
        request_type: requestType,
        reason,
        urgency,
        description,
        requested_amount: requestedAmount,
        recovery_method: recoveryMethod,
        status: 'pending',
        required_approvals: requiredApprovals,
        current_approvals: 0,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      })
      .select()
      .single();

    if (createError) {
      throw new Error('Failed to create recovery request');
    }

    // Notify guardians via Nostr (in a real implementation, this would send NIP-59 messages)
    await notifyGuardians(guardians, recoveryRequest.id, familyId);

    // Log the recovery request
    await supabase
      .from('emergency_recovery_logs')
      .insert({
        recovery_request_id: recoveryRequest.id,
        action: 'request_initiated',
        actor_npub: userNpub,
        actor_role: userRole,
        details: `Recovery request initiated for ${requestType}`,
        timestamp: new Date().toISOString()
      });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: {
          requestId: recoveryRequest.id,
          requiredApprovals,
          guardians: guardians.length
        }
      }),
    };
  } catch (error) {
    console.error('Initiate recovery error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to initiate recovery request' }),
    };
  }
}

async function handleGetStatus(body: RecoveryRequest, user: any) {
  const { userId } = body;

  try {
    // Get active recovery requests for the user
    const { data: requests, error } = await supabase
      .from('emergency_recovery_requests')
      .select(`
        *,
        guardian_approvals:emergency_recovery_approvals(*)
      `)
      .eq('user_id', userId)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error('Failed to fetch recovery status');
    }

    if (requests.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: { activeRequests: [] }
        }),
      };
    }

    const request = requests[0];
    const guardianApprovals = request.guardian_approvals || [];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: {
          activeRequests: [{
            id: request.id,
            status: request.status,
            current_approvals: request.current_approvals,
            required_approvals: request.required_approvals,
            guardian_approvals: guardianApprovals.map(approval => ({
              guardianNpub: approval.guardian_npub,
              guardianRole: approval.guardian_role,
              approval: approval.approval,
              timestamp: approval.timestamp
            })),
            created_at: request.created_at,
            expires_at: request.expires_at
          }]
        }
      }),
    };
  } catch (error) {
    console.error('Get status error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to get recovery status' }),
    };
  }
}

async function handleExecuteRecovery(body: RecoveryRequest, user: any) {
  const { recoveryRequestId, executorNpub, executorRole } = body;

  if (!recoveryRequestId || !executorNpub || !executorRole) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing required fields' }),
    };
  }

  try {
    // Get the recovery request
    const { data: request, error: fetchError } = await supabase
      .from('emergency_recovery_requests')
      .select('*')
      .eq('id', recoveryRequestId)
      .single();

    if (fetchError || !request) {
      throw new Error('Recovery request not found');
    }

    if (request.status !== 'approved') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Recovery request not approved' }),
      };
    }

    // Execute recovery based on type
    let recoveryResult;
    switch (request.request_type) {
      case 'nsec_recovery':
        recoveryResult = await executeNsecRecovery(request);
        break;
      case 'ecash_recovery':
        recoveryResult = await executeEcashRecovery(request);
        break;
      case 'emergency_liquidity':
        recoveryResult = await executeEmergencyLiquidity(request);
        break;
      case 'account_restoration':
        recoveryResult = await executeAccountRestoration(request);
        break;
      default:
        throw new Error('Unknown recovery type');
    }

    // Update request status
    await supabase
      .from('emergency_recovery_requests')
      .update({
        status: 'completed',
        executed_at: new Date().toISOString(),
        executor_npub: executorNpub,
        executor_role: executorRole
      })
      .eq('id', recoveryRequestId);

    // Log the execution
    await supabase
      .from('emergency_recovery_logs')
      .insert({
        recovery_request_id: recoveryRequestId,
        action: 'recovery_executed',
        actor_npub: executorNpub,
        actor_role: executorRole,
        details: `Recovery executed successfully: ${recoveryResult}`,
        timestamp: new Date().toISOString()
      });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: { result: recoveryResult }
      }),
    };
  } catch (error) {
    console.error('Execute recovery error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to execute recovery' }),
    };
  }
}

async function handleGetGuardians(body: RecoveryRequest, user: any) {
  const { familyId } = body;

  if (!familyId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Family ID required' }),
    };
  }

  try {
    const { data: guardians, error } = await supabase
      .from('family_members')
      .select('*')
      .eq('family_id', familyId)
      .in('role', ['guardian', 'steward'])
      .eq('is_active', true)
      .order('role', { ascending: true });

    if (error) {
      throw new Error('Failed to fetch guardians');
    }

    // Transform to match frontend interface
    const guardianInfo = guardians.map(guardian => ({
      npub: guardian.npub,
      role: guardian.role,
      name: guardian.username || guardian.npub.substring(0, 20) + '...',
      isOnline: true, // In a real implementation, this would check actual online status
      lastSeen: guardian.last_seen || new Date().toISOString()
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: { guardians: guardianInfo }
      }),
    };
  } catch (error) {
    console.error('Get guardians error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to get guardians' }),
    };
  }
}

async function handleApproveRecovery(body: RecoveryRequest, user: any) {
  const { recoveryRequestId, guardianNpub, approval } = body;

  if (!recoveryRequestId || !guardianNpub || !approval) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing required fields' }),
    };
  }

  try {
    // Record guardian approval
    const { error: approvalError } = await supabase
      .from('emergency_recovery_approvals')
      .insert({
        recovery_request_id: recoveryRequestId,
        guardian_npub: guardianNpub,
        guardian_role: user.role,
        approval,
        timestamp: new Date().toISOString()
      });

    if (approvalError) {
      throw new Error('Failed to record approval');
    }

    // Update approval count
    const { data: request, error: fetchError } = await supabase
      .from('emergency_recovery_requests')
      .select('*')
      .eq('id', recoveryRequestId)
      .single();

    if (fetchError) {
      throw new Error('Failed to fetch request');
    }

    const newApprovalCount = request.current_approvals + (approval === 'approved' ? 1 : 0);
    const newStatus = newApprovalCount >= request.required_approvals ? 'approved' : 'pending';

    await supabase
      .from('emergency_recovery_requests')
      .update({
        current_approvals: newApprovalCount,
        status: newStatus
      })
      .eq('id', recoveryRequestId);

    // Log the approval
    await supabase
      .from('emergency_recovery_logs')
      .insert({
        recovery_request_id: recoveryRequestId,
        action: 'guardian_approval',
        actor_npub: guardianNpub,
        actor_role: user.role,
        details: `Guardian ${approval} recovery request`,
        timestamp: new Date().toISOString()
      });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: { status: newStatus, approvalCount: newApprovalCount }
      }),
    };
  } catch (error) {
    console.error('Approve recovery error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to approve recovery' }),
    };
  }
}

async function handleRejectRecovery(body: RecoveryRequest, user: any) {
  return await handleApproveRecovery(body, user); // Same logic, just different approval value
}

// Helper functions for recovery execution
async function executeNsecRecovery(request: any): Promise<string> {
  // In a real implementation, this would:
  // 1. Use Shamir Secret Sharing to reconstruct the private key
  // 2. Generate new key pairs if needed
  // 3. Update user's key storage
  // 4. Notify user of new keys
  
  console.log('Executing nsec recovery for user:', request.user_id);
  return 'Private key recovered and new keys generated';
}

async function executeEcashRecovery(request: any): Promise<string> {
  // In a real implementation, this would:
  // 1. Recover eCash tokens from backup
  // 2. Reconstruct proofs if needed
  // 3. Transfer to user's wallet
  
  console.log('Executing eCash recovery for user:', request.user_id);
  return 'eCash tokens recovered and transferred';
}

async function executeEmergencyLiquidity(request: any): Promise<string> {
  // In a real implementation, this would:
  // 1. Release emergency funds from family treasury
  // 2. Transfer via Lightning or eCash
  // 3. Update family balance
  
  console.log('Executing emergency liquidity for user:', request.user_id, 'amount:', request.requested_amount);
  return `Emergency liquidity of ${request.requested_amount} sats released`;
}

async function executeAccountRestoration(request: any): Promise<string> {
  // In a real implementation, this would:
  // 1. Restore account access
  // 2. Reset authentication if needed
  // 3. Restore user data
  
  console.log('Executing account restoration for user:', request.user_id);
  return 'Account access restored';
}

async function notifyGuardians(guardians: any[], requestId: string, familyId: string) {
  // In a real implementation, this would send NIP-59 Gift Wrapped messages
  // to all guardians notifying them of the recovery request
  
  console.log(`Notifying ${guardians.length} guardians of recovery request ${requestId}`);
  
  // For now, just log the notification
  for (const guardian of guardians) {
    console.log(`Notified guardian ${guardian.npub} of recovery request`);
  }
} 