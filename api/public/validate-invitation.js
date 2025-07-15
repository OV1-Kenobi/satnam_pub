/**
 * Validate Educational Invitation API Endpoint
 * 
 * Validates invitation tokens from educational invitation links
 * Returns invitation details and validity status for course credits
 */

import db from '../../lib/db';

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

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { inviteToken } = req.body;

    if (!inviteToken) {
      return res.status(400).json({
        isValid: false,
        error: 'Invitation token is required'
      });
    }

    // Get invitation from database
    const { data: invitation, error: invitationError } = await db.models.educationalInvitations.getByToken(inviteToken);

    if (invitationError || !invitation) {
      return res.status(200).json({
        isValid: false,
        error: 'Invalid or unknown invitation token.'
      });
    }

    // Check if invitation has expired
    const now = new Date();
    const expiryDate = new Date(invitation.expires_at);
    const isExpired = now > expiryDate;

    // Check if invitation has already been used
    const isUsed = invitation.used;

    if (isExpired) {
      return res.status(200).json({
        isValid: false,
        error: 'This educational invitation has expired.',
        isExpired: true
      });
    }

    if (isUsed) {
      return res.status(200).json({
        isValid: false,
        error: 'This educational invitation has already been used.',
        isUsed: true
      });
    }

    // Return valid invitation details
    res.status(200).json({
      isValid: true,
      personalMessage: invitation.invitation_data?.personalMessage || 'Join me on the journey to Bitcoin education and sovereign identity!',
      courseCredits: invitation.course_credits,
      expiryDate: invitation.expires_at,
      isExpired: false,
      isUsed: false,
      welcomeMessage: 'Welcome to the future of Bitcoin education and sovereign identity!',
      creditsMessage: `You and your friend will both receive ${invitation.course_credits} course credit${invitation.course_credits > 1 ? 's' : ''}.`,
      inviterInfo: {
        // Note: In production, you might want to resolve this from the hashedInviterId
        displayName: invitation.invitation_data?.inviterName || 'A fellow Bitcoiner'
      }
    });
  } catch (error) {
    console.error('Invitation validation error:', error);
    res.status(500).json({ 
      isValid: false,
      error: 'Failed to validate invitation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}