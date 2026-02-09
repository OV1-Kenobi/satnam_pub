/**
 * OnboardingBackupStep Component
 * 
 * Displays all three secrets (nsec, Keet seed, password) for backup during onboarding.
 * Follows zero-knowledge security patterns from KeetIdentityStep.
 * 
 * Security Features:
 * - Ephemeral display only (5-minute timer)
 * - Automatic memory cleanup
 * - No plaintext storage to disk/logs
 * - Secure memory wiping on unmount
 * 
 * @module OnboardingBackupStep
 * @phase Phase 9: Backup & Security
 */

import { AlertTriangle, Check, Clock, Copy, Download, Key, Shield } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useOnboardingSession } from '../../../contexts/OnboardingSessionContext';
import { decryptKeetSeed, secureClearMemory as secureClearKeetSeed } from '../../../lib/onboarding/keet-seed-manager';
import { decryptNsecWithPassword, secureClearMemory } from '../../../lib/onboarding/nsec-decryption';

// ============================================================================
// Types
// ============================================================================

interface OnboardingBackupStepProps {
  password: string;
  onNext: () => void;
  onBack: () => void;
}

type SecretType = 'nsec' | 'keet_seed' | 'password';

// ============================================================================
// Component
// ============================================================================

export const OnboardingBackupStep: FC<OnboardingBackupStepProps> = ({
  password,
  onNext,
  onBack,
}) => {
  const { currentParticipant } = useOnboardingSession();

  // Ephemeral secret state (zero-knowledge handling)
  const [ephemeralNsec, setEphemeralNsec] = useState<string | null>(null);
  const [ephemeralKeetSeed, setEphemeralKeetSeed] = useState<string | null>(null);
  const [ephemeralPassword] = useState<string>(password); // Password from props

  const [secretsDisplayed, setSecretsDisplayed] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Copy state for each secret
  const [copiedNsec, setCopiedNsec] = useState(false);
  const [copiedKeetSeed, setCopiedKeetSeed] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Timer refs to prevent race conditions
  const timerStateRef = useRef<{
    cleanupTimer: NodeJS.Timeout | null;
    countdown: NodeJS.Timeout | null;
  }>({ cleanupTimer: null, countdown: null });

  // Secure memory cleanup utility
  const secureMemoryCleanup = useCallback(() => {
    if (ephemeralNsec) {
      secureClearMemory(ephemeralNsec);
    }
    if (ephemeralKeetSeed) {
      secureClearKeetSeed(ephemeralKeetSeed);
    }
    if (ephemeralPassword) {
      secureClearMemory(ephemeralPassword);
    }
  }, [ephemeralNsec, ephemeralKeetSeed, ephemeralPassword]);

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
      // Secure cleanup of ephemeral secrets
      secureMemoryCleanup();
    };
  }, [secureMemoryCleanup]);

  // Auto-cleanup timer (5 minutes)
  useEffect(() => {
    if (secretsDisplayed && !backupConfirmed && !timerStateRef.current.cleanupTimer) {
      // Set initial countdown time (5 minutes = 300 seconds)
      setTimeRemaining(300);

      // Main cleanup timer (5 minutes)
      const cleanupTimer = setTimeout(() => {
        // Auto-clear secrets after 5 minutes for security
        secureMemoryCleanup();
        setEphemeralNsec(null);
        setEphemeralKeetSeed(null);
        setSecretsDisplayed(false);
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

      timerStateRef.current.cleanupTimer = cleanupTimer;
      timerStateRef.current.countdown = countdown;
    }
  }, [secretsDisplayed, backupConfirmed, secureMemoryCleanup]);

  // Decrypt secrets and display
  const handleShowSecrets = async () => {
    if (!currentParticipant) {
      setError('No active participant');
      return;
    }

    if (!password) {
      setError('Password is required for decryption');
      return;
    }

    setIsDecrypting(true);
    setError(null);

    try {
      // Decrypt nsec (if available)
      let decryptedNsec: string | null = null;
      if (currentParticipant.encrypted_nsec) {
        const nsecBytes = await decryptNsecWithPassword(
          currentParticipant.encrypted_nsec,
          password
        );
        // Decode to string only for immediate UI display
        const decoder = new TextDecoder();
        decryptedNsec = decoder.decode(nsecBytes);
        // Best-effort wipe of byte buffer after use
        try {
          nsecBytes.fill(0);
        } catch {
          // Ignore cleanup errors in UI layer
        }
      }

      // Decrypt Keet seed (if available)
      let decryptedKeetSeed: string | null = null;
      if (currentParticipant.encrypted_keet_seed && currentParticipant.keet_seed_salt) {
        const seedBuffer = await decryptKeetSeed(
          currentParticipant.encrypted_keet_seed,
          password,
          currentParticipant.keet_seed_salt
        );
        decryptedKeetSeed = new TextDecoder().decode(seedBuffer.getData());
        seedBuffer.destroy(); // Clean up SecureBuffer
      }

      // Store in ephemeral state
      setEphemeralNsec(decryptedNsec);
      setEphemeralKeetSeed(decryptedKeetSeed);
      setSecretsDisplayed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decrypt secrets');
    } finally {
      setIsDecrypting(false);
    }
  };

  // Copy secret to clipboard
  const copyToClipboard = async (secret: string, type: SecretType) => {
    try {
      await navigator.clipboard.writeText(secret);

      // Set copied state for 2 seconds
      if (type === 'nsec') {
        setCopiedNsec(true);
        setTimeout(() => setCopiedNsec(false), 2000);
      } else if (type === 'keet_seed') {
        setCopiedKeetSeed(true);
        setTimeout(() => setCopiedKeetSeed(false), 2000);
      } else if (type === 'password') {
        setCopiedPassword(true);
        setTimeout(() => setCopiedPassword(false), 2000);
      }
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  // Download blank backup template
  const downloadBlankTemplate = () => {
    const template = `
SATNAM.PUB BACKUP TEMPLATE
==========================

CRITICAL: Write these values by hand. DO NOT save this file with your actual secrets.

1. NOSTR PRIVATE KEY (nsec)
   Format: 64 hexadecimal characters

   ________________________________________________________________

   ________________________________________________________________

2. KEET SEED PHRASE (24 words)
   Write each word in order:

   1. ____________  2. ____________  3. ____________  4. ____________
   5. ____________  6. ____________  7. ____________  8. ____________
   9. ____________ 10. ____________ 11. ____________ 12. ____________
  13. ____________ 14. ____________ 15. ____________ 16. ____________
  17. ____________ 18. ____________ 19. ____________ 20. ____________
  21. ____________ 22. ____________ 23. ____________ 24. ____________

3. PASSWORD

   ________________________________________________________________

SECURITY REMINDERS:
- Store this backup in a secure location (safe, safety deposit box)
- Consider using metal backup plates for fire/water resistance
- NEVER store digital copies of your secrets
- You can change your password later in Account Settings
- Your nsec and Keet seed CANNOT be changed - protect them carefully

Recovery Instructions:
1. Go to satnam.pub
2. Click "Import Existing Account"
3. Enter your nsec or Keet seed
4. Set a new password (if needed)
5. Your account will be restored

For support: https://satnam.pub/support
`;

    const blob = new Blob([template], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'satnam-backup-template.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Complete backup and proceed
  const handleCompleteBackup = () => {
    if (!backupConfirmed) {
      setError('Please confirm you have backed up your secrets');
      return;
    }

    // Secure cleanup before proceeding
    secureMemoryCleanup();
    setEphemeralNsec(null);
    setEphemeralKeetSeed(null);
    setSecretsDisplayed(false);

    // Clear timers
    if (timerStateRef.current.cleanupTimer) {
      clearTimeout(timerStateRef.current.cleanupTimer);
    }
    if (timerStateRef.current.countdown) {
      clearInterval(timerStateRef.current.countdown);
    }

    onNext();
  };

  // Format Keet seed words into grid
  const formatSeedWords = (seed: string): string[] => {
    return seed.split(' ');
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-orange-500 rounded-full mb-4">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Backup Your Secrets
        </h2>
        <p className="text-gray-400">
          Write down your secrets by hand on paper or metal backup
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Initial State: Show Secrets Button */}
      {!secretsDisplayed && (
        <div className="space-y-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <div className="flex items-start gap-3 mb-4">
              <Key className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-white font-semibold mb-2">
                  What Will Be Displayed?
                </h3>
                <ul className="text-gray-400 text-sm space-y-2">
                  <li>• <span className="text-white">Nostr Private Key (nsec)</span> - Your Nostr identity</li>
                  <li>• <span className="text-white">Keet Seed Phrase (24 words)</span> - Your P2P messaging key</li>
                  <li>• <span className="text-white">Password</span> - Your account password</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-200 text-sm font-semibold mb-1">
                  Security Warning
                </p>
                <p className="text-yellow-300 text-sm">
                  Your secrets will be displayed for 5 minutes only. Make sure you're in a
                  private location and ready to write them down.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleShowSecrets}
            disabled={isDecrypting}
            className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isDecrypting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                Decrypting...
              </>
            ) : (
              <>
                <Key className="w-5 h-5" />
                Show My Secrets
              </>
            )}
          </button>

          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm text-center">
              <span className="text-purple-400 font-semibold">Note:</span> You can change your password later in Account Settings
              (this will re-encrypt your keys)
            </p>
          </div>
        </div>
      )}

      {/* Secrets Displayed: Show All Three Secrets */}
      {secretsDisplayed && (
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

          {/* Nsec Display */}
          {ephemeralNsec && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-400 text-sm font-semibold">
                  1. Nostr Private Key (nsec)
                </p>
                <button
                  onClick={() => copyToClipboard(ephemeralNsec, 'nsec')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
                >
                  {copiedNsec ? (
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
              <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
                <p className="text-white font-mono text-sm break-all">
                  {ephemeralNsec}
                </p>
              </div>
            </div>
          )}

          {/* Keet Seed Display */}
          {ephemeralKeetSeed && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-400 text-sm font-semibold">
                  2. Keet Seed Phrase (24 words)
                </p>
                <button
                  onClick={() => copyToClipboard(ephemeralKeetSeed, 'keet_seed')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
                >
                  {copiedKeetSeed ? (
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
                {formatSeedWords(ephemeralKeetSeed).map((word, index) => (
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
          )}

          {/* Password Display */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-400 text-sm font-semibold">
                3. Password
              </p>
              <button
                onClick={() => copyToClipboard(ephemeralPassword, 'password')}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
              >
                {copiedPassword ? (
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
            <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
              <p className="text-white font-mono text-sm break-all">
                {ephemeralPassword}
              </p>
            </div>
          </div>

          {/* Download Blank Template Button */}
          <button
            onClick={downloadBlankTemplate}
            className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" />
            Download Blank Backup Template
          </button>

          {/* Backup Confirmation */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={backupConfirmed}
                onChange={(e) => setBackupConfirmed(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-900"
              />
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">
                  I have securely written down all my backup information
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  These secrets cannot be recovered if lost. Make sure you've stored them safely.
                </p>
              </div>
            </label>
          </div>

          {/* Complete Backup Button */}
          <button
            onClick={handleCompleteBackup}
            disabled={!backupConfirmed}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            <Shield className="w-5 h-5" />
            Complete Backup
          </button>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
};

export default OnboardingBackupStep;