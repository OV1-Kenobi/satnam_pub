/**
 * QR Code Generation API Endpoint (Privacy-First)
 * 
 * FOLLOWS SATNAM.PUB PRIVACY PROTOCOLS:
 * - Generates QR codes for educational invitation links
 * - NO sensitive data included in QR codes
 * - Privacy-safe invitation validation
 * - Dynamic route: /api/qr/[token]
 */

// Use maintained 'qrcode' lib for server-side QR generation (backward compatible, no util._extend)
import { config } from '../../config.js';
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
    // Generate real QR assets server-side for backward compatibility
    const qrOptions = {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
      color: { dark: '#000000', light: '#FFFFFF' }
    };
    const qrCodeDataUrl = await QRCode.toDataURL(invitationUrl, qrOptions);
    const qrCodeSvg     = await QRCode.toString(invitationUrl, { ...qrOptions, type: 'svg' });
    const qrCodeResponse = {
      url: invitationUrl,
      token: token,
      qrCodeDataUrl: qrCodeDataUrl,
      qrCodeSvg: qrCodeSvg,
      invitationData: {
        courseCredits: invitation.course_credits,
        expiresAt: invitation.expires_at,
        personalMessage: invitation.invitation_data?.personalMessage || 'Join me on Satnam.pub for Bitcoin education!',
        isValid: true
        // PRIVACY: NO sensitive data exposed in QR codes
      }
    };

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.status(200).json(qrCodeResponse);
  } catch (error) {
    console.error('QR code generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate QR code',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}