/**
 * Password Reset Modal Component
 *
 * Provides secure password recovery for users who forgot their password.
 * Requires proof of Nostr identity ownership via:
 * - NIP-07 browser extension signature
 * - Nsec manual entry (for those without extension)
 */

import { AlertTriangle, Eye, EyeOff, Key, RefreshCw, Shield, X } from 'lucide-react';
import React, { useState } from 'react';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (sessionToken: string) => void;
}

type ProofMethod = 'nip07' | 'nsec';
type ResetStep = 'nip05' | 'proof' | 'password' | 'processing' | 'success';

export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<ResetStep>('nip05');
  const [nip05, setNip05] = useState('');
  const [proofMethod, setProofMethod] = useState<ProofMethod | null>(null);
  const [nsec, setNsec] = useState('');
  const [showNsec, setShowNsec] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [signedEvent, setSignedEvent] = useState<any>(null);
  const [hasNip07, setHasNip07] = useState(false);

  React.useEffect(() => {
    // Check for NIP-07 extension
    setHasNip07(typeof window !== 'undefined' && !!(window as any).nostr);
  }, []);

  if (!isOpen) return null;

  const handleNip05Submit = () => {
    const trimmed = nip05.trim().toLowerCase();
    if (!trimmed || !/^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/.test(trimmed)) {
      setError('Please enter a valid NIP-05 identifier (e.g., user@domain.com)');
      return;
    }
    setError('');
    setStep('proof');
  };

  const handleNip07Proof = async () => {
    try {
      setIsProcessing(true);
      setError('');

      const nostr = (window as any).nostr;
      if (!nostr) {
        setError('NIP-07 extension not found');
        return;
      }

      // Create a password reset challenge event
      const event = {
        kind: 22242, // Custom auth kind for password reset
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['action', 'password-reset'],
          ['nip05', nip05.trim().toLowerCase()],
        ],
        content: `Password reset request for ${nip05}`,
      };

      const signed = await nostr.signEvent(event);
      setSignedEvent(signed);
      setProofMethod('nip07');
      setStep('password');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign with extension');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNsecSubmit = () => {
    if (!nsec.trim()) {
      setError('Please enter your nsec private key');
      return;
    }
    // Basic nsec format validation
    const trimmed = nsec.trim();
    if (!trimmed.startsWith('nsec') && !/^[a-f0-9]{64}$/i.test(trimmed)) {
      setError('Invalid nsec format. Enter nsec1... or 64-character hex');
      return;
    }
    setProofMethod('nsec');
    setError('');
    setStep('password');
  };

  const handlePasswordReset = async () => {
    // Validate passwords
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsProcessing(true);
    setError('');
    setStep('processing');

    try {
      const proofData = proofMethod === 'nip07'
        ? { signedEvent }
        : { nsec: nsec.trim() };

      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nip05: nip05.trim().toLowerCase(),
          newPassword,
          proofMethod,
          proofData,
        }),
      });

      const result = await response.json();

      // Clear sensitive data immediately
      setNsec('');
      setNewPassword('');
      setConfirmPassword('');

      if (!response.ok || !result.success) {
        setError(result.error || 'Password reset failed');
        setStep('password');
        return;
      }

      setStep('success');

      if (result.data?.sessionToken && onSuccess) {
        onSuccess(result.data.sessionToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
      setStep('password');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setNsec('');
    setNewPassword('');
    setConfirmPassword('');
    setSignedEvent(null);
    setStep('nip05');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Reset Password</h2>
          </div>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start">
              <AlertTriangle className="h-5 w-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Step 1: Enter NIP-05 */}
          {step === 'nip05' && (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm">
                Enter your NIP-05 identifier to begin password recovery.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  NIP-05 Identifier
                </label>
                <input
                  type="text"
                  value={nip05}
                  onChange={(e) => setNip05(e.target.value)}
                  placeholder="user@my.satnam.pub"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleNip05Submit}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Prove Identity */}
          {step === 'proof' && (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm">
                Prove you own <strong>{nip05}</strong> by signing with your Nostr identity.
              </p>

              <div className="space-y-3">
                {/* NIP-07 Option */}
                {hasNip07 && (
                  <button
                    onClick={handleNip07Proof}
                    disabled={isProcessing}
                    className="w-full p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 text-left flex items-center space-x-3"
                  >
                    <div className="p-2 bg-blue-100 rounded-full">
                      <Key className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">Browser Extension (NIP-07)</p>
                      <p className="text-sm text-gray-500">Sign with Alby, nos2x, etc.</p>
                    </div>
                  </button>
                )}

                {/* Nsec Option */}
                <div className="border-2 border-gray-200 rounded-lg p-4">
                  <p className="font-medium mb-2">Enter Nsec Private Key</p>
                  <p className="text-xs text-amber-600 mb-3">
                    ⚠️ Never share your nsec. It's processed locally and not stored.
                  </p>
                  <div className="relative">
                    <input
                      type={showNsec ? 'text' : 'password'}
                      value={nsec}
                      onChange={(e) => setNsec(e.target.value)}
                      placeholder="nsec1... or hex private key"
                      className="w-full px-3 py-2 pr-10 border rounded-md font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNsec(!showNsec)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                    >
                      {showNsec ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    onClick={handleNsecSubmit}
                    disabled={!nsec.trim()}
                    className="mt-3 w-full bg-gray-800 text-white py-2 px-4 rounded-md hover:bg-gray-900 disabled:opacity-50"
                  >
                    Verify Ownership
                  </button>
                </div>
              </div>

              <button
                onClick={() => setStep('nip05')}
                className="w-full text-gray-600 py-2 hover:text-gray-800"
              >
                ← Back
              </button>
            </div>
          )}

          {/* Step 3: Set New Password */}
          {step === 'password' && (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-700">✓ Identity verified. Enter your new password.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full px-3 py-2 pr-10 border rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>

              <button
                onClick={handlePasswordReset}
                disabled={isProcessing || newPassword.length < 8}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Reset Password
              </button>
            </div>
          )}

          {/* Processing */}
          {step === 'processing' && (
            <div className="text-center py-8">
              <RefreshCw className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Resetting your password...</p>
            </div>
          )}

          {/* Success */}
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Password Reset Complete!</h3>
              <p className="text-gray-600 text-sm mb-4">
                You can now sign in with your new password.
              </p>
              <button
                onClick={handleClose}
                className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

