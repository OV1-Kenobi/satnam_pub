import {
  Bitcoin,
  BookOpen,
  Copy,
  ExternalLink,
  Network,
  Users,
  Zap
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { ContactsManagerModal } from './components/ContactsManagerModal';
import DynasticSovereignty from "./components/DynasticSovereignty";
import EducationPlatform from "./components/EducationPlatform";
import EmergencyRecoveryPage from './components/EmergencyRecoveryPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import FamilyCoordination from "./components/FamilyCoordination";
import FamilyDashboard from "./components/FamilyDashboard";
import FamilyFoundryWizard from "./components/FamilyFoundryWizard";
import FamilyPaymentAutomationModal from "./components/FamilyPaymentAutomationModal";
import FeaturesOverview from "./components/FeaturesOverview";
import IdentityForge from "./components/IdentityForge";
import IndividualFinancesDashboard from "./components/IndividualFinancesDashboard";
import IndividualPaymentAutomationModal from "./components/IndividualPaymentAutomationModal";
import NostrEcosystem from "./components/NostrEcosystem";
import SignInModal from "./components/SignInModal";

import LNBitsIntegrationPanel from "./components/LNBitsIntegrationPanel";
import LNURLDisplay from "./components/LNURLDisplay";
import NFCProvisioningGuide from "./components/NFCProvisioningGuide";


import { useAuth } from "./components/auth/AuthProvider";
import FamilyFoundryAuthModal from "./components/auth/FamilyFoundryAuthModal";
import IdentityForgeGuard from "./components/auth/IdentityForgeGuard";
import { GiftwrappedMessaging } from "./components/communications/GiftwrappedMessaging";
import Navigation from "./components/shared/Navigation";
import PageWrapper from "./components/shared/PageWrapper";
import { useCredentialCleanup } from "./hooks/useCredentialCleanup";

import SecureTokenManager from "./lib/auth/secure-token-manager";
import { validateInvitation } from "./lib/invitation-validator";

import { showToast } from "./services/toastService";



const NTAG424AuthModal = lazy(() => import("./components/NTAG424AuthModal"));



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
    | "communications"
    | "family-foundry"
    | "payment-automation"
    | "educational-dashboard"
    | "sovereignty-controls"
    | "privacy-preferences"
    | "atomic-swaps"
    | "cross-mint-operations"
    | "payment-cascade"
    | "giftwrapped-messaging"
    | "family-payment-automation"
    | "individual-payment-automation"
    | "contacts"
    | "ln-node-management"
    | "lnbits-setup"
    | "lnurl-display"
    | "nfc-provisioning-guide"
  >("landing");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [nfcModalOpen, setNfcModalOpen] = useState(false);
  const [loadingNfcModal, setLoadingNfcModal] = useState(false);

  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [showCommunications, setShowCommunications] = useState(false);
  const [showFamilyFoundryAuthModal, setShowFamilyFoundryAuthModal] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<'dashboard' | 'individual-finances' | 'communications' | 'family-foundry' | 'payment-automation' | 'educational-dashboard' | 'sovereignty-controls' | 'privacy-preferences' | 'atomic-swaps' | 'cross-mint-operations' | 'payment-cascade' | 'giftwrapped-messaging' | 'contacts' | 'ln-node-management' | null>(null);

  // Invitation handling state
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [invitationDetails, setInvitationDetails] = useState<any>(null);
  const [isInvitedUser, setIsInvitedUser] = useState(false);

  // Authentication hook - use AuthProvider context (single source of truth)
  const auth = useAuth();
  const { authenticated } = auth;

  // Initialize credential cleanup system (only after authentication)
  useCredentialCleanup({
    enabled: authenticated, // Only run when user is authenticated
    autoRun: true // Auto-run cleanup when enabled
  });

  // Check for invitation token in URL on component mount
  useEffect(() => {
    const checkForInvitationToken = async () => {
      try {
        // Check URL parameters for invitation token
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token') || urlParams.get('invite');

        // Also check for /invite/[token] path pattern
        const pathMatch = window.location.pathname.match(/\/invite\/([^\/]+)/);
        const pathToken = pathMatch ? pathMatch[1] : null;

        const inviteToken = token || pathToken;

        if (inviteToken) {
          console.log('Invitation token detected:', inviteToken);
          setInvitationToken(inviteToken);

          // Validate the invitation token
          const details = await validateInvitation(inviteToken);
          if (details.isValid) {
            setInvitationDetails(details);
            setIsInvitedUser(true);
            // Automatically navigate to Identity Forge for invited users
            setCurrentView('forge');
            console.log('Valid invitation detected, redirecting to Identity Forge');
          } else {
            console.warn('Invalid invitation token:', details.error);
            // Clear invalid token from URL
            const newUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
          }
        }
      } catch (error) {
        console.error('Error processing invitation token:', error);
      }
    };

    checkForInvitationToken();
  }, []); // Run only once on mount

  // App-level navigation event listener used by IdentityForge completion screen
  useEffect(() => {
    const handler = (evt: Event) => {
      try {
        const e = evt as CustomEvent<{ view?: string }>;
        const targetView = e?.detail?.view as any;
        if (!targetView) return;
        setCurrentView(targetView);
      } catch (err) {
        console.warn('satnam:navigate handler error', err);
      }
    };
    window.addEventListener('satnam:navigate', handler as EventListener);
    return () => window.removeEventListener('satnam:navigate', handler as EventListener);
  }, []);
  // Global event to open Sign-In modal from nested components (e.g., NTAG424 modal pre-auth gating)
  useEffect(() => {
    const handler = () => {
      try {
        setSignInModalOpen(true);
      } catch (err) {
        console.warn('satnam:open-signin handler error', err);
      }
    };
    window.addEventListener('satnam:open-signin', handler as EventListener);
    return () => window.removeEventListener('satnam:open-signin', handler as EventListener);
  }, []);


  // Auto-close transient modals when navigating to new views
  useEffect(() => {
    // Close communications overlay if navigating elsewhere
    if (showCommunications && currentView !== 'communications') {
      setShowCommunications(false);
    }
    // Close contacts modal when leaving landing
    if (showContactsModal && currentView !== 'landing' && currentView !== 'contacts') {
      setShowContactsModal(false);
    }
  }, [currentView, showCommunications, showContactsModal]);

  // Handler for protected routes - checks auth and either shows sign-in or goes to destination
  const handleProtectedRoute = (destination: 'dashboard' | 'individual-finances' | 'communications' | 'family-foundry' | 'payment-automation' | 'educational-dashboard' | 'sovereignty-controls' | 'privacy-preferences' | 'atomic-swaps' | 'cross-mint-operations' | 'payment-cascade' | 'giftwrapped-messaging' | 'contacts' | 'ln-node-management') => {
    // CRITICAL FIX: Add loading check to prevent race conditions
    if (auth.loading) {
      console.log('🔄 Auth still loading, waiting before route protection check');
      return;
    }

    // Defensive route protection: allow proceed if a valid token exists even if flag lags
    if (!authenticated) {
      const token = SecureTokenManager.getAccessToken();
      const payload = token ? SecureTokenManager.parseTokenPayload(token) : null;
      const tokenValid = !!payload && payload.exp * 1000 > Date.now();

      console.log('🧭 Route guard state:', { authenticated, hasToken: !!token, tokenValid });

      if (tokenValid) {
        console.log('🔐 Valid token detected, proceeding despite auth flag lag:', destination);
        // fall through to navigation below
      } else {
        console.log('🚫 User not authenticated, showing SignInModal for destination:', destination);
        setSignInModalOpen(true);
        setPendingDestination(destination);
        return;
      }
    }

    console.log('✅ User authenticated (or token valid), proceeding to destination:', destination);

    switch (destination) {
      case 'dashboard':
        setCurrentView('dashboard');
        break;
      case 'individual-finances':
        setCurrentView('individual-finances');
        break;
      case 'communications':
        setCurrentView('communications');
        break;
      case 'family-foundry':
        setCurrentView('family-foundry');
        break;
      case 'payment-automation':
        setCurrentView('family-payment-automation');
        break;
      case 'educational-dashboard':
        setCurrentView('educational-dashboard');
        break;
      case 'sovereignty-controls':
        setCurrentView('sovereignty-controls');
        break;
      case 'privacy-preferences':
        setCurrentView('privacy-preferences');
        break;
      case 'atomic-swaps':
        setCurrentView('atomic-swaps');
        break;
      case 'cross-mint-operations':
        setCurrentView('cross-mint-operations');
        break;
      case 'payment-cascade':
        setCurrentView('payment-cascade');
        break;
      case 'giftwrapped-messaging':
        setCurrentView('giftwrapped-messaging');
        break;
      case 'ln-node-management':
        setCurrentView('ln-node-management');
        break;
      case 'contacts':
        setShowContactsModal(true);
        break;
      default:
        setCurrentView('landing');
    }
  };



  // Handle successful authentication
  const handleAuthSuccess = () => {
    console.log('🎉 Authentication success handler called');
    console.log('🔍 Current auth state:', { authenticated, loading: auth.loading, hasUser: !!auth.user });
    console.log('📍 Pending destination:', pendingDestination);
    setSignInModalOpen(false);

    // Respect pending destination for all secure sections (incl. Communications)
    const dest = pendingDestination || 'communications';

    // Small delay to ensure auth state is fully updated
    setTimeout(() => {
      if (dest) {
        console.log('📍 Navigating to destination after signin:', dest);

        if (dest === 'giftwrapped-messaging') {
          setShowCommunications(true);
          setCurrentView('communications');
        } else if (dest === 'communications') {
          setShowCommunications(false);
          setCurrentView('communications');
        } else if (dest === 'family-foundry') {
          setCurrentView("onboarding");
        } else if (dest === 'educational-dashboard') {
          setCurrentView("education");
        } else if (dest === 'sovereignty-controls') {
          setCurrentView("dashboard");
        } else if (dest === 'privacy-preferences') {
          setCurrentView("dashboard");
        } else if (dest === 'atomic-swaps') {
          setCurrentView("dashboard");
        } else if (dest === 'cross-mint-operations') {
          setCurrentView("individual-finances");
        } else if (dest === 'payment-cascade') {
          setCurrentView("individual-finances");
        } else if (dest === 'contacts') {
          setShowContactsModal(true);
        } else if (dest === 'ln-node-management') {
          setCurrentView('ln-node-management');
        } else {
          setCurrentView(dest);
        }
        setPendingDestination(null);
      } else {
        console.log('📍 No destination provided, staying on current view');
      }
    }, 100);
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
        <IdentityForgeGuard>
          <IdentityForge
            onComplete={() => setCurrentView("nostr-ecosystem")}
            onBack={() => setCurrentView("landing")}
            invitationToken={invitationToken}
            invitationDetails={invitationDetails}
            isInvitedUser={isInvitedUser}
          />
        </IdentityForgeGuard>
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
        <FamilyDashboard onBack={() => setCurrentView("landing")} />
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
        <IndividualFinancesDashboard
          memberId="current-user"
          memberData={{
            id: "current-user",
            username: "Current User",
            auth_hash: "mock-auth-hash",
            lightningAddress: "user@satnam.pub",
            role: "adult",
            is_discoverable: false,
            created_at: Date.now()
          }}
          onBack={() => setCurrentView("landing")}
        />
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
        <FamilyFoundryWizard
          onComplete={() => setCurrentView("dashboard")}
          onBack={() => setCurrentView("landing")}
        />
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
        <FamilyCoordination onBack={() => setCurrentView("landing")} />
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
        <EmergencyRecoveryPage onBack={() => setCurrentView("landing")} />
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

  if (currentView === "communications") {
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
        <GiftwrappedMessaging
          familyMember={{
            id: "current-user",
            npub: "npub1placeholder",
            username: "Current User",
            role: "adult"
          }}
        />
      </PageWrapper>
    );
  }

  if (currentView === "family-payment-automation") {
    // Only show family payment automation for family federation members
    if (!auth.user?.familyId) {
      // Redirect individual users to individual payment automation instead
      setCurrentView("individual-payment-automation");
      return null;
    }

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
        <FamilyPaymentAutomationModal
          isOpen={true}
          onClose={() => setCurrentView("landing")}
          onSave={(schedule) => {
            console.log("Family payment schedule saved:", schedule);
            setCurrentView("landing");
          }}
          familyId={auth.user.familyId}
          familyMembers={[
            {
              id: "member-1",
              name: "Guardian",
              role: "guardian",
              avatar: "👑",
              lightningAddress: "guardian@satnam.pub"
            },
            {
              id: "member-2",
              name: "Steward",
              role: "steward",
              avatar: "🛡️",
              lightningAddress: "steward@satnam.pub"
            }
          ]}
          currentUserRole="adult"
        />
      </PageWrapper>
    );
  }

  if (currentView === "individual-payment-automation") {
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
        <IndividualPaymentAutomationModal
          isOpen={true}
          onClose={() => setCurrentView("landing")}
          onSave={(schedule) => {
            console.log("Individual payment schedule saved:", schedule);
            setCurrentView("landing");
          }}
          userId="user-123"
        />
      </PageWrapper>
    );


  }

  if (currentView === "lnbits-setup") {
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => setCurrentView("landing")}
            className="inline-flex items-center text-purple-200 hover:text-white underline"
            aria-label="Back to Home"
          >
            Back
          </button>
          <h1 className="text-3xl font-bold text-white mt-2">LNbits Setup</h1>
          <p className="text-purple-100 mb-6">Create your wallet and optional Lightning Address. This information will be used in Step 3 when you program your Name Tag.</p>
          <LNBitsIntegrationPanel />
        </div>
      </PageWrapper>
    );
  }


  if (currentView === "lnurl-display") {
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LNURLDisplay onBack={() => setCurrentView("landing")} />
        </div>
      </PageWrapper>
    );
  }

  if (currentView === "nfc-provisioning-guide") {
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <NFCProvisioningGuide onBack={() => setCurrentView("landing")} />
        </div>
      </PageWrapper>
    );
  }





  if (currentView === "ln-node-management") {
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">PhoenixD Manager</h1>
            <p className="text-lg text-purple-100">
              Manage your Lightning Network channels, liquidity, and routing capabilities.
            </p>
          </div>

          {/* Node Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">Node Status</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-purple-200">Status:</span>
                  <span className="text-green-400 font-semibold">Online</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-200">Version:</span>
                  <span className="text-white">PhoenixD 0.12.1</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-200">Uptime:</span>
                  <span className="text-white">99.9%</span>
                </div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">Channel Summary</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-purple-200">Total Channels:</span>
                  <span className="text-white">12</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-200">Total Capacity:</span>
                  <span className="text-white">2.5 BTC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-200">Available Liquidity:</span>
                  <span className="text-white">1.8 BTC</span>
                </div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">Routing Stats</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-purple-200">Routes:</span>
                  <span className="text-white">1,247</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-200">Fees Earned:</span>
                  <span className="text-white">0.0023 BTC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-200">Success Rate:</span>
                  <span className="text-white">98.7%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Channel Management Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Add Channel */}
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">Add Channel</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-2">
                    Node Pubkey
                  </label>
                  <input
                    type="text"
                    placeholder="03a507... (64 characters)"
                    className="w-full px-4 py-2 bg-white/20 border border-purple-300 rounded-lg text-white placeholder-purple-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-2">
                    Channel Capacity (BTC)
                  </label>
                  <input
                    type="number"
                    placeholder="0.1"
                    step="0.01"
                    min="0.01"
                    className="w-full px-4 py-2 bg-white/20 border border-purple-300 rounded-lg text-white placeholder-purple-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-2">
                    Push Amount (BTC)
                  </label>
                  <input
                    type="number"
                    placeholder="0.05"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2 bg-white/20 border border-purple-300 rounded-lg text-white placeholder-purple-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <button className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-lg transition-colors">
                  Open Channel
                </button>
              </div>
            </div>

            {/* Rebalance Channels */}
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">Rebalance Channels</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-2">
                    Source Channel ID
                  </label>
                  <select className="w-full px-4 py-2 bg-white/20 border border-purple-300 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent">
                    <option value="">Select channel...</option>
                    <option value="channel1">Channel 1 (0.5 BTC)</option>
                    <option value="channel2">Channel 2 (0.3 BTC)</option>
                    <option value="channel3">Channel 3 (0.2 BTC)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-2">
                    Target Channel ID
                  </label>
                  <select className="w-full px-4 py-2 bg-white/20 border border-purple-300 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent">
                    <option value="">Select channel...</option>
                    <option value="channel4">Channel 4 (0.1 BTC)</option>
                    <option value="channel5">Channel 5 (0.4 BTC)</option>
                    <option value="channel6">Channel 6 (0.15 BTC)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-2">
                    Amount to Move (BTC)
                  </label>
                  <input
                    type="number"
                    placeholder="0.05"
                    step="0.01"
                    min="0.001"
                    className="w-full px-4 py-2 bg-white/20 border border-purple-300 rounded-lg text-white placeholder-purple-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <button className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-colors">
                  Rebalance
                </button>
              </div>
            </div>
          </div>

          {/* Active Channels */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-8">
            <h3 className="text-xl font-bold text-white mb-4">Active Channels</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-purple-300">
                    <th className="py-2 text-purple-200 font-medium">Channel ID</th>
                    <th className="py-2 text-purple-200 font-medium">Peer</th>
                    <th className="py-2 text-purple-200 font-medium">Capacity</th>
                    <th className="py-2 text-purple-200 font-medium">Local Balance</th>
                    <th className="py-2 text-purple-200 font-medium">Remote Balance</th>
                    <th className="py-2 text-purple-200 font-medium">Status</th>
                    <th className="py-2 text-purple-200 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-white">
                  <tr className="border-b border-purple-200/20">
                    <td className="py-3">1234567890</td>
                    <td className="py-3">03a507...abc123</td>
                    <td className="py-3">0.5 BTC</td>
                    <td className="py-3">0.3 BTC</td>
                    <td className="py-3">0.2 BTC</td>
                    <td className="py-3"><span className="text-green-400">Active</span></td>
                    <td className="py-3">
                      <button className="text-orange-400 hover:text-orange-300 text-sm">Close</button>
                    </td>
                  </tr>
                  <tr className="border-b border-purple-200/20">
                    <td className="py-3">0987654321</td>
                    <td className="py-3">02b608...def456</td>
                    <td className="py-3">0.3 BTC</td>
                    <td className="py-3">0.1 BTC</td>
                    <td className="py-3">0.2 BTC</td>
                    <td className="py-3"><span className="text-green-400">Active</span></td>
                    <td className="py-3">
                      <button className="text-orange-400 hover:text-orange-300 text-sm">Close</button>
                    </td>
                  </tr>
                  <tr className="border-b border-purple-200/20">
                    <td className="py-3">1122334455</td>
                    <td className="py-3">01c709...ghi789</td>
                    <td className="py-3">0.2 BTC</td>
                    <td className="py-3">0.15 BTC</td>
                    <td className="py-3">0.05 BTC</td>
                    <td className="py-3"><span className="text-green-400">Active</span></td>
                    <td className="py-3">
                      <button className="text-orange-400 hover:text-orange-300 text-sm">Close</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-8">
            <h3 className="text-xl font-bold text-white mb-4">Recent Transactions</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-purple-200/20">
                <div>
                  <div className="text-white font-medium">Payment Received</div>
                  <div className="text-purple-200 text-sm">Channel: 1234567890</div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-medium">+0.001 BTC</div>
                  <div className="text-purple-200 text-sm">2 hours ago</div>
                </div>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-purple-200/20">
                <div>
                  <div className="text-white font-medium">Payment Sent</div>
                  <div className="text-purple-200 text-sm">Channel: 0987654321</div>
                </div>
                <div className="text-right">
                  <div className="text-red-400 font-medium">-0.0005 BTC</div>
                  <div className="text-purple-200 text-sm">4 hours ago</div>
                </div>
              </div>
              <div className="flex justify-between items-center py-3">
                <div>
                  <div className="text-white font-medium">Channel Opened</div>
                  <div className="text-purple-200 text-sm">New channel with 01c709...ghi789</div>
                </div>
                <div className="text-right">
                  <div className="text-blue-400 font-medium">+0.2 BTC</div>
                  <div className="text-purple-200 text-sm">1 day ago</div>
                </div>
              </div>
            </div>
          </div>

          {/* Back Button */}
          <div className="flex justify-center">
            <button
              onClick={() => setCurrentView("landing")}
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center space-x-2 backdrop-blur-sm border-2 border-black"
            >
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (currentView === "contacts") {
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
        <GiftwrappedMessaging
          familyMember={{
            id: "current-user",
            npub: "npub1placeholder",
            username: "Current User",
            role: "adult"
          }}
        />
      </PageWrapper>
    );
  }



  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Hero Background Image with Overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('/BitcoinCitadelValley.jpg')`,
        }}
      >
        {/* Gradient overlay with 50% reduced opacity */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/35 via-purple-800/30 to-purple-600/25"></div>
        {/* Additional overlay with 50% reduced opacity */}
        <div className="absolute inset-0 bg-black/10"></div>
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
            Claim Your True Name
          </h1>
          <h2 className="text-2xl md:text-3xl font-semibold text-purple-100 mb-8 drop-shadow-lg">
            Control Your Digital Dynasty
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
              <img src="/SatNam-logo.png" alt="Claim" className="h-5 w-5" />
              <span>Claim Your Name</span>
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
                src="/Citadel-Academy-Logo.png"
                alt="Citadel Academy"
                className="h-4 w-4"
              />
              <span>Access Advanced Training</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* NFC Name Tag provisioning */}

          <div className="mt-10 bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center shadow-lg">


            <h3 className="text-2xl font-bold text-white mb-3">Set up your NFC Name Tag: Start your ID Credentialing Quest</h3>
            <p className="text-purple-100 mb-6 max-w-3xl mx-auto">
              Follow five simple steps to prepare your physical Name Tag, establish your personal Source of Truth Architecture,
              and finish with Stamping (registering your credentials onto the tag). Simple, private, and in your control.
            </p>
            <ol className="text-left max-w-3xl mx-auto text-purple-100 list-decimal list-inside space-y-2">
              <li>
                <strong>Step 1 — Claim Your True Name:</strong> Choose one:
                <button
                  onClick={() => setCurrentView("forge")}
                  className="ml-2 inline-flex items-center bg-purple-700 hover:bg-purple-800 text-white font-semibold py-1 px-3 rounded-md text-xs transition-colors border border-black/40"
                  title="I'm new: Create a sovereign identity (npub/NIP-05)"
                >I'm New: Open Identity Forge</button>
                <button
                  onClick={() => setSignInModalOpen(true)}
                  className="ml-2 inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded-md text-xs transition-colors border border-black/40"
                  title="I'm returning: Sign in to your Satnam account"
                >I'm Returning: Sign In</button>
                <div className="mt-1 text-purple-200/90 text-xs">Identity created in this step will label your wallet and Name Tag in later steps.</div>
              </li>
              <li>
                <strong>Step 2 — Wallet Creation:</strong> Create your LNbits wallet and (optionally) set up a Lightning Address. You’ll use this wallet info in Step 3 when programming your tag.
                <button
                  onClick={() => setCurrentView("lnurl-display")}
                  className="ml-2 inline-flex items-center bg-orange-500 hover:bg-orange-600 text-white font-semibold py-1 px-3 rounded-md text-xs transition-colors border border-black/40"
                  title="Show your LNURL details"
                >Show LNURL</button>              </li>
              <li>
                <strong>Step 3 — Tool Acquisition:</strong> Install the Boltcard programming app on your phone (links below). In the app, you’ll enter the wallet details you created in Step 2.
              </li>
              <li>
                <strong>Step 4 — Stamp Your ID onto Your NFC Name Tag:</strong> Use the programming app to provision your tag with your True Name (identity) and wallet data. Then return here and tap your Name Tag to register/authenticate — establishing secured Networks of Trusted Peers for communications and payments.
              </li>
              <li>
                <strong>Step 5 — Register Your True Name Tag:</strong> Once your tag is programmed, register it to your Satnam account to enable physical multi-factor authentication of peers, messages, and payments.
                <div className="mt-2">
                  <button
                    onClick={async () => {
                      try {
                        setLoadingNfcModal(true);
                        await import("./components/NTAG424AuthModal");
                        setNfcModalOpen(true);
                      } catch (e) {
                        console.error("Failed to load NFC modal chunk:", e);
                        showToast.error("Unable to open NFC authentication. Please try again.", { title: "NFC Module Error" });
                      } finally {
                        setLoadingNfcModal(false);
                      }
                    }}
                    aria-disabled={loadingNfcModal}
                    className={
                      "inline-flex items-center bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-5 rounded-lg transition-all duration-300 shadow" +
                      (loadingNfcModal ? " opacity-60 cursor-not-allowed" : "")
                    }
                    title="Register Your True Name Tag"
                  >
                    Register Your True Name Tag
                  </button>
                </div>
              </li>

            </ol>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-4">
              <a
                href="https://apps.apple.com/us/app/boltcard-nfc-programmer/id6450968873"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 shadow-lg"
                title="Install Boltcard Programmer (iOS)"
              >
                <span>Install for iOS (Boltcard Programmer)</span>
                <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.lightningnfcapp&pcampaignid=web_share"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 shadow-lg"
                title="Install Boltcard Programming (Android)"
              >
                <span>Install for Android (Boltcard Programming)</span>
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                onClick={() => setCurrentView("nfc-provisioning-guide")}
                className="bg-purple-700 hover:bg-purple-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center space-x-2 shadow-lg"
                title="Open the NFC Provisioning Guide"
              >
                <span>Provisioning Guide</span>
              </button>

            </div>

            {/* Additional resources (footnote) */}
            <div className="text-left max-w-3xl mx-auto mt-4 text-purple-200/80 text-xs">
              <div className="opacity-90">Additional resources:</div>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>
                  <a href="https://github.com/boltcard/bolt-nfc-android-app/releases" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-100">
                    Android APK Releases (Boltcard)
                  </a>
                </li>
                <li>
                  <a href="/docs/ntag424-blob-viewer.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-100">
                    NTAG424 Blob Viewer Tool
                  </a>
                </li>
                <li>
                  <a href="https://ereignishorizont.xyz/en/boltcard_en/" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-100">
                    External Boltcard Guide
                  </a>
                </li>
              </ul>
            </div>


            {/* Friendly notes */}
            <div className="text-left max-w-3xl mx-auto mt-6 text-purple-200/90 text-sm">
              <ul className="list-disc list-inside space-y-1">
                <li>Your Name Tag is private: programming happens on your device; secrets never leave your phone.</li>
                <li>Supported tag: NTAG424 DNA (keeps on-tag data small for fast taps).</li>
                <li>Need more details? The Provisioning Guide includes extra help and community links.</li>
              </ul>
            </div>

            <p className="text-purple-200 text-sm mt-4">
              Your journey to digital sovereignty begins here, by adding physical authentication of your identity. Take it step by step, you've got this.
            </p>
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
                src="/SatNam-logo.png"
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
              <img src="/SatNam-logo.png" alt="Claim" className="h-4 w-4" />
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
                src="/LN-Bitcoin-icon.png"
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
            Seeding Sovereign Dynasties
          </h2>
          <div className="grid md:grid-cols-3 gap-8 text-lg text-purple-100">
            <div>
              <h3 className="font-bold text-white mb-3">SatNam.pub: Your Self-Custodied & Credentialed Digital Identity Wallet</h3>
              <p>
                You control your keys, your identity, and your dynasty. No
                intermediaries, no dependencies. Your Responsibility!
              </p>
            </div>
            <div>
              <h3 className="font-bold text-white mb-3">Bitcoin-ONLY</h3>
              <p>
                Built on the longest-running, most secure and decentralized network. Without casino-coins and without custodians.
                Building on established trust, while decentralizing power. Using eCash to capture privacy and gain transaction speed within already trusted environments; between family members, businesses, and employees..
              </p>
            </div>
            <div>
              <h3 className="font-bold text-white mb-3">Family-First, Business-Second</h3>
              <p>
                We're building a cooperative of self-sovereign dynastic families and businesses. Sovereignty tools stamping your digital passport with YOUR identity. Curating essential tools for cultivating multigenerational
                wealth, creating and conserving your cognitive capital for your descendants.
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
                  className="block text-orange-400 hover:text-yellow-400 transition-colors duration-200"
                >
                  Family Financials
                </button>
                <button
                  onClick={() => handleProtectedRoute("individual-finances")}
                  className="block text-orange-400 hover:text-yellow-400 transition-colors duration-200"
                >
                  Individual Finances
                </button>
                <button
                  onClick={() => handleProtectedRoute("payment-automation")}
                  className="block text-orange-400 hover:text-yellow-400 transition-colors duration-200"
                >
                  Automated Payments
                </button>
                {auth.authenticated ? (
                  <button
                    onClick={async () => {
                      try {
                        const npub = (auth.user as any)?.npub as string | undefined;
                        if (!npub) {
                          showToast.error("Your npub is not available", { duration: 2500 });
                          return;
                        }
                        await navigator.clipboard.writeText(npub);
                        showToast.success("Copied your npub", { duration: 2500 });
                      } catch (e) {
                        showToast.error("Failed to copy npub", { duration: 3000 });
                      }
                    }}
                    className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                    aria-label="Copy your npub to clipboard"
                    title="Copy your npub"
                  >
                    Copy Npub
                  </button>
                ) : null}
                <button
                  onClick={() => setCurrentView('nfc-provisioning-guide')}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                  title="Prepare Your Name Tag/s"
                >
                  <span className="block">Prepare Your Name Tag/s</span>
                  <span className="block text-xs text-purple-300">
                    Read setup guide • <a href="https://play.google.com/store/apps/details?id=com.lightningnfcapp&pcampaignid=web_share" target="_blank" rel="noopener noreferrer" className="underline">Install Boltcard Programming App</a>
                  </span>
                </button>
                <button
                  onClick={() => handleProtectedRoute("contacts")}
                  className="block text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                >
                  Contacts
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-white font-bold mb-4">Features</h3>
              <div className="space-y-2">
                <button
                  onClick={() => handleProtectedRoute("cross-mint-operations")}
                  className="block text-orange-400 hover:text-yellow-400 transition-colors duration-200"
                >
                  Cross-Mint Operations
                </button>
                <button
                  onClick={() => handleProtectedRoute("payment-cascade")}
                  className="block text-orange-400 hover:text-yellow-400 transition-colors duration-200"
                >
                  Payment Cascade System
                </button>
                <button
                  onClick={() => handleProtectedRoute("ln-node-management")}
                  className="block text-orange-400 hover:text-yellow-400 transition-colors duration-200"
                >
                  LN Node Management
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
                {auth.authenticated ? (
                  <button
                    onClick={async () => {
                      try {
                        const npub = (auth.user as any)?.npub as string | undefined;
                        if (!npub) {
                          showToast.error("Your npub is not available", { duration: 2500 });
                          return;
                        }
                        await navigator.clipboard.writeText(npub);
                        showToast.success("Copied your npub", { duration: 2500 });
                      } catch (e) {
                        showToast.error("Failed to copy npub", { duration: 3000 });
                      }
                    }}
                    className="flex items-center space-x-1 text-purple-200 hover:text-yellow-400 transition-colors duration-200"
                    aria-label="Copy your npub to clipboard"
                    title="Copy your npub"
                  >
                    <Copy className="h-3 w-3" />
                    <span>Copy Npub</span>
                  </button>
                ) : null}
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
                  src="/Citadel-Academy-Logo.png"
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
                  src="/Citadel-Academy-Logo.png"
                  alt="Citadel Academy"
                  className="h-4 w-4"
                  loading="lazy"
                />
                <span>SatNam.pub: Your Self-Custodied & Credentialed Digital Identity Wallet</span>
              </span>
              <span className="flex items-center space-x-2">
                <Bitcoin className="h-4 w-4" />
                <span>Bitcoin-ONLY</span>
              </span>
              <span className="flex items-center space-x-2">
                <img
                  src="/Rebuilding_Camelot_logo__transparency_v3.png"
                  alt="Rebuilding Camelot"
                  className="h-4 w-4"
                  loading="lazy"
                />
                <span>Family-First, Business-Second</span>
              </span>
            </div>
          </div>
        </div>

        {/* NTAG424 Physical MFA Modal (lazy-loaded, isolated) */}
        {nfcModalOpen && (
          <ErrorBoundary
            fallback={null}
            onError={(e) => {
              console.error('Failed to load NTAG424 modal:', e);
              // Auto-close to recover UI if load/render fails
              try { setNfcModalOpen(false); } catch { }
            }}
          >
            <Suspense fallback={null}>
              <NTAG424AuthModal
                isOpen={true}
                onClose={() => setNfcModalOpen(false)}
                mode="both"
                title="Program Physical MFA tags"
                purpose="Program NTAG424 NFC tags for Client Vault signin and Nostr event signing"
              />
            </Suspense>
          </ErrorBoundary>
        )}

      </footer>

      {/* Sign In Modal */}
      <SignInModal
        isOpen={signInModalOpen}
        onClose={() => setSignInModalOpen(false)}
        onSignInSuccess={handleAuthSuccess}
        onCreateNew={() => {
          try { (window as any).__identityForgeRegFlow = true; } catch { }
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
          isModal={true}
          onClose={() => setShowCommunications(false)}
        />
      )}

      {/* Contacts Manager Modal */}
      {showContactsModal && (
        <ContactsManagerModal
          isOpen={showContactsModal}
          onClose={() => setShowContactsModal(false)}
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