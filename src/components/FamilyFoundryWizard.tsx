import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Crown,
  Shield,
  Users,
  Zap,
  Key,
  Award,
  Heart,
  Star,
  Target,
  BookOpen,
  Lock,
  Eye,
  EyeOff,
  Mail,
  QrCode,
  Copy,
  ExternalLink,
  X
} from "lucide-react";
import React, { useState } from "react";
import { FamilyFoundryService, CharterDefinition, RBACDefinition } from "../lib/api/family-foundry";
import FamilyFoundryStep1Charter from "./FamilyFoundryStep1Charter";
import FamilyFoundryStep2RBAC from "./FamilyFoundryStep2RBAC";
import FamilyFoundryStep3Invite from "./FamilyFoundryStep3Invite";
import FamilyFederationCreationModal from "./FamilyFederationCreationModal";
import PaymentCascadeModal from './PaymentCascadeModal';
import { PaymentCascadeNode } from '../lib/payment-automation';

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

type WizardStep = 'charter' | 'rbac' | 'invites' | 'federation';

const FamilyFoundryWizard: React.FC<FamilyFoundryWizardProps> = ({
  onComplete,
  onBack,
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>('charter');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showFederationModal, setShowFederationModal] = useState(false);
  const [isCreatingFederation, setIsCreatingFederation] = useState(false);
  const [federationProgress, setFederationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showCascadeModal, setShowCascadeModal] = useState(false);
  const [paymentCascade, setPaymentCascade] = useState<PaymentCascadeNode[]>([]);

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
    ]
  });

  // Step 3: Trusted Peers
  const [trustedPeers, setTrustedPeers] = useState<TrustedPeer[]>([]);

  const steps = [
    { id: 'charter', name: 'Charter Definition', icon: Crown },
    { id: 'rbac', name: 'RBAC Setup', icon: Shield },
    { id: 'invites', name: 'Invite Peers', icon: Users },
    { id: 'federation', name: 'Create Federation', icon: Zap }
  ];

  const nextStep = () => {
    setError(null);
    
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

  const handleFederationComplete = (federationId: string) => {
    console.log('Federation created successfully:', federationId);
    onComplete();
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
          <FamilyFoundryStep2RBAC
            rbac={rbac}
            onRBACChange={setRbac}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      
      case 'invites':
        return (
          <FamilyFoundryStep3Invite
            trustedPeers={trustedPeers}
            onPeersChange={setTrustedPeers}
            onNext={nextStep}
            onBack={prevStep}
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
                  <h4 className="text-white font-semibold mb-3">Members ({trustedPeers.length})</h4>
                  <div className="space-y-1">
                    {trustedPeers.map((peer) => (
                      <div key={peer.id} className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                        <span className="text-purple-200">{peer.name}</span>
                        <span className="text-purple-400 text-sm capitalize">({peer.role})</span>
                      </div>
                    ))}
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
                disabled={trustedPeers.length === 0}
                className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap className="h-4 w-4" />
                Configure Federation
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
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isCompleted
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
                      className={`text-sm mt-2 font-medium ${
                        isActive ? 'text-white' : 'text-purple-300'
                      }`}
                    >
                      {step.name}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`w-16 h-1 mx-4 transition-all duration-300 ${
                        isCompleted ? 'bg-green-600' : 'bg-white/10'
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
              {trustedPeers.map((peer, index) => (
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
              ))}
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
              <button
                onClick={sendInvitations}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
              >
                Send Invitations
              </button>
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

      <PaymentCascadeModal
        isOpen={showCascadeModal}
        onClose={() => setShowCascadeModal(false)}
        onSave={handleCascadeSave}
        familyMembers={familyMembersForCascade}
        totalAmount={charter.initialTreasury}
        defaultCurrency="sats"
        title="Family Treasury Cascade Setup"
      />
    </div>
  );
};

export default FamilyFoundryWizard; 