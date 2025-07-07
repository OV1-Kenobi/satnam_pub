import {
  Shield,
  Users,
  BookOpen,
  Brain,
  Zap,
  Lock,
  Settings,
  ArrowRight,
  ArrowLeft,
  Key,
  Wallet,
  MessageCircle,
  BarChart3,
  Target,
  Award,
  Globe,
  RefreshCw,
  Split,
  Sparkles,
  Crown
} from 'lucide-react';
import React from 'react';

interface FeaturesOverviewProps {
  onBack: () => void;
}

const FeaturesOverview: React.FC<FeaturesOverviewProps> = ({ onBack }) => {
  const featureCategories = [
    {
      title: "Core Identity & Authentication",
      description: "Foundation of sovereign digital identity",
      features: [
        {
          name: "Identity Forge",
          description: "Create sovereign digital identities with cryptographic keys",
          icon: Key,
          color: "purple"
        },
        {
          name: "Nostrich Sign-in",
          description: "Privacy-first authentication with NIP-07 browser extensions",
          icon: Shield,
          color: "blue"
        },
        {
          name: "Family Foundry",
          description: "Establish family federations with role-based governance",
          icon: Crown,
          color: "gold"
        },
        {
          name: "Emergency Recovery",
          description: "Account recovery tools and procedures",
          icon: RefreshCw,
          color: "red"
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
          color: "green"
        },
        {
          name: "Individual Finances Dashboard",
          description: "Personal financial tracking and management",
          icon: Wallet,
          color: "blue"
        },
        {
          name: "Lightning Treasury",
          description: "Lightning Network management and liquidity",
          icon: Zap,
          color: "orange"
        },
        {
          name: "Fedimint Governance",
          description: "Federation governance and decision-making",
          icon: Users,
          color: "purple"
        },
        {
          name: "Payment Automation",
          description: "Automated payment systems and scheduling",
          icon: Settings,
          color: "indigo"
        },
        {
          name: "Unified Family Payments",
          description: "Cross-protocol payment management",
          icon: Split,
          color: "teal"
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
          color: "blue"
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
          color: "teal"
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
          color: "purple"
        },
        {
          name: "Cross-Mint Operations",
          description: "Multi-protocol management and operations",
          icon: Globe,
          color: "blue"
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
          color: "orange"
        },
        {
          name: "Enhanced Liquidity Dashboard",
          description: "Liquidity management and optimization",
          icon: BarChart3,
          color: "indigo"
        }
      ]
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
          {featureCategories.map((category, categoryIndex) => (
            <div key={categoryIndex} className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">{category.title}</h2>
                <p className="text-purple-200">{category.description}</p>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {category.features.map((feature, featureIndex) => {
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
                      <p className="text-sm opacity-80">{feature.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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