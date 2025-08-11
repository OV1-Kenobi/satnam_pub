/**
 * Nsec Consent Modal Component
 * 
 * Provides secure user consent interface for encrypted nsec access during message signing.
 * Includes comprehensive security warnings and session management.
 */

import React, { useState } from 'react';
import { AlertTriangle, Shield, Clock, Key, X, CheckCircle } from 'lucide-react';

export interface NsecConsentData {
  granted: boolean;
  timestamp: number;
  sessionId: string;
  expiresAt: number;
  warningAcknowledged: boolean;
}

interface NsecConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConsent: (consent: NsecConsentData) => void;
  messageType: 'group-message' | 'direct-message' | 'invitation' | 'general-event';
  sessionTimeout?: number; // in milliseconds
}

export const NsecConsentModal: React.FC<NsecConsentModalProps> = ({
  isOpen,
  onClose,
  onConsent,
  messageType,
  sessionTimeout = 30 * 60 * 1000 // 30 minutes default
}) => {
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);
  const [securityUnderstanding, setSecurityUnderstanding] = useState(false);
  const [temporaryAccess, setTemporaryAccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleGrantConsent = () => {
    if (!warningAcknowledged || !securityUnderstanding || !temporaryAccess) {
      return;
    }

    setIsProcessing(true);

    const consent: NsecConsentData = {
      granted: true,
      timestamp: Date.now(),
      sessionId: `nsec-session-${Date.now()}-${Math.random()}`,
      expiresAt: Date.now() + sessionTimeout,
      warningAcknowledged: true
    };

    setTimeout(() => {
      onConsent(consent);
      setIsProcessing(false);
      onClose();
    }, 1000);
  };

  const handleDenyConsent = () => {
    const consent: NsecConsentData = {
      granted: false,
      timestamp: Date.now(),
      sessionId: '',
      expiresAt: 0,
      warningAcknowledged: false
    };

    onConsent(consent);
    onClose();
  };

  const getMessageTypeDescription = () => {
    switch (messageType) {
      case 'group-message':
        return 'group message (NIP-58)';
      case 'direct-message':
        return 'direct message (NIP-59 gift-wrapped)';
      case 'invitation':
        return 'peer invitation';
      case 'general-event':
        return 'Nostr event';
      default:
        return 'message';
    }
  };

  const formatTimeout = (ms: number) => {
    const minutes = Math.floor(ms / (1000 * 60));
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-100 rounded-full">
              <AlertTriangle className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Secure Message Signing Required
              </h2>
              <p className="text-sm text-gray-600">
                Signing {getMessageTypeDescription()} with encrypted private key
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Security Warning */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-orange-800 mb-2">
                  Security Notice: Private Key Access Required
                </h3>
                <div className="text-orange-700 text-sm space-y-2">
                  <p>
                    <strong>NIP-07 browser extension is not available.</strong> To sign this message, 
                    we need to temporarily access your encrypted private key (nsec) stored in our secure database.
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Your nsec is encrypted with your unique user salt</li>
                    <li>It will be decrypted only in memory for signing</li>
                    <li>The nsec will be immediately cleared after use</li>
                    <li>No private key data is logged or stored during this process</li>
                    <li>Session expires automatically in {formatTimeout(sessionTimeout)}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Zero-Content Storage Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-800 mb-2">
                  Zero-Content Storage Policy
                </h3>
                <div className="text-blue-700 text-sm space-y-2">
                  <p>
                    <strong>We do NOT store the content of your messages.</strong> Your message content 
                    remains private and is only used for signing purposes.
                  </p>
                  <p>
                    To access your message history, use other Nostr clients like{' '}
                    <a 
                      href="https://0xchat.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      0xchat
                    </a>{' '}
                    that can decrypt your gift-wrapped messages.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Session Information */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Clock className="h-5 w-5 text-gray-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">
                  Temporary Access Session
                </h3>
                <div className="text-gray-700 text-sm space-y-1">
                  <p>• Session duration: {formatTimeout(sessionTimeout)}</p>
                  <p>• Automatic expiration and cleanup</p>
                  <p>• Single-use signing session</p>
                  <p>• Memory cleared immediately after signing</p>
                </div>
              </div>
            </div>
          </div>

          {/* Consent Checkboxes */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Required Acknowledgments</h3>
            
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={warningAcknowledged}
                onChange={(e) => setWarningAcknowledged(e.target.checked)}
                className="mt-1 h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">
                I understand that my encrypted private key will be temporarily accessed 
                and decrypted in memory for message signing purposes.
              </span>
            </label>

            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={securityUnderstanding}
                onChange={(e) => setSecurityUnderstanding(e.target.checked)}
                className="mt-1 h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">
                I acknowledge the security implications and understand that this is a 
                fallback method when NIP-07 browser extension is not available.
              </span>
            </label>

            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={temporaryAccess}
                onChange={(e) => setTemporaryAccess(e.target.checked)}
                className="mt-1 h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">
                I consent to temporary access for this signing session only, with automatic 
                expiration in {formatTimeout(sessionTimeout)}.
              </span>
            </label>
          </div>

          {/* Recommendation */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-800 mb-2">
                  Recommendation: Install NIP-07 Extension
                </h3>
                <p className="text-green-700 text-sm">
                  For maximum security, consider installing a NIP-07 compatible browser extension 
                  like Alby, nos2x, or Flamingo to avoid private key access entirely.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleDenyConsent}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel Signing
          </button>
          
          <button
            onClick={handleGrantConsent}
            disabled={!warningAcknowledged || !securityUnderstanding || !temporaryAccess || isProcessing}
            className="px-6 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Key className="h-4 w-4" />
                <span>Grant Temporary Access</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
