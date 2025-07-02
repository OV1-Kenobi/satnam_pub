/**
 * QR Code Generation API Endpoint (Privacy-First)
 * 
 * FOLLOWS SATNAM.PUB PRIVACY PROTOCOLS:
 * - Generates QR codes for educational invitation links
 * - NO sensitive data included in QR codes
 * - Privacy-safe invitation validation
 * - Dynamic route: /api/qr/[token]
 */

import QRCode from 'qrcode';
import db from '../../lib/db.js';

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
    const invitation = await db.models.educationalInvitations.getByToken(token);
    
    if (!invitation) {
      return res.status(404).json({ error: 'Invalid invitation token' });
    }

    if (invitation.used) {
      return res.status(400).json({ error: 'Invitation has already been used' });
    }

    if (new Date() > new Date(invitation.expires_at)) {
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    // Generate the invitation URL
    const invitationUrl = `https://satnam.pub?invite=${token}`;
    
    // Generate QR code as PNG data URL
    const qrCodeDataUrl = await QRCode.toDataURL(invitationUrl, {
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256
    });

    // Generate QR code as SVG for better scalability
    const qrCodeSvg = await QRCode.toString(invitationUrl, {
      type: 'svg',
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256
    });

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