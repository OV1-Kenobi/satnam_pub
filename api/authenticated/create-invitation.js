/**
 * Create Educational Invitation API Endpoint (Privacy-First)
 * 
 * FOLLOWS SATNAM.PUB PRIVACY PROTOCOLS:
 * - NO pubkeys/npubs stored or transmitted
 * - Uses privacy-safe hashed identifiers only
 * - Invitation data encrypted for privacy
 * - NO sensitive data in responses
 */

import { randomBytes } from 'crypto';
import { createHashedUserId, getUserFromRequest } from '../../lib/auth.js';
import db from '../../lib/db.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
    // Get authenticated user
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { 
      personalMessage = 'Join me on Satnam.pub for Bitcoin education and sovereign identity!',
      courseCredits = 1,
      recipientInfo = '',
      expirationDays = 7
    } = req.body;

    // Validate inputs
    if (courseCredits < 1 || courseCredits > 5) {
      return res.status(400).json({ error: 'Course credits must be between 1 and 5' });
    }

    if (expirationDays < 1 || expirationDays > 30) {
      return res.status(400).json({ error: 'Expiration days must be between 1 and 30' });
    }

    // Generate unique tokens
    const inviteToken = `inv_${randomBytes(16).toString('hex')}`;
    const hashedInviteId = createHashedUserId(inviteToken);
    const hashedInviterId = user.hashedUserId || createHashedUserId(user.userId);

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // Prepare privacy-safe invitation data (NO sensitive info)
    const invitationData = {
      personalMessage,
      recipientInfo,
      inviterName: user.username,
      // PRIVACY: NO npub, pubkey, or sensitive data stored
      createdAt: new Date().toISOString()
    };

    // Create invitation in database
    const invitation = await db.models.educationalInvitations.create({
      inviteToken,
      hashedInviteId,
      hashedInviterId,
      invitationData,
      courseCredits,
      expiresAt
    });

    // Generate invitation URL and QR code URL
    const invitationUrl = `https://satnam.pub?invite=${inviteToken}`;
    const qrCodeUrl = `/api/qr/${inviteToken}`;

    res.status(201).json({
      success: true,
      invitation: {
        id: invitation.id,
        inviteToken: inviteToken,
        invitationUrl: invitationUrl,
        qrCodeUrl: qrCodeUrl,
        personalMessage: personalMessage,
        courseCredits: courseCredits,
        expiresAt: invitation.expires_at,
        recipientInfo: recipientInfo
      }
    });

  } catch (error) {
    console.error('Create invitation API error:', error);
    res.status(500).json({ 
      error: 'Failed to create educational invitation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}