import {
  ArrowLeft,
  Award,
  BarChart3,
  BookOpen,
  Brain,
  Crown,
  Globe,
  Key,
  Lock,
  MessageCircle,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  Split,
  Target,
  Users,
  Wallet,
  Zap
} from 'lucide-react';
import React from 'react';

interface FeaturesOverviewProps {
  onBack: () => void;
}

const FeaturesOverview: React.FC<FeaturesOverviewProps> = ({ onBack }) => {
  const GITHUB = 'https://github.com/OV1-Kenobi/satnam_pub/blob/main/';

  const featureCategories = [
    {
      title: "Core Identity & Authentication",
      description: "Foundation of sovereign digital identity",
      features: [
        {
          name: "Identity Forge",
          description: "Create sovereign digital identities with cryptographic keys",
          icon: Key,
          color: "purple",
          links: [
            { label: "Frontend", href: `${GITHUB}src/components/IdentityForge.tsx` },
            { label: "Backend", href: `${GITHUB}netlify/functions_active/register-identity.js` }
          ]
        },
        {
          name: "NIP-07 Sign-in",
          description: "Privacy-first authentication using browser extensions",
          icon: Shield,
          color: "blue",
          links: [
            { label: "Frontend", href: `${GITHUB}src/components/IndividualAuth.tsx` },
            { label: "API", href: `${GITHUB}netlify/functions_active/signin-handler.js` }
          ]
        },
        {
          name: "Family Foundry",
          description: "Establish family federations with role-based governance",
          icon: Crown,
          color: "gold",
          links: [
            { label: "Frontend", href: `${GITHUB}src/components/FamilyFoundryWizard.tsx` },
            { label: "DB", href: `${GITHUB}migrations/011_family_federation_auth.sql` }
          ]
        },
        {
          name: "Emergency Recovery",
          description: "Account recovery with OTP and privacy-first flows",
          icon: RefreshCw,
          color: "red",
          links: [
            { label: "Frontend", href: `${GITHUB}src/components/EmergencyRecoveryModal.tsx` },
            { label: "API (OTP Generate)", href: `${GITHUB}netlify/functions/auth-migration-otp-generate.ts` },
            { label: "DB", href: `${GITHUB}supabase/migrations/20241201000001_emergency_recovery_system.sql` }
          ]
        }
      ]
    },
    {
      title: "Financial Management",
      description: "Comprehensive Bitcoin financial tools",
      features: [
        {
          name: "Family Financials Dashboard",
          description: "Family treasury management with collective balance tracking",
          icon: BarChart3,
          color: "green",
          links: [
            { label: "Frontend", href: `${GITHUB}src/components/FamilyFinancialsDashboard.tsx` }
          ]
        },
        {
          name: "Individual Finances Dashboard",
          description: "Personal financial tracking and management",
          icon: Wallet,
          color: "blue",
          links: [
            { label: "Frontend", href: `${GITHUB}src/components/IndividualFinancesDashboard.tsx` }
          ]
        },
        {
          name: "Lightning Treasury",
          description: "Lightning Network management and liquidity",
          icon: Zap,
          color: "orange",
          links: [
            { label: "Frontend", href: `${GITHUB}src/components/FamilyLightningTreasury.tsx` }
          ]
        },
        {
          name: "Fedimint Governance",
          description: "Federation governance and decision-making",
          icon: Users,
          color: "purple",
          links: [
            { label: "Frontend", href: `${GITHUB}src/components/FamilyFedimintGovernance.tsx` }
          ]
        },
        {
          name: "Payment Automation",
          description: "Automated payment systems and scheduling",
          icon: Settings,
          color: "indigo",
          links: [
            { label: "Frontend (Family)", href: `${GITHUB}src/components/FamilyPaymentAutomationModal.tsx` },
            { label: "Frontend (Individual)", href: `${GITHUB}src/components/IndividualPaymentAutomationModal.tsx` }
          ]
        },
        {
          name: "Unified Family Payments",
          description: "Cross-protocol payment management",
          icon: Split,
          color: "teal",
          links: [
            { label: "API", href: `${GITHUB}netlify/functions_active/family-wallet-unified.js` }
          ]
        }
      ]
    },
    {
      title: "Educational & Cognitive Capital",
      description: "Knowledge wealth accumulation and tracking",
      features: [
        {
          name: "Educational Dashboard",
          description: "Learning progress tracking and course management",
          icon: BookOpen,
          color: "blue",
          links: [
            { label: "Frontend", href: `${GITHUB}src/components/EducationPlatform.tsx` }
          ]
        },
        {
          name: "Cognitive Capital Accounting",
          description: "Track and accumulate intellectual wealth",
          icon: Brain,
          color: "purple"
        },
        {
          name: "Course Registration",
          description: "Enroll in Bitcoin education courses",
          icon: Target,
          color: "green"
        },
        {
          name: "Progress Tracking",
          description: "Learning analytics and achievement monitoring",
          icon: Award,
          color: "orange"
        },
        {
          name: "Badge System",
          description: "Achievement tracking and verifiable credentials",
          icon: Sparkles,
          color: "yellow"
        },
        {
          name: "Learning Pathways",
          description: "Structured educational journeys",
          icon: Globe,
          color: "indigo"
        }
      ]
    },
    {
      title: "Privacy & Sovereignty Controls",
      description: "Complete control over data and operations",
      features: [
        {
          name: "Privacy Controls Dashboard",
          description: "Granular privacy level management",
          icon: Lock,
          color: "purple"
        },
        {
          name: "Sovereignty Controls",
          description: "Family sovereignty settings and policies",
          icon: Shield,
          color: "blue"
        },
        {
          name: "Privacy Enhanced Individual Dashboard",
          description: "Personal privacy metrics and controls",
          icon: Settings,
          color: "green"
        },
        {
          name: "Privacy Preferences Modal",
          description: "Global privacy settings and policies",
          icon: Lock,
          color: "indigo"
        },
        {
          name: "Privacy-First Messaging",
          description: "Secure communications with privacy controls",
          icon: MessageCircle,
          color: "teal",
          links: [
            { label: "Client", href: `${GITHUB}src/lib/giftwrapped-communication-service.ts` },
            { label: "API", href: `${GITHUB}netlify/functions_active/unified-communications.js` },
            { label: "DB", href: `${GITHUB}supabase/migrations/2025-08-29_communications_privacy_schema.sql` }
          ]
        }
      ]
    },
    {
      title: "Advanced Features",
      description: "Cutting-edge Bitcoin and privacy technologies",
      features: [
        {
          name: "Atomic Swaps",
          description: "Cross-protocol exchanges and trading",
          icon: RefreshCw,
          color: "purple",
          links: [
            { label: "Frontend", href: `${GITHUB}src/components/AtomicSwapModal.tsx` }
          ]
        },
        {
          name: "Cross-Mint Operations",
          description: "Multi-protocol management and operations",
          icon: Globe,
          color: "blue",
          links: [
            { label: "Client", href: `${GITHUB}src/lib/cross-mint-cashu-manager.ts` }
          ]
        },
        {
          name: "Payment Cascade System",
          description: "Automated payment flows and distribution",
          icon: Split,
          color: "green"
        },
        {
          name: "PhoenixD Manager",
          description: "Lightning node management and optimization",
          icon: Zap,
          color: "orange",
          links: [
            { label: "Client", href: `${GITHUB}src/lib/enhanced-phoenixd-manager.ts` },
            { label: "API (status)", href: `${GITHUB}netlify/functions_active/phoenixd-status.js` }
          ]
        },
        {
          name: "Enhanced Liquidity Dashboard",
          description: "Liquidity management and optimization",
          icon: BarChart3,
          color: "indigo",
          links: [
            { label: "Frontend", href: `${GITHUB}src/components/EnhancedLiquidityDashboard.tsx` }
          ]
        }
      ]
    }
  ];

  // Backend-only features that exist but lack a full frontend interface
  const backendOnlyFeatures = [
    {
      name: 'Trust Score / Web of Trust',
      backend: [
        { label: 'API', href: `${GITHUB}netlify/functions_active/trust-score.ts` },
        { label: 'DB', href: `${GITHUB}supabase/migrations/20250923_web_of_trust.sql` }
      ],
      neededUI: 'TrustScoreDashboard.tsx (family and individual views)',
      priority: 'High'
    },
    {
      name: 'DID/SCID Issuer Registry',
      backend: [
        { label: 'API (issuer-registry)', href: `${GITHUB}netlify/functions_active/issuer-registry.ts` },
        { label: 'API (did.json)', href: `${GITHUB}netlify/functions_active/did-json.ts` },
        { label: 'DB', href: `${GITHUB}supabase/migrations/20250923b_did_scid_extensions.sql` }
      ],
      neededUI: 'IssuerRegistryAdmin.tsx + DID viewer',
      priority: 'Medium'
    },
    {
      name: 'Badge System / Credentials',
      backend: [
        { label: 'API', href: `${GITHUB}netlify/functions/badge-system.ts` },
        { label: 'DB', href: `${GITHUB}migrations/018_citadel_academy_badges.sql` }
      ],
      neededUI: 'BadgesPanel.tsx + issue/verify flows',
      priority: 'Medium'
    },
    {
      name: 'Control Board Service',
      backend: [
        { label: 'Service', href: `${GITHUB}services/control-board.ts` },
        { label: 'DB', href: `${GITHUB}migrations/008_control_board_schema.sql` }
      ],
      neededUI: 'ControlBoard.tsx (Master Context compliant)',
      priority: 'Low'
    }
  ];


  const getColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      purple: "bg-purple-100 border-purple-200 text-purple-800",
      blue: "bg-blue-100 border-blue-200 text-blue-800",
      green: "bg-green-100 border-green-200 text-green-800",
      orange: "bg-orange-100 border-orange-200 text-orange-800",
      red: "bg-red-100 border-red-200 text-red-800",
      yellow: "bg-yellow-100 border-yellow-200 text-yellow-800",
      indigo: "bg-indigo-100 border-indigo-200 text-indigo-800",
      teal: "bg-teal-100 border-teal-200 text-teal-800",
      gold: "bg-yellow-100 border-yellow-300 text-yellow-900"
    };
    return colorMap[color] || "bg-gray-100 border-gray-200 text-gray-800";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-700">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-sm border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="text-white hover:text-purple-200 transition-colors duration-200"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-white">Features Overview</h1>
                <p className="text-purple-200">Comprehensive guide to all Satnam.pub features</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-12">
          {featureCategories.map((category, categoryIndex) => {
            const featuresWithLinks = category.features.filter((f: any) => Array.isArray((f as any).links) && (f as any).links.length > 0);
            if (featuresWithLinks.length === 0) return null;
            return (
              <div key={categoryIndex} className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-white mb-2">{category.title}</h2>
                  <p className="text-purple-200">{category.description}</p>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {featuresWithLinks.map((feature: any, featureIndex: number) => {
                    const Icon = feature.icon;
                    return (
                      <div
                        key={featureIndex}
                        className={`border-2 rounded-xl p-6 transition-all duration-300 hover:scale-105 ${getColorClasses(feature.color)}`}
                      >
                        <div className="flex items-center space-x-3 mb-4">
                          <div className={`p-2 rounded-lg ${getColorClasses(feature.color).replace('hover:scale-105', '')}`}>
                            <Icon className="h-6 w-6" />
                          </div>
                          <h3 className="text-lg font-semibold">{feature.name}</h3>
                        </div>
                        <p className="text-sm opacity-80 mb-3">{feature.description}</p>
                        <div className="text-xs space-x-3">
                          {feature.links.map((ln: any, i: number) => (
                            <a key={i} href={ln.href} target="_blank" rel="noopener noreferrer" className="underline opacity-90 hover:opacity-100">
                              {ln.label}
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>


        {/* Backend-only Features Section */}
        <div className="mt-16">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-2">Backend-Only Features Requiring UI/UX</h2>
            <p className="text-purple-200 mb-6">These backend capabilities exist and are functional; UI is planned.</p>
            <div className="grid md:grid-cols-2 gap-6">
              {backendOnlyFeatures.map((item, idx) => (
                <div key={idx} className="border border-white/20 rounded-xl p-5 bg-white/5">
                  <h3 className="text-white font-semibold mb-2">{item.name}</h3>
                  <p className="text-purple-200 text-sm mb-2">Needed UI: {item.neededUI}</p>
                  <p className="text-purple-200 text-sm mb-3">Priority: <span className="font-semibold">{item.priority}</span></p>
                  <div className="text-xs space-x-3">
                    {item.backend.map((ln: any, i: number) => (
                      <a key={i} href={ln.href} target="_blank" rel="noopener noreferrer" className="underline opacity-90 hover:opacity-100">
                        {ln.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center mt-12">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-4">Ready to Get Started?</h2>
            <p className="text-purple-200 mb-6">
              Choose your path to sovereignty and start building your family's digital dynasty today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={onBack}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-lg transition-all duration-300 flex items-center space-x-2"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Home</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeaturesOverview;