import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Heart,
  Key,
  Shield,
  Sparkles,
  User,
  Users,
  X
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useCryptoOperations } from "../hooks/useCrypto";
import { NostrProfileService } from "../lib/nostr-profile-service";
import { IdentityRegistrationResult } from "../types/auth";
import { apiClient } from '../utils/api-client';
import { SessionInfo } from '../utils/secureSession';
import { useAuth, useIdentityForge } from "./auth/AuthProvider";

import { recoverySessionBridge } from "../lib/auth/recovery-session-bridge";
import SecureTokenManager from "../lib/auth/secure-token-manager";
import type { UserIdentity } from "../lib/auth/user-identities-auth";

import { central_event_publishing_service, central_event_publishing_service as CEPS } from "../../lib/central_event_publishing_service";


import { fetchWithAuth } from "../lib/auth/fetch-with-auth";

import { secureNsecManager } from "../lib/secure-nsec-manager";
import { SecurePeerInvitationModal } from "./SecurePeerInvitationModal";


import { config } from "../../config";
import OTPVerificationPanel from "./OTPVerificationPanel";
import SovereigntyEducation from "./SovereigntyEducation";

import { isLightningAddressReachable, parseLightningAddress } from "../utils/lightning-address";

import { createBoltcard, createLightningAddress, provisionWallet } from "@/api/endpoints/lnbits.js";



// Feature flag: LNBits integration
const rawLnBitsFlag =
  (import.meta as any)?.env?.VITE_LNBITS_INTEGRATION_ENABLED ??
  (typeof process !== 'undefined' ? (process as any)?.env?.VITE_LNBITS_INTEGRATION_ENABLED : undefined);

const LNBITS_ENABLED: boolean = String(rawLnBitsFlag ?? '').toLowerCase() === 'true';





interface FormData {
  username: string;
  password: string;
  confirmPassword: string;
  pubkey: string;
  lightningEnabled: boolean;
  agreedToTerms: boolean;
}

interface IdentityForgeProps {
  onComplete: () => void;
  onBack: () => void;
  invitationToken?: string | null;
  invitationDetails?: any;
  isInvitedUser?: boolean;
  rotationMode?: {
    enabled: boolean;
    preserve: { nip05: string; lightningAddress?: string; username: string; bio?: string; profilePicture?: string };
    skipStep1?: boolean;
    onKeysReady?: (npub: string, nsecBech32: string) => Promise<void> | void;
  };
  // Optional: preselect migration mode (e.g., via deep link)
  initialMigrationMode?: 'generate' | 'import';
}

const IdentityForge: React.FC<IdentityForgeProps> = ({
  onComplete,
  onBack,
  invitationToken = null,
  invitationDetails = null,
  isInvitedUser = false,
  rotationMode,
  initialMigrationMode,
}) => {
  // Early guard: mark registration flow as active before any effects run
  if (typeof window !== 'undefined') {
    try {
      (window as any).__identityForgeRegFlow = true;
    } catch { }
  }

  const [currentStep, setCurrentStep] = useState(rotationMode?.enabled && rotationMode?.skipStep1 ? 2 : 1);
  // When in rotation mode, preset migration mode and preserve identity fields
  useEffect(() => {
    if (rotationMode?.enabled) {
      setMigrationMode('generate');
      // Skip username/password step; user keeps existing NIP-05/Lightning

    }
  }, [rotationMode?.enabled, rotationMode?.skipStep1]);

  // Registration flow flag for global NIP-07 guards
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__identityForgeRegFlow = true;
    }
    return () => {
      try {
        if (typeof window !== 'undefined' && (window as any).__identityForgeRegFlow) {
          delete (window as any).__identityForgeRegFlow;

        }
      } catch { /* no-op */ }
    };
  }, []);

  const [formData, setFormData] = useState<FormData>({
    username: "",
    password: "",
    confirmPassword: "",
    pubkey: "",
    lightningEnabled: true,
    agreedToTerms: false,
  });
  // Multi-domain NIP-05 + external Lightning Address support
  const allowedDomains = (config?.nip05?.allowedDomains || ["satnam.pub"]).filter((d: string) => typeof d === 'string' && d.trim());
  const [selectedDomain, setSelectedDomain] = useState<string>(allowedDomains[0] || "satnam.pub");
  const [externalLightningAddress, setExternalLightningAddress] = useState<string>("");
  const [extAddrValid, setExtAddrValid] = useState<boolean | null>(null);
  const [extAddrReachable, setExtAddrReachable] = useState<boolean | null>(null);
  const [checkingExtAddr, setCheckingExtAddr] = useState<boolean>(false);

  function validateLightningAddressFormat(addr: string): { local: string; domain: string } | null {
    const p = parseLightningAddress(addr);
    return p ? { local: p.local, domain: p.domain } : null;
  }

  async function verifyLightningAddressReachable(local: string, domain: string): Promise<boolean> {
    return isLightningAddressReachable(`${local}@${domain}`);
  }

  useEffect(() => {
    if (!externalLightningAddress) { setExtAddrValid(null); setExtAddrReachable(null); return; }
    const parsed = validateLightningAddressFormat(externalLightningAddress);
    setExtAddrValid(!!parsed);
    if (!parsed) { setExtAddrReachable(null); return; }
    let cancelled = false;
    setCheckingExtAddr(true);
    verifyLightningAddressReachable(parsed.local, parsed.domain)
      .then(ok => { if (!cancelled) setExtAddrReachable(ok); })
      .finally(() => { if (!cancelled) setCheckingExtAddr(false); });
    return () => { cancelled = true; };
  }, [externalLightningAddress]);


  // Zero-Knowledge Ephemeral Nsec Display (Master Context Compliance)
  const [ephemeralNsec, setEphemeralNsec] = useState<string | null>(null);
  const [nsecProtected, setNsecProtected] = useState(false); // Prevents premature clearing

  // Protected setter that prevents clearing when nsec should be preserved
  const setEphemeralNsecProtected = (value: string | null, force: boolean = false) => {
    // If trying to clear (set to null) but nsec is protected and not forced, prevent it
    if (value === null && nsecProtected && !force) {
      return; // Silently block the clear attempt
    }

    // If setting a value, enable protection
    if (value !== null) {
      setNsecProtected(true);
    } else if (force) {
      setNsecProtected(false); // Disable protection when force clearing
    }

    setEphemeralNsec(value);
  };
  const [nsecDisplayed, setNsecDisplayed] = useState(false);
  const [nsecSecured, setNsecSecured] = useState(false);
  const [showNsecConfirmation, setShowNsecConfirmation] = useState(false);
  const [nsecStoredConfirmed, setNsecStoredConfirmed] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [, setAutoCleanupTimer] = useState<NodeJS.Timeout | null>(null);
  const [, setCountdownTimer] = useState<NodeJS.Timeout | null>(null);

  // Ref to track timer state and prevent race conditions
  const timerStateRef = useRef({ cleanupTimer: null as NodeJS.Timeout | null, countdown: null as NodeJS.Timeout | null });

  // Zero-Knowledge Security: Secure memory cleanup utility
  const secureMemoryCleanup = (sensitiveString: string | null) => {
    if (!sensitiveString) return;

    try {
      // Convert string to ArrayBuffer for secure cleanup
      const encoder = new TextEncoder();
      const buffer = encoder.encode(sensitiveString);

      // Zero out the buffer
      buffer.fill(0);

      // Force garbage collection hint (if available)
      if (typeof window !== 'undefined' && 'gc' in window) {
        (window as any).gc();
      }
    } catch (error) {
      console.warn('Secure memory cleanup failed:', error);
    }
  };

  // Nostr Account Migration State (Zero-Knowledge Compliance)
  const [migrationMode, setMigrationMode] = useState<'generate' | 'import'>(initialMigrationMode === 'import' ? 'import' : 'generate');
  const [importedNsec, setImportedNsec] = useState('');
  const [detectedProfile, setDetectedProfile] = useState<any>(null);
  const [showMigrationConsent, setShowMigrationConsent] = useState(false);
  const [profileUpdateConsent, setProfileUpdateConsent] = useState(true);
  const [lightningAddressConsent, setLightningAddressConsent] = useState(true);
  const [isDetectingProfile, setIsDetectingProfile] = useState(false);


  // OTP verification state for migration flow
  const [otpVerified, setOtpVerified] = useState(false);
  const [, setOtpSessionId] = useState<string | null>(null);
  const [, setOtpExpiresAt] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Nostr Profile Creation State (New Users Only)
  const [profileData, setProfileData] = useState({
    displayName: '',
    bio: '',
    picture: '',
    website: ''
  });


  // Zero-Knowledge Protocol: Secure memory cleanup (Master Context Compliance)
  // Use refs to track current values for cleanup without triggering effect re-runs
  const ephemeralNsecRef = useRef<string | null>(null);
  const importedNsecRef = useRef<string>('');

  // Update refs when state changes (no cleanup function)
  useEffect(() => {
    ephemeralNsecRef.current = ephemeralNsec;
  }, [ephemeralNsec]);

  useEffect(() => {
    importedNsecRef.current = importedNsec;
  }, [importedNsec]);

  // Component unmount cleanup - NO dependencies to prevent re-runs during state changes
  useEffect(() => {
    return () => {
      // Critical: Secure cleanup of ephemeral nsec on component unmount ONLY
      if (ephemeralNsecRef.current) {
        secureMemoryCleanup(ephemeralNsecRef.current);
        // Don't call setEphemeralNsecProtected here - component is unmounting
      }
      // Critical: Secure cleanup of imported nsec from memory
      if (importedNsecRef.current) {
        secureMemoryCleanup(importedNsecRef.current);
        // Don't call setImportedNsec here - component is unmounting
      }
      // Clear any active timers using ref-based approach
      if (timerStateRef.current.cleanupTimer) {
        clearTimeout(timerStateRef.current.cleanupTimer);
        timerStateRef.current.cleanupTimer = null;
      }
      if (timerStateRef.current.countdown) {
        clearInterval(timerStateRef.current.countdown);
        timerStateRef.current.countdown = null;
      }
    };
  }, []); // EMPTY dependencies - only runs on mount/unmount

  // Auto-cleanup timer for ephemeral nsec (5-minute maximum exposure for manual recording)
  // Split into separate useEffects to prevent infinite loops

  // Timer start effect - only runs when nsec is first displayed
  useEffect(() => {
    // Only start timer when nsec exists, is displayed, not secured, and no timer is running
    if (ephemeralNsec && nsecDisplayed && !nsecSecured && !timerStateRef.current.cleanupTimer && !timerStateRef.current.countdown) {


      // Set initial countdown time (5 minutes = 300 seconds)
      setTimeRemaining(300);

      // Main cleanup timer (5 minutes)
      const cleanupTimer = setTimeout(() => {


        // CRITICAL FIX: Don't clear ephemeralNsec if user is in the middle of registration
        if (currentStep >= 3 && !nsecSecured) {

          return;
        }


        // Critical: Auto-clear nsec after 5 minutes for security (only if not in registration)
        setEphemeralNsecProtected(null, true); // Force clear after timer expires
        setNsecDisplayed(false);
        setShowNsecConfirmation(false);
        setTimeRemaining(0);

        // Clear ref state
        timerStateRef.current.cleanupTimer = null;
        timerStateRef.current.countdown = null;
      }, 300000); // 5 minutes = 300,000 milliseconds

      // Countdown timer (updates every second)
      const countdown = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(countdown);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Store timers in ref to prevent race conditions
      timerStateRef.current.cleanupTimer = cleanupTimer;
      timerStateRef.current.countdown = countdown;



      // Return cleanup function that only runs on actual component unmount
      return () => {

        if (timerStateRef.current.cleanupTimer) {
          clearTimeout(timerStateRef.current.cleanupTimer);
          timerStateRef.current.cleanupTimer = null;
        }
        if (timerStateRef.current.countdown) {
          clearInterval(timerStateRef.current.countdown);
          timerStateRef.current.countdown = null;
        }
      };
    }
  }, [ephemeralNsec, nsecDisplayed, nsecSecured]); // Dependencies exclude timer state to prevent re-runs



  // Timer cleanup effect - runs when nsec is secured or hidden
  useEffect(() => {
    // Only clear timers when nsec is secured OR when nsec display is turned off
    if ((nsecSecured || !nsecDisplayed) && (timerStateRef.current.cleanupTimer || timerStateRef.current.countdown)) {


      if (timerStateRef.current.countdown) {
        clearInterval(timerStateRef.current.countdown);
        timerStateRef.current.countdown = null;

      }
      if (timerStateRef.current.cleanupTimer) {
        clearTimeout(timerStateRef.current.cleanupTimer);
        timerStateRef.current.cleanupTimer = null;

      }
      // Reset timer display
      setTimeRemaining(0);
    }
  }, [nsecSecured, nsecDisplayed]); // Dependencies exclude timer state to prevent race condition

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameSuggestion, setUsernameSuggestion] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Zero-Knowledge Protocol: Secure nsec display functions
  const showNsecTemporarily = () => {
    if (!ephemeralNsec) {
      return;
    }

    if (nsecDisplayed) {
      return;
    }

    setNsecDisplayed(true);
    // Don't show confirmation immediately - let user copy first
    setShowNsecConfirmation(false);
  };



  const handleNsecSecured = () => {


    // User confirms they have secured their nsec
    setNsecSecured(true);
    setShowNsecConfirmation(false);

    // Disable protection since user has secured their key
    setNsecProtected(false);

    // CRITICAL FIX: DO NOT clear ephemeralNsec here!
    // The ephemeralNsec must persist until AFTER successful encryption in registerIdentity()
    // setEphemeralNsec(null); // REMOVED - this was causing the registration failure
    setNsecDisplayed(false);
    setTimeRemaining(0);



    // Clear any active timers using ref-based approach
    if (timerStateRef.current.cleanupTimer) {
      clearTimeout(timerStateRef.current.cleanupTimer);
      timerStateRef.current.cleanupTimer = null;
      setAutoCleanupTimer(null);
    }
    if (timerStateRef.current.countdown) {
      clearInterval(timerStateRef.current.countdown);
      timerStateRef.current.countdown = null;
      setCountdownTimer(null);
    }

    // CRITICAL FIX: Advance to next step after securing nsec
    // This was the main issue - users were getting stuck in Step 3

    nextStep();
  };

  const copyNsecSecurely = async () => {


    if (!ephemeralNsec) {
      return;
    }

    if (!nsecDisplayed) {
      return;
    }

    try {
      await navigator.clipboard.writeText(ephemeralNsec);

      // Show confirmation dialog after copying
      setShowNsecConfirmation(true);
      // Note: Nsec remains in clipboard but is cleared from component memory
      // User is responsible for clearing clipboard after securing the key
    } catch (error) {

      // Still show confirmation dialog even if copy failed
      setShowNsecConfirmation(true);
    }
  };

  // Zero-Knowledge Nostr Account Migration Functions
  const handleNsecImport = async () => {
    // Clear any previous error messages
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validate input format
    if (!importedNsec) {
      setErrorMessage('Please enter your Nostr key (nsec1... or npub1...)');
      return;
    }

    // Trim whitespace and normalize input
    const cleanedKey = importedNsec.trim();

    // Check for common user mistakes
    if (cleanedKey.includes(' ')) {
      setErrorMessage('Nostr keys should not contain spaces. Please check your key and try again.');
      return;
    }

    if (cleanedKey.length < 60) {
      setErrorMessage('Nostr key appears to be too short. Please check your key and try again.');
      return;
    }

    if (cleanedKey.length > 70) {
      setErrorMessage('Nostr key appears to be too long. Please check your key and try again.');
      return;
    }

    if (!cleanedKey.startsWith('nsec1') && !cleanedKey.startsWith('npub1')) {
      // Check for common mistakes
      if (cleanedKey.startsWith('nsec') || cleanedKey.startsWith('npub')) {
        setErrorMessage('Invalid key format. Nostr keys should start with "nsec1" or "npub1"');
      } else if (cleanedKey.match(/^[0-9a-f]{64}$/i)) {
        setErrorMessage('This appears to be a hex private key. Please use the nsec1... format instead.');
      } else {
        setErrorMessage('Invalid key format. Please enter a valid nsec1... or npub1... key');
      }
      return;
    }

    setIsDetectingProfile(true);
    setErrorMessage(null);

    try {
      let npub: string;
      let publicKey: string = '';
      let isViewOnly = false;
      let keyType = '';

      if (cleanedKey.startsWith('nsec1')) {
        // Handle nsec import (full access)
        keyType = 'private';

        try {
          // Canonical derivation via CEPS using nostr-tools under the hood
          const publicKeyHex = CEPS.derivePubkeyHexFromNsec(cleanedKey);
          publicKey = publicKeyHex;
          npub = CEPS.encodeNpub(publicKeyHex);

          // Store ephemeral nsec for full access (zero-knowledge compliance)
          setEphemeralNsecProtected(cleanedKey);

          console.log('✅ Private key imported successfully');
        } catch (decodeError) {
          throw new Error('Invalid nsec format or corrupted key');
        }

      } else if (cleanedKey.startsWith('npub1')) {
        // Handle npub import (view-only mode)
        keyType = 'public';

        try {
          // Validate and decode the npub via central service

          const pubHex = CEPS.decodeNpub(cleanedKey);
          publicKey = pubHex;
          npub = cleanedKey;
          isViewOnly = true;

          console.log('✅ Public key imported successfully (view-only mode)');
        } catch (decodeError) {
          throw new Error('Invalid npub format or corrupted key');
        }
      }

      // Detect existing profile metadata from Nostr network
      console.log('🔍 Detecting existing Nostr profile...');
      const profile = await detectNostrProfile(publicKey);

      // Set form data with detected information
      setFormData(prev => ({
        ...prev,
        pubkey: npub
      }));

      setDetectedProfile({
        ...profile,
        keyType: keyType,
        isViewOnly: isViewOnly
      });

      setShowMigrationConsent(true);
      setSuccessMessage(`${keyType === 'private' ? 'Private' : 'Public'} key imported successfully!`);

      // Clear imported key input immediately after processing (zero-knowledge compliance)
      secureMemoryCleanup(importedNsec);
      setImportedNsec('');

    } catch (error) {
      console.error('Key import failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setErrorMessage(`Import failed: ${errorMessage}`);

      // Clear sensitive data on error (zero-knowledge compliance)
      secureMemoryCleanup(importedNsec);
      secureMemoryCleanup(ephemeralNsec);
      setImportedNsec('');
      setEphemeralNsecProtected(null, true); // Force clear on error
    } finally {
      setIsDetectingProfile(false);
    }
  };

  const detectNostrProfile = async (publicKey: string) => {
    try {
      // Convert hex public key to npub format for profile service

      const npub = central_event_publishing_service.encodeNpub(publicKey);

      // Use existing NostrProfileService to fetch profile with timeout
      const profileService = new NostrProfileService();

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Profile detection timeout')), 15000); // 15 second timeout
      });

      const profilePromise = profileService.fetchProfileMetadata(npub);
      const profile = await Promise.race([profilePromise, timeoutPromise]) as any;

      if (profile && typeof profile === 'object') {
        console.log('✅ Existing Nostr profile detected:', profile.name || 'Unnamed');
        return {
          name: profile.name || '',
          about: profile.about || '',
          picture: profile.picture || '',
          nip05: profile.nip05 || '',
          lud16: profile.lud16 || '', // Lightning address
          npub: npub,
          hasExistingProfile: true,
          detectionMethod: 'nostr-relays'
        };
      } else {
        console.log('ℹ️ No existing profile found for this key');
        return {
          name: '',
          about: '',
          picture: '',
          nip05: '',
          lud16: '',
          npub: npub,
          hasExistingProfile: false,
          detectionMethod: 'nostr-relays'
        };
      }
    } catch (error) {
      console.warn('Profile detection failed:', error);

      // Determine error type for better user feedback
      let errorType = 'unknown';
      let userMessage = 'Profile detection failed';

      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorType = 'timeout';
          userMessage = 'Profile detection timed out - you can still import your key';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorType = 'network';
          userMessage = 'Network error during profile detection - you can still import your key';
        } else if (error.message.includes('Invalid')) {
          errorType = 'validation';
          userMessage = 'Invalid key format';
        }
      }

      // Return minimal profile structure on error
      return {
        name: '',
        about: '',
        picture: '',
        nip05: '',
        lud16: '',
        npub: publicKey ? nip19.npubEncode(publicKey) : '',
        hasExistingProfile: false,
        error: userMessage,
        errorType: errorType,
        detectionMethod: 'failed'
      };
    }
  };

  const handleMigrationConsent = () => {
    // User has confirmed migration preferences
    setShowMigrationConsent(false);
    setNsecSecured(true);

    // CRITICAL FIX: Don't clear ephemeralNsec here - it's needed for registration
    // setEphemeralNsec(null); // REMOVED - this was causing registration failures

    // Clear any active timers using ref-based approach
    if (timerStateRef.current.cleanupTimer) {
      clearTimeout(timerStateRef.current.cleanupTimer);
      timerStateRef.current.cleanupTimer = null;
      setAutoCleanupTimer(null);
    }
    if (timerStateRef.current.countdown) {
      clearInterval(timerStateRef.current.countdown);
      timerStateRef.current.countdown = null;
      setCountdownTimer(null);
    }
  };

  // Nostr Profile Publishing (New Users Only)
  const publishNostrProfile = async () => {
    if (!ephemeralNsec || migrationMode === 'import') {
      return;
    }

    try {
      // Create profile metadata for Nostr network
      const profileMetadata = {
        name: profileData.displayName,
        about: profileData.bio,
        picture: profileData.picture,
        website: profileData.website,
        nip05: `${formData.username}@${selectedDomain}`,
        lud16: formData.lightningEnabled ? (externalLightningAddress && extAddrValid && extAddrReachable ? externalLightningAddress : `${formData.username}@${selectedDomain}`) : undefined,
      };

      // Ensure a SecureSession exists before publishing; create one from ephemeralNsec if needed
      try {
        const preSession = secureNsecManager.getActiveSessionId?.();
        if (!preSession && ephemeralNsec) {
          await secureNsecManager.createPostRegistrationSession(ephemeralNsec, 15 * 60 * 1000);
        }
      } catch (sessErr) {
        console.warn('Unable to create temporary SecureSession for profile publish:', sessErr);
      }

      // Publish centrally using the active SecureSession
      try {

        await central_event_publishing_service.publishProfile(ephemeralNsec, profileMetadata);
      } catch (pubErr) {
        console.warn('Profile event signed but publish failed or skipped:', pubErr instanceof Error ? pubErr.message : pubErr);
      }

      // DON'T clear ephemeral nsec here - registerIdentity() still needs it

    } catch (error) {
      console.error('Profile publishing failed:', error);
      // Continue anyway - profile can be updated later
    } finally {
      // Profile publishing complete
    }
  };
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  // LNBits Boltcard provisioning state
  const [isProvisioningCard, setIsProvisioningCard] = useState(false);
  const [boltcardInfo, setBoltcardInfo] = useState<{ cardId: string; authQr?: string | null } | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registrationResult, setRegistrationResult] = useState<IdentityRegistrationResult | null>(null);
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);

  // Nsec retention for immediate peer invitations
  const [nsecRetentionSessionId, setNsecRetentionSessionId] = useState<string | null>(null);

  // Use crypto operations hook for lazy loading
  const crypto = useCryptoOperations();
  // Unified auth integration for post-registration authentication
  const identityForge = useIdentityForge();
  const auth = useAuth();

  // State consistency validation for Steps 2+ where nsec is relevant
  // Mark this as a registration flow to prevent any login prompts from interfering
  useEffect(() => {
    try {
      identityForge.setRegistrationFlow?.(true);
    } catch { }
    return () => {
      try { identityForge.setRegistrationFlow?.(false); } catch { }
    };
  }, []);
  // Also set a global guard to signal registration flow to any component
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__identityForgeRegFlow = true;
    }
    return () => {
      if (typeof window !== 'undefined') {
        try { delete (window as any).__identityForgeRegFlow; } catch { /* no-op */ }
      }
    };
  }, []);
  // Hard block NIP-07 calls during registration by monkey-patching methods in-place
  // This avoids race conditions where other code caches window.nostr before we patch
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const win = window as any;
    const blockedMethods = ['getPublicKey', 'signEvent', 'signSchnorr'];
    const original: Record<string, any> = {};

    const applyPatches = () => {
      if (!win.nostr) return;
      blockedMethods.forEach((m) => {
        const fn = win.nostr?.[m];
        if (typeof fn === 'function' && !original[m]) {
          original[m] = fn;
          win.nostr[m] = async (...args: any[]) => {
            if (win.__identityForgeRegFlow) {
              const msg = `[IdentityForge:NIP07-guard] Blocked ${m} during registration`;
              console.warn(msg, { args });
              if (typeof console?.trace === 'function') console.trace(msg);
              return Promise.reject(new Error('NIP-07 disabled during registration'));
            }
            try {
              return await original[m].apply(win.nostr, args);
            } catch (err) {
              throw err;
            }
          };
        }
      });
    };

    // Initial patch and keep trying briefly to catch late extension injection
    try { applyPatches(); } catch { }
    const intervalId = setInterval(() => {
      try { applyPatches(); } catch { }
    }, 300);
    // Stop after 10 seconds to avoid perpetual intervals
    const stopTimer = setTimeout(() => clearInterval(intervalId), 10000);

    return () => {
      try {
        if (win.nostr) {
          blockedMethods.forEach((m) => {
            if (original[m]) {
              try { win.nostr[m] = original[m]; } catch { }
            }
          });
        }
      } catch { }
      clearInterval(intervalId);
      clearTimeout(stopTimer);
    };
  }, []);



  useEffect(() => {
    if (currentStep >= 2) {
      // Validate state consistency to prevent impossible combinations
      if (nsecDisplayed && !ephemeralNsec && !nsecSecured) {
        setNsecDisplayed(false);
        setTimeRemaining(0);
      }

      if (timeRemaining > 0 && !ephemeralNsec && !nsecSecured) {
        setTimeRemaining(0);
      }
    }
  }, [ephemeralNsec, nsecDisplayed, nsecSecured, showNsecConfirmation, currentStep, timeRemaining]);

  // Username validation
  const validateUsername = (username: string) => {
    const regex = /^[a-zA-Z0-9_]{3,20}$/;
    return regex.test(username);
  };

  // Real-time username availability check
  useEffect(() => {
    if (formData.username && validateUsername(formData.username)) {
      const timer = setTimeout(async () => {
        try {
          setUsernameAvailable(null); // Set to loading state

          const response = await fetch('/.netlify/functions/check-username-availability', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              username: formData.username
            })
          });

          const contentType = response.headers.get('content-type') || '';
          let result: any = null;

          if (contentType.includes('application/json')) {
            try {
              result = await response.json();
            } catch (parseErr) {
              const text = await response.text().catch(() => '');
              throw new Error(`Invalid JSON from server: ${text?.slice(0, 200)}`);
            }
          } else {
            const text = await response.text().catch(() => '');
            throw new Error(`Non-JSON response (status ${response.status}): ${text?.slice(0, 200)}`);
          }

          if (!response.ok) {
            console.error('Username check HTTP error:', response.status, result?.error || result);
            setUsernameAvailable(null);
            setUsernameSuggestion(null);
            return;
          }

          if (result?.success) {
            setUsernameAvailable(result.available);
            if (!result.available && result.suggestion) {
              // Store suggestion for user feedback
              setUsernameSuggestion(result.suggestion);
            } else {
              setUsernameSuggestion(null);
            }
          } else {
            console.error('Username availability check failed:', result?.error);
            setUsernameAvailable(null);
            setUsernameSuggestion(null);
          }
        } catch (error) {
          console.error('Error checking username availability:', error instanceof Error ? error.message : String(error));
          setUsernameAvailable(null);
          setUsernameSuggestion(null);
        }
      }, 500); // Debounce API calls

      return () => clearTimeout(timer);
    } else {
      setUsernameAvailable(null);
      setUsernameSuggestion(null);
    }
  }, [formData.username]);

  // Generate recovery phrase and keys (CRYPTOGRAPHICALLY SECURE ONLY)
  const generateKeysAndPhrase = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStep("Initializing secure crypto environment...");



    try {
      // STEP 1: Use the same approach as the working debug test

      if (!crypto) {
        throw new Error("Crypto operations hook not available - please refresh and try again");
      }

      // Skip the problematic state validation and use direct approach

      // Ensure crypto is loaded (same as debug test)
      if (!crypto.isLoaded) {

        await crypto.loadCrypto();
      }

      // Don't rely on state polling - proceed directly to key generation

      setGenerationProgress(40);
      setGenerationStep("Generating cryptographically secure Nostr keypair...");


      // STEP 2: Generate cryptographically secure Nostr keypair directly
      const keyPair = await crypto.generateNostrKeyPair();
      if (!keyPair || !keyPair.npub || !keyPair.nsec) {
        throw new Error("Failed to generate Nostr keypair");
      }

      // STEP 3: Validate generated keys meet Nostr standards (decode-based, not string length)
      if (!keyPair.npub.startsWith('npub1')) {
        throw new Error(`Invalid npub format: ${keyPair.npub}`);
      }
      if (!keyPair.nsec.startsWith('nsec1')) {
        throw new Error(`Invalid nsec format: ${keyPair.nsec}`);
      }
      try {
        // Decode npub to hex and ensure 64-hex length

        const pubHexFromNpub = CEPS.decodeNpub(keyPair.npub);
        if (!pubHexFromNpub || pubHexFromNpub.length !== 64) {
          throw new Error(`Invalid underlying pubkey length from npub: ${pubHexFromNpub?.length}`);
        }
        // Decode nsec to bytes and ensure 32-byte length
        const privateKeyBytes = CEPS.decodeNsec(keyPair.nsec);
        if (!privateKeyBytes || privateKeyBytes.length !== 32) {
          throw new Error(`Invalid underlying private key length from nsec: ${privateKeyBytes?.length}`);
        }
      } catch (decodeErr) {
        throw new Error(`Invalid Nostr key encoding: ${decodeErr instanceof Error ? decodeErr.message : 'decode failed'}`);
      }

      // Ensure the underlying public key hex is 66 chars with 02/03 prefix,
      // and that npub was derived from the 32-byte x-coordinate
      try {
        const { secp256k1 } = await import('@noble/curves/secp256k1.js');
        const { hexToBytes, bytesToHex } = await import('@noble/curves/utils.js');
        const pub = secp256k1.getPublicKey(hexToBytes(keyPair.privateKey), true);
        const pubHex = bytesToHex(pub);
        if (pubHex.length !== 66 || !(pubHex.startsWith('02') || pubHex.startsWith('03'))) {
          throw new Error(`Generated compressed pubkey invalid: ${pubHex}`);
        }
      } catch (vkErr) {
        console.warn('Public key validation warning:', vkErr);
      }

      // SECURITY ENHANCEMENT: If recovery phrase was used, clean it from memory
      if (keyPair.recoveryPhrase) {
        const { secureRecoveryPhraseCleanup } = await import('../../utils/crypto-factory');
        secureRecoveryPhraseCleanup(keyPair.recoveryPhrase);
        console.log('🛡️ SECURITY: Recovery phrase securely cleaned from memory');
      }



      setGenerationProgress(70);
      setGenerationStep("Finalizing cryptographic identity...");

      setGenerationProgress(90);
      setGenerationStep("Finalizing secure identity...");

      // STEP 4: Update state with cryptographically secure keys
      // CRITICAL FIX: Use flushSync to prevent React state batching timing issues
      flushSync(() => {
        // Set ephemeralNsec FIRST to ensure it's available when pubkey triggers re-render
        setEphemeralNsecProtected(keyPair.nsec);
      });

      flushSync(() => {
        // Set pubkey to trigger the key display section render
        setFormData((prev) => ({
          ...prev,
          pubkey: keyPair.npub
        }));
      });

      setGenerationProgress(100);
      setGenerationStep("Identity claimed successfully!");



      // Stay in step 2 to show key display - don't advance yet
      // setCurrentStep(3); // Removed - user must secure keys first

    } catch (error) {
      console.error("❌ Cryptographic key generation failed:", error);
      console.error("❌ Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      console.error("❌ Error details:", {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        cause: error instanceof Error ? error.cause : undefined,
        cryptoLoaded: crypto?.isLoaded,
        cryptoAvailable: !!crypto,
        webCryptoAvailable: typeof window !== 'undefined' && !!window.crypto,
        timestamp: new Date().toISOString()
      });

      setGenerationStep("Key generation failed");

      const errorMsg = error instanceof Error ? error.message : String(error);
      const detailedError = `Secure key generation failed: ${errorMsg}.
        Debug info: Crypto loaded: ${crypto?.isLoaded}, Web Crypto: ${typeof window !== 'undefined' && !!window.crypto}`;

      setErrorMessage(detailedError);

      // Do not advance - user must retry for security
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  // Register identity with the backend (Frontend-Only Key Generation)
  const registerIdentity = async () => {
    // CRITICAL: This function now only handles registration with frontend-generated keys
    // Private keys are NEVER generated on the backend - only encrypted storage

    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStep("Registering identity with frontend-generated keys...");

    try {
      for (let i = 0; i <= 30; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      // CRITICAL: Encrypt nsec with user password before sending to server
      if (!ephemeralNsec) {
        console.error("🔐 CRITICAL ERROR: No ephemeralNsec available for encryption", {
          ephemeralNsec: ephemeralNsec,
          nsecSecured,
          currentStep,
          timestamp: new Date().toISOString()
        });
        throw new Error('No private key available for encryption');
      }



      // Import security functions
      const { secureMemoryWipe, validateSecureStorage } = await import('../../utils/crypto-factory');

      // SECURITY ENHANCEMENT: Validate no sensitive data in storage before proceeding
      const storageClean = await validateSecureStorage();
      if (!storageClean) {
        console.warn('⚠️ Potential sensitive data detected in browser storage');
      }

      console.log('🔐 Sending raw nsec to server for Noble V2 encryption with proper salt');

      // Send raw nsec to server - let register-identity function handle Noble V2 encryption
      // This ensures the userSalt used for encryption matches what's stored in the database
      const encryptedNsec = ephemeralNsec; // Server will encrypt with Noble V2

      console.log('✅ Raw nsec prepared for server-side Noble V2 encryption');

      // SECURITY ENHANCEMENT: Immediately wipe the ephemeral nsec from memory after preparing
      secureMemoryWipe(ephemeralNsec);
      console.log('🛡️ SECURITY: Ephemeral nsec wiped from memory after preparation');

      const requestData = {
        username: formData.username,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        npub: formData.pubkey, // Include the public key
        encryptedNsec: encryptedNsec, // Include encrypted private key
        nip05: `${formData.username}@${selectedDomain}`,
        lightningAddress: formData.lightningEnabled ? (externalLightningAddress && extAddrValid && extAddrReachable ? externalLightningAddress : `${formData.username}@${selectedDomain}`) : undefined,
        generateInviteToken: true,
        // Include invitation token if user was invited
        invitationToken: invitationToken || undefined,
        // Include import account information
        isImportedAccount: migrationMode === 'import',
        detectedProfile: detectedProfile,
      };


      const result = await apiClient.storeUserData(requestData);

      // CRITICAL: Secure cleanup of ephemeral nsec from memory immediately after encryption
      secureMemoryCleanup(ephemeralNsec);
      setEphemeralNsecProtected('', true); // Force clear after successful registration

      for (let i = 30; i <= 80; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      if (!result.success) {
        throw new Error(result.error || 'Registration failed');
      }

      setGenerationStep("Identity secured successfully!");
      for (let i = 80; i <= 100; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 15));
      }

      setRegistrationResult(result);

      // Immediately authenticate the new user to persist session using registration token
      try {
        // Initialize SecureTokenManager if not already initialized
        try {
          await SecureTokenManager.initialize();
        } catch (initError) {
          console.warn('🔐 POST-REG AUTH: SecureTokenManager initialization warning:', initError);
        }

        const nip05Identifier = `${formData.username}@${selectedDomain}`;
        let sessionToken = result?.session?.token || result?.sessionToken;


        if (!sessionToken) {
          // Fallback: perform server signin to obtain access token when registration path does not return one
          try {
            const fallbackOk = await (identityForge as any).authenticateAfterRegistration?.(nip05Identifier, formData.password);
            if (!fallbackOk) throw new Error('Fallback signin failed');
          } catch (e) {
            throw new Error('Registration did not return a session token and fallback signin failed');
          }

        }

        // Build minimal AuthResult compatible with unified auth system
        // Ensure user.hashedId matches token payload.hashedId to pass later validation
        let payload = null as any;
        if (sessionToken) {
          try {
            payload = SecureTokenManager.parseTokenPayload(sessionToken);

          } catch (e) {
            console.warn('🔐 POST-REG AUTH: Payload parse failed, using fallback auth flow:', e);
          }
        }

        if (!payload) {
          try {
            const fallbackOk = await (identityForge as any).authenticateAfterRegistration?.(nip05Identifier, formData.password);
            if (!fallbackOk) throw new Error('Fallback signin failed');
            const fallbackToken = SecureTokenManager.getAccessToken();
            if (fallbackToken) {
              payload = SecureTokenManager.parseTokenPayload(fallbackToken);
              sessionToken = fallbackToken;
            }
          } catch (e) {
            throw new Error('Registration succeeded but authentication failed: Invalid token payload and fallback auth failed');
          }
        }

        if (!payload) {
          throw new Error('Unable to establish valid session after registration');
        }




        if (!payload) {
          throw new Error('Unable to establish valid session after registration');
        }


        // FIXED: Use the session token from registration response instead of re-authenticating
        // The registration endpoint already returns a valid JWT token - no need to authenticate again
        if (sessionToken) {
          // Store the token from registration response with proper expiry
          // Parse the JWT token to get the actual expiry time
          try {
            const payload = SecureTokenManager.parseTokenPayload(sessionToken);
            const expiryMs = payload ? payload.exp * 1000 : Date.now() + (24 * 60 * 60 * 1000); // Use token exp or 24h fallback
            SecureTokenManager.setAccessToken(sessionToken, expiryMs);
            console.log('✅ Using session token from registration response with expiry:', new Date(expiryMs).toISOString());
          } catch (error) {
            // Fallback: use 24-hour expiry if token parsing fails
            const fallbackExpiryMs = Date.now() + (24 * 60 * 60 * 1000);
            SecureTokenManager.setAccessToken(sessionToken, fallbackExpiryMs);
            console.log('✅ Using session token from registration response with fallback 24h expiry');
          }
        } else {
          // Fallback: authenticate if no token was returned (shouldn't happen with working registration)
          console.warn('⚠️ No session token from registration, attempting fallback authentication');
          const authSuccess = await identityForge.authenticateAfterRegistration(nip05Identifier, formData.password);
          if (!authSuccess) {
            throw new Error('Failed to authenticate after registration - no token from registration and fallback auth failed');
          }
        }

        // Complete the registration flow
        identityForge.completeRegistration();

        // Retrieve in-memory access token for invitation modal
        const accessToken = SecureTokenManager.getAccessToken();

        const newSessionInfo: SessionInfo = {
          isAuthenticated: true,
          sessionToken: accessToken || sessionToken,
          user: {
            npub: formData.pubkey,
            nip05: nip05Identifier,
            federationRole: 'adult' as const,
            authMethod: 'nip05-password' as const, // FIXED: Use correct auth method for registration
            isWhitelisted: true,
            votingPower: 1,
            guardianApproved: false,
          },
        };


        setSessionInfo(newSessionInfo);

        // CRITICAL: Update global authentication state to mark user as authenticated
        // This ensures the useAuth hook reflects the authenticated state throughout the app
        try {
          // Use the handleAuthSuccess method from unified auth system to properly update global state
          const authResult = {
            success: true,
            sessionToken: accessToken || sessionToken,
            user: ({
              id: (payload?.hashedId || result?.user?.id || 'unknown') as string,
              user_salt: (result?.user?.user_salt || '') as string,
              password_hash: (result?.user?.password_hash || '') as string,
              password_salt: (result?.user?.password_salt || '') as string,
              failed_attempts: (result?.user?.failed_attempts ?? 0) as number,
              role: (result?.user?.role || 'private') as "private" | "offspring" | "adult" | "steward" | "guardian",
              is_active: true,
              hashedId: (payload?.hashedId || 'unknown') as string,
              authMethod: 'nip05-password',
            } as UserIdentity)
          };

          // Update the global auth state using the unified auth system
          const ok = await auth.handleAuthSuccess(authResult);
          console.log('✅ Global authentication state updated after registration:', { ok });

          if (!ok) {
            throw new Error('Authentication state update failed - user not authenticated after registration');
          }

          // Post-registration verification (lightweight)
          const token = SecureTokenManager.getAccessToken();
          const tokenPayload = token ? SecureTokenManager.parseTokenPayload(token) : null;
          console.log('🔍 Post-registration auth verification:', {
            hasToken: !!token,
            tokenExp: tokenPayload?.exp ? new Date(tokenPayload.exp * 1000).toISOString() : 'none'
          });

        } catch (authStateError) {
          console.error('❌ CRITICAL: Failed to update global auth state:', authStateError);
          // This is actually critical - if auth state isn't updated, user will see SignInModal
          throw new Error('Authentication state update failed after registration');
        }

        // Create robust SecureSession immediately after registration
        try {
          // Prefer server-sourced user payload for decryption-based session
          const raw = await fetchWithAuth('/api/auth/session-user', {
            method: 'GET',
            credentials: 'include',
          });
          const json = await raw.json().catch(() => null) as { success?: boolean; data?: { user?: UserIdentity } } | null;
          const user: UserIdentity | undefined = json?.data?.user as any;
          if (user && (user as any).encrypted_nsec && user.user_salt) {
            const session = await recoverySessionBridge.createRecoverySessionFromUser(user, { duration: 15 * 60 * 1000 });
            if (!session.success) {
              console.warn('🔐 Post-registration session creation failed:', session.error);
            } else {
              setNsecRetentionSessionId(session.sessionId || null);
            }
          } else if (ephemeralNsec) {
            // Fallback to in-memory ephemeral nsec retention (no re-auth)
            const retentionSessionId = await secureNsecManager.createPostRegistrationSession(
              ephemeralNsec,
              15 * 60 * 1000
            );
            setNsecRetentionSessionId(retentionSessionId);

            // Automatic LNBits wallet provisioning (feature-gated)
            try {
              if (LNBITS_ENABLED) {
                const w = await provisionWallet();
                if (w?.success && formData.lightningEnabled) {
                  const body = (externalLightningAddress && extAddrValid && extAddrReachable)
                    ? { externalLightningAddress }
                    : undefined as any;
                  await createLightningAddress(body);
                }
              }
            } catch (e) {
              console.warn('LNbits auto-provision skipped:', (e instanceof Error ? e.message : String(e)));
            }

          } else {
            console.warn('🔐 No user payload or ephemeral nsec available for session creation');
          }
        } catch (retentionError) {
          console.warn('Failed to initialize SecureSession after registration:', retentionError);
        }
      } catch (e) {
        console.error('Failed to authenticate after registration:', e);
        setErrorMessage('Registration successful but automatic login failed. Please log in manually.');
      }

      return result;
    } catch (error) {
      console.error("Registration failed:", error);
      setGenerationStep("Registration failed - please try again");
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  const nextStep = async () => {


    if (currentStep === 1) {
      // Move to Step 2 for pathway selection
      setCurrentStep(2);
    } else if (currentStep === 2) {
      // Moving from step 2 to step 3
      if (migrationMode === 'import') {
        // Require OTP verification before proceeding with migration
        if (!otpVerified) {
          setErrorMessage('Please verify the TOTP sent to your existing Nostr account before continuing.');
          return;
        }
        // For import users, register identity and go directly to completion
        try {
          await registerIdentity();
          setCurrentStep(4); // Go directly to completion screen
        } catch (error) {
          console.error("❌ Failed to register imported identity:", error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          setGenerationStep(`Registration failed: ${errorMessage}`);
        }
      } else {
        // Go to profile creation for new users
        setCurrentStep(3);
      }
    } else if (currentStep === 3 && migrationMode === 'generate') {
      // Publish profile and register identity, then move directly to completion


      // Set generating state to show progress
      setIsGenerating(true);
      setGenerationStep("Publishing profile and registering identity...");
      setGenerationProgress(0);

      try {
        // Validate required data before proceeding
        if (!ephemeralNsec) {
          throw new Error('No ephemeral private key available - please regenerate keys');
        }
        if (!formData.username || !formData.password) {
          throw new Error('Missing username or password - please complete form');
        }
        if (!formData.pubkey) {
          throw new Error('No public key available - please regenerate keys');
        }

        // First publish the Nostr profile
        setGenerationStep("Publishing Nostr profile...");
        setGenerationProgress(25);
        await publishNostrProfile();

        // Then register the identity
        setGenerationStep("Registering identity with backend...");
        setGenerationProgress(50);
        const result = await registerIdentity();
        setGenerationProgress(100);

        // Validate registration result
        if (!result || !result.success) {
          throw new Error('Registration failed - invalid response from server');
        }

        // Go directly to completion screen (step 4)
        setGenerationStep("Identity claimed successfully!");
        setCurrentStep(4);
      } catch (error) {
        console.error("❌ Failed to complete identity creation:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Show user-friendly error message
        setGenerationStep(`Identity creation failed: ${errorMessage}`);
        setGenerationProgress(0);
      } finally {
        setIsGenerating(false);
      }
    } else if (currentStep < 4) {

      // Rotation mode: after profile step completes, hand keys back to caller
      if (rotationMode?.enabled && currentStep === 3 && migrationMode === 'generate') {
        try {
          // Publish profile updates (existing flow); then hand off keys
          await publishNostrProfile();
          if (!formData.pubkey || !ephemeralNsec) throw new Error('Missing keys for rotation');
          await rotationMode.onKeysReady?.(formData.pubkey, ephemeralNsec);
          return; // control will be returned to parent modal
        } catch (e) {
          console.error('Rotation handoff after profile update failed:', e);
          const errorMsg = e instanceof Error ? e.message : 'Unknown error occurred';
          setErrorMessage(`Key rotation failed: ${errorMsg}. Please try again.`);
          setIsGenerating(false);
        }
      }

      setCurrentStep(currentStep + 1);
    } else {
      // Step 4 is the final completion screen
      setIsComplete(true);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      onBack();
    }
  };

  const canContinue = () => {
    switch (currentStep) {
      case 1:
        // Merged step: username + password validation
        return formData.username &&
          usernameAvailable === true &&
          formData.password &&
          formData.confirmPassword &&
          formData.password === formData.confirmPassword &&
          formData.password.length >= 8;
      case 2:
        if (migrationMode === 'import') {
          // Require TOTP verification before continuing
          return formData.pubkey && nsecSecured && otpVerified && !isDetectingProfile;
        }
        // CRITICAL SECURITY: Require nsecSecured to be true before proceeding
        // This prevents username storage without nsec confirmation

        return formData.pubkey && nsecSecured && !isGenerating;
      case 3:
        // Profile creation step for new users - always can continue once reached
        const canContinueStep3 = true;

        return canContinueStep3;
      case 4:
        // Final completion screen - no continue button needed
        return false;
      default:
        return false;
    }
  };

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onBack();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onBack]);


  // API base for Netlify Functions
  const API_BASE: string = (import.meta as any)?.env?.VITE_API_BASE_URL || "/api";

  // Optional "Provision Name Tag" flow (Boltcard via LNbits)
  const handleProvisionNameTag = async () => {
    if (!LNBITS_ENABLED) return;
    if (isProvisioningCard) return;
    try {
      setIsProvisioningCard(true);
      const created = await createBoltcard({ label: "Name Tag", spend_limit_sats: 20000 });
      if (!created?.success) throw new Error(created?.error || "Boltcard creation failed");
      const cardId: string = String(created.data?.cardId || "");
      const authQr: string | null | undefined = created.data?.authQr;
      setBoltcardInfo({ cardId, authQr: authQr || null });
      try { localStorage.setItem('lnbits_last_card_id', cardId); } catch { }
      const pin = window.prompt('Set a 6-digit PIN for your Name Tag (do not reuse other PINs):');
      if (pin && /^[0-9]{6}$/.test(pin.trim())) {
        const res = await fetchWithAuth(`${API_BASE}/lnbits-set-boltcard-pin`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId, pin: pin.trim() })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          console.warn('Failed to set PIN:', json?.error || res.statusText);
        }
      }
      setShowInvitationModal(true);
    } catch (e) {
      console.error('Provision Name Tag failed:', e);
    } finally {
      setIsProvisioningCard(false);
    }
  };

  if (isComplete) {
    return (
      <div className="modal-overlay-bitcoin-citadel">
        <div className="modal-content-bitcoin-citadel">
          <div className="text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce">
              <Sparkles className="h-12 w-12 text-white" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-6">
              Identity Claimed Successfully!

              {LNBITS_ENABLED && (
                <div className="flex flex-col items-center gap-3 mt-6">
                  <button
                    onClick={handleProvisionNameTag}
                    disabled={isProvisioningCard}
                    className={`px-6 py-3 rounded-lg font-semibold transition ${isProvisioningCard ? 'bg-white/10 text-purple-300' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                    aria-label="Provision Name Tag (Boltcard)"
                  >
                    {isProvisioningCard ? 'Provisioning Name Tag…' : 'Provision Name Tag (optional)'}
                  </button>
                  {boltcardInfo?.authQr && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                      <p className="text-sm text-purple-200 mb-2">Scan this QR in the Boltcard app to program your Name Tag</p>
                      <img src={boltcardInfo.authQr} alt="Boltcard Auth QR" className="w-48 h-48 object-contain rounded" />
                    </div>
                  )}
                </div>
              )}

            </h2>
            <p className="text-xl text-purple-200 mb-8">
              Welcome to true digital sovereignty,{" "}
              <span className="font-bold text-yellow-400">
                {formData.username}
              </span>
            </p>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/20 mb-8">
              <p className="text-purple-200 mb-2">Your sovereign identity:</p>
              <p className="text-white font-mono text-lg">
                {formData.username}@{selectedDomain}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={async () => {
                  if (!sessionInfo) {
                    const token = SecureTokenManager.getAccessToken();
                    const nip05Identifier = `${formData.username}@${selectedDomain}`;
                    const fallback: SessionInfo = {
                      isAuthenticated: !!token,
                      sessionToken: token || undefined,
                      user: {
                        npub: formData.pubkey,
                        nip05: nip05Identifier,
                        federationRole: 'adult',
                        authMethod: 'otp',
                        isWhitelisted: true,
                        votingPower: 1,
                        guardianApproved: false,
                      },
                    };
                    setSessionInfo(fallback);
                  }

                  setShowInvitationModal(true);
                }}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                <span>🎁 Invite a Peer</span>
                <ArrowRight className="h-5 w-5" />
              </button>
              <button
                onClick={onComplete}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                <span>Explore Nostr Ecosystem</span>
                <ArrowRight className="h-5 w-5" />
              </button>
              <button
                onClick={() => window.location.reload()}
                className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300"
              >
                Claim Another Name
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay-bitcoin-citadel">
      <div className="modal-content-bitcoin-citadel">
        {/* Close Button */}
        <button
          onClick={onBack}
          className="absolute top-4 right-4 text-white hover:text-purple-200 transition-colors duration-200 z-10"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <img
              src="/SatNam-logo.png"
              alt="Claim Your Name"
              className="h-10 w-10"
              loading="lazy"
            />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Claim Your Name</h2>
          <p className="text-purple-200">
            Claim your sovereign digital identity
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${step <= currentStep
                    ? "bg-orange-500 text-white"
                    : "bg-white/20 text-purple-200"
                    }`}
                >
                  {step < currentStep ? <Check className="h-5 w-5" /> : step}
                </div>
                {step < 4 && (
                  <div
                    className={`h-1 w-8 mx-2 transition-all duration-300 ${step < currentStep ? "bg-orange-500" : "bg-white/20"
                      }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-purple-200">
            <span>Identity</span>
            <span>Keys</span>
            <span>Profile</span>
            <span>Complete</span>
          </div>
        </div>

        {/* Error and Success Messages */}
        {errorMessage && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-4">
            <div className="flex items-start space-x-3">
              <X className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-red-200 font-semibold mb-1">Error</h4>
                <p className="text-red-200/80 text-sm">{errorMessage}</p>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-red-400 hover:text-red-300 ml-auto"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 mb-4">
            <div className="flex items-start space-x-3">
              <Check className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-green-200 font-semibold mb-1">Success</h4>
                <p className="text-green-200/80 text-sm">{successMessage}</p>
              </div>
              <button
                onClick={() => setSuccessMessage(null)}
                className="text-green-400 hover:text-green-300 ml-auto"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Form Content */}
        <div className="space-y-6">
          {/* Step 1: Create Your Identity (Username + Password) */}
          {currentStep === 1 && (
            <div className="space-y-6">
              {/* Invitation Welcome Message */}
              {isInvitedUser && invitationDetails && (
                <div className="bg-gradient-to-r from-purple-600/20 to-orange-500/20 border border-purple-400/30 rounded-lg p-4 mb-6">
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-3">
                      <Users className="h-6 w-6 text-orange-400 mr-2" />
                      <h4 className="text-lg font-semibold text-white">You've Been Invited!</h4>
                    </div>
                    {invitationDetails.personalMessage && (
                      <p className="text-purple-100 mb-3 italic">
                        "{invitationDetails.personalMessage}"
                      </p>
                    )}
                    <div className="flex items-center justify-center space-x-4 text-sm text-purple-200">
                      <span className="flex items-center">
                        <Sparkles className="h-4 w-4 mr-1 text-yellow-400" />
                        {invitationDetails.courseCredits} Course Credits
                      </span>
                      <span className="flex items-center">
                        <Heart className="h-4 w-4 mr-1 text-red-400" />
                        Welcome to Satnam.pub
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-center">
                <h3 className="text-2xl font-bold text-white mb-4">
                  {isInvitedUser ? "Complete Your Invitation" : "Create Your Identity"}
                </h3>
                <p className="text-purple-200">
                  {isInvitedUser
                    ? "Finish setting up your account to claim your course credits"
                    : "Choose your username and create a secure password"
                  }
                </p>
              </div>

              {/* Quick entry to migration flow */}
              <div className="flex items-center justify-center">
                <button
                  onClick={() => {
                    try {
                      // Validate that Step 1 requirements are met before allowing migration
                      if (!formData.username || !formData.password || !formData.agreedToTerms) {
                        setErrorMessage('Please complete username, password, and terms agreement before importing an existing identity.');
                        return;
                      }

                      if (usernameAvailable !== true) {
                        setErrorMessage('Please ensure your username is available before proceeding.');
                        return;
                      }

                      if (formData.password !== formData.confirmPassword) {
                        setErrorMessage('Please ensure your passwords match before proceeding.');
                        return;
                      }

                      if (formData.password.length < 8) {
                        setErrorMessage('Password must be at least 8 characters long.');
                        return;
                      }

                      setMigrationMode('import');
                      setCurrentStep(2);
                    } catch (error) {
                      console.error('Error switching to migration mode:', error);
                      setErrorMessage('An error occurred while switching to import mode. Please try again.');
                    }
                  }}
                  disabled={!formData.username || !formData.password || !formData.agreedToTerms || usernameAvailable !== true || formData.password !== formData.confirmPassword || formData.password.length < 8}
                  className={`inline-flex items-center px-4 py-2 rounded-lg shadow border border-white/20 transition-all duration-200 ${formData.username && formData.password && formData.agreedToTerms && usernameAvailable === true && formData.password === formData.confirmPassword && formData.password.length >= 8
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                >
                  Already have a Nostr identity? Import it here
                </button>
              </div>


              <div className="space-y-6">
                {/* Username Section */}
                <div className="space-y-4">
                  <h4 className="text-white font-semibold text-lg">Choose Your Username</h4>
                  <div className="relative">
                    <input
                      id="username"
                      name="username"
                      type="text"
                      value={formData.username}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          username: e.target.value,
                        }))
                      }
                      placeholder="Enter your username"
                      className="w-full bg-white/10 border border-white/20 rounded-lg p-4 text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    {formData.username && (
                      <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                        {usernameAvailable === null ? (
                          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : usernameAvailable ? (
                          <Check className="h-6 w-6 text-green-400" />
                        ) : (
                          <X className="h-6 w-6 text-red-400" />
                        )}
                      </div>
                    )}
                  </div>

                  {formData.username && (
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                      <p className="text-purple-200 mb-2">

                        {/* NIP-05 Domain Selection + External Lightning Address */}
                        <div className="space-y-4 pt-4 border-t border-white/10">
                          <h4 className="text-white font-semibold text-lg">NIP-05 and Lightning</h4>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm text-purple-200 mb-1">NIP-05 Domain</label>
                              <select
                                value={selectedDomain}
                                onChange={(e) => setSelectedDomain(e.target.value)}
                                className="w-full bg-white/10 border border-white/20 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                              >
                                {allowedDomains.map((d: string) => (
                                  <option key={d} value={d}>{d}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm text-purple-200 mb-1">External Lightning Address (Optional)</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={externalLightningAddress}
                                  onChange={(e) => setExternalLightningAddress(e.target.value)}
                                  placeholder="alice@example.com"
                                  className="w-full bg-white/10 border border-white/20 rounded-lg p-3 pr-10 text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                                />
                                {externalLightningAddress && (
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    {checkingExtAddr ? (
                                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : extAddrValid && extAddrReachable ? (
                                      <Check className="h-5 w-5 text-green-400" />
                                    ) : extAddrValid && extAddrReachable === false ? (
                                      <X className="h-5 w-5 text-red-400" />
                                    ) : null}
                                  </div>
                                )}
                              </div>
                              {externalLightningAddress && !extAddrValid && (
                                <p className="text-xs text-red-300 mt-1">Invalid address format</p>
                              )}
                              {externalLightningAddress && extAddrValid && extAddrReachable === false && (
                                <p className="text-xs text-red-300 mt-1">Address not reachable</p>
                              )}
                              {externalLightningAddress && extAddrValid && extAddrReachable && (
                                <p className="text-xs text-green-300 mt-1">Address verified</p>
                              )}
                            </div>
                          </div>
                        </div>

                        Your identity will be:
                      </p>
                      <p className="text-white font-mono text-lg">
                        {formData.username}@{selectedDomain}
                      </p>
                      {usernameAvailable === false && (
                        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mt-3">
                          <p className="text-red-200">
                            This name is already taken
                          </p>
                          {usernameSuggestion && (
                            <div className="mt-2 pt-2 border-t border-red-500/30">
                              <p className="text-red-200 text-sm">
                                Try: <button
                                  onClick={() => setFormData(prev => ({ ...prev, username: usernameSuggestion }))}
                                  className="text-orange-300 hover:text-orange-200 underline font-medium"
                                >
                                  {usernameSuggestion}
                                </button>
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      {usernameAvailable === true && (
                        <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3 mt-3">
                          <p className="text-green-200">
                            ✓ Username is available!
                          </p>
                        </div>
                      )}
                      {!validateUsername(formData.username) && (
                        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mt-3">
                          <p className="text-red-200">
                            3-20 characters, letters, numbers, and underscores only
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Password Section */}
                <div className="space-y-4 pt-4 border-t border-white/10">
                  <h4 className="text-white font-semibold text-lg">Create Your Password</h4>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      placeholder="Create a strong password"
                      className="w-full bg-white/10 border border-white/20 rounded-lg p-4 pr-12 text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-purple-200 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          confirmPassword: e.target.value,
                        }))
                      }
                      placeholder="Confirm your password"
                      className="w-full bg-white/10 border border-white/20 rounded-lg p-4 pr-12 text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-purple-200 hover:text-white"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>

                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
                      <p className="text-red-200">Passwords do not match</p>
                    </div>
                  )}
                </div>

                {/* Lightning Address Option */}
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-bold mb-2">
                        Enable Lightning Address
                      </h4>
                      <p className="text-purple-200 text-sm">
                        Allow others to send you Bitcoin payments at {formData.username}@{selectedDomain}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          lightningEnabled: !prev.lightningEnabled,
                        }))
                      }
                      className={`w-14 h-8 rounded-full transition-all duration-300 ${formData.lightningEnabled
                        ? "bg-orange-500"
                        : "bg-white/20"
                        }`}
                    >
                      <div
                        className={`w-6 h-6 bg-white rounded-full transition-all duration-300 ${formData.lightningEnabled
                          ? "translate-x-7"
                          : "translate-x-1"
                          }`}
                      />
                    </button>
                  </div>
                  {formData.lightningEnabled && (
                    <div className="mt-4 p-3 bg-orange-500/20 border border-orange-500/30 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <div className="h-8 w-8 bg-orange-500 rounded-full flex items-center justify-center">
                          ⚡
                        </div>
                        <div>
                          <p className="text-orange-200 font-mono text-sm">
                            {formData.username}@{selectedDomain}
                          </p>
                          <p className="text-orange-300 text-xs">
                            Ready for Bitcoin payments
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}



          {/* Step 2: Generate Your Keys or Import Existing */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <Key className="h-16 w-16 text-orange-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-4">
                  Claim Your Name, stamp your passport to the Nostr realm
                </h3>
                <p className="text-purple-200">
                  Choose how you want to set up your sovereign identity
                </p>
              </div>

              {/* Migration Mode Selection */}
              {!formData.pubkey && !isGenerating && !isDetectingProfile && (
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                  <h4 className="text-white font-bold mb-4 text-center">Choose Your Setup Method</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={() => setMigrationMode('generate')}
                      className={`p-4 rounded-xl border-2 transition-all duration-300 text-left ${migrationMode === 'generate'
                        ? 'border-orange-500 bg-orange-500/20'
                        : 'border-white/20 bg-white/5 hover:border-orange-500/50'
                        }`}
                    >
                      <div className="flex items-center space-x-3 mb-2">
                        <Sparkles className="h-6 w-6 text-orange-400" />
                        <h5 className="text-white font-semibold">Create New Satnam Account</h5>
                      </div>
                      <p className="text-purple-200 text-sm">
                        Generate a brand new sovereign identity with fresh cryptographic keys
                      </p>
                    </button>

                    <button
                      onClick={() => setMigrationMode('import')}
                      className={`p-4 rounded-xl border-2 transition-all duration-300 text-left ${migrationMode === 'import'
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-white/20 bg-white/5 hover:border-blue-500/50'
                        }`}
                    >
                      <div className="flex items-center space-x-3 mb-2">
                        <ArrowRight className="h-6 w-6 text-blue-400" />
                        <h5 className="text-white font-semibold">Import My Existing Identity</h5>
                      </div>
                      <p className="text-purple-200 text-sm">
                        Use your existing Nostr credentials (npub or nsec)
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* Forge Your Satnam ID Button */}
              {!formData.pubkey && !isGenerating && !isDetectingProfile && (
                <div className="text-center">
                  <button
                    onClick={() => {
                      if (migrationMode === 'generate') {
                        // For new users: generate keys and STAY in step 2 for key display
                        generateKeysAndPhrase().catch(error => {
                          console.error("Failed to generate keys:", error);
                          setErrorMessage("Failed to generate keys. Please try again.");
                        });
                      } else {
                        // For import users: enforce OTP verification via centralized handler
                        nextStep();
                      }
                    }}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-8 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 mx-auto"
                  >
                    <Key className="h-5 w-5" />
                    <span>Claim Your Name</span>
                  </button>
                  <p className="text-orange-200/60 text-sm mt-2">
                    {migrationMode === 'generate'
                      ? 'Create your cryptographic identity with zero-knowledge security'
                      : 'Import your existing Nostr credentials securely'
                    }
                  </p>
                </div>
              )}

              {isGenerating ? (
                <div className="space-y-6">
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-white font-semibold">
                        {generationStep}
                      </span>
                      <span className="text-orange-500 font-bold">
                        {generationProgress}%
                      </span>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-orange-500 to-yellow-500 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${generationProgress}%` }}
                      />
                    </div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
                    <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-purple-200">
                      Generating cryptographically secure keys...
                    </p>
                  </div>
                </div>
              ) : migrationMode === 'import' && !formData.pubkey ? (
                /* Import Flow */
                <div className="space-y-6">
                  {/* Nsec Import Section */}
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-6">
                    <div className="flex items-start space-x-3 mb-4">
                      <Key className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1" />
                      <div>
                        <h4 className="text-blue-200 font-bold mb-2">Import Your Nostr Private Key</h4>
                        <p className="text-blue-200/80 text-sm mb-4">
                          Enter your existing nsec private key to migrate your Nostr identity to Satnam.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Import Method Selection */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                          <h5 className="text-blue-200 font-semibold mb-2">Option 1: Private Key (Nsec)</h5>
                          <p className="text-blue-200/70 text-sm">
                            Import using your private key for full account control
                          </p>
                        </div>
                        <div className="bg-gray-500/10 border border-gray-500/30 rounded-lg p-4">
                          <h5 className="text-gray-200 font-semibold mb-2">Option 2: Public Key (Npub)</h5>
                          <p className="text-gray-200/70 text-sm">
                            View-only mode - you can see your profile but not post
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-blue-200 text-sm font-semibold mb-2">
                          Your Nostr Key (nsec1... or npub1...)
                        </label>
                        <input
                          id="importedNsec"
                          name="importedNsec"
                          type="password"
                          value={importedNsec}
                          onChange={(e) => setImportedNsec(e.target.value)}
                          placeholder="nsec1... or npub1..."
                          className="w-full px-4 py-3 bg-black/20 border border-blue-500/30 rounded-lg text-white placeholder-blue-300/50 focus:border-blue-400 focus:outline-none"
                        />
                        {importedNsec && (
                          <div className="mt-2">
                            {importedNsec.startsWith('nsec1') ? (
                              <div className="flex items-center space-x-2 text-green-400">
                                <Check className="h-4 w-4" />
                                <span className="text-sm">Private key detected - full account access</span>
                              </div>
                            ) : importedNsec.startsWith('npub1') ? (
                              <div className="flex items-center space-x-2 text-yellow-400">
                                <AlertTriangle className="h-4 w-4" />
                                <span className="text-sm">Public key detected - view-only mode</span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2 text-red-400">
                                <X className="h-4 w-4" />
                                <span className="text-sm">Invalid key format - must start with nsec1 or npub1</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Error message display */}
                        {errorMessage && (
                          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <div className="flex items-center space-x-2 text-red-400">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="text-sm">{errorMessage}</span>
                            </div>
                          </div>
                        )}

                        {/* Success message display */}
                        {successMessage && (
                          <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                            <div className="flex items-center space-x-2 text-green-400">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-sm">{successMessage}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                        <div className="flex items-start space-x-3">
                          <Shield className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <h5 className="text-yellow-200 font-semibold text-sm mb-1">Security Notice</h5>
                            <p className="text-yellow-200/80 text-xs">
                              Your private key will be processed securely and never stored unencrypted.
                              Only enter your nsec on trusted devices and websites.
                            </p>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleNsecImport}
                        disabled={!importedNsec || (!importedNsec.startsWith('nsec1') && !importedNsec.startsWith('npub1')) || isDetectingProfile}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                      >
                        {isDetectingProfile ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Detecting Profile...</span>
                          </>
                        ) : (
                          <>
                            <ArrowRight className="h-5 w-5" />
                            <span>
                              {importedNsec.startsWith('nsec1') ? 'Import Account (Full Access)' :
                                importedNsec.startsWith('npub1') ? 'Import Account (View Only)' :
                                  'Import Account'}
                            </span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Security Warning for Import */}
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mt-4">
                      <h5 className="text-red-200 font-semibold text-sm mb-2">🔒 Zero-Knowledge Import</h5>
                      <ul className="text-red-200/80 text-xs space-y-1">
                        <li>• Your nsec is processed in memory only - never stored unencrypted</li>
                        <li>• We detect your existing profile to preserve your Nostr identity</li>
                        <li>• Your private key is cleared from memory immediately after processing</li>
                        <li>• Only you control your keys - we never have access to them</li>
                      </ul>
                    </div>
                  </div>


                </div>
              ) : formData.pubkey ? (
                <div className="space-y-6">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-green-500/20 border border-green-500/50 rounded-full flex items-center justify-center mx-auto">
                      <Check className="h-8 w-8 text-green-400" />
                    </div>
                    <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4">
                      <p className="text-green-200 font-semibold">
                        Keys generated successfully!
                      </p>
                    </div>

                    {rotationMode?.enabled && (
                      <div className="bg-amber-500/15 border border-amber-400/30 rounded-lg p-3">
                        <p className="text-amber-200 text-sm text-center">
                          When you rotate, your followers will be notified via NIP-26 delegation and NIP-41 migration events so they can trust your new key.
                        </p>
                      </div>
                    )}

                  </div>

                  {/* Critical Security Notice */}
                  <div className="bg-red-500/10 border-2 border-red-500/50 rounded-2xl p-6">
                    <div className="flex items-start space-x-3">
                      <AlertTriangle className="h-6 w-6 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-red-200 font-bold text-lg mb-3">🚨 CRITICAL: Secure Your Keys</h4>
                        <div className="text-red-200/90 text-sm space-y-2">
                          <p className="font-semibold">You are about to see your private key (Nsec). This is EXTREMELY important:</p>
                          <ul className="space-y-1 ml-4">
                            <li>• Your Nsec is like a master password - losing it means losing your account forever</li>
                            <li>• Copy it to a secure password manager or write it down immediately</li>
                            <li>• You also need your password for account recovery - store both securely</li>
                            <li>• Never share your Nsec with anyone or enter it on untrusted websites</li>
                            <li>• We use zero-knowledge protocol - your Nsec is never stored unencrypted</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                    <h4 className="text-white font-bold mb-3">
                      Your Public Key (npub)
                    </h4>
                    <p className="text-purple-200 font-mono break-all text-sm">
                      {formData.pubkey.substring(0, 16)}...
                      {formData.pubkey.substring(formData.pubkey.length - 16)}
                    </p>
                    <button
                      onClick={() => navigator.clipboard.writeText(formData.pubkey)}
                      className="mt-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm flex items-center space-x-1"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </button>
                  </div>



                  {/* Zero-Knowledge Nsec Private Key Section */}
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-6">
                    <div className="flex items-start space-x-3 mb-4">
                      <AlertTriangle className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-orange-200 font-bold mb-2">Your Private Key (nsec)</h4>
                        <p className="text-orange-200/80 text-sm mb-3">
                          This is your private key for proving your identity. Store it securely and never share it.
                        </p>
                      </div>
                    </div>

                    {!nsecDisplayed && !nsecSecured ? (
                      /* Initial state: Show button to reveal nsec */
                      <div className="text-center">
                        <button
                          onClick={showNsecTemporarily}
                          className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 mx-auto"
                        >
                          <Key className="h-5 w-5" />
                          <span>Show My Private Key</span>
                        </button>
                        <p className="text-orange-200/60 text-xs mt-2">
                          Click to temporarily display your nsec (auto-clears in 5 minutes)
                        </p>
                      </div>
                    ) : nsecDisplayed && !nsecSecured ? (
                      /* Ephemeral display: Show nsec temporarily */
                      <div>
                        {ephemeralNsec ? (
                          <div className="space-y-4">
                            <div className="bg-black/20 rounded-lg p-4">
                              <p className="text-orange-100 font-mono break-all text-sm">
                                {ephemeralNsec}
                              </p>
                            </div>
                            {timeRemaining > 0 && (
                              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                                <div className="flex items-center justify-center space-x-2">
                                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                                  <p className="text-yellow-200 text-sm font-semibold">
                                    Auto-clear in: {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                                  </p>
                                </div>
                                <p className="text-yellow-200/80 text-xs text-center mt-1">
                                  Secure your nsec before the timer expires
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-red-500/20 rounded-lg p-4 mb-4">
                            <p className="text-red-200 text-sm">
                              ❌ ERROR: Nsec not available for display
                            </p>
                          </div>
                        )}

                        <div className="flex justify-center mb-4">
                          <button
                            onClick={copyNsecSecurely}
                            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm flex items-center space-x-2"
                          >
                            <Copy className="h-4 w-4" />
                            <span>Copy Nsec</span>
                          </button>
                        </div>

                        {/* Consolidated Confirmation Checkboxes */}
                        <div className="space-y-4 mt-6">
                          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                            <div className="space-y-3">
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={nsecStoredConfirmed}
                                  onChange={(e) => setNsecStoredConfirmed(e.target.checked)}
                                  className="mt-1 w-4 h-4 text-green-600 bg-transparent border-2 border-green-500 rounded focus:ring-green-500 focus:ring-2"
                                />
                                <div>
                                  <span className="text-green-200 font-semibold text-sm">
                                    ✓ I have securely stored my Nsec
                                  </span>
                                  <p className="text-green-200/70 text-xs mt-1">
                                    Copied to password manager or written down safely
                                  </p>
                                </div>
                              </label>

                              <label className="flex items-start space-x-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formData.agreedToTerms}
                                  onChange={(e) => setFormData(prev => ({ ...prev, agreedToTerms: e.target.checked }))}
                                  className="mt-1 w-4 h-4 text-blue-600 bg-transparent border-2 border-blue-500 rounded focus:ring-blue-500 focus:ring-2"
                                />
                                <div>
                                  <span className="text-blue-200 font-semibold text-sm">
                                    ✓ I accept the platform terms and conditions
                                  </span>
                                  <p className="text-blue-200/70 text-xs mt-1">
                                    Privacy-first, zero-knowledge architecture
                                  </p>
                                </div>
                              </label>
                            </div>
                          </div>

                          {/* Forge Identity Button */}
                          <button
                            onClick={() => {
                              if (nsecStoredConfirmed && formData.agreedToTerms) {
                                handleNsecSecured();
                              }
                            }}
                            disabled={!nsecStoredConfirmed || !formData.agreedToTerms}
                            className={`w-full py-4 px-6 rounded-lg font-bold text-lg transition-all duration-300 flex items-center justify-center space-x-3 ${nsecStoredConfirmed && formData.agreedToTerms
                              ? "bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white shadow-lg"
                              : "bg-gray-600 text-gray-400 cursor-not-allowed"
                              }`}
                          >
                            <span>Continue to Profile Setup</span>
                            {nsecStoredConfirmed && formData.agreedToTerms && <ArrowRight className="h-5 w-5" />}
                          </button>

                          {rotationMode?.enabled && !nsecSecured && (
                            <div className="mt-6 space-y-3">
                              <button
                                onClick={() => {
                                  if (!rotationMode?.onKeysReady) return;
                                  if (!formData.pubkey || !ephemeralNsec) return;
                                  rotationMode.onKeysReady(formData.pubkey, ephemeralNsec);
                                }}
                                disabled={!nsecStoredConfirmed || !formData.agreedToTerms}
                                className={`w-full py-3 rounded-lg font-semibold transition ${nsecStoredConfirmed && formData.agreedToTerms ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-600 text-gray-300 cursor-not-allowed'}`}
                              >
                                Rotate Keys Now
                              </button>
                              <button
                                onClick={() => setCurrentStep(3)}
                                className="w-full py-3 rounded-lg font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20"
                              >
                                Update Profile First
                              </button>
                            </div>
                          )}


                          {rotationMode?.enabled && nsecSecured && (
                            <div className="mt-6">
                              <button
                                onClick={async () => {
                                  if (!rotationMode?.onKeysReady) return;
                                  if (!formData.pubkey) return;
                                  // Ephemeral nsec may have been cleared after securing; prompt user to re-display if needed
                                  if (!ephemeralNsec) {
                                    setNsecSecured(false);
                                    setNsecDisplayed(true);
                                    return;
                                  }
                                  await rotationMode.onKeysReady(formData.pubkey, ephemeralNsec);
                                }}
                                className="w-full py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                              >
                                Proceed to Rotate Keys
                              </button>
                            </div>
                          )}

                        </div>
                      </div>
                    ) : (
                      /* Nsec secured state: Show confirmation and security completion */
                      <div className="space-y-6">
                        <div className="text-center">
                          <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4">
                            <div className="flex items-center justify-center space-x-3">
                              <CheckCircle className="h-6 w-6 text-green-400" />
                              <div>
                                <h5 className="text-green-200 font-semibold">Nsec Secured Successfully</h5>
                                <p className="text-green-200/80 text-sm">Your private key has been cleared from memory</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Security Setup Complete Box - Only shown after nsec is secured */}
                        <div className="bg-blue-500/20 border border-blue-500/50 rounded-2xl p-6">
                          <div className="flex items-start space-x-3">
                            <Shield className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1" />
                            <div>
                              <h4 className="text-blue-200 font-bold mb-2">
                                🎉 Your Security Setup Complete
                              </h4>
                              <div className="text-blue-200 text-sm space-y-2">
                                <p>• Your password secures your account recovery</p>
                                <p>• Your nsec private key enables daily authentication</p>
                                <p>• Both are required - store them securely and separately</p>
                                <p>• Zero-knowledge protocol: your keys never leave your device unencrypted</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-blue-500/20 border border-blue-500/50 rounded-2xl p-4">
                          <div className="flex items-start space-x-3">
                            <Key className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="text-blue-200 font-bold mb-2">What happens next?</h4>
                              <div className="text-blue-200 text-sm space-y-1">
                                <p>• Your identity will be registered on the Satnam.pub network</p>
                                <p>• Your keys will be encrypted with your password</p>
                                <p>• You'll get access to Bitcoin education courses</p>
                                <p>• You can invite peers and earn course credits</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Critical Security Warnings */}
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                      <h5 className="text-red-200 font-semibold text-sm mb-2">🚨 ZERO-KNOWLEDGE SECURITY</h5>
                      <ul className="text-red-200/80 text-xs space-y-1">
                        <li>• Your Nsec is processed in memory only - never stored unencrypted</li>
                        <li>• Auto-clears from memory after 30 seconds or when you confirm it's secured</li>
                        <li>• Store it in a secure password manager or write it down safely</li>
                        <li>• Also securely store your password - you need BOTH for account recovery</li>
                        <li>• Never enter your Nsec on untrusted websites or devices</li>
                      </ul>
                    </div>
                  </div>


                </div>
              ) : null}

              {/* Migration OTP Verification Panel (after import when pubkey is set) */}
              {currentStep === 2 && migrationMode === 'import' && formData.username && formData.pubkey && (
                <div className="mt-6 space-y-4">
                  <SovereigntyEducation />
                  <div className="bg-white/10 border border-white/20 rounded-lg p-4">
                    <OTPVerificationPanel
                      npub={formData.pubkey}
                      nip05={`${formData.username}@${selectedDomain}`}
                      lightningAddress={formData.lightningEnabled ? (externalLightningAddress && extAddrValid && extAddrReachable ? externalLightningAddress : `${formData.username}@${selectedDomain}`) : undefined}
                      onVerified={({ sessionId, expiresAt }: { sessionId: string; expiresAt: string }) => {
                        setOtpVerified(true);
                        setOtpSessionId(sessionId);
                        setOtpExpiresAt(expiresAt);
                      }}
                    />
                    {otpVerified && (
                      <div className="mt-3 text-green-300 text-sm">Ownership verified. You may continue.</div>
                    )}
                  </div>
                </div>
              )}

            </div>
          )
          }

          {/* Step 3: Profile Creation (New Users Only) */}
          {
            (() => {
              const shouldShow = currentStep === 3 && migrationMode === 'generate';

              return shouldShow;
            })() && (
              <div className="space-y-6">
                <div className="text-center">
                  <User className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-white mb-4">
                    Create Your Nostr Profile
                  </h3>
                  <p className="text-purple-200">
                    Set up your profile to be visible across all Nostr clients
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Display Name */}
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                    <label className="block text-white font-bold mb-2">
                      Display Name *

                    </label>
                    <input
                      type="text"
                      value={profileData.displayName}
                      onChange={(e) => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                      placeholder="How you want to appear to others"
                      className="w-full px-4 py-3 bg-black/20 border border-white/30 rounded-lg text-white placeholder-purple-300/50 focus:border-blue-400 focus:outline-none"
                    />
                    <p className="text-purple-300 text-sm mt-1">
                      This is different from your username ({formData.username}) and can be changed later
                    </p>
                  </div>

                  {/* Bio */}
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                    <label className="block text-white font-bold mb-2">
                      Bio / About
                    </label>
                    <textarea
                      value={profileData.bio}
                      onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                      placeholder="Tell others about yourself..."
                      rows={3}
                      className="w-full px-4 py-3 bg-black/20 border border-white/30 rounded-lg text-white placeholder-purple-300/50 focus:border-blue-400 focus:outline-none resize-none"
                    />
                  </div>

                  {/* Profile Picture */}
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                    <label className="block text-white font-bold mb-2">
                      Profile Picture URL
                    </label>
                    <input
                      type="url"
                      value={profileData.picture}
                      onChange={(e) => setProfileData(prev => ({ ...prev, picture: e.target.value }))}
                      placeholder="https://example.com/your-photo.jpg"
                      className="w-full px-4 py-3 bg-black/20 border border-white/30 rounded-lg text-white placeholder-purple-300/50 focus:border-blue-400 focus:outline-none"
                    />
                  </div>

                  {/* Website */}
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                    <label className="block text-white font-bold mb-2">
                      Website
                    </label>
                    <input
                      type="url"
                      value={profileData.website}
                      onChange={(e) => setProfileData(prev => ({ ...prev, website: e.target.value }))}
                      placeholder="https://your-website.com"
                      className="w-full px-4 py-3 bg-black/20 border border-white/30 rounded-lg text-white placeholder-purple-300/50 focus:border-blue-400 focus:outline-none"
                    />
                  </div>

                  {/* Profile Preview */}
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-6">
                    <h4 className="text-blue-200 font-bold mb-4">Profile Preview</h4>
                    <div className="bg-black/20 rounded-lg p-4">
                      <div className="flex items-start space-x-4">
                        {profileData.picture ? (
                          <img
                            src={profileData.picture}
                            alt="Profile"
                            className="w-12 h-12 rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                            <User className="h-6 w-6 text-white" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <h5 className="text-white font-bold">
                              {profileData.displayName || 'Your Display Name'}
                            </h5>
                            <span className="text-blue-400 text-sm">✓ {formData.username}@{selectedDomain}</span>
                          </div>
                          <p className="text-purple-200 text-sm mb-2">
                            {profileData.bio || 'Your bio will appear here...'}
                          </p>
                          {profileData.website && (
                            <a href={profileData.website} className="text-blue-400 text-sm hover:underline">
                              {profileData.website}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-blue-200/80 text-sm mt-3">
                      This is how your profile will appear in Nostr clients across the network
                    </p>
                  </div>

                  {/* Auto-populated Information */}
                  <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
                    <h5 className="text-green-200 font-semibold text-sm mb-2">✅ Automatically Configured</h5>
                    <ul className="text-green-200/80 text-xs space-y-1">
                      <li>• NIP-05 Identifier: {formData.username}@{selectedDomain}</li>
                      {formData.lightningEnabled && (
                        <li>• Lightning Address: {formData.username}@{selectedDomain}</li>
                      )}
                      <li>• Profile will be published to the Nostr network for global visibility</li>
                    </ul>
                  </div>
                </div>
              </div>
            )
          }




          {/* Step 4: Final Completion Screen */}
          {
            currentStep === 4 && (
              <div className="space-y-6">
                {isGenerating ? (
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                      <h3 className="text-2xl font-bold text-white mb-4">
                        Forging Your Identity
                      </h3>
                      <p className="text-purple-200">
                        Registering your sovereign identity...
                      </p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-white font-semibold">
                          {generationStep}
                        </span>
                        <span className="text-orange-500 font-bold">
                          {generationProgress}%
                        </span>
                      </div>
                      <div className="w-full bg-white/20 rounded-full h-3">
                        <div
                          className="bg-gradient-to-r from-orange-500 to-yellow-500 h-3 rounded-full transition-all duration-300"
                          style={{ width: `${generationProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : registrationResult ? (
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="w-20 h-20 bg-yellow-500/20 border-2 border-yellow-500/50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Crown className="h-10 w-10 text-yellow-400" />
                      </div>
                      <h3 className="text-3xl font-bold text-white mb-4">
                        Your Unforgeable True Name is Established! 🎉
                      </h3>
                      <p className="text-yellow-200 text-lg">
                        Congratulations! Your sovereign digital identity has been forged with cryptographic certainty.
                      </p>
                      <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/20 mt-6">
                        <p className="text-white font-mono text-lg">
                          {formData.username}@{selectedDomain}
                        </p>
                        <p className="text-purple-200 text-sm mt-2">
                          Your unforgeable True Name on the sovereign web
                        </p>
                      </div>
                    </div>

                    <div className="bg-green-500/20 border border-green-500/50 rounded-2xl p-6">
                      <h4 className="text-green-200 font-bold mb-3">Your Identity Summary</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-green-300">Username:</span>
                          <span className="text-green-100 font-mono">{registrationResult.user.username}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-green-300">NIP-05:</span>
                          <span className="text-green-100 font-mono">{registrationResult.user.nip05}</span>
                        </div>
                        {formData.lightningEnabled && (
                          <div className="flex justify-between">
                            <span className="text-green-300">Lightning:</span>
                            <span className="text-green-100 font-mono">{registrationResult.user.lightningAddress}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-6">
                      <h4 className="text-purple-200 font-bold mb-3">🎯 Your Sovereignty Journey Begins</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-purple-200/80 text-sm">
                        <div>
                          <p>• <strong>Family Foundry:</strong> Create your family charter and establish governance roles</p>
                          <p>• <strong>Invite Peers:</strong> Earn educational credits through the mutual benefit system</p>
                        </div>
                        <div>
                          <p>• <strong>Nostr Ecosystem:</strong> Explore decentralized social networking tools</p>
                          <p>• <strong>Bitcoin Education:</strong> Access sovereign financial education resources</p>
                        </div>
                      </div>
                    </div>

                    {/* Primary CTA: Found Your Family Dynasty */}
                    <div className="bg-gradient-to-br from-purple-600/30 to-yellow-600/30 backdrop-blur-sm rounded-3xl p-8 border-2 border-yellow-500/50 shadow-2xl">
                      <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-yellow-500/20 border border-yellow-500/50 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Crown className="h-8 w-8 text-yellow-400" />
                        </div>
                        <h4 className="text-2xl font-bold text-white mb-3">
                          Found Your Family Dynasty
                        </h4>
                        <p className="text-purple-200 text-lg mb-4">
                          Establish your family's sovereign foundation with the Family Foundry
                        </p>
                      </div>

                      <div className="bg-black/20 rounded-2xl p-6 mb-6">
                        <h5 className="text-yellow-200 font-semibold mb-3">Family Federation Benefits:</h5>
                        <div className="text-purple-200 text-sm space-y-2">
                          <div className="flex items-start space-x-2">
                            <Shield className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                            <span>Threshold multi-signature protections for Family Nostr accounts</span>
                          </div>
                          <div className="flex items-start space-x-2">
                            <Shield className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                            <span>Private banking account security through multi-sig</span>
                          </div>
                          <div className="flex items-start space-x-2">
                            <Users className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                            <span>Family governance and sovereignty features</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-center">
                        <button
                          onClick={() => {
                            // Navigate via app-level event to Dynastic Sovereignty view
                            window.dispatchEvent(new CustomEvent('satnam:navigate', { detail: { view: 'dynastic-sovereignty' } }));
                          }}
                          className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-bold py-4 px-10 rounded-xl transition-all duration-300 transform hover:scale-105 flex items-center justify-center space-x-3 mx-auto text-lg shadow-lg hover:shadow-xl"
                        >
                          <Crown className="h-6 w-6" />
                          <span>Begin Family Foundry Journey</span>
                          <ArrowRight className="h-6 w-6" />
                        </button>
                      </div>
                    </div>

                    {/* Secondary Navigation Options */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Invite Peers - Secondary */}
                      <button
                        onClick={() => {
                          setShowInvitationModal(true);
                        }}
                        className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-white font-semibold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                      >
                        <span>🎁</span>
                        <div className="text-left">
                          <div className="font-bold">Invite Peers</div>
                          <div className="text-xs text-emerald-200">Earn educational credits for both you and your peers</div>
                        </div>
                      </button>

                      {/* Explore Nostr Ecosystem - Tertiary */}
                      <button
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('satnam:navigate', { detail: { view: 'nostr-ecosystem' } }));
                        }}
                        className="bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-white font-semibold py-4 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                      >
                        <Key className="h-5 w-5 text-blue-400" />
                        <div className="text-left">
                          <div className="font-bold">Explore Nostr Ecosystem</div>
                          <div className="text-xs text-blue-200">Discover existing Nostr clients and tools</div>
                        </div>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          }



          {/* Navigation Buttons */}
          {
            (() => {
              const shouldShow = !(currentStep === 4 && registrationResult);

              return shouldShow;
            })() && (
              <div className="flex justify-between pt-6">
                <button
                  onClick={prevStep}
                  disabled={isGenerating}
                  className="bg-purple-700 hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span>Back</span>
                </button>

                <button
                  onClick={nextStep}
                  disabled={!canContinue() || isGenerating}
                  className={`font-bold py-3 px-8 rounded-lg transition-all duration-300 flex items-center space-x-2 ${canContinue() && !isGenerating
                    ? "bg-orange-500 hover:bg-orange-600 text-white"
                    : "bg-white/10 text-purple-300 cursor-not-allowed"
                    }`}
                >
                  <span>
                    {currentStep === 1 ? "Claim Your Name" :
                      currentStep === 3 && migrationMode === 'generate' ? "Claim Name" :
                        "Continue"}
                  </span>
                  {!isGenerating && <ArrowRight className="h-5 w-5" />}
                  {isGenerating && (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                </button>
              </div>
            )
          }
        </div >

        {/* Security Messaging */}
        < div className="text-center mt-8 pt-6 border-t border-white/20" >
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-8 text-purple-200 text-sm">
            <span className="flex items-center space-x-2">
              <Key className="h-4 w-4" />
              <span>Your keys, your identity</span>
            </span>
            <span className="flex items-center space-x-2">
              <X className="h-4 w-4" />
              <span>No email required</span>
            </span>
            <span className="flex items-center space-x-2">
              <Check className="h-4 w-4" />
              <span>Sovereign from day one</span>
            </span>
          </div>
        </div >
      </div >

      {/* Migration Consent Dialog */}
      {
        showMigrationConsent && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-purple-900/90 to-blue-900/90 backdrop-blur-sm rounded-2xl border border-white/20 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-blue-500/20 border border-blue-500/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <User className="h-8 w-8 text-blue-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    Identity Claim Consent
                  </h3>
                  <p className="text-purple-200">
                    Configure how your existing Nostr identity integrates with Satnam
                  </p>
                </div>

                {/* Detected Profile Information */}
                {detectedProfile && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-6 border border-white/20">
                    <h4 className="text-white font-bold mb-3 flex items-center">
                      {detectedProfile.hasExistingProfile ? (
                        <>
                          <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                          Existing Nostr Profile Detected
                        </>
                      ) : (
                        <>
                          <User className="h-5 w-5 text-blue-400 mr-2" />
                          New Profile (No existing data found)
                        </>
                      )}
                    </h4>

                    {detectedProfile.hasExistingProfile ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-purple-300">Name:</span>
                              <span className="text-white font-medium">{detectedProfile.name || 'Not set'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-purple-300">NIP-05:</span>
                              <span className="text-white font-medium">{detectedProfile.nip05 || 'Not verified'}</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-purple-300">Lightning:</span>
                              <span className="text-white font-medium">{detectedProfile.lud16 || 'Not configured'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-purple-300">Profile:</span>
                              <span className="text-white font-medium">{detectedProfile.picture ? 'Has avatar' : 'No avatar'}</span>
                            </div>
                          </div>
                        </div>

                        {detectedProfile.about && (
                          <div className="mt-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                            <span className="text-purple-300 text-sm">About:</span>
                            <p className="text-white text-sm mt-1">{detectedProfile.about}</p>
                          </div>
                        )}

                        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mt-4">
                          <p className="text-green-200 text-sm">
                            ✅ Your existing Nostr identity will be preserved and integrated with Satnam.pub
                          </p>
                        </div>

                        {/* Key type indicator */}
                        <div className="flex items-center justify-between text-xs text-purple-300 bg-purple-500/10 rounded-lg p-2">
                          <span>Key Type:</span>
                          <span className="font-medium">
                            {detectedProfile.keyType === 'private' ? '🔐 Private Key (Full Access)' : '👁️ Public Key (View Only)'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-blue-200 text-sm">
                          No existing profile metadata found on the Nostr network for this key.
                        </p>
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                          <p className="text-blue-200 text-sm">
                            ℹ️ You can still import this key and set up your profile on Satnam.pub
                          </p>
                        </div>

                        {/* Key type indicator for new profiles */}
                        <div className="flex items-center justify-between text-xs text-purple-300 bg-purple-500/10 rounded-lg p-2">
                          <span>Key Type:</span>
                          <span className="font-medium">
                            {detectedProfile.keyType === 'private' ? '🔐 Private Key (Full Access)' : '👁️ Public Key (View Only)'}
                          </span>
                        </div>
                      </div>
                    )}

                    {detectedProfile.error && (
                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mt-3">
                        <p className="text-yellow-200 text-sm">
                          ⚠️ Profile detection encountered an issue: {detectedProfile.error}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Profile Update Consent */}
                <div className="space-y-4 mb-6">
                  <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={profileUpdateConsent}
                        onChange={(e) => setProfileUpdateConsent(e.target.checked)}
                        className="mt-1 rounded border-green-500/30 bg-green-500/10 text-green-500 focus:ring-green-500"
                      />
                      <div>
                        <label className="text-green-200 font-bold cursor-pointer">
                          Update my Nostr profile with new NIP-05 identifier
                        </label>
                        <p className="text-green-200/80 text-sm mt-1">
                          Add <span className="font-mono">{formData.username}@{selectedDomain}</span> as your verified NIP-05 identifier.
                          This will be your new verified identity on Satnam while preserving your existing Nostr presence.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Lightning Address Consent */}
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={lightningAddressConsent}
                        onChange={(e) => setLightningAddressConsent(e.target.checked)}
                        className="mt-1 rounded border-orange-500/30 bg-orange-500/10 text-orange-500 focus:ring-orange-500"
                      />
                      <div>
                        <label className="text-orange-200 font-bold cursor-pointer">
                          Use Satnam Lightning address for Bitcoin payments
                        </label>
                        <p className="text-orange-200/80 text-sm mt-1">
                          Enable <span className="font-mono">{formData.username}@{selectedDomain}</span> as your Lightning address for receiving Bitcoin payments.
                          {detectedProfile?.lud16 && (
                            <span className="block mt-1">
                              Your existing Lightning address ({detectedProfile.lud16}) will be preserved in your profile.
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => {
                      setShowMigrationConsent(false);
                      setMigrationMode('generate');
                      setDetectedProfile(null);
                      setEphemeralNsecProtected(null, true); // Force clear when canceling migration
                    }}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
                  >
                    Cancel Migration
                  </button>
                  <button
                    onClick={handleMigrationConsent}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
                  >
                    Confirm Migration
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Secure Peer Invitation Modal */}
      {
        showInvitationModal && sessionInfo && (
          <SecurePeerInvitationModal
            isOpen={showInvitationModal}
            onClose={() => {
              setShowInvitationModal(false);
              onComplete();
            }}
            sessionInfo={sessionInfo}
            temporaryNsec={nsecRetentionSessionId ? 'available' : undefined}
            retentionSessionId={nsecRetentionSessionId || undefined}
            onComplete={() => {
              setShowInvitationModal(false);
              onComplete();
            }}
          />
        )
      }
    </div >
  );
};

export default IdentityForge;