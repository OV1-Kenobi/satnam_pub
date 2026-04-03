// OTS Proof Confirmation Poller
// Purpose: Netlify Scheduled Function (cron job) that polls pending OTS proofs and updates status
// Schedule: Every 10 minutes (configured in netlify.toml)
// Aligned with: docs/planning/OTS-AGENT-PROOF-GENERATION-IMPLEMENTATION-PLAN.md Phase 1

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { OpenTimestampsClient } from '@alexalves87/opentimestamps-client';

// Initialize Supabase admin client (service role)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Poll pending OTS proofs and update status when Bitcoin block is confirmed
 * @param {Object} event - Netlify function event
 * @returns {Object} Response with polling summary
 */
export const handler: Handler = async (event) => {
  const startTime = Date.now();
  const requestId = `poller-${Date.now()}`;
  
  console.log('🔄 OTS proof confirmation poller started', { requestId });
  
  // Verify this is a scheduled function call (security check)
  if (event.httpMethod !== 'POST' || event.headers['x-netlify-event'] !== 'schedule') {
    console.warn('Unauthorized call to scheduled function', { requestId, method: event.httpMethod });
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Forbidden: This endpoint is only accessible via Netlify scheduled functions' }),
    };
  }
  
  try {
    // Query pending proofs (created within last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: pendingProofs, error: queryError } = await supabaseAdmin
      .from('ots_proof_records')
      .select('*')
      .eq('proof_status', 'pending')
      .gte('created_at', sevenDaysAgo);
    
    if (queryError) {
      console.error('Failed to query pending proofs', { requestId, error: queryError.message });
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Database query failed', details: queryError.message }),
      };
    }
    
    if (!pendingProofs || pendingProofs.length === 0) {
      console.log('No pending proofs to process', { requestId });
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          pending_proofs_checked: 0,
          confirmed: 0,
          failed: 0,
          duration_ms: Date.now() - startTime,
        }),
      };
    }
    
    console.log(`Processing ${pendingProofs.length} pending proofs`, { requestId });
    
    let confirmedCount = 0;
    let failedCount = 0;
    const otsClient = new OpenTimestampsClient();
    
    // Process each pending proof
    for (const proof of pendingProofs) {
      try {
        console.log(`Verifying proof ${proof.id}`, { requestId, proof_hash: proof.proof_hash });
        
        // Download .ots proof file from storage
        const response = await fetch(proof.ots_proof_file_url);
        if (!response.ok) {
          throw new Error(`Failed to download proof file: ${response.status} ${response.statusText}`);
        }
        
        const otsProofBytes = await response.arrayBuffer();
        
        // Verify proof using OpenTimestamps client
        const verifyResult = await otsClient.verify(Buffer.from(otsProofBytes));
        
        // Check if proof is confirmed (has Bitcoin block height)
        if (verifyResult && typeof verifyResult === 'object' && 'bitcoinBlockHeight' in verifyResult) {
          const bitcoinBlockHeight = (verifyResult as any).bitcoinBlockHeight;
          
          if (bitcoinBlockHeight && typeof bitcoinBlockHeight === 'number') {
            // Proof confirmed!
            const { error: updateError } = await supabaseAdmin
              .from('ots_proof_records')
              .update({
                proof_status: 'confirmed',
                bitcoin_block_height: bitcoinBlockHeight,
                confirmed_at: new Date().toISOString(),
              })
              .eq('id', proof.id);
            
            if (updateError) {
              console.error(`Failed to update proof ${proof.id} to confirmed`, { requestId, error: updateError.message });
            } else {
              console.log(`✅ Proof ${proof.id} confirmed at block ${bitcoinBlockHeight}`, { requestId });
              confirmedCount++;
            }
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`Verification failed for proof ${proof.id}`, { requestId, error: errorMsg });
        
        // Check if proof is older than 7 days — mark as failed
        const createdAt = new Date(proof.created_at);
        const ageInDays = (Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
        
        if (ageInDays > 7) {
          const { error: updateError } = await supabaseAdmin
            .from('ots_proof_records')
            .update({ proof_status: 'failed' })
            .eq('id', proof.id);
          
          if (updateError) {
            console.error(`Failed to update proof ${proof.id} to failed`, { requestId, error: updateError.message });
          } else {
            console.log(`❌ Proof ${proof.id} marked as failed (older than 7 days)`, { requestId });
            failedCount++;
          }
        }
      }
    }
    
    const duration = Date.now() - startTime;
    console.log('✅ OTS proof confirmation polling completed', {
      requestId,
      pending_proofs_checked: pendingProofs.length,
      confirmed: confirmedCount,
      failed: failedCount,
      duration,
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        pending_proofs_checked: pendingProofs.length,
        confirmed: confirmedCount,
        failed: failedCount,
        duration_ms: duration,
      }),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ OTS proof confirmation polling failed', { requestId, error: errorMsg, duration });
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        details: errorMsg,
        request_id: requestId,
      }),
    };
  }
};

