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
import FamilyCoordination from "./components/FamilyCoordination";
import FamilyDashboard from "./components/FamilyDashboard";
import IndividualFinancesDashboard from "./components/IndividualFinancesDashboard";
import FamilyOnboarding from "./components/FamilyOnboarding";
import FamilyFoundryWizard from "./components/FamilyFoundryWizard";
import IdentityForge from "./components/IdentityForge";
import NostrEcosystem from "./components/NostrEcosystem";
import SignInModal from "./components/SignInModal";
import EmergencyRecoveryModal from './components/EmergencyRecoveryModal';
import EmergencyRecoveryPage from './components/EmergencyRecoveryPage';
import { GiftwrappedMessaging } from "./components/communications/GiftwrappedMessaging";
import FeaturesOverview from "./components/FeaturesOverview";
import DynasticSovereignty from "./components/DynasticSovereignty";
import FamilyFoundryAuthModal from "./components/auth/FamilyFoundryAuthModal";
import { FamilyFederationAuthProvider, FamilyFederationAuthWrapper } from "./components/auth/FamilyFederationAuth";
import { useAuth } from "./hooks/useAuth";
import { useCredentialCleanup } from "./hooks/useCredentialCleanup";
import Navigation from "./components/shared/Navigation";
import PageWrapper from "./components/shared/PageWrapper";
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  const [currentView, setCurrentView] = useState<
    | "landing"
    | "forge"
    | "dashboard"
    | "individual-finances"
    | "onboarding"
    | "education"
    | "coordination"
    | "recovery"
    | "nostr-ecosystem"
    | "features-overview"
    | "dynastic-sovereignty"
  >("landing");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [showCommunications, setShowCommunications] = useState(false);
  const [showFamilyFoundryAuthModal, setShowFamilyFoundryAuthModal] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<'dashboard' | 'individual-finances' | 'communications' | 'family-foundry' | 'payment-automation' | 'educational-dashboard' | 'sovereignty-controls' | 'privacy-preferences' | 'atomic-swaps' | 'cross-mint-operations' | 'payment-cascade' | 'giftwrapped-messaging' | null>(null);
  
  // Authentication hook
  const { authenticated, loading } = useAuth();
  
  // Initialize credential cleanup system
  useCredentialCleanup();

  // Handler for protected routes - checks auth and either shows sign-in or goes to destination
  const handleProtectedRoute = (destination: 'dashboard' | 'individual-finances' | 'communications' | 'family-foundry' | 'payment-automation' | 'educational-dashboard' | 'sovereignty-controls' | 'privacy-preferences' | 'atomic-swaps' | 'cross-mint-operations' | 'payment-cascade' | 'giftwrapped-messaging') => {
    if (authenticated) {
      // User is authenticated, go directly to destination
      if (destination === 'communications') {
        setShowCommunications(true);
      } else if (destination === 'giftwrapped-messaging') {
        setShowCommunications(true);
      } else if (destination === 'family-foundry') {
        setCurrentView("onboarding");
      } else if (destination === 'educational-dashboard') {
        setCurrentView("education");
      } else if (destination === 'payment-automation') {
        setCurrentView("dashboard"); // Will show payment automation in family dashboard
      } else if (destination === 'sovereignty-controls') {
        setCurrentView("dashboard"); // Will show sovereignty controls in family dashboard
      } else if (destination === 'privacy-preferences') {
        setCurrentView("dashboard"); // Will show privacy preferences in family dashboard
      } else if (destination === 'atomic-swaps') {
        setCurrentView("dashboard"); // Will show atomic swaps in family dashboard
      } else if (destination === 'cross-mint-operations') {
        setCurrentView("individual-finances"); // Will show cross-mint in individual dashboard
      } else if (destination === 'payment-cascade') {
        setCurrentView("individual-finances"); // Will show payment cascade in individual dashboard
      } else {
        setCurrentView(destination);
      }
    } else {
      // User not authenticated, show sign-in modal and remember destination
      setPendingDestination(destination);
      setSignInModalOpen(true);
    }
  };

  // Handle successful authentication
  const handleAuthSuccess = () => {
    setSignInModalOpen(false);
    if (pendingDestination) {
      if (pendingDestination === 'communications' || pendingDestination === 'giftwrapped-messaging') {
        setShowCommunications(true);
      } else if (pendingDestination === 'family-foundry') {
        setCurrentView("onboarding");
      } else if (pendingDestination === 'educational-dashboard') {
        setCurrentView("education");
      } else if (pendingDestination === 'payment-automation') {
        setCurrentView("dashboard"); // Will show payment automation in family dashboard
      } else if (pendingDestination === 'sovereignty-controls') {
        setCurrentView("dashboard"); // Will show sovereignty controls in family dashboard
      } else if (pendingDestination === 'privacy-preferences') {
        setCurrentView("dashboard"); // Will show privacy preferences in family dashboard
      } else if (pendingDestination === 'atomic-swaps') {
        setCurrentView("dashboard"); // Will show atomic swaps in family dashboard
      } else if (pendingDestination === 'cross-mint-operations') {
        setCurrentView("individual-finances"); // Will show cross-mint in individual dashboard
      } else if (pendingDestination === 'payment-cascade') {
        setCurrentView("individual-finances"); // Will show payment cascade in individual dashboard
      } else {
        setCurrentView(pendingDestination);
      }
      setPendingDestination(null);
    }
  };

  if (currentView === "forge") {
    return (
      <PageWrapper
        currentView={currentView}
        setCurrentView={setCurrentView}
        setSignInModalOpen={setSignInModalOpen}
        handleProtectedRoute={handleProtectedRoute}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        showCommunications={showCommunications}
        setShowCommunications={setShowCommunications}
      >
        <IdentityForge
          onComplete={() => setCurrentView("nostr-ecosystem")}
          onBack={() => setCurrentView("landing")}
        />
      </PageWrapper>
    );
  }

  if (currentView === "dashboard") {
    return (
      <PageWrapper
        currentView={currentView}
        setCurrentView={setCurrentView}
        setSignInModalOpen={setSignInModalOpen}
        handleProtectedRoute={handleProtectedRoute}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        showCommunications={showCommunications}
        setShowCommunications={setShowCommunications}
      >
        <FamilyFederationAuthProvider>
          <FamilyFederationAuthWrapper requireAuth={true} allowedRoles={["adult", "offspring", "steward", "guardian"]}>
            <FamilyDashboard onBack={() => setCurrentView("landing")} />
          </FamilyFederationAuthWrapper>
        </FamilyFederationAuthProvider>
      </PageWrapper>
    );
  }

  if (currentView === "individual-finances") {
    return (
      <PageWrapper
        currentView={currentView}
        setCurrentView={setCurrentView}
        setSignInModalOpen={setSignInModalOpen}
        handleProtectedRoute={handleProtectedRoute}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        showCommunications={showCommunications}
        setShowCommunications={setShowCommunications}
      >
        <FamilyFederationAuthProvider>
          <FamilyFederationAuthWrapper requireAuth={true} allowedRoles={["adult", "offspring", "steward", "guardian"]}>
            <IndividualFinancesDashboard 
              memberId="current-user"
              memberData={{
                username: "Current User",
                role: "adult",
                lightningAddress: "user@satnam.pub"
              }}
              onBack={() => setCurrentView("landing")} 
            />
          </FamilyFederationAuthWrapper>
        </FamilyFederationAuthProvider>
      </PageWrapper>
    );
  }

  if (currentView === "onboarding") {
    return (
      <PageWrapper
        currentView={currentView}
        setCurrentView={setCurrentView}
        setSignInModalOpen={setSignInModalOpen}
        handleProtectedRoute={handleProtectedRoute}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        showCommunications={showCommunications}
        setShowCommunications={setShowCommunications}
      >
        <FamilyFederationAuthProvider>
          <FamilyFederationAuthWrapper requireAuth={true} allowedRoles={["adult", "offspring", "steward", "guardian"]}>
            <FamilyFoundryWizard
              onComplete={() => setCurrentView("dashboard")}
              onBack={() => setCurrentView("landing")}
            />
          </FamilyFederationAuthWrapper>
        </FamilyFederationAuthProvider>
      </PageWrapper>
    );
  }

  if (currentView === "education") {
    return (
      <PageWrapper
        currentView={currentView}
        setCurrentView={setCurrentView}
        setSignInModalOpen={setSignInModalOpen}
        handleProtectedRoute={handleProtectedRoute}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        showCommunications={showCommunications}
        setShowCommunications={setShowCommunications}
      >
        <EducationPlatform onBack={() => setCurrentView("landing")} />
      </PageWrapper>
    );
  }

  if (currentView === "coordination") {
    return (
      <PageWrapper
        currentView={currentView}
        setCurrentView={setCurrentView}
        setSignInModalOpen={setSignInModalOpen}
        handleProtectedRoute={handleProtectedRoute}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        showCommunications={showCommunications}
        setShowCommunications={setShowCommunications}
      >
        <FamilyFederationAuthProvider>
          <FamilyFederationAuthWrapper requireAuth={true} allowedRoles={["adult", "offspring", "steward", "guardian"]}>
            <FamilyCoordination onBack={() => setCurrentView("landing")} />
          </FamilyFederationAuthWrapper>
        </FamilyFederationAuthProvider>
      </PageWrapper>
    );
  }

  if (currentView === "nostr-ecosystem") {
    return (
      <PageWrapper
        currentView={currentView}
        setCurrentView={setCurrentView}
        setSignInModalOpen={setSignInModalOpen}
        handleProtectedRoute={handleProtectedRoute}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        showCommunications={showCommunications}
        setShowCommunications={setShowCommunications}
      >
        <NostrEcosystem onBack={() => setCurrentView("landing")} />
      </PageWrapper>
    );
  }

  if (currentView === "recovery") {
    return (
      <PageWrapper
        currentView={currentView}
        setCurrentView={setCurrentView}
        setSignInModalOpen={setSignInModalOpen}
        handleProtectedRoute={handleProtectedRoute}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        showCommunications={showCommunications}
        setShowCommunications={setShowCommunications}
      >
        <FamilyFederationAuthProvider>
          <FamilyFederationAuthWrapper requireAuth={true} allowedRoles={["adult", "offspring", "steward", "guardian"]}>
            <EmergencyRecoveryPage onBack={() => setCurrentView("landing")} />
          </FamilyFederationAuthWrapper>
        </FamilyFederationAuthProvider>
      </PageWrapper>
    );
  }

  if (currentView === "features-overview") {
    return (
      <PageWrapper
        currentView={currentView}
        setCurrentView={setCurrentView}
        setSignInModalOpen={setSignInModalOpen}
        handleProtectedRoute={handleProtectedRoute}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        showCommunications={showCommunications}
        setShowCommunications={setShowCommunications}
      >
        <FeaturesOverview onBack={() => setCurrentView("landing")} />
      </PageWrapper>
    );
  }

  if (currentView === "dynastic-sovereignty") {
    return (
      <DynasticSovereignty 
        onBack={() => setCurrentView("landing")} 
        onStartFoundry={() => handleProtectedRoute("family-foundry")}
        onAuthRequired={() => setShowFamilyFoundryAuthModal(true)}
      />
    );
  }

  const navigationItems = [
    { label: "Family Financials", action: () => setCurrentView("dashboard") },
    { label: "Individual Finances", action: () => setCurrentView("individual-finances") },
    { label: "Communications", action: () => setShowCommunications(true) },
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
      <Navigation
        currentView={currentView}
        setCurrentView={setCurrentView}
        setSignInModalOpen={setSignInModalOpen}
        handleProtectedRoute={handleProtectedRoute}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

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
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-4 px-8 rounded-lg text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center space-x-2 backdrop-blur-sm border-2 border-black"
            >
              <img src="/ID forge icon.png" alt="Forge" className="h-5 w-5" />
              <span>Forge Identity</span>
            </button>
                          <button
                onClick={() => setCurrentView("dynastic-sovereignty")}
                className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-4 px-8 rounded-lg text-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 backdrop-blur-sm shadow-lg hover:shadow-xl border-2 border-black"
              >
                <img
                  src="/Rebuilding_Camelot_logo__transparency_v3.png"
                  alt="Rebuilding Camelot"
                  className="h-5 w-5"
                />
                <span>Family Foundry</span>
              </button>
          </div>

          {/* Secondary Navigation Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => setCurrentView("dashboard")}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 backdrop-blur-sm shadow-lg hover:shadow-xl"
            >
              <Users className="h-4 w-4" />
              <span>Family Financials</span>
            </button>
            <button
              onClick={() => setCurrentView("individual-finances")}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 backdrop-blur-sm shadow-lg hover:shadow-xl"
            >
              <Zap className="h-4 w-4" />
              <span>Individual Finances</span>
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

          {/* Human-Readable Bitcoin Addresses Card */}
          <div
            className="bg-white/10 backdrop-blur-sm rounded-xl p-8 text-center hover:bg-white/20 transition-all duration-300 transform hover:scale-105 border border-white/20 cursor-pointer group shadow-lg hover:shadow-xl"
            onClick={() => setCurrentView("dashboard")}
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
              Human-Readable Bitcoin Addresses
            </h3>
            <p className="text-purple-100 leading-relaxed mb-6">
              Receive bitcoin instantly with reusable human-readable addresses.
              No more complex invoice management or payment friction.
            </p>
            <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 mx-auto">
              <Zap className="h-4 w-4" />
              <span>Manage Payments</span>
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
                  onClick={() => handleProtectedRoute("dashboard")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Family Financials
                </button>
                <button
                  onClick={() => handleProtectedRoute("individual-finances")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Individual Finances
                </button>
                <button
                  onClick={() => handleProtectedRoute("educational-dashboard")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Cognitive Capital
                </button>
                <button
                  onClick={() => handleProtectedRoute("privacy-preferences")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Privacy Controls
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-white font-bold mb-4">Features</h3>
              <div className="space-y-2">
                <button
                  onClick={() => handleProtectedRoute("family-foundry")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Family Foundry
                </button>
                <button
                  onClick={() => handleProtectedRoute("payment-automation")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Payment Automation
                </button>
                <button
                  onClick={() => handleProtectedRoute("educational-dashboard")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Educational Dashboard
                </button>
                <button
                  onClick={() => handleProtectedRoute("sovereignty-controls")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Sovereignty Controls
                </button>
                <button
                  onClick={() => handleProtectedRoute("privacy-preferences")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Privacy Preferences
                </button>
                <button
                  onClick={() => handleProtectedRoute("atomic-swaps")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Atomic Swaps
                </button>
                <button
                  onClick={() => handleProtectedRoute("cross-mint-operations")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Cross-Mint Operations
                </button>
                <button
                  onClick={() => handleProtectedRoute("payment-cascade")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Payment Cascade System
                </button>
                <button
                  onClick={() => handleProtectedRoute("giftwrapped-messaging")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Giftwrapped Messaging
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-white font-bold mb-4">Resources</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setCurrentView("features-overview")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Features Overview
                </button>
                <button
                  onClick={() => setCurrentView("dynastic-sovereignty")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Dynastic Sovereignty
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
        onSignInSuccess={handleAuthSuccess}
        onCreateNew={() => {
          setSignInModalOpen(false);
          setCurrentView("forge");
        }}
      />

      {/* Family Foundry Authentication Modal */}
      <FamilyFoundryAuthModal
        isOpen={showFamilyFoundryAuthModal}
        onClose={() => setShowFamilyFoundryAuthModal(false)}
        onAuthSuccess={() => {
          setShowFamilyFoundryAuthModal(false);
          handleProtectedRoute("family-foundry");
        }}
        onExistingUserSignIn={() => {
          setShowFamilyFoundryAuthModal(false);
          setSignInModalOpen(true);
        }}
      />

      {/* Communications Modal */}
      {showCommunications && (
        <GiftwrappedMessaging 
          familyMember={{
            id: "current-user",
            npub: "npub1placeholder",
            username: "Current User",
            role: "adult"
          }}
        />
      )}
    </div>
  );
}

// Wrap the App with ErrorBoundary
export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}