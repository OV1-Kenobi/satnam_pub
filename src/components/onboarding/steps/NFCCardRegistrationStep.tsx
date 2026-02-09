/**
 * NFCCardRegistrationStep Component
 * @description Handles NFC card registration for physical peer onboarding
 * Phase 11 Task 11.2.4: Optimized to use scanForCard() with caching and retry logic
 *
 * Features:
 * - Web NFC API integration for card scanning
 * - Support for NTAG424, Boltcard, and Tapsigner card types
 * - PIN setup with PBKDF2-SHA512 hashing
 * - Device compatibility detection
 * - Visual feedback during card scanning
 * - UID caching to prevent redundant scans (30-second TTL)
 * - Automatic retry with exponential backoff
 *
 * Security:
 * - Card UIDs are hashed before storage (privacy-first)
 * - PINs are hashed using PBKDF2-SHA512 with 100k iterations
 * - Unique salt generated per card using Web Crypto API
 * - Raw PINs never stored, only hashes
 *
 * @module NFCCardRegistrationStep
 */

import { AlertCircle, CreditCard, Loader2, NfcIcon, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useOnboardingSession } from '../../../contexts/OnboardingSessionContext';
import type { NFCCardType } from '../../../types/onboarding';
import { authenticatedFetch } from '../../../utils/secureSession';
import { scanForCard, isNFCSupported, handleNFCError } from '../../../lib/tapsigner/nfc-reader';

// ============================================================================
// Types
// ============================================================================

interface NFCCardRegistrationStepProps {
  /** Callback when NFC step is completed */
  onNext: () => void;
  /** Callback when user wants to go back */
  onBack?: () => void;
  /** Optional: Skip NFC registration */
  allowSkip?: boolean;
}

interface NFCCardData {
  cardUid: string; // Hashed UID for storage
  originalUid: string; // Original UID for display
  cardType: NFCCardType;
  pinHash?: string;
  pinSalt?: string;
}

interface FormErrors {
  scan?: string;
  pin?: string;
  general?: string;
}

type ScanState = 'idle' | 'scanning' | 'scanned' | 'error';

// ============================================================================
// Constants
// ============================================================================

const SCAN_TIMEOUT_MS = 15000; // 15 seconds
const PIN_LENGTH = 6;
const PBKDF2_ITERATIONS = 100000;

// ============================================================================
// Component
// ============================================================================

export const NFCCardRegistrationStep: FC<NFCCardRegistrationStepProps> = ({
  onNext,
  onBack,
  allowSkip = false,
}) => {
  const { currentParticipant, updateParticipant, completeStep } = useOnboardingSession();

  // State
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [cardData, setCardData] = useState<NFCCardData | null>(null);
  const [selectedCardType, setSelectedCardType] = useState<NFCCardType>('ntag424');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [nfcSupported, setNfcSupported] = useState<boolean>(false);

  // ============================================================================
  // Effects
  // ============================================================================

  /**
   * Check Web NFC API support on mount
   */
  useEffect(() => {
    const checkNFCSupport = async () => {
      const supported = isNFCSupported();
      setNfcSupported(supported);

      if (!supported) {
        setErrors({
          general: 'Web NFC is not supported on this device. Please use Chrome or Edge on Android.',
        });
      }
    };

    checkNFCSupport();
  }, []);

  // ============================================================================
  // Handlers
  // ============================================================================

  /**
   * Hash card UID using SHA-256 for privacy-first storage
   */
  const hashCardUid = useCallback(async (uid: string): Promise<string> => {
    const encoder = new TextEncoder();
    const uidBytes = encoder.encode(uid);

    // Hash using SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', uidBytes);
    const hashBytes = new Uint8Array(hashBuffer);

    // Convert to hex
    return Array.from(hashBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }, []);

  /**
   * Scan NFC card using Web NFC API
   * Phase 11 Task 11.2.4: Uses optimized scanForCard() with caching and retry logic
   */
  const handleScanCard = useCallback(async () => {
    if (!isNFCSupported()) {
      setErrors({ scan: 'NFC not supported on this device' });
      return;
    }

    setErrors({});
    setScanState('scanning');

    try {
      // Use optimized scanForCard() with caching and retry logic
      const cardData = await scanForCard(SCAN_TIMEOUT_MS);

      // Hash the card UID for privacy-first storage
      const hashedUid = await hashCardUid(cardData.cardId);

      setCardData({
        cardUid: hashedUid,
        originalUid: cardData.cardId,
        cardType: selectedCardType,
      });
      setScanState('scanned');
    } catch (error) {
      console.error('NFC scan error:', error);
      setScanState('error');
      setErrors({
        scan: handleNFCError(error),
      });
    }
  }, [selectedCardType, hashCardUid]);

  /**
   * Generate salt using Web Crypto API
   */
  const generateSalt = useCallback(async (): Promise<string> => {
    const saltBytes = new Uint8Array(32);
    crypto.getRandomValues(saltBytes);
    // Convert to base64
    return btoa(String.fromCharCode(...saltBytes));
  }, []);

  /**
   * Hash PIN using PBKDF2-SHA512
   */
  const hashPin = useCallback(async (pin: string, saltB64: string): Promise<string> => {
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pin);

    // Import PIN as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      pinBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    // Decode salt from base64
    const saltBytes = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));

    // Derive key using PBKDF2
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-512',
      },
      keyMaterial,
      512 // 64 bytes
    );

    // Convert to hex
    const hashBytes = new Uint8Array(derivedBits);
    return Array.from(hashBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }, []);

  /**
   * Validate PIN input
   */
  const validatePin = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    // Tapsigner doesn't require user-configurable PIN
    if (selectedCardType === 'tapsigner') {
      return true;
    }

    if (!pin) {
      newErrors.pin = 'PIN is required';
    } else if (pin.length !== PIN_LENGTH) {
      newErrors.pin = `PIN must be exactly ${PIN_LENGTH} digits`;
    } else if (!/^\d+$/.test(pin)) {
      newErrors.pin = 'PIN must contain only digits';
    } else if (pin !== pinConfirm) {
      newErrors.pin = 'PINs do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [pin, pinConfirm, selectedCardType]);

  /**
   * Submit card registration to backend
   */
  const handleSubmit = useCallback(async () => {
    if (!currentParticipant) {
      setErrors({ general: 'No participant found' });
      return;
    }

    if (!cardData) {
      setErrors({ general: 'Please scan a card first' });
      return;
    }

    // Validate PIN for non-Tapsigner cards
    if (selectedCardType !== 'tapsigner' && !validatePin()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Generate PIN hash and salt for non-Tapsigner cards
      let pinHash: string | undefined;
      let pinSalt: string | undefined;

      if (selectedCardType !== 'tapsigner' && pin) {
        pinSalt = await generateSalt();
        pinHash = await hashPin(pin, pinSalt);
      }

      // Call backend to register card
      const response = await authenticatedFetch('/.netlify/functions/onboarding-card-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          participantId: currentParticipant.participantId,
          cardUid: cardData.cardUid,
          cardType: selectedCardType,
          pinHash,
          pinSalt,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to register card';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Response body wasn't JSON, use default message
        }
        throw new Error(errorMessage);
      }

      // Response parsed successfully - no body data needed

      // Update participant in context
      await updateParticipant(currentParticipant.participantId, {
        currentStep: 'lightning',
      });

      // Mark step as complete (NFC card data stored in nfc_cards table via API)
      await completeStep('nfc');

      // Clear sensitive data
      setPin('');
      setPinConfirm('');

      // Proceed to next step
      onNext();
    } catch (error) {
      console.error('Card registration error:', error);
      setErrors({
        general: error instanceof Error ? error.message : 'Failed to register card',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    currentParticipant,
    cardData,
    selectedCardType,
    pin,
    validatePin,
    generateSalt,
    hashPin,
    updateParticipant,
    completeStep,
    onNext,
  ]);

  /**
   * Skip NFC registration
   */
  const handleSkip = useCallback(async () => {
    if (!currentParticipant) return;

    await updateParticipant(currentParticipant.participantId, {
      currentStep: 'lightning',
    });

    onNext();
  }, [currentParticipant, updateParticipant, onNext]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
          <NfcIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          NFC Card Registration
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Register your NFC card for secure authentication and payments
        </p>
      </div>

      {/* NFC Support Warning */}
      {!nfcSupported && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-yellow-900 dark:text-yellow-200 mb-1">
                NFC Not Supported
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Web NFC is not available on this device. Please use Chrome or Edge on Android.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Card Type Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Card Type
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(['ntag424', 'boltcard', 'tapsigner'] as NFCCardType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedCardType(type)}
              disabled={scanState === 'scanning' || scanState === 'scanned'}
              className={`
                px-4 py-3 rounded-lg border-2 transition-all
                ${selectedCardType === type
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }
                ${scanState === 'scanning' || scanState === 'scanned' ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <div className="text-sm font-medium capitalize">{type}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Scan Button */}
      {scanState !== 'scanned' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleScanCard}
            disabled={!nfcSupported || scanState === 'scanning'}
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {scanState === 'scanning' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Scanning... (tap your card)
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                Scan NFC Card
              </>
            )}
          </button>

          {errors.scan && (
            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errors.scan}</span>
            </div>
          )}
        </div>
      )}

      {/* Card Scanned Success */}
      {scanState === 'scanned' && cardData && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-green-900 dark:text-green-200 mb-1">
                Card Detected
              </h3>
              <p className="text-sm text-green-700 dark:text-green-300">
                Card UID: {cardData.originalUid.substring(0, 8)}...
              </p>
              <p className="text-sm text-green-700 dark:text-green-300">
                Type: {cardData.cardType}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PIN Setup (for NTAG424 and Boltcard) */}
      {scanState === 'scanned' && selectedCardType !== 'tapsigner' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="pin" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Set Card PIN ({PIN_LENGTH} digits)
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              maxLength={PIN_LENGTH}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              placeholder="Enter 6-digit PIN"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="pinConfirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Confirm PIN
            </label>
            <input
              id="pinConfirm"
              type="password"
              inputMode="numeric"
              maxLength={PIN_LENGTH}
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              placeholder="Confirm 6-digit PIN"
            />
          </div>

          {errors.pin && (
            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errors.pin}</span>
            </div>
          )}
        </div>
      )}

      {/* General Error */}
      {errors.general && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{errors.general}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Back
          </button>
        )}

        <div className="flex-1 flex gap-3">
          {allowSkip && (
            <button
              type="button"
              onClick={handleSkip}
              disabled={isSubmitting}
              className="flex-1 px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              Skip for Now
            </button>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!cardData || isSubmitting || (selectedCardType !== 'tapsigner' && (!pin || !pinConfirm))}
            className="flex-1 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Registering...
              </>
            ) : (
              'Register Card'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
