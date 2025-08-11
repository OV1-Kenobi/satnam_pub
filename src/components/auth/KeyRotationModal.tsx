/**
 * Key Rotation Modal Component
 * 
 * Provides secure interface for Nostr key rotation when keys are compromised.
 * Maintains NIP-05 and Lightning Address continuity while generating new keypair.
 */

import { AlertTriangle, CheckCircle, Copy, Download, Eye, EyeOff, RefreshCw, X } from 'lucide-react';
import React, { useState } from 'react';
import { nostrKeyRecovery } from '../../lib/auth/nostr-key-recovery';
import { useAuth } from './AuthProvider';

interface KeyRotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRotationComplete?: () => void;
}

export const KeyRotationModal: React.FC<KeyRotationModalProps> = ({
  isOpen,
  onClose,
  onRotationComplete
}) => {
  const auth = useAuth();

  // Form state
  const [reason, setReason] = useState('');
  const [username, setUsername] = useState('');
  const [nip05, setNip05] = useState('');
  const [lightningAddress, setLightningAddress] = useState('');
  const [bio, setBio] = useState('');
  const [profilePicture, setProfilePicture] = useState('');

  // Rotation state
  const [rotationStep, setRotationStep] = useState<'setup' | 'processing' | 'keys' | 'completed'>('setup');
  const [isProcessing, setIsProcessing] = useState(false);
  const [rotationId, setRotationId] = useState<string | null>(null);
  const [newKeys, setNewKeys] = useState<{ npub: string; nsec: string } | null>(null);
  const [showNsec, setShowNsec] = useState(false);
  const [migrationSteps, setMigrationSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Confirmation state
  const [confirmRotation, setConfirmRotation] = useState(false);
  const [confirmBackup, setConfirmBackup] = useState(false);
  const [confirmRisks, setConfirmRisks] = useState(false);

  if (!isOpen) return null;

  const handleInitiateRotation = async () => {
    if (!confirmRotation || !confirmBackup || !confirmRisks) {
      setError('Please confirm all requirements before proceeding');
      return;
    }

    if (!reason.trim() || !username.trim() || !nip05.trim() || !lightningAddress.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setError(null);
    setIsProcessing(true);
    setRotationStep('processing');

    try {
      if (!auth.user?.id) {
        setError('User not authenticated');
        setRotationStep('setup');
        return;
      }

      // Initiate key rotation
      const result = await nostrKeyRecovery.initiateKeyRotation(
        auth.user.id,
        reason.trim(),
        {
          nip05: nip05.trim(),
          lightningAddress: lightningAddress.trim(),
          username: username.trim(),
          bio: bio.trim() || undefined,
          profilePicture: profilePicture.trim() || undefined
        }
      );

      if (!result.success) {
        setError(result.error || 'Failed to initiate key rotation');
        setRotationStep('setup');
        return;
      }

      setRotationId(result.rotationId || null);
      setNewKeys(result.newKeys || null);
      setRotationStep('keys');

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Key rotation failed');
      setRotationStep('setup');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteRotation = async () => {
    if (!rotationId || !auth.user?.id) {
      setError('Missing rotation data');
      return;
    }

    setIsProcessing(true);

    try {
      const result = await nostrKeyRecovery.completeKeyRotation(
        rotationId,
        auth.user.id
      );

      if (result.success) {
        setMigrationSteps(result.migrationSteps || []);
        setRotationStep('completed');

        // Clear sensitive data
        setNewKeys(null);

        if (onRotationComplete) {
          onRotationComplete();
        }
      } else {
        setError(result.error || 'Failed to complete rotation');
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Rotation completion failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyNsec = async () => {
    if (newKeys?.nsec) {
      try {
        await navigator.clipboard.writeText(newKeys.nsec);
      } catch (error) {
        console.error('Failed to copy nsec:', error);
      }
    }
  };

  const handleDownloadKeys = () => {
    if (newKeys) {
      const keyData = `# Rotated Nostr Keys\n\nPublic Key (npub): ${newKeys.npub}\nPrivate Key (nsec): ${newKeys.nsec}\n\n# Identity Preservation\nNIP-05: ${nip05}\nLightning Address: ${lightningAddress}\nUsername: ${username}\n\n# SECURITY WARNING\nStore these keys securely and never share your nsec with anyone.`;

      const blob = new Blob([keyData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rotated-nostr-keys.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleClose = () => {
    // Clear sensitive data
    setNewKeys(null);
    setReason('');
    setError(null);
    setRotationStep('setup');
    setConfirmRotation(false);
    setConfirmBackup(false);
    setConfirmRisks(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-100 rounded-full">
              <RefreshCw className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Nostr Key Rotation
              </h2>
              <p className="text-sm text-gray-600">
                Generate new keys while preserving your identity
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {rotationStep === 'setup' && (
            <div className="space-y-6">
              {/* Warning */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-orange-800 mb-2">
                      Key Rotation Warning
                    </h3>
                    <div className="text-orange-700 text-sm space-y-1">
                      <p>• This will generate completely new Nostr keys</p>
                      <p>• Your old npub will be deprecated with migration notice</p>
                      <p>• NIP-05 and Lightning Address will remain the same</p>
                      <p>• You'll need to update other Nostr clients with new nsec</p>
                      <p>• This action cannot be easily undone</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Identity Preservation Form */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Identity Preservation</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username *
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Your display name"
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      NIP-05 Identifier *
                    </label>
                    <input
                      type="text"
                      value={nip05}
                      onChange={(e) => setNip05(e.target.value)}
                      placeholder="username@satnam.pub"
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lightning Address *
                  </label>
                  <input
                    type="text"
                    value={lightningAddress}
                    onChange={(e) => setLightningAddress(e.target.value)}
                    placeholder="username@satnam.pub"
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bio (Optional)
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Your profile bio"
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Profile Picture URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={profilePicture}
                    onChange={(e) => setProfilePicture(e.target.value)}
                    placeholder="https://example.com/profile.jpg"
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rotation Reason *
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain why you need to rotate your keys (e.g., suspected compromise, security upgrade, etc.)"
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Confirmation Checkboxes */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Required Confirmations</h3>

                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmRotation}
                    onChange={(e) => setConfirmRotation(e.target.checked)}
                    className="mt-1 h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">
                    I understand that this will generate completely new Nostr keys and
                    deprecate my current npub with a migration notice.
                  </span>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmBackup}
                    onChange={(e) => setConfirmBackup(e.target.checked)}
                    className="mt-1 h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">
                    I will securely backup my new nsec immediately and update
                    all my Nostr clients with the new private key.
                  </span>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmRisks}
                    onChange={(e) => setConfirmRisks(e.target.checked)}
                    className="mt-1 h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">
                    I acknowledge the risks and understand that my NIP-05 and Lightning
                    Address will remain the same to preserve social network continuity.
                  </span>
                </label>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleInitiateRotation}
                disabled={isProcessing || !confirmRotation || !confirmBackup || !confirmRisks ||
                  !reason.trim() || !username.trim() || !nip05.trim() || !lightningAddress.trim()}
                className="w-full bg-orange-600 text-white py-3 px-4 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Generating New Keys...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    <span>Rotate Keys</span>
                  </>
                )}
              </button>
            </div>
          )}

          {rotationStep === 'processing' && (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-orange-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Generating New Keys
              </h3>
              <p className="text-gray-600">
                Creating cryptographically secure new keypair...
              </p>
            </div>
          )}

          {rotationStep === 'keys' && newKeys && (
            <div className="space-y-6">
              {/* New Keys Display */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-green-800 mb-2">
                      New Keys Generated
                    </h3>
                    <p className="text-green-700 text-sm">
                      Your new Nostr keypair has been generated. Please backup these keys securely.
                    </p>
                  </div>
                </div>
              </div>

              {/* New Public Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Public Key (npub)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newKeys.npub}
                    readOnly
                    className="w-full p-3 pr-10 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(newKeys.npub)}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* New Private Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Private Key (nsec) - BACKUP SECURELY
                </label>
                <div className="relative">
                  <textarea
                    value={newKeys.nsec}
                    readOnly
                    rows={3}
                    className={`w-full p-3 pr-20 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm ${showNsec ? 'text-gray-900' : 'text-transparent bg-gray-200'
                      }`}
                    style={showNsec ? {} : { textShadow: '0 0 8px rgba(0,0,0,0.5)' }}
                  />
                  <div className="absolute right-2 top-2 flex flex-col space-y-1">
                    <button
                      onClick={() => setShowNsec(!showNsec)}
                      className="p-1 text-gray-400 hover:text-gray-600 bg-white rounded border"
                    >
                      {showNsec ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={handleCopyNsec}
                      className="p-1 text-gray-400 hover:text-gray-600 bg-white rounded border"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleDownloadKeys}
                      className="p-1 text-gray-400 hover:text-gray-600 bg-white rounded border"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Identity Continuity Notice */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800 mb-2">Identity Continuity</h3>
                <div className="text-blue-700 text-sm space-y-1">
                  <p>• NIP-05: {nip05} (unchanged)</p>
                  <p>• Lightning Address: {lightningAddress} (unchanged)</p>
                  <p>• Username: {username} (preserved)</p>
                  <p>• Your social network can still find and pay you</p>
                </div>
              </div>

              {/* Complete Rotation Button */}
              <button
                onClick={handleCompleteRotation}
                disabled={isProcessing}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Completing Rotation...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>Complete Key Rotation</span>
                  </>
                )}
              </button>
            </div>
          )}

          {rotationStep === 'completed' && (
            <div className="space-y-6">
              {/* Success Notice */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-green-800 mb-2">
                      Key Rotation Completed Successfully
                    </h3>
                    <p className="text-green-700 text-sm">
                      Your Nostr keys have been rotated and your identity preserved.
                    </p>
                  </div>
                </div>
              </div>

              {/* Migration Steps */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Migration Steps Completed</h3>
                <div className="space-y-2">
                  {migrationSteps.map((step, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <span className="text-sm font-mono">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Next Steps */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800 mb-2">Next Steps</h3>
                <ul className="text-blue-700 text-sm space-y-1">
                  <li>• Update your browser extension with the new nsec</li>
                  <li>• Import new nsec into other Nostr clients</li>
                  <li>• Verify your NIP-05 resolves to the new npub</li>
                  <li>• Test Lightning payments to your address</li>
                  <li>• Notify close contacts about the key rotation</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {rotationStep === 'completed' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};
