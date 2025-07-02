/**
 * User Course Credits API Endpoint (Privacy-First)
 * 
 * FOLLOWS SATNAM.PUB PRIVACY PROTOCOLS:
 * - Handles EDUCATIONAL COURSE CREDITS (NOT monetary credits)
 * - Uses privacy-safe hashed user identifiers only
 * - NO sensitive data in responses
 * - All data encrypted according to privacy levels
 */

import { createHashedUserId, getUserFromRequest } from '../../lib/auth.js';
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

    const hashedUserId = user.hashedUserId || createHashedUserId(user.userId);

    // Get user's course credits balance
    const userCredits = await db.models.courseCredits.getUserCredits(hashedUserId);
    
    // Get referral statistics
    const referralStats = await db.models.courseCredits.getUserReferralStats(hashedUserId);
    
    // Get recent activity
    const recentActivity = await db.models.courseCredits.getUserCreditHistory(hashedUserId);

    // Format response data for educational course credits
    const courseCreditsData = {
      totalCredits: userCredits?.total_credits || 0,
      pendingCredits: referralStats?.pending_course_credits || 0,
      referralsCompleted: referralStats?.completed_referrals || 0,
      referralsPending: referralStats?.pending_referrals || 0,
      recentActivity: recentActivity.slice(0, 10).map(activity => ({
        type: activity.activity_type,
        amount: activity.credits_amount,
        description: activity.description,
        timestamp: activity.created_at
      }))
    };

    res.status(200).json(courseCreditsData);
  } catch (error) {
    console.error('Course Credits API error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch course credits data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}