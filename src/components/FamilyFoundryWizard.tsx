import {
  ArrowLeft,
  CheckCircle,
  Crown,
  Mail,
  Shield,
  Users,
  Zap
} from "lucide-react";
import React, { useState } from "react";
import { clientConfig } from '../config/env.client';
import { CharterDefinition, RBACDefinition } from '../lib/api/family-foundry.js';
import { FeatureFlags } from '../lib/feature-flags';
import { PaymentCascadeNode } from '../lib/payment-automation';
import { createFamilyFoundry, mapTrustedPeersToMembers } from '../lib/family-foundry-api';
import { createFrostSession } from '../lib/family-foundry-frost';
import { createNfcMfaPolicy, calculateHighValueThreshold } from '../lib/family-foundry-nfc-mfa';
import { sendFederationApprovalRequests, generateFederationOperationHash } from '../lib/family-foundry-steward-approval';
import FamilyFederationCreationModal from "./FamilyFederationCreationModal";
import { InvitationGenerator } from "./family-invitations";
import FamilyFoundryStep1Charter from "./FamilyFoundryStep1Charter";
import FamilyFoundryStep2RBAC from "./FamilyFoundryStep2RBAC";
import FamilyFoundryStep3Invite from "./FamilyFoundryStep3Invite";
import { SimpleProofTimestampButton } from "./identity/SimpleProofTimestampButton";
import SimpleProofFeeEstimationWrapper from "./identity/SimpleProofFeeEstimationWrapper";
import PaymentCascadeModal from './PaymentCascadeModal';
import { useCryptoOperations } from "../hooks/useCrypto";
import { NobleEncryption } from "../lib/crypto/noble-encryption";
import { useAuth } from "./auth/AuthProvider";

// Feature flag for SimpleProof
const SIMPLEPROOF_ENABLED: boolean = clientConfig.flags.simpleproofEnabled ?? false;

interface TrustedPeer {
  id: string;
  name: string;
  npub: string;
  role: string;
  relationship: string;
  invited: boolean;
}

interface FamilyFoundryWizardProps {
  onComplete: () => void;
  onBack?: () => void;
}

type WizardStep = 'charter' | 'rbac' | 'invites' | 'federation' | 'complete';

const FamilyFoundryWizard: React.FC<FamilyFoundryWizardProps> = ({
  onComplete,
  onBack,
}) => {
  const cryptoOps = useCryptoOperations();
  const { user: authUser } = useAuth();
  const identityDomain = clientConfig.domains.platformLightning ?? "my.satnam.pub";
  const [currentStep, setCurrentStep] = useState<WizardStep>('charter');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showFederationModal, setShowFederationModal] = useState(false);
  const [isCreatingFederation, setIsCreatingFederation] = useState(false);
  const [federationProgress, setFederationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showCascadeModal, setShowCascadeModal] = useState(false);
  const [paymentCascade, setPaymentCascade] = useState<PaymentCascadeNode[]>([]);
  const [federationId, setFederationId] = useState<string | null>(null);
  const [federationDuid, setFederationDuid] = useState<string | null>(null);
  const [charterId, setCharterId] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [frostSessionId, setFrostSessionId] = useState<string | null>(null);
  const [frostThreshold, setFrostThreshold] = useState<number | null>(null);
  const [nfcMfaPolicyId, setNfcMfaPolicyId] = useState<string | null>(null);
  const [stewardApprovalStatus, setStewardApprovalStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [stewardApprovalsReceived, setStewardApprovalsReceived] = useState(0);
  // Phase 3: Federation identity setup (frontend)
  const [federationHandle, setFederationHandle] = useState<string>("");
  const [federationHandleError, setFederationHandleError] = useState<string | null>(null);

  // Step 1: Charter Definition
  const [charter, setCharter] = useState<CharterDefinition>({
    familyName: '',
    familyMotto: '',
    foundingDate: new Date().toISOString().split('T')[0],
    missionStatement: '',
    values: [],
    initialTreasury: 0
  });

  // Step 2: RBAC Definition - Updated to match existing codebase
  const [rbac, setRbac] = useState<RBACDefinition>({
    roles: [
      {
        id: 'guardian',
        name: 'Guardian',
        description: 'Ultimate family authority with complete control over federation',
        rights: [
          'View all family balances',
          'Approve all payments',
          'Create any role',
          'Manage all roles',
          'Remove stewards',
          'Manage federation settings',
          'Emergency override capabilities'
        ],
        responsibilities: [
          'Lead family with wisdom and integrity',
          'Ensure family values are upheld',
          'Make critical decisions for family welfare',
          'Mentor stewards and adults',
          'Maintain family sovereignty'
        ],
        rewards: [
          'Guardian badge and recognition',
          'Complete decision-making authority',
          'Treasury management privileges',
          'Family leadership status'
        ],
        hierarchyLevel: 4
      },
      {
        id: 'steward',
        name: 'Steward',
        description: 'Family administrators with creation and control authority',
        rights: [
          'View all balances',
          'Approve adult payments',
          'Create adults and offspring',
          'Manage adults and offspring',
          'View federation settings',
          'Propose changes'
        ],
        responsibilities: [
          'Protect family interests',
          'Guide younger family members',
          'Maintain family security',
          'Oversee family operations',
          'Support guardian decisions'
        ],
        rewards: [
          'Steward badge and recognition',
          'Enhanced access privileges',
          'Mentorship opportunities',
          'Family administration status'
        ],
        hierarchyLevel: 3
      },
      {
        id: 'adult',
        name: 'Adult',
        description: 'Mature family members with offspring management capabilities',
        rights: [
          'View family balances',
          'Approve offspring payments',
          'Create offspring',
          'Manage offspring',
          'View family events'
        ],
        responsibilities: [
          'Guide offspring development',
          'Contribute to family decisions',
          'Follow family values',
          'Support family goals',
          'Learn and grow'
        ],
        rewards: [
          'Adult badge and recognition',
          'Family management privileges',
          'Learning resources access',
          'Family participation status'
        ],
        hierarchyLevel: 2
      },
      {
        id: 'offspring',
        name: 'Offspring',
        description: 'Younger family members with basic privileges and learning focus',
        rights: [
          'View own balance',
          'Make small payments',
          'View family events'
        ],
        responsibilities: [
          'Follow family values',
          'Learn from family members',
          'Contribute to family goals',
          'Respect family hierarchy',
          'Grow and develop'
        ],
        rewards: [
          'Offspring badge and recognition',
          'Family benefits access',
          'Learning resources',
          'Family membership status'
        ],
        hierarchyLevel: 1
      }
    ],
    frostThreshold: 2 // Default: 2-of-3 threshold (user-configurable)
  });

  // Step 3: Trusted Peers
  const [trustedPeers, setTrustedPeers] = useState<TrustedPeer[]>([]);

  const steps = [
    { id: 'charter', name: 'Charter Definition', icon: Crown },
    { id: 'rbac', name: 'RBAC Setup', icon: Shield },
    { id: 'invites', name: 'Invite Peers', icon: Users },
    { id: 'federation', name: 'Create Federation', icon: Zap }
  ];

  const nextStep = async () => {
    setError(null);

    // After RBAC step (Step 2), call backend to create federation
    if (currentStep === 'rbac') {
      await createFederationBackend();
      return;
    }

    if (currentStep === 'invites') {
      setShowInviteModal(true);
      return;
    }

    if (currentStep === 'federation') {
      setShowFederationModal(true);
      return;
    }

    const currentIndex = steps.findIndex(step => step.id === currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1].id as WizardStep);
    }
  };

  /**
   * Create federation on backend after RBAC configuration
   * Maps trusted peers to user_duids, creates FROST session, and configures NFC MFA
   */
  // Local validator that mirrors backend NIP-05 handle rules
  const validateFederationHandle = (handle: string): string | null => {
    const trimmed = handle.trim().toLowerCase();
    if (!trimmed) {
      // Empty handle is allowed (federation identity setup is optional)
      return null;
    }
    // Match backend rules: 2-64 chars, lowercase letters, digits, dot, underscore, hyphen
    const pattern = /^[a-z0-9._-]{2,64}$/;
    if (!pattern.test(trimmed)) {
      return "Federation handle must be 2-64 characters and use only lowercase letters, numbers, dots, underscores, or hyphens.";
    }
    return null;
  };

  const createFederationBackend = async () => {
    try {
      setIsCreatingFederation(true);
      setFederationProgress(10);

      // Validate federation identity handle (optional)
      const normalizedHandle = federationHandle.trim().toLowerCase();
      if (normalizedHandle) {
        const handleError = validateFederationHandle(normalizedHandle);
        if (handleError) {
          setFederationHandleError(handleError);
          throw new Error(handleError);
        }
      }
      setFederationHandleError(null);

      // Map trusted peers to family members with user_duids
      // For solo founders (no trusted peers), this will return an empty array
      setFederationProgress(30);
      const members = trustedPeers.length > 0
        ? await mapTrustedPeersToMembers(trustedPeers)
        : [];
      setFederationProgress(50);

      // Optionally prepare federation identity payload (npub + encrypted nsec)
      let identityPayload: {
        federation_npub?: string;
        federation_nsec_encrypted?: string;
        federation_handle?: string;
      } = {};

      if (normalizedHandle) {
        try {
          if (!cryptoOps) {
            throw new Error("Crypto operations not initialized");
          }
          // Phase 3: Generate federation-level Nostr keys fully in the browser
          const keyPair = await cryptoOps.generateNostrKeyPair();
          if (!keyPair?.npub || !keyPair?.nsec) {
            throw new Error("Failed to generate federation Nostr keypair");
          }

          // Get founding user's user_salt from auth context
          // The useAuth hook provides user data including user_salt from the JWT session
          if (!authUser || !authUser.id) {
            throw new Error("Unable to resolve current user for federation identity encryption");
          }
          const userSalt = authUser.user_salt;
          if (!userSalt || typeof userSalt !== 'string') {
            throw new Error("Missing user_salt for federation identity encryption - please re-authenticate");
          }

          // Encrypt federation nsec using Noble V2 with the same user_salt
          // that protects the founding user's personal nsec. This keeps
          // recovery flows aligned while still treating federation identity
          // as a separate logical context tied to the family_federations row.
          const encryptedFederationNsec = await NobleEncryption.encryptNsec(
            keyPair.nsec,
            userSalt
          );

          identityPayload = {
            federation_npub: keyPair.npub,
            federation_nsec_encrypted: encryptedFederationNsec,
            federation_handle: normalizedHandle,
          };
        } catch (identityError) {
          // Best-effort only: log locally and continue federation creation
          console.error(
            "Federation identity setup failed; proceeding without federation-level npub/nsec:",
            identityError
          );
        }
      }

      // Prepare federation creation request
      const request = {
        charter: {
          familyName: charter.familyName,
          familyMotto: charter.familyMotto || '',
          foundingDate: charter.foundingDate,
          missionStatement: charter.missionStatement || '',
          values: charter.values || []
        },
        rbac: rbac,
        members: members,
        ...identityPayload,
      };

      setFederationProgress(70);

      // Call backend API
      const response = await createFamilyFoundry(request);

      if (!response.success) {
        throw new Error(response.error || 'Failed to create federation');
      }

      setFederationProgress(75);

      // Store federation details
      if (!response.data) {
        throw new Error('No federation data returned');
      }

      const newFederationId = response.data.federationId;
      const newFederationDuid = response.data.federationDuid;
      const newCharterId = response.data.charterId;

      setFederationId(newFederationId);
      setFederationDuid(newFederationDuid);
      setCharterId(newCharterId);

      // Phase 3: Create FROST session for federation operations
      setFederationProgress(80);
      const frostResult = await createFrostSession({
        federationDuid: newFederationDuid,
        familyName: charter.familyName,
        creatorUserDuid: 'current-user-duid', // Will be replaced with actual user DUID
        participants: members.map(m => ({
          user_duid: m.user_duid,
          role: m.role
        })),
        messageHash: '', // Will be set per operation
        eventTemplate: 'federation_creation',
        eventType: 'federation_setup',
        customThreshold: rbac.frostThreshold // User-configurable FROST threshold (1-5)
      });

      if (frostResult.success && frostResult.sessionId) {
        setFrostSessionId(frostResult.sessionId);
        setFrostThreshold(frostResult.threshold || 2);
      }

      // Phase 3: Configure NFC MFA policy
      setFederationProgress(85);
      const nfcPolicyResult = await createNfcMfaPolicy({
        federationDuid: newFederationDuid,
        policy: 'required_for_high_value',
        amountThreshold: calculateHighValueThreshold(members.length),
        stewardThreshold: frostResult.threshold || 2
      });

      if (nfcPolicyResult.success && nfcPolicyResult.policyId) {
        setNfcMfaPolicyId(nfcPolicyResult.policyId);
      }

      // Phase 3: Send steward approval requests
      setFederationProgress(90);
      const operationHash = await generateFederationOperationHash(
        newFederationDuid,
        charter.familyName,
        'current-user-duid' // Will be replaced with actual user DUID
      );

      // Get steward pubkeys from members (placeholder - would need actual pubkey mapping)
      const stewardPubkeys = members
        .filter(m => m.role === 'steward' || m.role === 'guardian')
        .map(m => m.user_duid); // Placeholder - would need actual pubkey conversion

      if (stewardPubkeys.length > 0) {
        const approvalResult = await sendFederationApprovalRequests({
          federationDuid: newFederationDuid,
          federationName: charter.familyName,
          creatorUserDuid: 'current-user-duid',
          stewardThreshold: frostResult.threshold || 2,
          stewardPubkeys,
          operationHash,
          expiresAtSeconds: Math.floor(Date.now() / 1000) + 300 // 5 minutes
        });

        if (approvalResult.success) {
          setStewardApprovalStatus('pending');
        }
      }

      setFederationProgress(100);

      // Move to next step
      setTimeout(() => {
        setCurrentStep('invites');
        setIsCreatingFederation(false);
      }, 500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setIsCreatingFederation(false);
      setFederationProgress(0);
    }
  };

  const prevStep = () => {
    setError(null);
    const currentIndex = steps.findIndex(step => step.id === currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1].id as WizardStep);
    }
  };

  const sendInvitations = async () => {
    try {
      // Integrate with existing PostAuthInvitationModal system
      // This will use the existing /api/authenticated/generate-peer-invite endpoint
      // which provides DM, QR code, course credits, and landing page integration

      const invitationPromises = trustedPeers.map(async (peer) => {
        const response = await fetch('/api/authenticated/generate-peer-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            personalMessage: `You've been invited to join the ${charter.familyName} family federation on Satnam.pub!`,
            courseCredits: 1,
            expiryDays: 30,
            recipientNostrPubkey: peer.npub,
            sendAsGiftWrappedDM: true // Use NIP-59 Gift Wrapped messaging
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to send invitation to ${peer.name}`);
        }

        return response.json();
      });

      await Promise.all(invitationPromises);

      // Close modal and continue to federation creation
      setShowInviteModal(false);
      setCurrentStep('federation');

    } catch (error) {
      console.error('Error sending invitations:', error);
      setError('Failed to send invitations');
    }
  };

  const handleFederationComplete = (newFederationId: string) => {
    // REMOVED: console.log (use proper logging mechanism for production)
    setFederationId(newFederationId);
    // SECURITY: Use cryptographically secure random generation (Web Crypto API)
    setVerificationId(`family-federation-${Date.now()}-${crypto.randomUUID()}`);
    setShowFederationModal(false);
    setCurrentStep('complete');
  };

  const handleCascadeSave = (cascade: PaymentCascadeNode[]) => {
    setPaymentCascade(cascade);
    setShowCascadeModal(false);
  };

  // Convert trusted peers to family members for cascade modal
  const familyMembersForCascade = trustedPeers.map(peer => ({
    id: peer.id,
    name: peer.name,
    npub: peer.npub,
    role: peer.role as 'guardian' | 'steward' | 'adult' | 'offspring'
  }));

  const renderStepContent = () => {
    switch (currentStep) {
      case 'charter':
        return (
          <FamilyFoundryStep1Charter
            charter={charter}
            onCharterChange={setCharter}
            onNext={nextStep}
            onBack={onBack}
          />
        );

      case 'rbac':
        return (
          <div>
            {isCreatingFederation && (
              <div className="mb-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="animate-spin">
                    <Zap className="h-5 w-5 text-blue-400" />
                  </div>
                  <span className="text-blue-200 font-semibold">Creating Federation...</span>
                </div>
                <div className="w-full bg-blue-900/30 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${federationProgress}%` }}
                  />
                </div>
                <p className="text-blue-300 text-sm mt-2">{federationProgress}% complete</p>
              </div>
            )}
            <FamilyFoundryStep2RBAC
              rbac={rbac}
              onRBACChange={setRbac}
              onNext={nextStep}
              onBack={prevStep}
              disabled={isCreatingFederation}
            />
            {/* Phase 3: Federation Identity Setup (handle + previews) */}
            <div className="mt-8 bg-white/5 border border-white/10 rounded-xl p-6">
              <h3 className="text-xl font-bold text-white mb-3">Federation Identity Setup (Optional)</h3>
              <p className="text-purple-200 text-sm mb-4">
                Configure a federation-wide Nostr identity for your family. This handle will be used to
                derive the federation&apos;s NIP-05 identifier and Lightning address on
                <span className="font-mono"> {identityDomain}</span>. Leave this blank if you prefer to
                configure federation identity later.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-purple-100 mb-1" htmlFor="federation-handle">
                    Federation Handle
                  </label>
                  <input
                    id="federation-handle"
                    type="text"
                    className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-white placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g. smith-family"
                    value={federationHandle}
                    onChange={(e) => {
                      const value = e.target.value.toLowerCase();
                      setFederationHandle(value);
                      const validationError = validateFederationHandle(value);
                      setFederationHandleError(validationError);
                    }}
                  />
                  {federationHandleError && (
                    <p className="mt-1 text-sm text-red-400">{federationHandleError}</p>
                  )}
                </div>
                {federationHandle.trim() && !federationHandleError && (
                  <div className="bg-black/30 border border-white/10 rounded-lg p-4">
                    <p className="text-sm text-purple-200 mb-1 font-semibold">Derived Federation Identity</p>
                    <p className="text-sm text-purple-100">
                      NIP-05:&nbsp;
                      <span className="font-mono">
                        {federationHandle.trim().toLowerCase()}@{identityDomain}
                      </span>
                    </p>
                    <p className="text-sm text-purple-100 mt-1">
                      Lightning Address:&nbsp;
                      <span className="font-mono">
                        {federationHandle.trim().toLowerCase()}@{identityDomain}
                      </span>
                    </p>
                    <p className="text-xs text-purple-300 mt-2">
                      The federation&apos;s private key (nsec) will be generated in your browser and encrypted
                      using your account&apos;s encryption key before being sent to the server. You can recover
                      it using the same credentials you use for your personal identity.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'invites':
        return (
          <FamilyFoundryStep3Invite
            trustedPeers={trustedPeers}
            onPeersChange={setTrustedPeers}
            onNext={nextStep}
            onBack={prevStep}
            allowSkip={true}
          />
        );

      case 'federation':
        return (
          <div className="space-y-8">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full mb-4">
                <Zap className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Create Your Family Federation</h2>
              <p className="text-purple-200 max-w-2xl mx-auto">
                Configure your family federation with the selected members and consensus thresholds
              </p>
            </div>

            {/* Federation Summary */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <h3 className="text-xl font-bold text-white mb-4">Federation Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-white font-semibold mb-3">Family Charter</h4>
                  <div className="space-y-2">
                    <p className="text-purple-200"><span className="text-white">Name:</span> {charter.familyName}</p>
                    <p className="text-purple-200"><span className="text-white">Motto:</span> {charter.familyMotto}</p>
                    <p className="text-purple-200"><span className="text-white">Founded:</span> {charter.foundingDate}</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-3">
                    Members ({trustedPeers.length + 1})
                    <span className="text-purple-300 font-normal text-sm ml-2">(including you as founder)</span>
                  </h4>
                  <div className="space-y-1">
                    {/* Show founding user first */}
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span className="text-white font-medium">You</span>
                      <span className="text-green-400 text-sm">(Founder / Guardian)</span>
                    </div>
                    {trustedPeers.length > 0 ? (
                      trustedPeers.map((peer) => (
                        <div key={peer.id} className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                          <span className="text-purple-200">{peer.name}</span>
                          <span className="text-purple-400 text-sm capitalize">({peer.role})</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-purple-300 text-sm italic mt-2">
                        No additional members invited yet. You can invite members after creating the federation.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-6">
              <button
                onClick={prevStep}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={() => setShowFederationModal(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
              >
                <Zap className="h-4 w-4" />
                {trustedPeers.length === 0 ? 'Create Solo Federation' : 'Configure Federation'}
              </button>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="max-w-4xl mx-auto">
            {/* Success Header */}
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Federation Created Successfully!</h2>
              <p className="text-purple-200">
                Your family federation "{charter.familyName}" has been established
              </p>
            </div>

            {/* Federation Summary */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
              <h3 className="text-xl font-bold text-white mb-4">Federation Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-purple-300 text-sm">Federation ID</p>
                  <p className="text-white font-mono text-sm">{federationId?.substring(0, 16)}...</p>
                </div>
                <div>
                  <p className="text-purple-300 text-sm">Family Name</p>
                  <p className="text-white">{charter.familyName}</p>
                </div>
                <div>
                  <p className="text-purple-300 text-sm">Motto</p>
                  <p className="text-white">{charter.familyMotto}</p>
                </div>
                <div>
                  <p className="text-purple-300 text-sm">Members</p>
                  <p className="text-white">
                    {trustedPeers.length === 0
                      ? '1 (Founder only)'
                      : `${trustedPeers.length + 1} (Founder + ${trustedPeers.length} invited)`}
                  </p>
                </div>
              </div>
            </div>

            {/* SimpleProof Blockchain Attestation (Optional) */}
            {SIMPLEPROOF_ENABLED && verificationId && federationId && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-6 mb-6">
                <h4 className="text-orange-200 font-bold mb-3">🔐 Blockchain Attestation (Optional)</h4>
                <p className="text-purple-200 text-sm mb-4">
                  Create a permanent, verifiable record of your family federation establishment on the Bitcoin blockchain.
                  This provides cryptographic proof of your federation's founding charter and members.
                </p>
                <SimpleProofFeeEstimationWrapper
                  data={JSON.stringify({
                    eventType: 'family_federation',
                    federationId: federationId,
                    familyName: charter.familyName,
                    familyMotto: charter.familyMotto,
                    foundingDate: charter.foundingDate,
                    missionStatement: charter.missionStatement,
                    memberCount: trustedPeers.length + 1, // +1 for founding user
                    members: [
                      { name: 'Founder', role: 'guardian' },
                      ...trustedPeers.map(p => ({ name: p.name, role: p.role }))
                    ],
                    createdAt: new Date().toISOString(),
                  })}
                  verificationId={verificationId}
                  eventType="family_federation"
                  onSuccess={(result: any) => {
                    console.log('✅ SimpleProof attestation created for family federation:', result);
                  }}
                  onError={(error: any) => {
                    console.error('❌ SimpleProof attestation failed:', error);
                  }}
                  variant="primary"
                  size="md"
                  className="w-full"
                />
                <p className="text-purple-300 text-xs mt-3 text-center">
                  You can skip this step and continue to your family dashboard
                </p>
              </div>
            )}

            {/* Invitation Generator - for solo founders or to invite more members */}
            {federationDuid && (
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-4">Invite Family Members</h3>
                <p className="text-purple-200 text-sm mb-4">
                  Generate invitation links to share with family members. Each invitation includes a QR code and role-specific onboarding guide.
                </p>
                <InvitationGenerator
                  federationDuid={federationDuid}
                  federationName={charter.familyName}
                  onInvitationGenerated={(invitation) => {
                    console.log('Invitation generated:', invitation);
                  }}
                />
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-center">
              <button
                onClick={onComplete}
                className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300"
              >
                <Users className="h-5 w-5" />
                Go to Family Dashboard
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {steps.map((step, index) => {
              const isActive = step.id === currentStep;
              const isCompleted = steps.findIndex(s => s.id === currentStep) > index;
              const IconComponent = step.icon;

              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${isCompleted
                        ? 'bg-green-600'
                        : isActive
                          ? 'bg-purple-600'
                          : 'bg-white/10'
                        }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-6 w-6 text-white" />
                      ) : (
                        <IconComponent className="h-6 w-6 text-white" />
                      )}
                    </div>
                    <span
                      className={`text-sm mt-2 font-medium ${isActive ? 'text-white' : 'text-purple-300'
                        }`}
                    >
                      {step.name}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`w-16 h-1 mx-4 transition-all duration-300 ${isCompleted ? 'bg-green-600' : 'bg-white/10'
                        }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="max-w-4xl mx-auto">
          {renderStepContent()}
        </div>

        {/* Error Display */}
        {error && (
          <div className="fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg">
            {error}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 max-w-2xl w-full">
            <div className="text-center mb-6">
              <Mail className="h-16 w-16 mx-auto mb-4 text-green-400" />
              <h3 className="text-2xl font-bold text-white mb-2">Send Family Federation Invitations</h3>
              <p className="text-purple-100">Invite your trusted family members using the existing Satnam.pub invitation system</p>
            </div>

            <div className="space-y-4 mb-6">
              {trustedPeers.length > 0 ? (
                trustedPeers.map((peer, index) => (
                  <div key={index} className="flex items-center justify-between bg-white/10 rounded-lg p-4">
                    <div>
                      <h4 className="text-white font-semibold">{peer.name}</h4>
                      <p className="text-purple-200 text-sm">{peer.npub}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="bg-purple-600 text-white px-2 py-1 rounded text-xs">
                          {peer.role}
                        </span>
                        <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs">
                          {peer.relationship}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-green-400 text-sm">🎁 1 Course Credit</div>
                      <div className="text-purple-300 text-xs">NIP-59 DM</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-4">
                  {/* Solo founder invitation generator */}
                  {federationDuid ? (
                    <div>
                      <p className="text-purple-200 mb-4 text-center">
                        Generate an invitation link to share with family members via Signal, email, or any other method.
                      </p>
                      <InvitationGenerator
                        federationDuid={federationDuid}
                        federationName={charter.familyName}
                        onInvitationGenerated={(invitation) => {
                          console.log('Invitation generated:', invitation);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-white/5 rounded-xl border border-white/10">
                      <Users className="h-12 w-12 mx-auto mb-4 text-purple-400 opacity-50" />
                      <p className="text-purple-200 mb-2">No members to invite yet</p>
                      <p className="text-purple-300 text-sm">
                        You can use the Family Invitation System from your dashboard to invite members later.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-400/30 mb-6">
              <h4 className="font-medium text-blue-300 mb-2">
                🎓 Invitation Benefits
              </h4>
              <div className="text-sm text-blue-200 space-y-1">
                <p>• Each invitee receives 1 course credit upon signup</p>
                <p>• You'll receive 1 bonus course credit per successful invitation</p>
                <p>• Invitees land on Satnam.pub with ID Foundry Modal ready</p>
                <p>• Complete privacy protection with NIP-59 Gift Wrapped messaging</p>
                <p>• QR codes and direct links available for sharing</p>
              </div>
            </div>

            <div className="flex gap-4">
              {/* Solo founder: Skip invitations and proceed to completion */}
              {trustedPeers.length === 0 ? (
                <button
                  onClick={() => {
                    setShowInviteModal(false);
                    // Federation was already created in createFederationBackend()
                    // Skip the federation modal and go directly to complete
                    setVerificationId(`family-federation-${Date.now()}-${crypto.randomUUID()}`);
                    setCurrentStep('complete');
                  }}
                  className="flex-1 font-bold py-3 px-6 rounded-lg transition-all duration-300 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                >
                  Continue as Solo Founder
                </button>
              ) : (
                <button
                  onClick={sendInvitations}
                  className="flex-1 font-bold py-3 px-6 rounded-lg transition-all duration-300 bg-green-600 hover:bg-green-700 text-white"
                >
                  Send Invitations
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MVP Mode Information - Shown when Fedimint is disabled */}
      {!FeatureFlags.isFedimintEnabled() && (
        <div className="fixed bottom-4 left-4 bg-blue-600/90 backdrop-blur-sm text-white px-6 py-4 rounded-lg shadow-lg border border-blue-400/50 max-w-sm">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold mb-1">MVP Mode Active</h4>
              <p className="text-sm text-blue-100">
                Family Federation is running in MVP mode without payment features. Core federation, messaging, and consensus operations are fully functional.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Federation Creation Modal */}
      <FamilyFederationCreationModal
        isOpen={showFederationModal}
        onClose={() => setShowFederationModal(false)}
        onBack={() => setShowFederationModal(false)}
        charter={charter}
        rbac={rbac}
        trustedPeers={trustedPeers}
        onComplete={handleFederationComplete}
      />

      {/* Payment Cascade Modal - Only shown when Fedimint is enabled */}
      {FeatureFlags.isFedimintEnabled() && (
        <PaymentCascadeModal
          isOpen={showCascadeModal}
          onClose={() => setShowCascadeModal(false)}
          onSave={handleCascadeSave}
          familyMembers={familyMembersForCascade}
          totalAmount={charter.initialTreasury}
          defaultCurrency="sats"
          title="Family Treasury Cascade Setup"
        />
      )}
    </div>
  );
};

export default FamilyFoundryWizard; 