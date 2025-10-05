import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Crown,
  Globe,
  Key,
  MessageCircle,
  RefreshCw,
  Settings,
  Shield,
  Users,
  Wallet,
  Zap,
  type LucideIcon
} from 'lucide-react';
import React from 'react';

interface FeaturesOverviewProps {
  onBack: () => void;
}

const FeaturesOverview: React.FC<FeaturesOverviewProps> = ({ onBack }) => {
  // In-app navigation helpers (App listens for these global events)
  const navigate = (view: string) => {
    window.dispatchEvent(new CustomEvent('satnam:navigate', { detail: { view } }));
  };
  const openSignIn = () => {
    window.dispatchEvent(new Event('satnam:open-signin'));
  };

  type Feature = {
    name: string;
    description: string;
    icon: LucideIcon;
    color: string;
    action: () => void;
    ctaLabel?: string;
  };

  const featureCategories: { title: string; description: string; features: Feature[] }[] = [
    {
      title: "Identity & Security",
      description: "Create your identity, sign in, and recover access securely",
      features: [
        {
          name: "Claim Your Name",
          description: "Create a new Nostr account (npub) and choose your Satnam name.",
          icon: Key,
          color: "purple",
          action: () => navigate('forge'),
          ctaLabel: "Claim Your Name"
        },
        {
          name: "NIP-07 Sign-in",
          description: "Sign in using your Nostr browser extension (recommended).",
          icon: Shield,
          color: "blue",
          action: () => openSignIn(),
          ctaLabel: "Open Sign-in"
        },
        {
          name: "Family Foundry",
          description: "Start a family federation with roles and shared governance.",
          icon: Crown,
          color: "gold",
          action: () => navigate('onboarding'),
          ctaLabel: "Start Foundry"
        },
        {
          name: "Emergency Recovery",
          description: "Recover your account using privacy-first OTP recovery.",
          icon: RefreshCw,
          color: "red",
          action: () => navigate('recovery'),
          ctaLabel: "Open Recovery"
        }
      ]
    },
    {
      title: "Payments & Lightning",
      description: "Manage family and personal finances, automation, and node tools",
      features: [
        {
          name: "Family Financials Dashboard",
          description: "View and manage your family treasury and shared balances.",
          icon: BarChart3,
          color: "green",
          action: () => navigate('dashboard'),
          ctaLabel: "Open Family Financials"
        },
        {
          name: "Individual Finances",
          description: "Track your personal balances, payments, and activity.",
          icon: Wallet,
          color: "blue",
          action: () => navigate('individual-finances'),
          ctaLabel: "Open Individual Finances"
        },
        {
          name: "Payment Automation (Family)",
          description: "Schedule recurring family payments and distributions.",
          icon: Settings,
          color: "indigo",
          action: () => navigate('family-payment-automation'),
          ctaLabel: "Configure Family Automation"
        },
        {
          name: "Payment Automation (Individual)",
          description: "Automate your own recurring payments and allowances.",
          icon: Settings,
          color: "indigo",
          action: () => navigate('individual-payment-automation'),
          ctaLabel: "Configure Personal Automation"
        },
        {
          name: "Liquidity Management",
          description: "Manage your Lightning node channels, liquidity, and routing.",
          icon: Zap,
          color: "orange",
          action: () => navigate('ln-node-management'),
          ctaLabel: "Open Liquidity Manager"
        },
        {
          name: "Payment QR Code",
          description: "View your LNURL and wallet details used for NFC provisioning.",
          icon: Globe,
          color: "teal",
          action: () => navigate('lnurl-display'),
          ctaLabel: "Show Payment QR Code"
        }
      ]
    },
    {
      title: "Messaging & Communication",
      description: "Private messaging with gift-wrapped deliveries and group chat",
      features: [
        {
          name: "Private Messaging",
          description: "Send and receive private, gift-wrapped messages to peers.",
          icon: MessageCircle,
          color: "teal",
          action: () => navigate('communications'),
          ctaLabel: "Open Private Messaging"
        }
      ]
    },
    {
      title: "Family & Federation Management",
      description: "Coordinate roles, dashboards, and shared operations",
      features: [
        {
          name: "Family Dashboard",
          description: "Overview of family activity, balances, and coordination tools.",
          icon: Users,
          color: "purple",
          action: () => navigate('dashboard'),
          ctaLabel: "Open Family Dashboard"
        }
      ]
    },
    {
      title: "NFC & Name Tag",
      description: "Provision and register your NFC Name Tag for physical MFA",
      features: [
        {
          name: "Write Your Name Tag",
          description: "Follow the guided steps to program and register your tag.",
          icon: Key,
          color: "purple",
          action: () => navigate('nfc-provisioning-guide'),
          ctaLabel: "Write Name Tag"
        }
      ]
    },
    {
      title: "Learning & Resources",
      description: "Learn Bitcoin and explore the Nostr ecosystem",
      features: [
        {
          name: "Bitcoin Education",
          description: "Courses and progress tracking to grow your skills.",
          icon: BookOpen,
          color: "blue",
          action: () => navigate('education'),
          ctaLabel: "Open Education"
        },
        {
          name: "Nostr Ecosystem",
          description: "Discover apps and services that work with your identity.",
          icon: Globe,
          color: "indigo",
          action: () => navigate('nostr-ecosystem'),
          ctaLabel: "Explore Nostr"
        },
        {
          name: "Settings",
          description: "Manage preferences, privacy options, and app behavior.",
          icon: Settings,
          color: "green",
          action: () => navigate('settings'),
          ctaLabel: "Open Settings"
        }
      ]
    }
  ];



  const getColorClasses = (_color: string) => {
    // Unified Nostr purple theme for feature cards
    return "bg-purple-700/40 border-purple-300 text-white backdrop-blur-md";
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/10 backdrop-blur-sm border-b border-white/20">
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
            const features = category.features;
            return (
              <div key={categoryIndex} className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-white mb-2">{category.title}</h2>
                  <p className="text-purple-200">{category.description}</p>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {features.map((feature: any, featureIndex: number) => {
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
                        <div className="mt-4">
                          <button
                            onClick={feature.action}
                            className="bg-white/80 text-black font-semibold py-2 px-3 rounded-md hover:bg-white transition-colors"
                          >
                            {feature.ctaLabel || 'Open'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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