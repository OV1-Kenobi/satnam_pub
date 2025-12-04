/**
 * Invitation Token Validation API Endpoint (Privacy-First)
 *
 * FOLLOWS SATNAM.PUB PRIVACY PROTOCOLS:
 * - Validates educational invitation tokens
 * - Returns invitation URL for client-side QR code generation
 * - NO sensitive data included in responses
 * - Privacy-safe invitation validation
 * - Dynamic route: /api/qr/[token]
 *
 * ARCHITECTURE NOTE:
 * QR code generation is handled client-side using qr-code-browser.ts
 * to maintain browser-only serverless architecture and avoid Node.js dependencies.
 * The client should generate QR codes from the returned `url` field.
 */

import { config } from '../../config/config.js';
import db from '../../lib/db';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Validate that the invitation token exists and is valid
    const { data: invitation, error: invitationError } = await db.models.educationalInvitations.getByToken(token);

    if (invitationError || !invitation) {
      return res.status(404).json({ error: 'Invalid invitation token' });
    }

    if (invitation.used) {
      return res.status(400).json({ error: 'Invitation has already been used' });
    }

    if (new Date() > new Date(invitation.expires_at)) {
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    // Generate the invitation URL (Master Context compliant)
    const baseUrl = config.api.baseUrl;
    const tokenStr = Array.isArray(token) ? token[0] : token;
    const invitationUrl = `${baseUrl}?invite=${encodeURIComponent(tokenStr)}`;

    // Return URL and metadata for client-side QR generation
    // Client uses qr-code-browser.ts to generate scannable QR codes
    const response = {
      url: invitationUrl,
      token: tokenStr,
      // Null values indicate client should generate QR from url
      qrCodeDataUrl: null,
      qrCodeSvg: null,
      // Recommended QR options for client-side generation
      qrOptions: {
        size: 256,
        margin: 4,
        errorCorrectionLevel: 'M'
      },
      invitationData: {
        courseCredits: invitation.course_credits,
        expiresAt: invitation.expires_at,
        personalMessage: invitation.invitation_data?.personalMessage || 'Join me on Satnam.pub for Bitcoin education!',
        isValid: true
        // PRIVACY: NO sensitive data exposed
      }
    };

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.status(200).json(response);
  } catch (error) {
    console.error('Invitation validation error:', error);
    res.status(500).json({
      error: 'Failed to validate invitation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}