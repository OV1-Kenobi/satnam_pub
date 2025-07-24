import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bitcoin,
  Check,
  CheckCircle,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Heart,
  Key,
  Lock,
  Shield,
  Sparkles,
  User,
  Users,
  X,
  Zap
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { ApiClient } from '../../utils/api-client.js';
import { useCryptoOperations } from "../hooks/useCrypto";
import { IdentityRegistrationResult } from "../types/auth";
import { SessionInfo } from '../utils/secureSession.js';
import { PostAuthInvitationModal } from "./PostAuthInvitationModal";

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
}

const IdentityForge: React.FC<IdentityForgeProps> = ({
  onComplete,
  onBack,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    username: "",
    password: "",
    confirmPassword: "",
    pubkey: "",
    lightningEnabled: true,
    agreedToTerms: false,
  });

  // Zero-Knowledge Ephemeral Nsec Display (Master Context Compliance)
  const [ephemeralNsec, setEphemeralNsec] = useState<string | null>(null);
  const [nsecDisplayed, setNsecDisplayed] = useState(false);
  const [nsecSecured, setNsecSecured] = useState(false);
  const [showNsecConfirmation, setShowNsecConfirmation] = useState(false);
  const [nsecStoredConfirmed, setNsecStoredConfirmed] = useState(false);
  const [autoCleanupTimer, setAutoCleanupTimer] = useState<NodeJS.Timeout | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [countdownTimer, setCountdownTimer] = useState<NodeJS.Timeout | null>(null);

  // Ref to track timer state and prevent race conditions
  const timerStateRef = useRef({ cleanupTimer: null as NodeJS.Timeout | null, countdown: null as NodeJS.Timeout | null });

  // Nostr Account Migration State (Zero-Knowledge Compliance)
  const [migrationMode, setMigrationMode] = useState<'generate' | 'import'>('generate');
  const [importedNsec, setImportedNsec] = useState('');
  const [detectedProfile, setDetectedProfile] = useState<any>(null);
  const [showMigrationConsent, setShowMigrationConsent] = useState(false);
  const [profileUpdateConsent, setProfileUpdateConsent] = useState(true);
  const [lightningAddressConsent, setLightningAddressConsent] = useState(true);
  const [isDetectingProfile, setIsDetectingProfile] = useState(false);

  // Nostr Profile Creation State (New Users Only)
  const [profileData, setProfileData] = useState({
    displayName: '',
    bio: '',
    picture: '',
    website: ''
  });


  // Zero-Knowledge Protocol: Secure memory cleanup (Master Context Compliance)
  useEffect(() => {
    return () => {
      // Critical: Clear ephemeral nsec on component unmount
      if (ephemeralNsec) {
        setEphemeralNsec(null);
      }
      // Critical: Clear imported nsec from memory
      if (importedNsec) {
        setImportedNsec('');
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
  }, [ephemeralNsec, importedNsec]); // Removed timer dependency to prevent race conditions

  // Auto-cleanup timer for ephemeral nsec (5-minute maximum exposure for manual recording)
  // Split into separate useEffects to prevent infinite loops

  // Timer start effect - only runs when nsec is first displayed
  useEffect(() => {
    // Only start timer when nsec exists, is displayed, not secured, and no timer is running
    if (ephemeralNsec && nsecDisplayed && !nsecSecured && !timerStateRef.current.cleanupTimer && !timerStateRef.current.countdown) {
      console.log('🚀 Starting 5-minute timer and countdown');

      // Set initial countdown time (5 minutes = 300 seconds)
      setTimeRemaining(300);

      // Main cleanup timer (5 minutes)
      const cleanupTimer = setTimeout(() => {
        console.log('⏰ 5-minute timer expired - clearing nsec');
        // Critical: Auto-clear nsec after 5 minutes for security
        setEphemeralNsec(null);
        setNsecDisplayed(false);
        setShowNsecConfirmation(false);
        setTimeRemaining(0);
        setAutoCleanupTimer(null);
        setCountdownTimer(null);
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

      // Set state timers for UI purposes
      setAutoCleanupTimer(cleanupTimer);
      setCountdownTimer(countdown);

      // Return cleanup function that only runs on actual component unmount
      return () => {
        console.log('🧹 Component unmounting - cleaning up timers');
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
      console.log('🛑 Clearing timers - nsecSecured:', nsecSecured, 'nsecDisplayed:', nsecDisplayed);

      if (timerStateRef.current.countdown) {
        clearInterval(timerStateRef.current.countdown);
        timerStateRef.current.countdown = null;
        setCountdownTimer(null);
      }
      if (timerStateRef.current.cleanupTimer) {
        clearTimeout(timerStateRef.current.cleanupTimer);
        timerStateRef.current.cleanupTimer = null;
        setAutoCleanupTimer(null);
      }
      // Reset timer display
      setTimeRemaining(0);
    }
  }, [nsecSecured, nsecDisplayed]); // Dependencies exclude timer state to prevent race condition

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Zero-Knowledge Protocol: Secure nsec display functions
  const showNsecTemporarily = () => {
    console.log('🔍 showNsecTemporarily called:', {
      ephemeralNsec: ephemeralNsec ? 'EXISTS' : 'NULL',
      nsecDisplayed,
      nsecSecured,
      showNsecConfirmation,
      timeRemaining
    });

    if (!ephemeralNsec) {
      console.error('❌ CRITICAL: ephemeralNsec is null/undefined - cannot display');
      return;
    }

    if (nsecDisplayed) {
      console.log('⚠️ Nsec already displayed, ignoring duplicate call');
      return;
    }

    console.log('✅ Setting nsecDisplayed to true');
    setNsecDisplayed(true);
    // Don't show confirmation immediately - let user copy first
    setShowNsecConfirmation(false);

    console.log('🎨 Nsec display enabled:', {
      ephemeralNsecLength: ephemeralNsec.length,
      nsecPrefix: ephemeralNsec.substring(0, 10) + '...'
    });
  };



  const handleNsecSecured = () => {
    // User confirms they have secured their nsec
    setNsecSecured(true);
    setShowNsecConfirmation(false);

    // Critical: Immediately clear nsec from memory after user confirmation
    setEphemeralNsec(null);
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
  };

  const copyNsecSecurely = async () => {
    console.log('📋 copyNsecSecurely called:', {
      ephemeralNsec: ephemeralNsec ? 'EXISTS' : 'NULL',
      nsecDisplayed,
      nsecSecured,
      timeRemaining
    });

    if (!ephemeralNsec) {
      console.error('❌ CRITICAL: Cannot copy - ephemeralNsec is null/undefined');
      console.error('❌ State check:', {
        nsecDisplayed,
        nsecSecured,
        timeRemaining,
        autoCleanupTimer: autoCleanupTimer ? 'ACTIVE' : 'NULL',
        countdownTimer: countdownTimer ? 'ACTIVE' : 'NULL'
      });
      return;
    }

    if (!nsecDisplayed) {
      console.error('❌ Cannot copy - nsec not displayed');
      return;
    }

    try {
      await navigator.clipboard.writeText(ephemeralNsec);
      console.log('✅ Nsec copied to clipboard successfully');
      console.log('📋 Copied nsec length:', ephemeralNsec.length);
      // Show confirmation dialog after copying
      setShowNsecConfirmation(true);
      // Note: Nsec remains in clipboard but is cleared from component memory
      // User is responsible for clearing clipboard after securing the key
    } catch (error) {
      console.error('❌ Failed to copy to clipboard:', error);
      // Still show confirmation dialog even if copy failed
      setShowNsecConfirmation(true);
    }
  };

  // Zero-Knowledge Nostr Account Migration Functions
  const handleNsecImport = async () => {
    if (!importedNsec || !importedNsec.startsWith('nsec1')) {
      return;
    }

    setIsDetectingProfile(true);

    try {
      // Extract pubkey from nsec for profile detection (ephemeral only)
      const { nip19, getPublicKey } = await import('../lib/nostr-browser');

      const { data: privateKeyBytes } = nip19.decode(importedNsec);
      const publicKey = await getPublicKey.fromPrivateKey(privateKeyBytes as string);
      const npub = nip19.npubEncode(publicKey);

      // Detect existing profile metadata
      const profile = await detectNostrProfile(publicKey);

      // Set form data with detected information
      setFormData(prev => ({
        ...prev,
        pubkey: npub
      }));

      // Store ephemeral nsec and detected profile
      setEphemeralNsec(importedNsec);
      setDetectedProfile(profile);
      setShowMigrationConsent(true);

      // Clear imported nsec input immediately after processing
      setImportedNsec('');

    } catch (error) {
      console.error('Profile detection failed:', error);
      // Still allow migration even if profile detection fails
      setShowMigrationConsent(true);
    } finally {
      setIsDetectingProfile(false);
    }
  };

  const detectNostrProfile = async (publicKey: string) => {
    // This would integrate with existing Nostr profile services
    // For now, return mock data structure
    return {
      name: 'Detected User',
      about: 'Existing Nostr profile',
      picture: '',
      nip05: '',
      lud16: '' // Lightning address
    };
  };

  const handleMigrationConsent = () => {
    // User has confirmed migration preferences
    setShowMigrationConsent(false);
    setNsecSecured(true);

    // Clear ephemeral nsec after consent
    setEphemeralNsec(null);

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
        nip05: `${formData.username}@satnam.pub`,
        lud16: formData.lightningEnabled ? `${formData.username}@satnam.pub` : undefined
      };

      // This would integrate with existing Nostr publishing services
      // For now, simulate the publishing process
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('Profile published to Nostr network:', profileMetadata);

      // Clear ephemeral nsec after profile publishing
      setEphemeralNsec(null);
      setNsecSecured(true);

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registrationResult, setRegistrationResult] = useState<IdentityRegistrationResult | null>(null);
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);

  // Use crypto operations hook for lazy loading
  const crypto = useCryptoOperations();

  // State consistency validation and debugging (only for Steps 3+ where nsec is relevant)
  useEffect(() => {
    // CRITICAL: Only log nsec-related state changes during Steps 3+ (key generation and beyond)
    // Prevents premature logging during Steps 1-2 (username/password entry)
    if (currentStep >= 3) {
      const state = {
        ephemeralNsec: ephemeralNsec ? 'EXISTS' : 'NULL',
        nsecDisplayed,
        nsecSecured,
        showNsecConfirmation,
        currentStep,
        timeRemaining
      };

      console.log('🔄 Nsec State changed (Step 3+):', state);

      // CRITICAL: Validate state consistency to prevent impossible combinations
      if (nsecDisplayed && !ephemeralNsec && !nsecSecured) {
        console.error('❌ INVALID STATE: nsecDisplayed is true but ephemeralNsec is NULL and nsecSecured is false');
        console.error('❌ This should never happen - fixing state...');
        setNsecDisplayed(false);
        setTimeRemaining(0);
      }

      if (timeRemaining > 0 && !ephemeralNsec && !nsecSecured) {
        console.error('❌ INVALID STATE: Timer running but ephemeralNsec is NULL and nsecSecured is false');
        console.error('❌ This should never happen - stopping timer...');
        setTimeRemaining(0);
      }
    } else {
      // For Steps 1-2, only log basic step changes without nsec details
      console.log('🔄 Step changed:', { currentStep });
    }
  }, [ephemeralNsec, nsecDisplayed, nsecSecured, showNsecConfirmation, currentStep, timeRemaining]);

  // Username validation
  const validateUsername = (username: string) => {
    const regex = /^[a-zA-Z0-9_]{3,20}$/;
    return regex.test(username);
  };

  // Simulate username availability check
  useEffect(() => {
    if (formData.username && validateUsername(formData.username)) {
      const timer = setTimeout(() => {
        // Simulate API call - randomly available for demo
        setUsernameAvailable(Math.random() > 0.3);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setUsernameAvailable(null);
    }
  }, [formData.username]);

  // Generate recovery phrase and keys
  const generateKeysAndPhrase = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      // Step 1: Loading crypto modules
      setGenerationStep("Loading crypto modules...");
      console.log("Starting key generation process...");

      for (let i = 0; i <= 20; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Step 2: Generating recovery phrase
      setGenerationStep("Generating recovery phrase...");
      console.log("About to generate recovery phrase...");

      for (let i = 20; i <= 40; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      console.log("Calling crypto.generateRecoveryPhrase()...");
      console.log("Crypto state:", {
        isLoaded: crypto.isLoaded,
        isLoading: crypto.isLoading,
        error: crypto.error
      });

      const recoveryPhraseResult = await Promise.race([
        crypto.generateRecoveryPhrase(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Recovery phrase timeout after 15 seconds")), 15000)
        )
      ]) as { phrase: string; entropy: string; wordCount: number };

      // Extract the actual phrase string from the result with validation
      if (!recoveryPhraseResult || typeof recoveryPhraseResult !== 'object') {
        throw new Error("Invalid recovery phrase result: expected object with phrase property");
      }

      const recoveryPhrase = recoveryPhraseResult.phrase;
      if (!recoveryPhrase || typeof recoveryPhrase !== 'string') {
        throw new Error("Invalid recovery phrase: expected non-empty string");
      }

      console.log("Recovery phrase generated successfully:", recoveryPhrase ? "✓" : "✗");

      // Step 3: Generating entropy
      setGenerationStep("Generating entropy...");
      for (let i = 40; i <= 60; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Step 4: Creating keypair from recovery phrase
      setGenerationStep("Creating keypair...");
      console.log("About to generate keypair...");

      for (let i = 60; i <= 80; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      console.log("Calling crypto.generateNostrKeyPair()...");
      const keyPair = await Promise.race([
        crypto.generateNostrKeyPair(recoveryPhrase),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Keypair generation timeout after 15 seconds")), 15000)
        )
      ]) as { npub: string; nsec: string };
      console.log("Keypair generated successfully:", keyPair ? "✓" : "✗");

      // Validate the generated keypair
      if (!keyPair.npub || !keyPair.npub.startsWith('npub1')) {
        throw new Error("Invalid keypair generated");
      }

      // Step 5: Securing identity
      setGenerationStep("Securing identity...");
      for (let i = 80; i <= 100; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      console.log("Key generation completed successfully");
      setFormData((prev) => ({
        ...prev,
        pubkey: keyPair.npub
      }));

      // Zero-Knowledge Protocol: Store nsec ephemerally only
      // Will be cleared automatically after user secures it
      console.log('🔑 Setting ephemeralNsec:', {
        nsecExists: keyPair.nsec ? 'YES' : 'NO',
        nsecLength: keyPair.nsec ? keyPair.nsec.length : 0,
        nsecPrefix: keyPair.nsec ? keyPair.nsec.substring(0, 10) + '...' : 'NULL'
      });
      setEphemeralNsec(keyPair.nsec);
    } catch (error) {
      console.error("Failed to generate keys:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        cryptoIsLoaded: crypto.isLoaded,
        cryptoIsLoading: crypto.isLoading,
        cryptoError: crypto.error
      });
      setGenerationStep("Key generation failed - please try again");
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  // Register identity with the backend
  const registerIdentity = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStep("Registering identity...");

    try {
      for (let i = 0; i <= 30; i++) {
        setGenerationProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      const apiClient = new ApiClient();
      const result = await apiClient.storeUserData({
        username: formData.username,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        nip05: `${formData.username}@satnam.pub`,
        lightningAddress: formData.lightningEnabled ? `${formData.username}@satnam.pub` : undefined,
        generateInviteToken: true,
      });

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

      // Create session info for PostAuth modal
      setSessionInfo({
        isAuthenticated: true,
        user: {
          npub: result.npub,
          nip05: result.profile.nip05,
          federationRole: 'adult',
          authMethod: 'otp',
          isWhitelisted: true,
          votingPower: 1,
          guardianApproved: false,
        },
      });

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
    if (currentStep === 2) {
      // Generate keys when moving to step 3 (only for generate mode)
      if (migrationMode === 'generate') {
        try {
          await generateKeysAndPhrase();
          setCurrentStep(currentStep + 1);
        } catch (error) {
          console.error("Failed to generate keys:", error);
        }
      } else {
        setCurrentStep(currentStep + 1);
      }
    } else if (currentStep === 3) {
      // Moving from step 3 to step 4
      if (migrationMode === 'import') {
        // Skip profile creation for import users, go to terms
        setCurrentStep(5);
      } else {
        // Go to profile creation for new users
        setCurrentStep(4);
      }
    } else if (currentStep === 4 && migrationMode === 'generate') {
      // Publish profile and move to terms agreement
      await publishNostrProfile();
      setCurrentStep(5);
    } else if (currentStep === 5) {
      // Register identity when moving to Family Dynasty invitation
      try {
        await registerIdentity();
        setCurrentStep(6); // Go to Family Dynasty invitation step
      } catch (error) {
        console.error("Failed to register identity:", error);
      }
    } else if (currentStep === 6) {
      // Family Dynasty invitation step - user chooses their path
      setCurrentStep(7); // Go to final completion
    } else if (currentStep < 7) {
      setCurrentStep(currentStep + 1);
    } else {
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
        return formData.username && usernameAvailable === true;
      case 2:
        return formData.password &&
          formData.confirmPassword &&
          formData.password === formData.confirmPassword &&
          formData.password.length >= 8;
      case 3:
        if (migrationMode === 'import') {
          return formData.pubkey && nsecSecured && !isDetectingProfile;
        }
        // CRITICAL SECURITY: Require nsecSecured to be true before proceeding
        // This prevents username storage without nsec confirmation
        return formData.pubkey && nsecSecured && !isGenerating;
      case 4:
        // Consolidated nsec confirmation and terms acceptance step
        return nsecStoredConfirmed && formData.agreedToTerms;
      case 5:
        // Registration/success step - always can continue
        return true;
      case 6:
        return true; // Family Dynasty invitation step - always can continue
      case 7:
        return true;
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

  if (isComplete) {
    return (
      <div className="modal-overlay-bitcoin-citadel">
        <div className="modal-content-bitcoin-citadel">
          <div className="text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce">
              <Sparkles className="h-12 w-12 text-white" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-6">
              Identity Forged Successfully!
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
                {formData.username}@satnam.pub
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setShowInvitationModal(true)}
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
                Forge Another Identity
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
              src="/ID forge icon.png"
              alt="Identity Forge"
              className="h-10 w-10"
              loading="lazy"
            />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Identity Forge</h2>
          <p className="text-purple-200">
            Forge your sovereign digital identity
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            {[1, 2, 3, 4, 5].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${step <= currentStep
                    ? "bg-orange-500 text-white"
                    : "bg-white/20 text-purple-200"
                    }`}
                >
                  {step < currentStep ? <Check className="h-5 w-5" /> : step}
                </div>
                {step < 5 && (
                  <div
                    className={`h-1 w-8 mx-2 transition-all duration-300 ${step < currentStep ? "bg-orange-500" : "bg-white/20"
                      }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-purple-200">
            <span>Name</span>
            <span>Password</span>
            <span>Keys</span>
            <span>Security</span>
            <span>Complete</span>
          </div>
        </div>

        {/* Form Content */}
        <div className="space-y-6">
          {/* Step 1: Choose Your True Name */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Choose Your True Name
                </h3>
                <p className="text-purple-200">
                  This will be your sovereign identity across the Bitcoin network
                </p>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input
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
                      Your identity will be:
                    </p>
                    <p className="text-white font-mono text-lg">
                      {formData.username}@satnam.pub
                    </p>
                    {usernameAvailable === false && (
                      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mt-3">
                        <p className="text-red-200">
                          This name is already taken
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

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <h4 className="text-white font-bold mb-2">
                  Your keys, your identity
                </h4>
                <p className="text-purple-200">
                  No email required, no data collection. Sovereign from day one.
                </p>
              </div>

              {/* Lightning Address Option */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-bold mb-2">
                      Enable Lightning Address
                    </h4>
                    <p className="text-purple-200 text-sm">
                      Allow others to send you Bitcoin payments at {formData.username}@satnam.pub
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
                          {formData.username}@satnam.pub
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
          )}

          {/* Step 2: Create Password */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <Lock className="h-16 w-16 text-orange-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-4">
                  Create Your Password
                </h3>
                <p className="text-purple-200">
                  This password will encrypt your private keys securely
                </p>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input
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

                {/* Password validation indicators */}
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                  <h4 className="text-white font-bold mb-3">Password Requirements</h4>
                  <div className="space-y-2 text-sm">
                    <div className={`flex items-center space-x-2 ${formData.password.length >= 8 ? 'text-green-400' : 'text-purple-200'}`}>
                      <div className={`w-2 h-2 rounded-full ${formData.password.length >= 8 ? 'bg-green-400' : 'bg-purple-200'}`} />
                      <span>At least 8 characters</span>
                    </div>
                    <div className={`flex items-center space-x-2 ${formData.password === formData.confirmPassword && formData.confirmPassword ? 'text-green-400' : 'text-purple-200'}`}>
                      <div className={`w-2 h-2 rounded-full ${formData.password === formData.confirmPassword && formData.confirmPassword ? 'bg-green-400' : 'bg-purple-200'}`} />
                      <span>Passwords match</span>
                    </div>
                  </div>
                </div>

                <div className="bg-red-500/20 border border-red-500/50 rounded-2xl p-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-red-200 font-bold mb-2">Important Security Notice</h4>
                      <p className="text-red-200 text-sm">
                        Your password encrypts your private keys. If you lose this password,
                        you can only recover your account using your recovery phrase.
                        Choose a strong, memorable password.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Generate Your Keys or Import Existing */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <Key className="h-16 w-16 text-orange-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-4">
                  {migrationMode === 'generate' ? 'Generate Your Keys' : 'Import Existing Nostr Account'}
                </h3>
                <p className="text-purple-200">
                  {migrationMode === 'generate'
                    ? 'Creating your cryptographic identity'
                    : 'Migrate your existing Nostr identity to Satnam'
                  }
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
                        <h5 className="text-white font-semibold">Generate New Keys</h5>
                      </div>
                      <p className="text-purple-200 text-sm">
                        Create a brand new Nostr identity with fresh cryptographic keys
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
                        <h5 className="text-white font-semibold">Import Existing Account</h5>
                      </div>
                      <p className="text-purple-200 text-sm">
                        Migrate your existing Nostr identity using your private key (nsec)
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* Generate Keys Button */}
              {migrationMode === 'generate' && !formData.pubkey && !isGenerating && (
                <div className="text-center">
                  <button
                    onClick={generateKeysAndPhrase}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-8 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 mx-auto"
                  >
                    <Sparkles className="h-5 w-5" />
                    <span>Generate My Keys</span>
                  </button>
                  <p className="text-orange-200/60 text-sm mt-2">
                    Create your cryptographic identity with zero-knowledge security
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
                      <div>
                        <label className="block text-blue-200 text-sm font-semibold mb-2">
                          Your Nsec Private Key
                        </label>
                        <input
                          type="password"
                          value={importedNsec}
                          onChange={(e) => setImportedNsec(e.target.value)}
                          placeholder="nsec1..."
                          className="w-full px-4 py-3 bg-black/20 border border-blue-500/30 rounded-lg text-white placeholder-blue-300/50 focus:border-blue-400 focus:outline-none"
                        />
                      </div>

                      <button
                        onClick={handleNsecImport}
                        disabled={!importedNsec || !importedNsec.startsWith('nsec1') || isDetectingProfile}
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
                            <span>Import Account</span>
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
                  <div className="text-center">
                    <div className="w-16 h-16 bg-green-500/20 border border-green-500/50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="h-8 w-8 text-green-400" />
                    </div>
                    <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4">
                      <p className="text-green-200 font-semibold">
                        Keys generated successfully!
                      </p>
                    </div>
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
                          This is your private key for signing in. Store it securely and never share it.
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
                            <span>🔥 Forge Identity</span>
                            {nsecStoredConfirmed && formData.agreedToTerms && <ArrowRight className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Nsec secured state: Show confirmation */
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
            </div>
          )}

          {/* Step 4: Profile Creation (New Users Only) */}
          {currentStep === 4 && migrationMode === 'generate' && (
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
                          <span className="text-blue-400 text-sm">✓ {formData.username}@satnam.pub</span>
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
                    <li>• NIP-05 Identifier: {formData.username}@satnam.pub</li>
                    {formData.lightningEnabled && (
                      <li>• Lightning Address: {formData.username}@satnam.pub</li>
                    )}
                    <li>• Profile will be published to the Nostr network for global visibility</li>
                  </ul>
                </div>
              </div>
            </div>
          )}



          <div className="space-y-4">
            <div className="bg-blue-500/20 border border-blue-500/50 rounded-2xl p-6">
              <div className="flex items-start space-x-3">
                <Shield className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="text-blue-200 font-bold mb-2">
                    � Your Security Setup Complete
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

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  checked={formData.agreedToTerms}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      agreedToTerms: e.target.checked,
                    }))
                  }
                  className="mt-1 rounded border-white/30 bg-white/10 text-orange-500 focus:ring-orange-500"
                />
                <div>
                  <label className="text-white font-bold cursor-pointer">
                    I agree to the Terms of Service
                  </label>
                  <p className="text-purple-200 text-sm mt-1">
                    I understand that Satnam.pub is a sovereign platform and I'm responsible
                    for my own security and key management.
                  </p>
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
            {/* Step 5: Complete Registration */}
            {currentStep === 5 && (
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
                      <div className="w-20 h-20 bg-green-500/20 border-2 border-green-500/50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Check className="h-10 w-10 text-green-400" />
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-4">
                        Identity Forged Successfully! 🎉
                      </h3>
                      <p className="text-green-200">
                        Welcome to the sovereign Bitcoin education community
                      </p>
                    </div>

                    <div className="bg-green-500/20 border border-green-500/50 rounded-2xl p-6">
                      <h4 className="text-green-200 font-bold mb-3">Your Identity Summary</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-green-300">Username:</span>
                          <span className="text-green-100 font-mono">{registrationResult.profile.username}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-green-300">NIP-05:</span>
                          <span className="text-green-100 font-mono">{registrationResult.profile.nip05}</span>
                        </div>
                        {formData.lightningEnabled && (
                          <div className="flex justify-between">
                            <span className="text-green-300">Lightning:</span>
                            <span className="text-green-100 font-mono">{registrationResult.profile.nip05}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-orange-500/20 border border-orange-500/50 rounded-2xl p-6">
                      <h4 className="text-orange-200 font-bold mb-3">🎓 Next Steps</h4>
                      <div className="text-orange-200 text-sm space-y-2">
                        <p>• Explore Bitcoin education courses</p>
                        <p>• Invite peers to earn course credits</p>
                        <p>• Join family federations</p>
                        <p>• Start your sovereign journey</p>
                      </div>
                    </div>

                    <div className="text-center space-y-6">
                      {/* Primary CTA: Found Family Dynasty */}
                      <div className="flex justify-center">
                        <button
                          onClick={() => setCurrentStep(6)}
                          className="bg-gradient-to-r from-purple-600 to-yellow-600 hover:from-purple-700 hover:to-yellow-700 text-white font-bold py-6 px-12 rounded-xl text-xl transition-all duration-300 flex items-center justify-center space-x-3 shadow-2xl border-2 border-yellow-500/50"
                        >
                          <Crown className="h-8 w-8" />
                          <span>🏰 Found Family Dynasty</span>
                        </button>
                      </div>

                      {/* Secondary Actions */}
                      <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button
                          onClick={() => setShowInvitationModal(true)}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                        >
                          <span>🎁</span>
                          <span>Invite Peers</span>
                        </button>
                        <button
                          onClick={() => {
                            // Navigate to Nostr Resources page
                            window.location.href = '/nostr-resources';
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                        >
                          <Key className="h-5 w-5" />
                          <span>Nostr Resources</span>
                        </button>
                        <button
                          onClick={onComplete}
                          className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          <span>Return Home</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Step 6: Family Dynasty Founding Invitation */}
            {currentStep === 6 && (
              <div className="space-y-6">
                <div className="text-center">
                  <Crown className="h-20 w-20 text-yellow-500 mx-auto mb-6" />
                  <h3 className="text-3xl font-bold text-white mb-4">
                    Your Sovereign Identity is Forged!
                  </h3>
                  <p className="text-purple-200 text-lg mb-6">
                    Welcome to true digital sovereignty, <span className="font-bold text-yellow-400">{formData.username}</span>
                  </p>
                  <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/20 mb-8">
                    <p className="text-purple-200 mb-2">Your sovereign identity:</p>
                    <p className="text-white font-mono text-lg">
                      {formData.username}@satnam.pub
                    </p>
                  </div>
                </div>

                {/* Primary CTA: Family Dynasty Founding */}
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
                    <h5 className="text-yellow-200 font-bold mb-4 text-lg">🏰 Dynastic Sovereignty Benefits:</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Shield className="h-4 w-4 text-blue-400" />
                          <span className="text-purple-200">Protected family nsec keys with Shamir Secret Sharing</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Users className="h-4 w-4 text-green-400" />
                          <span className="text-purple-200">Role-based family governance and permissions</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Zap className="h-4 w-4 text-yellow-400" />
                          <span className="text-purple-200">Family Lightning treasury with threshold signatures</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Key className="h-4 w-4 text-orange-400" />
                          <span className="text-purple-200">Hierarchical role-based controls (Guardian → Adult → Offspring)</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Heart className="h-4 w-4 text-red-400" />
                          <span className="text-purple-200">Private family communications with NIP-59 gift-wrapped messaging</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Bitcoin className="h-4 w-4 text-orange-400" />
                          <span className="text-purple-200">Fedimint eCash for enhanced privacy and family spending</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center">
                    <button
                      onClick={() => {
                        // Navigate to Dynastic Sovereignty page which leads to Family Foundry
                        window.location.href = '/dynastic-sovereignty';
                      }}
                      className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-bold py-4 px-10 rounded-xl transition-all duration-300 transform hover:scale-105 flex items-center justify-center space-x-3 mx-auto text-lg shadow-lg hover:shadow-xl"
                    >
                      <Crown className="h-6 w-6" />
                      <span>Begin Family Foundry Journey</span>
                      <ArrowRight className="h-6 w-6" />
                    </button>
                    <p className="text-yellow-200/80 text-sm mt-3">
                      Establish your family charter, roles, and invite family members through the Family Foundry
                    </p>
                  </div>
                </div>

                {/* Secondary Navigation Options */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Nostr Resources - Secondary */}
                  <button
                    onClick={() => {
                      window.location.href = '/nostr-resources';
                    }}
                    className="bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <Key className="h-5 w-5 text-blue-400" />
                    <span>Explore Nostr Ecosystem</span>
                  </button>

                  {/* Invite Peers - Tertiary */}
                  <button
                    onClick={() => setShowInvitationModal(true)}
                    className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <span>🎁</span>
                    <span>Invite Peers</span>
                  </button>

                  {/* Return Home - Tertiary */}
                  <button
                    onClick={onComplete}
                    className="bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/30 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Return to Home</span>
                  </button>
                </div>

                {/* Educational Context */}
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-6">
                  <h5 className="text-purple-200 font-semibold text-sm mb-2">🎓 What's Next in Your Sovereignty Journey</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-purple-200/80 text-sm">
                    <div>
                      <p>• <strong>Family Foundry:</strong> Create your family charter and establish governance roles</p>
                      <p>• <strong>Invite Family Members:</strong> Extend invitations through secure NIP-59 messaging</p>
                    </div>
                    <div>
                      <p>• <strong>Treasury Management:</strong> Set up family Lightning channels and eCash federation</p>
                      <p>• <strong>Educational Credits:</strong> Earn course credits by inviting peers to join Satnam</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            {!(currentStep === 5 && registrationResult) && !(currentStep === 6) && (
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
                    {currentStep === 2 ? "Generate Keys" :
                      currentStep === 4 && migrationMode === 'generate' ? "Create Profile" :
                        currentStep === 5 ? "Forge Identity" :
                          currentStep === 6 ? "Choose Your Path" :
                            currentStep === 7 && !registrationResult ? "Processing..." :
                              "Continue"}
                  </span>
                  {!isGenerating && <ArrowRight className="h-5 w-5" />}
                  {isGenerating && (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Security Messaging */}
          <div className="text-center mt-8 pt-6 border-t border-white/20">
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
          </div>
        </div>

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
                      Profile Migration Consent
                    </h3>
                    <p className="text-purple-200">
                      Configure how your existing Nostr identity integrates with Satnam
                    </p>
                  </div>

                  {/* Detected Profile Information */}
                  {detectedProfile && (
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-6 border border-white/20">
                      <h4 className="text-white font-bold mb-3">Your Existing Nostr Profile</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-purple-300">Display Name:</span>
                          <span className="text-white">{detectedProfile.name || 'Not set'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-purple-300">Bio:</span>
                          <span className="text-white">{detectedProfile.about || 'Not set'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-purple-300">Current NIP-05:</span>
                          <span className="text-white">{detectedProfile.nip05 || 'None'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-purple-300">Lightning Address:</span>
                          <span className="text-white">{detectedProfile.lud16 || 'None'}</span>
                        </div>
                      </div>
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
                            Add <span className="font-mono">{formData.username}@satnam.pub</span> as your verified NIP-05 identifier.
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
                            Enable <span className="font-mono">{formData.username}@satnam.pub</span> as your Lightning address for receiving Bitcoin payments.
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
                        setEphemeralNsec(null);
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

        {/* PostAuth Invitation Modal */}
        {
          showInvitationModal && sessionInfo && (
            <PostAuthInvitationModal
              isOpen={showInvitationModal}
              onClose={() => {
                setShowInvitationModal(false);
                onComplete();
              }}
              onSkip={() => {
                setShowInvitationModal(false);
                onComplete();
              }}
              sessionInfo={sessionInfo}
            />
          )
        }
      </div>
    </div>
  );
};

export default IdentityForge;