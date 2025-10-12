/**
 * Key Rotation Modal Component
 *
 * Provides secure interface for Nostr key rotation when keys are compromised.
 * Maintains NIP-05 and Lightning Address continuity while generating new keypair.
 */

import { AlertTriangle, CheckCircle, RefreshCw, X } from 'lucide-react';
import React, { useState } from 'react';
import { nostrKeyRecovery } from '../../lib/auth/nostr-key-recovery';
import IdentityForge from '../IdentityForge';
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
  // Identity Forge handles key display/backup; no in-modal key state needed.
  // Keeping placeholder state for potential future flows (not used currently).
  // const [newKeys, setNewKeys] = useState<{ npub: string; nsec: string } | null>(null);
  const [migrationSteps, setMigrationSteps] = useState<string[]>([]);
  // Identity Forge overlay state (must be declared before usage)
  const [showIdentityForge, setShowIdentityForge] = useState<boolean>(false);

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
      // Redirect to Identity Forge Step 2 for client-side keygen
      try { (window as any).__identityForgeRegFlow = true; } catch { }
      setShowIdentityForge(true);
      setRotationStep('keys');

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Key rotation failed');
      setRotationStep('setup');
    } finally {
      setIsProcessing(false);
    }
  };







  const cleanupRegFlag = () => { try { delete (window as any).__identityForgeRegFlow; } catch { } };

  const handleClose = () => {
    // Clear sensitive data
    setReason('');
    setError(null);
    setRotationStep('setup');
    setConfirmRotation(false);
    setConfirmBackup(false);
    setConfirmRisks(false);
    cleanupRegFlag();
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
        {(rotationStep === 'processing' || (rotationStep === 'keys' && showIdentityForge)) && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded mb-4">
            <p className="text-blue-700 text-sm">You'll be redirected to Identity Forge to generate your new keypair securely on your device.</p>
          </div>
        )}

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
                      placeholder="username@my.satnam.pub (Nostr identity)"
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
                    placeholder="username@my.satnam.pub (Bitcoin payments)"
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

          {rotationStep === 'keys' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-700 text-sm">
                  Generating your new keys in Identity Forge. You'll be returned here automatically when done.
                </p>
              </div>
              {!showIdentityForge && (
                <div className="text-gray-600 text-sm">Awaiting Identity Forge...</div>
              )}
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

      {/* Identity Forge Modal - rendered independently of rotation step */}
      {showIdentityForge && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-4xl shadow-2xl border border-white/10 overflow-hidden">
            <IdentityForge
              onComplete={() => { setShowIdentityForge(false); cleanupRegFlag(); }}
              onBack={() => { setShowIdentityForge(false); cleanupRegFlag(); }}
              rotationMode={{
                enabled: true,
                skipStep1: true,
                preserve: {
                  username: username.trim(),
                  nip05: nip05.trim(),
                  lightningAddress: lightningAddress.trim(),
                  bio: bio.trim() || undefined,
                  profilePicture: profilePicture.trim() || undefined,
                },
                onKeysReady: async (npub: string, nsecBech32: string) => {
                  try {
                    if (!rotationId || !auth.user?.id) {
                      setError('Missing rotation data or user authentication');
                      setShowIdentityForge(false);
                      setRotationStep('setup');
                      return;
                    }

                    // Correct flow: user already backed up keys in Identity Forge.
                    // Perform secure memory handling and complete rotation immediately.
                    const { SecureBuffer } = await import('../../lib/security/secure-buffer');
                    const { secureClearMemory } = await import('../../lib/privacy/encryption');

                    // Convert bech32 nsec string to bytes for secure handling
                    const enc = new TextEncoder();
                    const nsecBytes = enc.encode(nsecBech32);
                    let sec: any | null = null;
                    try {
                      sec = SecureBuffer.fromBytes(nsecBytes, true);
                      // Immediately clear the source nsecBytes
                      try { secureClearMemory([{ data: nsecBytes, type: 'uint8array' }] as any); } catch { nsecBytes.fill(0); }

                      // Complete rotation (db update) with provided keys
                      const result = await nostrKeyRecovery.completeKeyRotation(
                        rotationId,
                        auth.user.id,
                        { newNsecBech32: nsecBech32, newNpub: npub }
                      );

                      if (result.success) {
                        setShowIdentityForge(false);
                        setMigrationSteps(result.migrationSteps || []);
                        setRotationStep('completed');
                        if (onRotationComplete) onRotationComplete();
                      } else {
                        setShowIdentityForge(false);
                        setError(result.error || 'Rotation completion failed');
                        setRotationStep('setup');
                      }
                    } finally {
                      try { sec?.dispose(); } catch { }
                    }
                  } catch (e) {
                    setShowIdentityForge(false);
                    setError(e instanceof Error ? e.message : 'Rotation preparation failed');
                    setRotationStep('setup');
                  }
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
