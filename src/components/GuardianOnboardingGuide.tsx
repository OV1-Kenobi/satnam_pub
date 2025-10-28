import React, { useState } from 'react';
import { 
  Shield, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Users, 
  Lock, 
  Mail,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface GuardianOnboardingGuideProps {
  onComplete?: () => void;
  onBack?: () => void;
  embedded?: boolean; // If true, shows compact version for Family Foundry
}

type Section = 
  | 'intro' 
  | 'responsibilities' 
  | 'workflow' 
  | 'receiving' 
  | 'responding' 
  | 'security' 
  | 'troubleshooting';

const GuardianOnboardingGuide: React.FC<GuardianOnboardingGuideProps> = ({
  onComplete,
  onBack,
  embedded = false
}) => {
  const [activeSection, setActiveSection] = useState<Section>('intro');
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);

  const sections = [
    { id: 'intro' as Section, name: 'Introduction', icon: BookOpen },
    { id: 'responsibilities' as Section, name: 'Your Role', icon: Shield },
    { id: 'workflow' as Section, name: 'Signing Workflow', icon: Users },
    { id: 'receiving' as Section, name: 'Receiving Requests', icon: Mail },
    { id: 'responding' as Section, name: 'Responding', icon: CheckCircle },
    { id: 'security' as Section, name: 'Security', icon: Lock },
    { id: 'troubleshooting' as Section, name: 'Troubleshooting', icon: AlertTriangle }
  ];

  const faqs = [
    {
      question: 'How many guardians are required?',
      answer: 'Family federations can configure thresholds from 1-of-N to 7-of-7. Common configurations: 2-of-3 (small families), 3-of-5 (medium families), 5-of-7 (large families).'
    },
    {
      question: 'What happens if a guardian is unavailable?',
      answer: 'As long as the threshold is met, the signing can complete. For example, in a 3-of-5 configuration, only 3 guardians need to approve even if 2 are unavailable.'
    },
    {
      question: 'Can I change my approval after submitting?',
      answer: 'No, approvals are final once submitted. Review carefully before approving.'
    },
    {
      question: 'How long do I have to respond?',
      answer: 'Typically 24 hours, but this can vary. Check the expiresAt field in the request.'
    },
    {
      question: 'Are my communications private?',
      answer: 'Yes! All guardian communications use NIP-59 gift-wrapped messaging for maximum privacy.'
    }
  ];

  const renderIntro = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-xl p-6">
        <h3 className="text-2xl font-bold text-white mb-4">Welcome, Guardian! 🛡️</h3>
        <p className="text-purple-100 leading-relaxed">
          As a guardian in a Family Federation, you play a crucial role in protecting your family's 
          digital sovereignty through multi-signature approval workflows using <strong>Shamir Secret Sharing (SSS)</strong>.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
          <div className="flex items-center gap-3 mb-3">
            <Lock className="h-6 w-6 text-green-400" />
            <h4 className="text-white font-semibold">No Single Point of Failure</h4>
          </div>
          <p className="text-purple-200 text-sm">
            No individual guardian has the complete key. Security through distribution.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="h-6 w-6 text-blue-400" />
            <h4 className="text-white font-semibold">Privacy-First</h4>
          </div>
          <p className="text-purple-200 text-sm">
            Uses NIP-59 gift-wrapped messaging for all communications.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
          <div className="flex items-center gap-3 mb-3">
            <Users className="h-6 w-6 text-purple-400" />
            <h4 className="text-white font-semibold">Flexible Thresholds</h4>
          </div>
          <p className="text-purple-200 text-sm">
            Supports 1-of-N to 7-of-7 configurations based on family needs.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
          <div className="flex items-center gap-3 mb-3">
            <Lock className="h-6 w-6 text-red-400" />
            <h4 className="text-white font-semibold">Zero-Knowledge</h4>
          </div>
          <p className="text-purple-200 text-sm">
            Private keys never exist in plaintext. Immediate memory wipe after signing.
          </p>
        </div>
      </div>
    </div>
  );

  const renderResponsibilities = () => (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white mb-4">Guardian Responsibilities</h3>
      
      <div className="space-y-4">
        <div className="flex items-start gap-4 bg-white/10 rounded-lg p-4 border border-white/20">
          <CheckCircle className="h-6 w-6 text-green-400 flex-shrink-0 mt-1" />
          <div>
            <h4 className="text-white font-semibold mb-2">Review Signing Requests Carefully</h4>
            <p className="text-purple-200 text-sm">
              Examine event type, content, requester identity, and expiration time before approving.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 bg-white/10 rounded-lg p-4 border border-white/20">
          <Clock className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1" />
          <div>
            <h4 className="text-white font-semibold mb-2">Respond Promptly</h4>
            <p className="text-purple-200 text-sm">
              Time-sensitive requests typically expire in 24 hours. Enable notifications to stay informed.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 bg-white/10 rounded-lg p-4 border border-white/20">
          <Lock className="h-6 w-6 text-purple-400 flex-shrink-0 mt-1" />
          <div>
            <h4 className="text-white font-semibold mb-2">Maintain Security</h4>
            <p className="text-purple-200 text-sm">
              Protect your guardian credentials. Use NIP-07 browser extension or hardware wallets.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 bg-white/10 rounded-lg p-4 border border-white/20">
          <Users className="h-6 w-6 text-orange-400 flex-shrink-0 mt-1" />
          <div>
            <h4 className="text-white font-semibold mb-2">Communicate with Other Guardians</h4>
            <p className="text-purple-200 text-sm">
              Coordinate on important decisions. Report suspicious activity immediately.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-red-600/20 to-orange-600/20 border border-red-500/30 rounded-xl p-6">
        <h4 className="text-white font-bold mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          Master Context Role Hierarchy
        </h4>
        <div className="flex items-center justify-center gap-2 text-white font-mono text-sm">
          <span className="text-purple-300">Private</span>
          <ArrowRight className="h-4 w-4" />
          <span className="text-blue-300">Offspring</span>
          <ArrowRight className="h-4 w-4" />
          <span className="text-green-300">Adult</span>
          <ArrowRight className="h-4 w-4" />
          <span className="text-purple-300">Steward</span>
          <ArrowRight className="h-4 w-4" />
          <span className="text-red-300 font-bold">Guardian</span>
        </div>
        <p className="text-purple-200 text-sm mt-3">
          Guardians have the highest level of authority and responsibility in the family federation.
        </p>
      </div>
    </div>
  );

  const renderWorkflow = () => (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white mb-4">Threshold Signing Workflow</h3>
      
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h4 className="text-white font-bold mb-4">Example: 3-of-5 Threshold</h4>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">1</div>
            <p className="text-purple-100">Family member initiates signing request</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">2</div>
            <p className="text-purple-100">System generates SSS shares (5 total)</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">3</div>
            <p className="text-purple-100">All 5 guardians receive NIP-59 approval requests</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm">4</div>
            <p className="text-purple-100">Guardians review and approve (need 3 approvals)</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm">5</div>
            <p className="text-purple-100">Threshold met! System reconstructs key</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">6</div>
            <p className="text-purple-100">Event signed and broadcast to Nostr relays</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">7</div>
            <p className="text-purple-100">All guardians notified of completion</p>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-green-600/20 to-teal-600/20 border border-green-500/30 rounded-xl p-6">
        <h4 className="text-white font-bold mb-3">Timeline Example</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-purple-100">
            <span>T+0 min</span>
            <span>Request initiated</span>
          </div>
          <div className="flex justify-between text-purple-100">
            <span>T+1 min</span>
            <span>Guardians receive messages</span>
          </div>
          <div className="flex justify-between text-purple-100">
            <span>T+15 min</span>
            <span>Guardian 1 approves ✅</span>
          </div>
          <div className="flex justify-between text-purple-100">
            <span>T+30 min</span>
            <span>Guardian 2 approves ✅</span>
          </div>
          <div className="flex justify-between text-green-300 font-semibold">
            <span>T+45 min</span>
            <span>Guardian 3 approves ✅ (Threshold met!)</span>
          </div>
          <div className="flex justify-between text-blue-300">
            <span>T+46 min</span>
            <span>Event signed and broadcast</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderReceiving = () => (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white mb-4">Receiving Approval Requests</h3>
      
      <div className="bg-white/10 rounded-lg p-6 border border-white/20">
        <h4 className="text-white font-bold mb-4">NIP-59 Message Format</h4>
        <div className="bg-black/30 rounded-lg p-4 font-mono text-xs text-purple-200 overflow-x-auto">
          <pre>{`{
  "type": "guardian_approval_request",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "familyId": "family-federation-123",
  "eventType": "payment_request",
  "threshold": 3,
  "expiresAt": 1730000000000,
  "requesterPubkey": "npub1...",
  "eventTemplate": {
    "kind": 1,
    "content": "Payment request for family expenses",
    "tags": [["amount", "50000"], ["currency", "sats"]],
    "created_at": 1729900000
  }
}`}</pre>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-white font-semibold">Where to Find Requests:</h4>
        <div className="grid gap-3">
          <div className="flex items-center gap-3 bg-white/10 rounded-lg p-3">
            <Mail className="h-5 w-5 text-purple-400" />
            <span className="text-purple-100">Nostr Client - Check DMs for gift-wrapped messages</span>
          </div>
          <div className="flex items-center gap-3 bg-white/10 rounded-lg p-3">
            <Shield className="h-5 w-5 text-blue-400" />
            <span className="text-purple-100">Satnam.pub Dashboard - Guardian Panel</span>
          </div>
          <div className="flex items-center gap-3 bg-white/10 rounded-lg p-3">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            <span className="text-purple-100">Mobile Notifications - Amber/NIP-55 signer</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'intro':
        return renderIntro();
      case 'responsibilities':
        return renderResponsibilities();
      case 'workflow':
        return renderWorkflow();
      case 'receiving':
        return renderReceiving();
      case 'responding':
        return (
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-white mb-4">Responding to Requests</h3>
            <div className="space-y-4">
              {[
                { step: 1, title: 'Review the Request', items: ['Event type and content', 'Requester identity', 'Expiration time', 'Threshold requirement'] },
                { step: 2, title: 'Verify Authenticity', items: ['Check requester public key', 'Verify event details', 'Confirm with other guardians if unsure'] },
                { step: 3, title: 'Submit Your Approval', items: ['Open Guardian Panel', 'Select pending request', 'Click "Approve"', 'Confirm with NIP-07 or NIP-05/password'] },
                { step: 4, title: 'Wait for Threshold', items: ['Event auto-signed when threshold met', 'Broadcast to Nostr relays', 'All guardians notified'] }
              ].map(({ step, title, items }) => (
                <div key={step} className="bg-white/10 rounded-lg p-4 border border-white/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                      {step}
                    </div>
                    <h4 className="text-white font-semibold">{title}</h4>
                  </div>
                  <ul className="space-y-2 ml-11">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-purple-200 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        );
      case 'security':
        return (
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-white mb-4">Security Best Practices</h3>
            <div className="grid gap-4">
              <div className="bg-gradient-to-br from-green-600/20 to-teal-600/20 border border-green-500/30 rounded-xl p-6">
                <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                  <Lock className="h-5 w-5 text-green-400" />
                  Protect Your Credentials
                </h4>
                <ul className="space-y-2 text-purple-100 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <span>Use NIP-07 browser extension (preferred) or NIP-05/password</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <span>Never share your nsec with anyone</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <span>Keep backup of credentials in secure location</span>
                  </li>
                </ul>
              </div>

              <div className="bg-gradient-to-br from-red-600/20 to-orange-600/20 border border-red-500/30 rounded-xl p-6">
                <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  Report Suspicious Activity
                </h4>
                <ol className="space-y-2 text-purple-100 text-sm list-decimal list-inside">
                  <li>Do NOT approve the request</li>
                  <li>Contact other guardians immediately</li>
                  <li>Report to family federation administrator</li>
                  <li>Document the incident</li>
                </ol>
              </div>
            </div>
          </div>
        );
      case 'troubleshooting':
        return (
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-white mb-4">Troubleshooting & FAQ</h3>
            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <div key={index} className="bg-white/10 rounded-lg border border-white/20 overflow-hidden">
                  <button
                    onClick={() => setExpandedFAQ(expandedFAQ === index ? null : index)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="text-white font-semibold">{faq.question}</span>
                    {expandedFAQ === index ? (
                      <ChevronUp className="h-5 w-5 text-purple-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-purple-400" />
                    )}
                  </button>
                  {expandedFAQ === index && (
                    <div className="px-4 pb-4 text-purple-200 text-sm">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      {!embedded && (
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full mb-4">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Guardian Onboarding Guide</h2>
          <p className="text-purple-200 max-w-2xl mx-auto">
            Learn how to protect your family's digital sovereignty through federated signing
          </p>
        </div>
      )}

      {/* Section Navigation */}
      <div className="flex flex-wrap gap-2 justify-center">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300 ${
                activeSection === section.id
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                  : 'bg-white/10 text-purple-200 hover:bg-white/20'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-sm">{section.name}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {renderContent()}
      </div>

      {/* Navigation Buttons */}
      {!embedded && (
        <div className="flex justify-between pt-6">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
          {onComplete && (
            <button
              onClick={onComplete}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ml-auto"
            >
              I Understand My Role
              <CheckCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default GuardianOnboardingGuide;

