/**
 * Profile URL Display Component
 * Phase 3: Public Profile URL System - UI Integration
 * Sub-Phase 3B: Profile Sharing UI
 *
 * Displays shareable profile URLs with copy-to-clipboard functionality
 * and QR code generation for easy sharing.
 *
 * FIXED: Uses browser-compatible qr-code-browser utility instead of qrcode.react
 * to avoid Node.js util._extend deprecation warnings
 */

import React, { useEffect, useState } from 'react';
import { Copy, Check, QrCode, ExternalLink } from 'lucide-react';
import { ProfileVisibility } from '../lib/services/profile-service';
import { generateQRCodeDataURL, getRecommendedErrorCorrection } from '../utils/qr-code-browser';

interface ProfileURLDisplayProps {
  username: string;
  npub?: string;
  visibility: ProfileVisibility;
  className?: string;
}

const PLATFORM_DOMAIN = 'https://www.satnam.pub';

export const ProfileURLDisplay: React.FC<ProfileURLDisplayProps> = ({
  username,
  npub,
  visibility,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'username' | 'npub' | 'short'>('username');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Generate URLs in different formats
  const urls = {
    username: `${PLATFORM_DOMAIN}/profile/${username}`,
    npub: npub ? `${PLATFORM_DOMAIN}/profile/npub/${npub}` : null,
    short: `${PLATFORM_DOMAIN}/p/${username}`,
  };

  const currentURL = urls[selectedFormat] || urls.username;

  // Generate QR code when URL changes or QR visibility changes
  useEffect(() => {
    let isMounted = true;

    const generateQR = async () => {
      if (!showQR || !currentURL) {
        setQrDataUrl('');
        return;
      }

      try {
        const dataUrl = await generateQRCodeDataURL(currentURL, {
          size: 200,
          margin: 4,
          errorCorrectionLevel: getRecommendedErrorCorrection('url'),
        });
        if (isMounted) {
          setQrDataUrl(dataUrl);
        }
      } catch (error) {
        console.error('Failed to generate QR code:', error);
        if (isMounted) {
          setQrDataUrl('');
        }
      }
    };

    generateQR();

    return () => {
      isMounted = false;
    };
  }, [currentURL, showQR]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentURL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const handleOpenInNewTab = () => {
    window.open(currentURL, '_blank', 'noopener,noreferrer');
  };

  const getVisibilityStatusColor = () => {
    switch (visibility) {
      case 'public':
        return 'text-green-400';
      case 'contacts_only':
        return 'text-blue-400';
      case 'trusted_contacts_only':
        return 'text-purple-400';
      case 'private':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  };

  const getVisibilityStatusText = () => {
    switch (visibility) {
      case 'public':
        return 'Public - Anyone can view';
      case 'contacts_only':
        return 'Contacts Only - Only your contacts can view';
      case 'trusted_contacts_only':
        return 'Trusted Contacts Only - Only verified/trusted contacts can view';
      case 'private':
        return 'Private - Only you can view (URL not shareable)';
      default:
        return 'Unknown visibility';
    }
  };

  const isShareable = visibility !== 'private';

  return (
    <div className={`profile-url-display ${className}`}>
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white mb-2">Your Profile URL</h3>
        <p className={`text-sm ${getVisibilityStatusColor()}`}>
          {getVisibilityStatusText()}
        </p>
      </div>

      {/* URL Format Selector */}
      {isShareable && (
        <div className="mb-4">
          <p className="text-xs text-gray-400 uppercase mb-2">URL Format</p>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedFormat('username')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${selectedFormat === 'username'
                ? 'bg-purple-600 text-white border-2 border-purple-500'
                : 'bg-gray-700 text-gray-300 border border-gray-600 hover:border-purple-500'
                }`}
            >
              Username
            </button>
            {npub && (
              <button
                onClick={() => setSelectedFormat('npub')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${selectedFormat === 'npub'
                  ? 'bg-purple-600 text-white border-2 border-purple-500'
                  : 'bg-gray-700 text-gray-300 border border-gray-600 hover:border-purple-500'
                  }`}
              >
                Npub
              </button>
            )}
            <button
              onClick={() => setSelectedFormat('short')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${selectedFormat === 'short'
                ? 'bg-purple-600 text-white border-2 border-purple-500'
                : 'bg-gray-700 text-gray-300 border border-gray-600 hover:border-purple-500'
                }`}
            >
              Short URL
            </button>
          </div>
        </div>
      )}

      {/* URL Display */}
      <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={currentURL}
            readOnly
            className="flex-1 bg-gray-800 text-gray-300 px-3 py-2 rounded border border-gray-600 text-sm font-mono"
          />
          {isShareable && (
            <>
              <button
                onClick={handleCopy}
                className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
              <button
                onClick={handleOpenInNewTab}
                className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                title="Open in new tab"
              >
                <ExternalLink size={20} />
              </button>
            </>
          )}
        </div>

        {copied && (
          <p className="text-green-400 text-xs">✓ URL copied to clipboard!</p>
        )}

        {!isShareable && (
          <p className="text-yellow-400 text-xs">
            ⚠ Your profile is set to private. Change visibility to share your profile URL.
          </p>
        )}
      </div>

      {/* QR Code Section */}
      {isShareable && (
        <div className="mb-4">
          <button
            onClick={() => setShowQR(!showQR)}
            className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
          >
            <QrCode size={16} />
            {showQR ? 'Hide QR Code' : 'Show QR Code'}
          </button>

          {showQR && (
            <div className="mt-4 p-4 bg-white rounded-lg inline-block">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR code for profile URL`}
                  className="w-[200px] h-[200px]"
                />
              ) : (
                <div className="w-[200px] h-[200px] flex items-center justify-center bg-gray-100 rounded">
                  <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full"></div>
                </div>
              )}
              <p className="text-center text-xs text-gray-600 mt-2">
                Scan to view profile
              </p>
            </div>
          )}
        </div>
      )}

      {/* Privacy Notice */}
      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
        <p className="text-xs text-blue-300">
          <strong>Privacy Note:</strong> Profile views are tracked using privacy-first analytics
          (hashed viewer identity, no PII). Only aggregated data is stored.
        </p>
      </div>
    </div>
  );
};

export default ProfileURLDisplay;

