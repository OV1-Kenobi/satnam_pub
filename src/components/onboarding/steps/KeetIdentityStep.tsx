/**
 * KeetIdentityStep Component
 * 
 * Generates and securely handles 24-word BIP39 seed for Keet P2P messaging.
 * This seed also serves as the foundation for future Silent Payments integration.
 * 
 * Security Features:
 * - Zero-knowledge ephemeral display (5-minute timer)
 * - AES-256-GCM encryption with PBKDF2 key derivation
 * - Automatic memory cleanup
 * - Follows same patterns as nsec handling in IdentityForge.tsx
 * 
 * @module KeetIdentityStep
 * @phase Phase 8: Keet P2P Identity
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Key, Copy, Check, AlertTriangle, Clock, Shield } from 'lucide-react';
import { useOnboardingSession } from '../../../contexts/OnboardingSessionContext';
import {
  generateKeetSeedPhrase,
  deriveKeetPeerIdFromSeed,
  encryptKeetSeed,
  secureClearMemory,
} from '../../../lib/onboarding/keet-seed-manager';
import { createPRKFromKeetSeed } from '../../../lib/auth/password-recovery-key';
import { authenticatedFetch } from '../../../utils/secureSession';

interface KeetIdentityStepProps {
  /** Password from PasswordSetupStep for encrypting Keet seed */
  password: string;
  /** Callback when Keet identity step is completed */
  onNext: () => void;
  /** Callback when user wants to go back */
  onBack: () => void;
}

const KeetIdentityStep: React.FC<KeetIdentityStepProps> = ({ password, onNext, onBack }) => {
  const { currentParticipant, updateParticipant } = useOnboardingSession();

  // Ephemeral seed state (zero-knowledge handling)
  const [ephemeralSeed, setEphemeralSeed] = useState<string | null>(null);
  const [keetPeerId, setKeetPeerId] = useState<string | null>(null);
  const [seedDisplayed, setSeedDisplayed] = useState(false);
  const [seedSecured, setSeedSecured] = useState(false);
  const [seedBackedUp, setSeedBackedUp] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Timer refs to prevent race conditions
  const timerStateRef = useRef<{
    cleanupTimer: NodeJS.Timeout | null;
    countdown: NodeJS.Timeout | null;
  }>({ cleanupTimer: null, countdown: null });

  // Secure memory cleanup utility
  const secureMemoryCleanup = useCallback((sensitiveString: string | null) => {
    if (!sensitiveString) return;
    secureClearMemory(sensitiveString);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear timers
      if (timerStateRef.current.cleanupTimer) {
        clearTimeout(timerStateRef.current.cleanupTimer);
      }
      if (timerStateRef.current.countdown) {
        clearInterval(timerStateRef.current.countdown);
      }
      // Secure cleanup of ephemeral seed
      if (ephemeralSeed) {
        secureMemoryCleanup(ephemeralSeed);
      }
    };
  }, [ephemeralSeed, secureMemoryCleanup]);

  // Auto-cleanup timer (5 minutes)
  useEffect(() => {
    if (ephemeralSeed && seedDisplayed && !seedSecured && !timerStateRef.current.cleanupTimer) {
      // Set initial countdown time (5 minutes = 300 seconds)
      setTimeRemaining(300);

      // Main cleanup timer (5 minutes)
      const cleanupTimer = setTimeout(() => {
        // Auto-clear seed after 5 minutes for security
        secureMemoryCleanup(ephemeralSeed);
        setEphemeralSeed(null);
        setSeedDisplayed(false);
        setTimeRemaining(0);
        timerStateRef.current.cleanupTimer = null;
        timerStateRef.current.countdown = null;
      }, 300000); // 5 minutes = 300,000 milliseconds

      // Countdown timer (updates every second)
      const countdown = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(countdown);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Store timers in ref
      timerStateRef.current.cleanupTimer = cleanupTimer;
      timerStateRef.current.countdown = countdown;

      return () => {
        if (timerStateRef.current.cleanupTimer) {
          clearTimeout(timerStateRef.current.cleanupTimer);
        }
        if (timerStateRef.current.countdown) {
          clearInterval(timerStateRef.current.countdown);
        }
      };
    }
  }, [ephemeralSeed, seedDisplayed, seedSecured, secureMemoryCleanup]);

  // Timer cleanup when seed is secured
  useEffect(() => {
    if (seedSecured && (timerStateRef.current.cleanupTimer || timerStateRef.current.countdown)) {
      if (timerStateRef.current.countdown) {
        clearInterval(timerStateRef.current.countdown);
        timerStateRef.current.countdown = null;
      }
      if (timerStateRef.current.cleanupTimer) {
        clearTimeout(timerStateRef.current.cleanupTimer);
        timerStateRef.current.cleanupTimer = null;
      }
      setTimeRemaining(0);
    }
  }, [seedSecured]);

  // Generate Keet seed
  const handleGenerateSeed = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      // Generate 24-word BIP39 seed
      const seedPhrase = generateKeetSeedPhrase();

      // Derive Keet Peer ID from seed
      const peerId = await deriveKeetPeerIdFromSeed(seedPhrase);

      // Store in ephemeral state
      setEphemeralSeed(seedPhrase);
      setKeetPeerId(peerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate Keet seed');
    } finally {
      setIsGenerating(false);
    }
  };

  // Show seed temporarily (starts 5-minute timer)
  const showSeedTemporarily = () => {
    if (!ephemeralSeed || seedDisplayed) return;
    setSeedDisplayed(true);
  };

  // Copy seed to clipboard
  const copySeedToClipboard = async () => {
    if (!ephemeralSeed || !seedDisplayed) return;

    try {
      await navigator.clipboard.writeText(ephemeralSeed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  // Secure seed (encrypt and store)
  const handleSecureSeed = async () => {
    if (!ephemeralSeed) {
      setError('No seed phrase generated');
      return;
    }

    if (!password) {
      setError('Password is required for encryption');
      return;
    }

    if (!currentParticipant) {
      setError('No active participant');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Encrypt seed with user's password
      // Note: encryptKeetSeed generates its own unique salt for PBKDF2
      const { encryptedSeed, seedSalt } = await encryptKeetSeed(
        ephemeralSeed,
        password
      );

      // Create Password Recovery Key (PRK) from Keet seed for password recovery
      // This encrypts the password using a key derived from the Keet seed
      // User can recover password later by providing their 24-word seed
      const prkKeet = await createPRKFromKeetSeed(password, ephemeralSeed);

      // Persist Keet identity to backend with encrypted seed and PRK
      const response = await authenticatedFetch('/.netlify/functions/onboarding-keet-identity-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          participantId: currentParticipant.participantId,
          keetPeerId,
          encryptedKeetSeed: encryptedSeed,
          keetSeedSalt: seedSalt,
          // Password Recovery Key (PRK) data for Keet seed-based password recovery
          prkKeet,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to persist Keet identity');
      }

      // Update local participant state
      await updateParticipant(currentParticipant.participantId, {
        keet_peer_id: keetPeerId || undefined,
        encrypted_keet_seed: encryptedSeed,
        keet_seed_salt: seedSalt,
        prkKeet,
        currentStep: 'keet',
      });

      // Clear ephemeral seed from memory
      secureMemoryCleanup(ephemeralSeed);
      setEphemeralSeed(null);
      setSeedSecured(true);

      // Clear timers
      if (timerStateRef.current.cleanupTimer) {
        clearTimeout(timerStateRef.current.cleanupTimer);
        timerStateRef.current.cleanupTimer = null;
      }
      if (timerStateRef.current.countdown) {
        clearInterval(timerStateRef.current.countdown);
        timerStateRef.current.countdown = null;
      }
      setTimeRemaining(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to secure seed');
    } finally {
      setIsGenerating(false);
    }
  };

  // Continue to next step
  const handleContinue = () => {
    if (!seedBackedUp) {
      setError('Please confirm you have backed up your seed phrase');
      return;
    }
    if (!seedSecured) {
      setError('Please secure your seed before continuing');
      return;
    }
    onNext();
  };

  // Format seed words into grid
  const formatSeedWords = (seed: string): string[] => {
    return seed.split(' ');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-gradient-to-br from-purple-500/20 to-orange-500/20 rounded-full">
            <Key className="w-12 h-12 text-purple-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Keet P2P Identity
        </h2>
        <p className="text-gray-400">
          Generate your 24-word seed for secure peer-to-peer messaging
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-200 text-sm font-semibold">Error</p>
            <p className="text-red-300 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Initial State: Generate Button */}
      {!ephemeralSeed && !seedSecured && (
        <div className="space-y-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <div className="flex items-start gap-3 mb-4">
              <Shield className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-white font-semibold mb-2">
                  What is a Keet Seed?
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Your 24-word seed is the master key to your Keet P2P identity. It enables
                  secure messaging and will also support Bitcoin Silent Payments in the future.
                  <span className="text-yellow-400 font-semibold"> Write it down and keep it safe!</span>
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerateSeed}
            disabled={isGenerating}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                Generating...
              </>
            ) : (
              <>
                <Key className="w-5 h-5" />
                Generate Keet Identity
              </>
            )}
          </button>
        </div>
      )}

      {/* Seed Generated: Show Peer ID and Display Button */}
      {ephemeralSeed && !seedDisplayed && !seedSecured && (
        <div className="space-y-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-2">Keet Peer ID:</p>
            <p className="text-white font-mono text-xs break-all bg-gray-900/50 p-3 rounded">
              {keetPeerId}
            </p>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-200 text-sm font-semibold mb-1">
                  Security Warning
                </p>
                <p className="text-yellow-300 text-sm">
                  Your seed phrase will be displayed for 5 minutes only. Make sure you're in a
                  private location and ready to write it down.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={showSeedTemporarily}
            className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            <Key className="w-5 h-5" />
            Show Seed Phrase
          </button>
        </div>
      )}

      {/* Seed Displayed: Show Words, Timer, and Backup Confirmation */}
      {ephemeralSeed && seedDisplayed && !seedSecured && (
        <div className="space-y-4">
          {/* Countdown Timer */}
          {timeRemaining > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-400" />
                  <p className="text-yellow-200 text-sm font-semibold">
                    Auto-clear in: {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Seed Words Grid */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-400 text-sm font-semibold">
                Your 24-Word Seed Phrase
              </p>
              <button
                onClick={copySeedToClipboard}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {formatSeedWords(ephemeralSeed).map((word, index) => (
                <div
                  key={index}
                  className="bg-gray-900/50 border border-gray-700 rounded p-2 flex items-center gap-2"
                >
                  <span className="text-gray-500 text-xs font-mono w-6">
                    {index + 1}.
                  </span>
                  <span className="text-white font-mono text-sm">
                    {word}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Backup Confirmation */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={seedBackedUp}
                onChange={(e) => setSeedBackedUp(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-900"
              />
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">
                  I have written down my 24-word seed phrase
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  This seed cannot be recovered if lost. Make sure you've stored it safely.
                </p>
              </div>
            </label>
          </div>

          {/* Secure Seed Button */}
          <button
            onClick={handleSecureSeed}
            disabled={!seedBackedUp || isGenerating}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                Securing...
              </>
            ) : (
              <>
                <Shield className="w-5 h-5" />
                Secure Seed
              </>
            )}
          </button>
        </div>
      )}

      {/* Seed Secured: Success Message and Continue */}
      {seedSecured && (
        <div className="space-y-4">
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-500/20 rounded-full">
                <Check className="w-6 h-6 text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-green-200 font-semibold mb-2">
                  Keet Identity Secured!
                </h3>
                <p className="text-green-300 text-sm leading-relaxed">
                  Your 24-word seed has been encrypted and stored securely. You can now use
                  Keet P2P messaging, and this seed will also enable Bitcoin Silent Payments
                  in the future.
                </p>
              </div>
            </div>
          </div>

          {keetPeerId && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Your Keet Peer ID:</p>
              <p className="text-white font-mono text-xs break-all bg-gray-900/50 p-3 rounded">
                {keetPeerId}
              </p>
            </div>
          )}

          <button
            onClick={handleContinue}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700 text-white font-semibold rounded-lg transition-all duration-200"
          >
            Continue
          </button>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex gap-3 pt-4 border-t border-gray-700">
        <button
          onClick={onBack}
          className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
};

export default KeetIdentityStep;


