import {
    Bitcoin,
    BookOpen,
    ExternalLink,
    Menu,
    Network,
    Users,
    X,
    Zap,
} from "lucide-react";
import { useState } from "react";
import EducationPlatform from "./components/EducationPlatform";
import FamilyAuthModal from "./components/FamilyAuthModal";
import FamilyCoordination from "./components/FamilyCoordination";
import FamilyFinancialsDashboard from "./components/FamilyFinancialsDashboard";
import FamilyOnboarding from "./components/FamilyOnboarding";
import FamilyWalletDemo from "./components/FamilyWalletDemo";
import IdentityForge from "./components/IdentityForge";
import IndividualFinancesDashboard from "./components/IndividualFinancesDashboard";
import NostrEcosystem from "./components/NostrEcosystem";
import ServerStatus from "./components/ServerStatus";
import SignInModal from "./components/SignInModal";
import useAuth from "./hooks/useAuth";
import { FamilyFederationUser } from "./types/auth";

function App() {
  const [currentView, setCurrentView] = useState<
    | "landing"
    | "forge"
    | "dashboard"
    | "financials"
    | "individual-wallet"
    | "onboarding"
    | "education"
    | "coordination"
    | "recovery"
    | "nostr-ecosystem"
    | "family-wallets"
  >("landing");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [familyAuthModalOpen, setFamilyAuthModalOpen] = useState(false);
  
  // Authentication state
  const auth = useAuth();

  const handleFamilyAuthSuccess = (user: FamilyFederationUser) => {
    // Authentication successful - redirect to enhanced financials dashboard
    setCurrentView("financials");
  };

  if (currentView === "forge") {
    return (
      <IdentityForge
        onComplete={() => setCurrentView("nostr-ecosystem")}
        onBack={() => setCurrentView("landing")}
      />
    );
  }

  if (currentView === "dashboard") {
    return <FamilyFinancialsDashboard onBack={() => setCurrentView("landing")} />;
  }

  if (currentView === "financials") {
    return <FamilyFinancialsDashboard onBack={() => setCurrentView("landing")} />;
  }

  if (currentView === "individual-wallet") {
    return (
      <IndividualFinancesDashboard 
        memberId="demo-user-123"
        memberData={{
          username: "demo_user",
          role: "child",
          lightningAddress: "demo_user@satnam.pub",
          spendingLimits: {
            daily: 10000,
            weekly: 50000,
            requiresApproval: 100000
          }
        }}
      />
    );
  }

  if (currentView === "onboarding") {
    return (
      <FamilyOnboarding
        familyName="Nakamoto"
        onComplete={() => setCurrentView("dashboard")}
        onBack={() => setCurrentView("landing")}
      />
    );
  }

  if (currentView === "education") {
    return <EducationPlatform onBack={() => setCurrentView("landing")} />;
  }

  if (currentView === "coordination") {
    return <FamilyCoordination onBack={() => setCurrentView("landing")} />;
  }

  if (currentView === "nostr-ecosystem") {
    return <NostrEcosystem onBack={() => setCurrentView("landing")} />;
  }

  if (currentView === "family-wallets") {
    return <FamilyWalletDemo />;
  }



  if (currentView === "recovery") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-12 text-center max-w-2xl border border-white/20">
          <img
            src="/Citadel Academy Logo.png"
            alt="Citadel Academy"
            className="h-16 w-16 mx-auto mb-6"
          />
          <h2 className="text-3xl font-bold text-white mb-4">
            Account Recovery
          </h2>
          <p className="text-purple-100 mb-8">
            Recover your sovereign identity using your backup phrase or recovery
            keys.
          </p>
          <div className="bg-white/10 rounded-lg p-6 mb-8">
            <img
              src="/SatNam.Pub logo.png"
              alt="SatNam.Pub"
              className="h-12 w-12 mx-auto mb-4 rounded-full"
            />
            <p className="text-purple-200 mb-4">
              Enter your 12 or 24-word recovery phrase to restore your identity
            </p>
            <textarea
              className="w-full bg-white/10 border border-white/20 rounded-lg p-4 text-white placeholder-purple-200 resize-none"
              rows={3}
              placeholder="Enter your recovery phrase here..."
            />
          </div>
          <div className="flex space-x-4 justify-center">
            <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300">
              Recover Identity
            </button>
            <button
              onClick={() => setCurrentView("landing")}
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navigationItems = [
    { label: "Family Financials", action: () => setFamilyAuthModalOpen(true) },
    { label: "Individual Wallet", action: () => setCurrentView("individual-wallet") },
    { label: "Family Wallets", action: () => setCurrentView("family-wallets") },
    { label: "Bitcoin Education", action: () => setCurrentView("education") },
    {
      label: "Nostr Resources",
      action: () => setCurrentView("nostr-ecosystem"),
    },
    {
      label: "Advanced Coordination",
      action: () => setCurrentView("coordination"),
    },
    { label: "Recovery Help", action: () => setCurrentView("recovery") },
    {
      label: "Citadel Academy",
      action: () => window.open("https://citadel.academy", "_blank"),
      external: true,
    },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Hero Background Image with Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('/Bitcoin Citadel Valley.jpg')`,
        }}
      >
        {/* Gradient overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/80 via-purple-800/70 to-purple-600/60"></div>
        {/* Additional overlay for enhanced contrast */}
        <div className="absolute inset-0 bg-black/20"></div>
      </div>

      {/* Bitcoin Network Background Animation */}
      <div className="absolute inset-0 opacity-20 z-10">
        <div className="absolute top-20 left-20 w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
        <div className="absolute top-40 right-32 w-1 h-1 bg-orange-400 rounded-full animate-ping"></div>
        <div className="absolute bottom-32 left-40 w-3 h-3 bg-yellow-300 rounded-full animate-pulse"></div>
        <div className="absolute top-60 left-1/2 w-1 h-1 bg-orange-300 rounded-full animate-ping"></div>
        <div className="absolute bottom-40 right-20 w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>

        {/* Connection Lines */}
        <svg
          className="absolute inset-0 w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line
            x1="80"
            y1="80"
            x2="200"
            y2="160"
            stroke="#FFD700"
            strokeWidth="1"
            opacity="0.3"
            strokeDasharray="5,5"
          >
            <animate
              attributeName="stroke-dashoffset"
              values="0;10"
              dur="2s"
              repeatCount="indefinite"
            />
          </line>
          <line
            x1="200"
            y1="160"
            x2="50%"
            y2="240"
            stroke="#F7931A"
            strokeWidth="1"
            opacity="0.3"
            strokeDasharray="5,5"
          >
            <animate
              attributeName="stroke-dashoffset"
              values="0;10"
              dur="3s"
              repeatCount="indefinite"
            />
          </line>
          <line
            x1="50%"
            y1="240"
            x2="80%"
            y2="200"
            stroke="#FFD700"
            strokeWidth="1"
            opacity="0.3"
            strokeDasharray="5,5"
          >
            <animate
              attributeName="stroke-dashoffset"
              values="0;10"
              dur="2.5s"
              repeatCount="indefinite"
            />
          </line>
        </svg>
      </div>

      {/* Enhanced Navigation */}
      <nav className="relative z-20 bg-purple-900/90 backdrop-blur-sm border-b border-yellow-400 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            {/* Logo with SatNam.Pub Custom Logo - Protected Brand Section */}
            <div className="flex items-center space-x-3 flex-shrink-0 mr-8 lg:mr-12">
              <img
                src="/SatNam.Pub logo.png"
                alt="SatNam.Pub"
                className="h-10 w-auto"
                loading="lazy"
              />
              <span className="text-white text-xl font-bold">Satnam.pub</span>
            </div>

            {/* Server Status - Development Helper */}
            <div className="hidden lg:block mr-4">
              <ServerStatus className="text-white" />
            </div>

            {/* Desktop Navigation - Properly Spaced */}
            <div className="hidden lg:flex items-center space-x-4 xl:space-x-6 flex-1 justify-end">
              {/* Primary CTA */}
              <button
                onClick={() => setCurrentView("forge")}
                className="bg-purple-800 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 shadow-lg"
              >
                <img src="/ID forge icon.png" alt="Forge" className="h-4 w-4" />
                <span>New ID Forge</span>
              </button>

              {/* Navigation Links */}
              <button
                onClick={() => setFamilyAuthModalOpen(true)}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg"
              >
                Family Financials
              </button>

              <button
                onClick={() => setCurrentView("individual-wallet")}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-1 shadow-lg"
              >
                <Zap className="h-4 w-4" />
                <span>Individual Wallet</span>
              </button>



              <button
                onClick={() => setCurrentView("nostr-ecosystem")}
                className="bg-purple-800 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-1 shadow-lg"
              >
                <Network className="h-4 w-4" />
                <span>Nostr Resources</span>
              </button>

              <a
                href="https://citadel.academy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-yellow-400 transition-colors duration-200 flex items-center space-x-1 font-medium"
              >
                <img
                  src="/Citadel Academy Logo.png"
                  alt="Citadel Academy"
                  className="h-4 w-4"
                />
                <span>Enter Citadel Academy</span>
                <ExternalLink className="h-3 w-3" />
              </a>

              {/* Nostrich Sign-in Button - Positioned Before Recovery */}
              <button
                onClick={() => setSignInModalOpen(true)}
                className="bg-purple-800 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 shadow-lg border-2 border-black"
              >
                <span>Nostrich Sign-in</span>
              </button>

              <button
                onClick={() => setCurrentView("recovery")}
                className="text-white hover:text-yellow-400 transition-colors duration-200 font-medium"
              >
                Recovery
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6 text-white" />
              ) : (
                <Menu className="h-6 w-6 text-white" />
              )}
            </button>
          </div>

          {/* Mobile Navigation Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden bg-purple-800/95 backdrop-blur-sm rounded-lg mt-2 p-4 border border-white/20">
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setSignInModalOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full bg-purple-800 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 border-2 border-black"
                >
                  <span>Nostrich Sign-in</span>
                </button>

                <button
                  onClick={() => {
                    setCurrentView("forge");
                    setMobileMenuOpen(false);
                  }}
                  className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2"
                >
                  <img
                    src="/ID forge icon.png"
                    alt="Forge"
                    className="h-4 w-4"
                  />
                  <span>Forge Identity</span>
                </button>

                {navigationItems.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      item.action();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left text-white hover:text-yellow-400 py-2 px-4 rounded-lg hover:bg-white/10 transition-all duration-300 flex items-center justify-between"
                  >
                    <span>{item.label}</span>
                    {item.external && <ExternalLink className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Enhanced Hero Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-32">
        <div className="text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight drop-shadow-2xl">
            Forge Your True Name
          </h1>
          <h2 className="text-2xl md:text-3xl font-semibold text-purple-100 mb-8 drop-shadow-lg">
            Own Your Digital Dynasty
          </h2>
          <p className="text-xl text-purple-100 mb-12 max-w-4xl mx-auto leading-relaxed drop-shadow-lg">
            Create decentralized interoperable identities and human-readable
            bitcoin addresses for your family. No custodians, no compromises,
            pure Bitcoin sovereignty.
          </p>

          {/* Primary CTA */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-8">
            <button
              onClick={() => setSignInModalOpen(true)}
              className="bg-purple-800 hover:bg-purple-700 text-white font-bold py-4 px-8 rounded-lg text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center space-x-2 backdrop-blur-sm border-2 border-black"
            >
              <span>Nostrich Sign-in</span>
            </button>
            <button
              onClick={() => setCurrentView("forge")}
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-4 px-8 rounded-lg text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center space-x-2 backdrop-blur-sm"
            >
              <img src="/ID forge icon.png" alt="Forge" className="h-5 w-5" />
              <span>Forge Identity</span>
            </button>
            <button
              onClick={() => setCurrentView("onboarding")}
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-4 px-8 rounded-lg text-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 backdrop-blur-sm shadow-lg hover:shadow-xl"
            >
              <img
                src="/Rebuilding_Camelot_logo__transparency_v3.png"
                alt="Rebuilding Camelot"
                className="h-5 w-5"
              />
              <span>Family Onboarding</span>
            </button>
          </div>

          {/* Secondary Navigation Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => setFamilyAuthModalOpen(true)}
              className="bg-orange-500/90 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 backdrop-blur-sm shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <Users className="h-4 w-4" />
              <span>View Family Financials</span>
            </button>
            <button
              onClick={() => setCurrentView("education")}
              className="bg-purple-700/80 hover:bg-purple-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 backdrop-blur-sm shadow-lg hover:shadow-xl"
            >
              <BookOpen className="h-4 w-4" />
              <span>Start Learning Bitcoin</span>
            </button>
            <button
              onClick={() => setCurrentView("nostr-ecosystem")}
              className="bg-purple-700/80 hover:bg-purple-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 backdrop-blur-sm shadow-lg hover:shadow-xl"
            >
              <Network className="h-4 w-4" />
              <span>Explore Nostr Ecosystem</span>
            </button>
            <a
              href="https://citadel.academy"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-purple-700/80 hover:bg-purple-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 backdrop-blur-sm shadow-lg hover:shadow-xl"
            >
              <img
                src="/Citadel Academy Logo.png"
                alt="Citadel Academy"
                className="h-4 w-4"
              />
              <span>Access Advanced Training</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Enhanced Features Grid - Clickable Navigation Cards */}
      <div
        id="features"
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32"
      >
        <div className="grid md:grid-cols-3 gap-8">
          {/* Decentralized Interoperable Identities Card */}
          <div
            className="bg-white/10 backdrop-blur-sm rounded-xl p-8 text-center hover:bg-white/20 transition-all duration-300 transform hover:scale-105 border border-white/20 cursor-pointer group shadow-lg hover:shadow-xl"
            onClick={() => setCurrentView("forge")}
          >
            <div className="w-16 h-16 mx-auto mb-6 relative">
              <img
                src="/SatNam.Pub logo.png"
                alt="SatNam.Pub"
                className="h-16 w-16 rounded-full"
                loading="lazy"
              />
              <div className="absolute inset-0 border-2 border-yellow-400 rounded-full group-hover:animate-pulse"></div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">
              Decentralized Interoperable Identities
            </h3>
            <p className="text-purple-100 leading-relaxed mb-6">
              Create your True Name using Nostr's open source protocols with
              cryptographic verification that no one can take, fake, or censor.
            </p>
            <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 mx-auto">
              <img src="/ID forge icon.png" alt="Forge" className="h-4 w-4" />
              <span>Create Identity</span>
            </button>
          </div>

          {/* Enhanced Family Financials Card */}
          <div
            className="bg-white/10 backdrop-blur-sm rounded-xl p-8 text-center hover:bg-white/20 transition-all duration-300 transform hover:scale-105 border border-white/20 cursor-pointer group shadow-lg hover:shadow-xl"
            onClick={() => setCurrentView("financials")}
          >
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 relative">
              <img
                src="/LN Bitcoin icon.png"
                alt="Lightning Bitcoin"
                className="h-14 w-14"
                loading="lazy"
              />
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">
              Enhanced Family Financials
            </h3>
            <p className="text-purple-100 leading-relaxed mb-6">
              Dual-protocol sovereign banking with Lightning Network + Fedimint eCash.
              Smart routing, guardian consensus, and automated liquidity management.
            </p>
            <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 mx-auto">
              <Zap className="h-4 w-4" />
              <span>Family Banking</span>
            </button>
          </div>

          {/* Family Federation Card */}
          <div
            className="bg-white/10 backdrop-blur-sm rounded-xl p-8 text-center hover:bg-white/20 transition-all duration-300 transform hover:scale-105 border border-white/20 cursor-pointer group shadow-lg hover:shadow-xl"
            onClick={() => setCurrentView("education")}
          >
            <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <img
                src="/Rebuilding_Camelot_logo__transparency_v3.png"
                alt="Rebuilding Camelot"
                className="h-8 w-8"
                loading="lazy"
              />
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">
              Family Federation
            </h3>
            <p className="text-purple-100 leading-relaxed mb-6">
              Create connected identities for your entire family that YOU
              control. Unify your tribe, establish your family 'round table
              council', aligning with us as we Rebuild Camelot to robustly grow
              our cooperative of sovereign family dynasties together.
            </p>
            <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 mx-auto">
              <BookOpen className="h-4 w-4" />
              <span>Join Academy</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sovereignty Section */}
      <div
        id="sovereignty"
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32"
      >
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-12 text-center border border-white/20 shadow-lg">
          <h2 className="text-4xl font-bold text-white mb-8">
            Forge Dynastic Sovereignty
          </h2>
          <div className="grid md:grid-cols-3 gap-8 text-lg text-purple-100">
            <div>
              <h3 className="font-bold text-white mb-3">100% Self-Sovereign</h3>
              <p>
                You control your keys, your identity, and your dynasty. No
                intermediaries, no dependencies.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-white mb-3">Bitcoin-Only</h3>
              <p>
                Built on the most secure and decentralized network. No gambling,
                no compromise.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-white mb-3">Family-First</h3>
              <p>
                Designed to decentralize identity, cultivate multigenerational
                wealth, and preserve cognitive capital.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Footer with Navigation */}
      <footer className="relative z-10 bg-purple-900/80 backdrop-blur-sm border-t border-yellow-400/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Quick Links Section */}
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-white font-bold mb-4">Quick Links</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setFamilyAuthModalOpen(true)}
                  className="block text-orange-300 hover:text-orange-400 font-semibold transition-colors duration-200"
                >
                  Family Financials
                </button>
                <button
                  onClick={() => setCurrentView("education")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Education Portal
                </button>
                <button
                  onClick={() => setCurrentView("nostr-ecosystem")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Nostr Resources
                </button>
                <button
                  onClick={() => setCurrentView("recovery")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Recovery Help
                </button>
                <a
                  href="https://citadel.academy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-200 hover:text-yellow-400 transition-colors duration-200 flex items-center space-x-1"
                >
                  <span>Citadel Academy</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <div>
              <h3 className="text-white font-bold mb-4">Features</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setCurrentView("forge")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Identity Forge
                </button>
                <button
                  onClick={() => setCurrentView("coordination")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Advanced Coordination
                </button>
                <button
                  onClick={() => setCurrentView("onboarding")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Family Onboarding
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-white font-bold mb-4">Resources</h3>
              <div className="space-y-2">
                <a
                  href="#features"
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Features Overview
                </a>
                <a
                  href="#sovereignty"
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Dynastic Sovereignty
                </a>
                <a
                  href="https://citadel.academy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Advanced Learning
                </a>
              </div>
            </div>

            <div>
              <h3 className="text-white font-bold mb-4">Connect</h3>
              <div className="space-y-2">
                <a
                  href="https://iris.to/npub1p9a5sclpw5prjhx0c0u4ufjnwmnt2pxcvpa4lxnf4wn53vawuatqkmzxyt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-200 hover:text-yellow-400 transition-colors duration-200 flex items-center space-x-1"
                >
                  <span>Follow us on Nostr</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href="https://t.me/rebuilding_camelot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-200 hover:text-yellow-400 transition-colors duration-200 flex items-center space-x-1"
                >
                  <span>Join the conversation on Telegram</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href="https://iris.to/npub1qq50zturtx4ns2uf2adt26pcpmez47ur9ds6a4fwaax5u5evr3nsnu2qvm"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-200 hover:text-yellow-400 transition-colors duration-200 flex items-center space-x-1"
                >
                  <span>Follow the Founder, Ov1, on Nostr</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Powered by Citadel Academy */}
          <div className="text-center border-t border-white/20 pt-8">
            <div className="flex items-center justify-center space-x-2 mb-6">
              <span className="text-purple-200">Powered by</span>
              <a
                href="https://citadel.academy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-yellow-400 hover:text-yellow-300 font-bold flex items-center space-x-1 transition-colors duration-200"
              >
                <img
                  src="/Citadel Academy Logo.png"
                  alt="Citadel Academy"
                  className="h-4 w-4"
                  loading="lazy"
                />
                <span>Citadel Academy</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            {/* Tagline */}
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-8 text-purple-200">
              <span className="flex items-center space-x-2">
                <img
                  src="/Citadel Academy Logo.png"
                  alt="Citadel Academy"
                  className="h-4 w-4"
                  loading="lazy"
                />
                <span>100% Self-Sovereign</span>
              </span>
              <span className="flex items-center space-x-2">
                <Bitcoin className="h-4 w-4" />
                <span>Bitcoin-Only</span>
              </span>
              <span className="flex items-center space-x-2">
                <img
                  src="/Rebuilding_Camelot_logo__transparency_v3.png"
                  alt="Rebuilding Camelot"
                  className="h-4 w-4"
                  loading="lazy"
                />
                <span>Family-First</span>
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* Sign In Modal */}
      <SignInModal
        isOpen={signInModalOpen}
        onClose={() => setSignInModalOpen(false)}
        onSignInSuccess={() => {
          setSignInModalOpen(false);
          setCurrentView("dashboard");
        }}
        onCreateNew={() => {
          setSignInModalOpen(false);
          setCurrentView("forge");
        }}
      />

      {/* Family Federation Authentication Modal */}
      <FamilyAuthModal
        isOpen={familyAuthModalOpen}
        onClose={() => setFamilyAuthModalOpen(false)}
        onSuccess={handleFamilyAuthSuccess}
        title="Family Federation Access Required"
        description="Please authenticate with your Family Federation credentials to access Family Financials"
      />
    </div>
  );
}

export default App;