/**
 * User Educational Referrals API Endpoint
 * 
 * Handles detailed educational referral tracking, invitation history, and course credit history
 * for the educational referral dashboard
 */

import { getUserFromRequest } from '../../lib/auth.js';
import db from '../../lib/db.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Get authenticated user
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Ensure user is an object with hashedUserId property
    if (typeof user === 'string' || !user.hashedUserId) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const hashedUserId = user.hashedUserId;

    // Get user's invitations
    const userInvitations = await db.models.educationalInvitations.getUserInvitations(hashedUserId);
    
    // Get referral statistics
    const referralStats = await db.models.courseCredits.getUserReferralStats(hashedUserId);
    
    // Get credit history
    const creditHistory = await db.models.courseCredits.getUserCreditHistory(hashedUserId);

    // Ensure we have arrays to work with
    const invitationsArray = userInvitations || [];
    const creditsArray = creditHistory || [];

    // Format invitations data
    const recentInvitations = invitationsArray.map(invitation => {
      const now = new Date();
      const expiryDate = invitation.expires_at ? new Date(invitation.expires_at) : new Date();
      
      let status = 'pending';
      if (invitation.used) {
        status = 'accepted';
      } else if (invitation.expires_at && now > expiryDate) {
        status = 'expired';
      }

      return {
        id: invitation.invite_token || '',
        recipientInfo: invitation.invitation_data?.recipientInfo || 'Friend',
        personalMessage: invitation.invitation_data?.personalMessage || 'Join me on Satnam.pub for Bitcoin education!',
        courseCredits: invitation.course_credits || 0,
        status: status,
        createdAt: invitation.created_at,
        expiresAt: invitation.expires_at,
        inviteUrl: `https://satnam.pub?invite=${invitation.invite_token || ''}`,
        qrCodeUrl: `/api/qr/${invitation.invite_token || ''}`
      };
    });

    // Format credit history
    const formattedCreditHistory = creditsArray.map(credit => ({
      id: credit.id || '',
      type: credit.activity_type || 'unknown',
      amount: credit.credits_amount || 0,
      description: credit.description || '',
      referralId: credit.invite_token || '',
      timestamp: credit.created_at
    }));

    const referralData = {
      totalReferrals: referralStats?.total_referrals || 0,
      completedReferrals: referralStats?.completed_referrals || 0,
      pendingReferrals: referralStats?.pending_referrals || 0,
      totalCreditsEarned: referralStats?.total_course_credits_earned || 0,
      pendingCredits: referralStats?.pending_course_credits || 0,
      recentInvitations: recentInvitations.slice(0, 10), // Limit to 10 recent
      creditHistory: formattedCreditHistory.slice(0, 20) // Limit to 20 recent
    };

    res.status(200).json(referralData);
  } catch (error) {
    console.error('Referrals API error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch referral data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}