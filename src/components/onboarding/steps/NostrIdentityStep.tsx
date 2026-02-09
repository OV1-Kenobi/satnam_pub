/**
 * NostrIdentityStep Component
 * @description Handles Nostr identity creation or migration for onboarding wizard
 *
 * Features:
 * - Detects new account vs migration flow based on intake data
 * - Generates new Nostr keypair for new accounts
 * - Handles migration flow for existing accounts
 * - Zero-knowledge nsec handling (ephemeral, Web Crypto API only)
 * - Encrypts nsec using password from PasswordSetupStep
 *
 * Security:
 * - Raw nsec is NEVER stored in state, localStorage, or sessionStorage
 * - nsec is encrypted immediately after generation using password
 * - Only encrypted_nsec is persisted to database
 * - Uses Web Crypto API for all cryptographic operations
 *
 * @module NostrIdentityStep
 */

import { AlertCircle, Key, Loader2, RefreshCw, UserCheck, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useOnboardingSession } from '../../../contexts/OnboardingSessionContext';
import { authenticatedFetch } from '../../../utils/secureSession';
import { createPRKFromNsec, type PRKEncryptionResult } from '../../../lib/auth/password-recovery-key';

// ============================================================================
// Types
// ============================================================================

interface NostrIdentityStepProps {
  /** Password from PasswordSetupStep for encrypting nsec */
  password: string;
  /** Callback when identity step is completed */
  onNext: () => void;
  /** Callback when user wants to go back */
  onBack?: () => void;
}

interface IdentityState {
  npub: string;
  nip05: string;
  encryptedNsec: string;
  /** PRK for password recovery via nsec */
  prkNsec?: PRKEncryptionResult;
}

interface FormErrors {
  generation?: string;
  general?: string;
}

// ============================================================================
// Helper: Encrypt nsec using Web Crypto API
// ============================================================================

/**
 * Encrypts a private key (nsec) using password-derived AES-GCM key
 * @security This is the ONLY place where raw nsec is handled
 * @param nsecHex - The nsec in hex format (32 bytes = 64 hex chars)
 * @param password - User password for key derivation
 * @returns Encrypted nsec in format: salt:iv:ciphertext (all hex)
 */
async function encryptNsecWithPassword(nsecHex: string, password: string): Promise<string> {
  const encoder = new TextEncoder();

  // Generate random salt for PBKDF2
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key from password
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // Generate random IV for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt nsec
  const dataBuffer = encoder.encode(nsecHex);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    dataBuffer
  );

  // Convert to hex strings
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const encryptedHex = Array.from(new Uint8Array(encryptedBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  return `${saltHex}:${ivHex}:${encryptedHex}`;
}

// ============================================================================
// Component
// ============================================================================

export const NostrIdentityStep: FC<NostrIdentityStepProps> = ({
  password,
  onNext,
  onBack,
}) => {
  const {
    currentParticipant,
    updateParticipant,
    completeStep,
    setError: setContextError,
  } = useOnboardingSession();

  // Determine if this is a migration flow
  const isMigrationFlow = currentParticipant?.existingNostrAccount || currentParticipant?.migrationFlag;

  // State
  const [identityState, setIdentityState] = useState<IdentityState | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ============================================================================
  // Keypair Generation (New Account Flow)
  // ============================================================================

  const generateNewIdentity = useCallback(async () => {
    if (!password) {
      setErrors({ generation: 'Password is required for identity creation' });
      return;
    }

    setIsGenerating(true);
    setErrors({});

    try {
      // Import browser-compatible keypair generator
      const { generateNostrKeyPair } = await import('../../../../utils/crypto-lazy');
      const keyPair = await generateNostrKeyPair();

      // Get the private key hex for encryption
      const nsecHex = keyPair.privateKey;

      // Immediately encrypt nsec with password (zero-knowledge handling)
      const encryptedNsec = await encryptNsecWithPassword(nsecHex, password);

      // Create Password Recovery Key (PRK) from nsec for password recovery
      // This encrypts the password using a key derived from the nsec
      // User can recover password later by providing their nsec
      const prkNsec = await createPRKFromNsec(password, keyPair.nsec);

      // Generate NIP-05 identifier (will be assigned by backend)
      // For now, use participant's true name as username base
      const usernameBase = currentParticipant?.trueName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 20) || 'user';
      const nip05 = `${usernameBase}@satnam.pub`;

      setIdentityState({
        npub: keyPair.npub,
        nip05: nip05,
        encryptedNsec: encryptedNsec,
        prkNsec: prkNsec,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate identity';
      setErrors({ generation: errorMessage });
      setContextError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  }, [password, currentParticipant?.trueName, setContextError]);

  // ============================================================================
  // Submit Handler
  // ============================================================================

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentParticipant) {
      setErrors({ general: 'No active participant' });
      return;
    }

    // For new account flow, require generated identity
    if (!isMigrationFlow && !identityState) {
      setErrors({ general: 'Please generate a new identity first' });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      if (isMigrationFlow) {
        // Migration flow: Mark step as completed, actual migration happens in later phase
        await updateParticipant(currentParticipant.participantId, {
          migrationFlag: true,
          currentStep: 'identity',
        });
      } else {
        // New account flow: Persist identity to backend with encrypted nsec and PRK
        const response = await authenticatedFetch('/.netlify/functions/onboarding-identity-create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            participantId: currentParticipant.participantId,
            npub: identityState!.npub,
            nip05: identityState!.nip05,
            encryptedNsec: identityState!.encryptedNsec,
            // Password Recovery Key (PRK) data for nsec-based password recovery
            prkNsec: identityState!.prkNsec,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to persist identity');
        }

        // Update context with identity data
        await updateParticipant(currentParticipant.participantId, {
          npub: identityState!.npub,
          nip05: identityState!.nip05,
          currentStep: 'identity',
        });
      }

      // Mark identity step as completed
      await completeStep('identity');

      // Advance to next step
      onNext();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete identity setup';
      setErrors({ general: errorMessage });
      setContextError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [currentParticipant, isMigrationFlow, identityState, updateParticipant, completeStep, onNext, setContextError]);

  // Auto-generate identity for new accounts if password is available
  useEffect(() => {
    if (!isMigrationFlow && password && !identityState && !isGenerating) {
      // Don't auto-generate, let user trigger it
    }
  }, [isMigrationFlow, password, identityState, isGenerating]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-purple-600/20 rounded-full">
          <Key className="h-6 w-6 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">
            {isMigrationFlow ? 'Import Existing Account' : 'Create Nostr Identity'}
          </h3>
          <p className="text-sm text-purple-200">
            {currentParticipant?.trueName
              ? `Identity for ${currentParticipant.trueName}`
              : isMigrationFlow
                ? 'We\'ll help migrate your existing Nostr identity'
                : 'Generate a new Nostr keypair for secure communication'}
          </p>
        </div>
      </div>

      {/* General Error Display */}
      {errors.general && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{errors.general}</p>
        </div>
      )}

      {/* Migration Flow */}
      {isMigrationFlow && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-500/20 border border-blue-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <UserCheck className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-white font-medium">Existing Account Detected</h4>
                <p className="text-sm text-blue-200 mt-1">
                  You indicated you have an existing Nostr account.
                  {currentParticipant?.oldNpub && (
                    <span className="block mt-2 font-mono text-xs bg-white/10 px-2 py-1 rounded">
                      {currentParticipant.oldNpub.substring(0, 20)}...
                    </span>
                  )}
                </p>
                <p className="text-sm text-blue-200 mt-2">
                  Your account migration will be completed in a later step using secure OTP verification.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Account Flow */}
      {!isMigrationFlow && (
        <div className="space-y-4">
          {/* Generation Error */}
          {errors.generation && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <p className="text-red-300 text-sm">{errors.generation}</p>
            </div>
          )}

          {/* Not Generated Yet */}
          {!identityState && (
            <div className="p-4 bg-purple-500/20 border border-purple-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <UserPlus className="h-5 w-5 text-purple-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-white font-medium">Generate New Identity</h4>
                  <p className="text-sm text-purple-200 mt-1">
                    Click the button below to generate a new Nostr keypair.
                    Your private key will be encrypted with your password.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={generateNewIdentity}
                disabled={isGenerating || !password}
                className="mt-4 w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Generating Keypair...
                  </>
                ) : (
                  <>
                    <Key className="h-5 w-5" />
                    Generate New Nostr Account
                  </>
                )}
              </button>
            </div>
          )}

          {/* Identity Generated */}
          {identityState && (
            <div className="space-y-4">
              <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
                <h4 className="text-green-400 font-medium flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  Identity Generated Successfully
                </h4>
              </div>

              {/* Display npub */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-purple-200">
                  Your Public Key (npub)
                </label>
                <div className="p-3 bg-white/10 border border-white/20 rounded-lg font-mono text-sm text-white break-all">
                  {identityState.npub}
                </div>
              </div>

              {/* Display NIP-05 */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-purple-200">
                  Your NIP-05 Identifier
                </label>
                <div className="p-3 bg-white/10 border border-white/20 rounded-lg font-mono text-sm text-white">
                  {identityState.nip05}
                </div>
              </div>

              {/* Regenerate Button */}
              <button
                type="button"
                onClick={generateNewIdentity}
                disabled={isGenerating || isSubmitting}
                className="text-sm text-purple-300 hover:text-purple-200 flex items-center gap-1"
              >
                <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                Regenerate (will create new keypair)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Security Notice */}
      <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <p className="text-xs text-yellow-200">
          <strong>Security Notice:</strong> Your private key (nsec) is encrypted with your password
          and will never be stored in plaintext. Only you can decrypt it with your password.
        </p>
      </div>

      {/* Navigation Buttons */}
      <div className="flex gap-3 pt-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting || isGenerating}
            className="px-4 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
          >
            Back
          </button>
        )}
        <button
          type="submit"
          disabled={(!isMigrationFlow && !identityState) || isSubmitting || isGenerating}
          className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving...
            </>
          ) : isMigrationFlow ? (
            'Continue to Migration'
          ) : (
            'Continue'
          )}
        </button>
      </div>
    </form>
  );
};

export default NostrIdentityStep;

