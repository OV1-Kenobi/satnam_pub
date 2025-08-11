/**
 * Nsec Recovery Modal Component
 * 
 * Provides secure interface for Nostr key recovery for both Family Federation
 * and Private Individual users when they are logged out.
 */

import React, { useState } from 'react';
import { AlertTriangle, Key, Shield, Copy, Download, Eye, EyeOff, X, RefreshCw } from 'lucide-react';
import { FederationRole } from '../../types/auth';
import { nostrKeyRecovery, RecoveryMethod } from '../../lib/auth/nostr-key-recovery';

interface NsecRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: FederationRole;
}

export const NsecRecoveryModal: React.FC<NsecRecoveryModalProps> = ({
  isOpen,
  onClose,
  userRole = 'private'
}) => {
  // Form state
  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod>('nip05-password');
  const [nip05, setNip05] = useState('');
  const [npub, setNpub] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Recovery state
  const [isProcessing, setIsProcessing] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<'credentials' | 'processing' | 'result'>('credentials');
  const [recoveredNsec, setRecoveredNsec] = useState<string | null>(null);
  const [showNsec, setShowNsec] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRecoverySubmit = async () => {
    setError(null);
    setIsProcessing(true);
    setRecoveryStep('processing');

    try {
      // Validate credentials
      if (recoveryMethod === 'nip05-password') {
        if (!nip05.trim() || !password.trim()) {
          setError('Please provide both NIP-05 and password');
          setRecoveryStep('credentials');
          return;
        }
      } else if (recoveryMethod === 'nip07-password') {
        if (!npub.trim() || !password.trim()) {
          setError('Please provide both npub and password');
          setRecoveryStep('credentials');
          return;
        }
      }

      // Initiate recovery
      const credentials = recoveryMethod === 'nip05-password' 
        ? { nip05: nip05.trim(), password }
        : { npub: npub.trim(), password };

      const initiateResult = await nostrKeyRecovery.initiateNsecRecovery(
        credentials,
        userRole
      );

      if (!initiateResult.success) {
        setError(initiateResult.error || 'Failed to initiate recovery');
        setRecoveryStep('credentials');
        return;
      }

      setRequestId(initiateResult.requestId || null);

      // For family federation users, show consensus requirement
      if (initiateResult.requiresConsensus) {
        setError('Family federation recovery requires guardian consensus. Please contact your guardians.');
        setRecoveryStep('credentials');
        return;
      }

      // For private users, process recovery immediately
      if (initiateResult.requestId) {
        const recoveryResult = await nostrKeyRecovery.processPrivateUserRecovery(
          initiateResult.requestId
        );

        if (recoveryResult.success && recoveryResult.nsec) {
          setRecoveredNsec(recoveryResult.nsec);
          setRecoveryStep('result');
        } else {
          setError(recoveryResult.error || 'Recovery failed');
          setRecoveryStep('credentials');
        }
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Recovery failed');
      setRecoveryStep('credentials');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyNsec = async () => {
    if (recoveredNsec) {
      try {
        await navigator.clipboard.writeText(recoveredNsec);
        // Could add a toast notification here
      } catch (error) {
        console.error('Failed to copy nsec:', error);
      }
    }
  };

  const handleDownloadNsec = () => {
    if (recoveredNsec) {
      const blob = new Blob([recoveredNsec], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recovered-nsec.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleClose = () => {
    // Clear sensitive data before closing
    setRecoveredNsec(null);
    setPassword('');
    setNpub('');
    setNip05('');
    setError(null);
    setRecoveryStep('credentials');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-full">
              <Key className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Nostr Key Recovery
              </h2>
              <p className="text-sm text-gray-600">
                Recover your encrypted private key (nsec)
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
          {recoveryStep === 'credentials' && (
            <div className="space-y-6">
              {/* Security Notice */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-orange-800 mb-2">
                      Security Notice
                    </h3>
                    <div className="text-orange-700 text-sm space-y-1">
                      <p>• Recovery only available when you are logged out</p>
                      <p>• Requires same credentials used for signin</p>
                      <p>• Your nsec will be decrypted and displayed securely</p>
                      <p>• All recovery attempts are logged for security</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recovery Method Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Recovery Method
                </label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3">
                    <input
                      type="radio"
                      name="recoveryMethod"
                      value="nip05-password"
                      checked={recoveryMethod === 'nip05-password'}
                      onChange={(e) => setRecoveryMethod(e.target.value as RecoveryMethod)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">NIP-05 + Password</span>
                      <p className="text-xs text-gray-500">Use your username@satnam.pub and password</p>
                    </div>
                  </label>
                  
                  <label className="flex items-center space-x-3">
                    <input
                      type="radio"
                      name="recoveryMethod"
                      value="nip07-password"
                      checked={recoveryMethod === 'nip07-password'}
                      onChange={(e) => setRecoveryMethod(e.target.value as RecoveryMethod)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">Npub + Password</span>
                      <p className="text-xs text-gray-500">Use your public key and password</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Credentials Form */}
              <div className="space-y-4">
                {recoveryMethod === 'nip05-password' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      NIP-05 Identifier
                    </label>
                    <input
                      type="text"
                      value={nip05}
                      onChange={(e) => setNip05(e.target.value)}
                      placeholder="username@satnam.pub"
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Public Key (npub)
                    </label>
                    <input
                      type="text"
                      value={npub}
                      onChange={(e) => setNpub(e.target.value)}
                      placeholder="npub1..."
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full p-3 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
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
                onClick={handleRecoverySubmit}
                disabled={isProcessing || !password.trim() || 
                  (recoveryMethod === 'nip05-password' && !nip05.trim()) ||
                  (recoveryMethod === 'nip07-password' && !npub.trim())}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Processing Recovery...</span>
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4" />
                    <span>Recover Nsec</span>
                  </>
                )}
              </button>
            </div>
          )}

          {recoveryStep === 'processing' && (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Processing Recovery Request
              </h3>
              <p className="text-gray-600">
                Authenticating credentials and retrieving encrypted nsec...
              </p>
            </div>
          )}

          {recoveryStep === 'result' && recoveredNsec && (
            <div className="space-y-6">
              {/* Success Notice */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Shield className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-green-800 mb-2">
                      Recovery Successful
                    </h3>
                    <p className="text-green-700 text-sm">
                      Your encrypted nsec has been successfully recovered and decrypted.
                    </p>
                  </div>
                </div>
              </div>

              {/* Nsec Display */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recovered Private Key (nsec)
                </label>
                <div className="relative">
                  <textarea
                    value={recoveredNsec}
                    readOnly
                    rows={3}
                    className={`w-full p-3 pr-20 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm ${
                      showNsec ? 'text-gray-900' : 'text-transparent bg-gray-200'
                    }`}
                    style={showNsec ? {} : { textShadow: '0 0 8px rgba(0,0,0,0.5)' }}
                  />
                  <div className="absolute right-2 top-2 flex flex-col space-y-1">
                    <button
                      onClick={() => setShowNsec(!showNsec)}
                      className="p-1 text-gray-400 hover:text-gray-600 bg-white rounded border"
                      title={showNsec ? 'Hide nsec' : 'Show nsec'}
                    >
                      {showNsec ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={handleCopyNsec}
                      className="p-1 text-gray-400 hover:text-gray-600 bg-white rounded border"
                      title="Copy nsec"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleDownloadNsec}
                      className="p-1 text-gray-400 hover:text-gray-600 bg-white rounded border"
                      title="Download nsec"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Security Warnings */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-800 mb-2">
                      Critical Security Warnings
                    </h3>
                    <ul className="text-red-700 text-sm space-y-1">
                      <li>• Store this nsec in a secure password manager immediately</li>
                      <li>• Never share your nsec with anyone</li>
                      <li>• Clear this screen after saving your nsec</li>
                      <li>• Consider key rotation if you suspect compromise</li>
                      <li>• This nsec will be cleared from memory when you close this modal</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Next Steps */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800 mb-2">Next Steps</h3>
                <ul className="text-blue-700 text-sm space-y-1">
                  <li>• Import this nsec into your preferred Nostr client</li>
                  <li>• Update your browser extension with this nsec</li>
                  <li>• Test signing in with your recovered credentials</li>
                  <li>• Consider enabling additional security measures</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          {recoveryStep === 'result' ? (
            <div className="flex space-x-3 w-full">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close & Clear Memory
              </button>
            </div>
          ) : (
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
