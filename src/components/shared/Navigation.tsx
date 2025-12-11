import { BookOpen, ExternalLink, LogOut, Menu, Network, User, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../services/toastService";
import { useAuth } from "../auth/AuthProvider";

import { usePrivacyFirstMessaging } from "../../hooks/usePrivacyFirstMessaging";

import { resolvePlatformLightningDomain } from '../../config/domain.client';
import SecureTokenManager from "../../lib/auth/secure-token-manager";

interface NavigationProps {
  currentView: string;
  setCurrentView: (view: "landing" | "forge" | "dashboard" | "individual-finances" | "onboarding" | "education" | "coordination" | "recovery" | "nostr-ecosystem" | "communications" | "nfc-provisioning-guide" | "lnurl-display") => void;

  setSignInModalOpen: (open: boolean) => void;
  handleProtectedRoute: (destination: 'dashboard' | 'individual-finances' | 'communications') => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  showCommunications?: boolean;
  setShowCommunications?: (show: boolean) => void;
}

const Navigation: React.FC<NavigationProps> = ({
  currentView,
  setCurrentView,
  setSignInModalOpen,
  handleProtectedRoute,
  mobileMenuOpen,
  setMobileMenuOpen,
  showCommunications,
  setShowCommunications,
}) => {
  const navigate = useNavigate();
  const messaging = usePrivacyFirstMessaging();
  const incomingCount = (messaging?.incomingMessages || []).length;

  const auth = useAuth();
  const platformDomain = resolvePlatformLightningDomain();
  const userAny = (auth.user || {}) as any;
  const rawNpub = userAny?.npub as string | undefined;
  const rawUsername = userAny?.username as string | undefined;
  const rawNip05 = userAny?.nip05 as string | undefined;

  // Derive display identifier with NIP-05 priority:
  //   1) nip05 from current JWT token payload
  //   2) nip05 on auth.user
  //   3) username@platformDomain
  //   4) shortened npub
  //   5) generic "Signed in" label
  let displayId: string;

  let nip05FromToken: string | undefined;
  if (auth.sessionToken) {
    try {
      const payload = SecureTokenManager.parseTokenPayload(auth.sessionToken);
      nip05FromToken = payload?.nip05;
    } catch (error) {
      // Token parsing failed; fall back to other display ID sources
      console.warn("Failed to parse session token:", error);
    }
  }

  if (nip05FromToken) {
    displayId = nip05FromToken;
  } else if (rawNip05 && typeof rawNip05 === "string") {
    displayId = rawNip05;
  } else if (rawUsername) {
    displayId = `${rawUsername}@${platformDomain}`;
  } else if (rawNpub) {
    displayId = `${rawNpub.slice(0, 8)}...${rawNpub.slice(-4)}`;
  } else {
    displayId = "Signed in";
  }

  const handleLogout = async () => {
    try {
      await auth.logout();
      showToast.success("Logged out successfully", { duration: 2500 });
    } finally {
      setMobileMenuOpen(false);
      setCurrentView("landing");
    }
  };

  const navigationItems = [
    { label: "Family Foundry", action: () => navigate("/family-foundry"), external: false },
    { label: "Features", action: () => navigate("/features"), external: false },
    { label: "Nostr Resources", action: () => navigate("/nostr-resources"), external: false },
    { label: "Family Financials", action: () => setCurrentView("dashboard") },
    { label: "Individual Finances", action: () => setCurrentView("individual-finances") },
    { label: "Communications", action: () => handleProtectedRoute("communications") },
    { label: "Advanced Coordination", action: () => setCurrentView("coordination") },
    { label: "Recovery Help", action: () => setCurrentView("recovery") },
    {
      label: "NFC Card Setup",
      action: () => setCurrentView("nfc-provisioning-guide"),
      external: false,
    },
    {
      label: "Features Overview",
      action: () => navigate("/features"),
      external: false,
    },
  ];

  return (
    <nav className="relative z-20 bg-purple-900/90 backdrop-blur-sm border-b border-yellow-400 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16">
          {/* Logo with SatNam.Pub Custom Logo - Clickable to return to landing */}
          <button
            onClick={() => setCurrentView("landing")}
            className="flex items-center space-x-3 hover:opacity-80 transition-opacity duration-200"
          >
            <img
              src="/SatNam-logo.png"
              alt="SatNam.Pub"
              className="h-10 w-auto"
              loading="lazy"
            />
            <span className="text-white text-xl font-bold">Satnam.pub</span>
          </button>

          {/* Desktop Navigation - Centered */}
          <div className="hidden lg:flex items-center space-x-3 flex-1 justify-center">
            {/* Primary CTA */}
            <button
              onClick={() => setCurrentView("forge")}
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-3 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-1 shadow-lg border-2 border-black text-xs"
            >
              <img src="/SatNam-logo.png" alt="Claim" className="h-3 w-3" />
              <span>Name Yourself</span>
            </button>

            {/* Navigation Links */}
            <button
              onClick={() => handleProtectedRoute("dashboard")}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-3 rounded-lg transition-all duration-300 transform hover:scale-105 text-xs"
            >
              Family Financials
            </button>

            <button
              onClick={() => handleProtectedRoute("individual-finances")}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-3 rounded-lg transition-all duration-300 transform hover:scale-105 text-xs"
            >
              Individual Finances
            </button>



            {/* Communications Button - No background, center position */}
            <button
              onClick={() => handleProtectedRoute("communications")}
              className="text-white hover:text-yellow-400 transition-colors duration-200 font-medium text-xs py-3"
            >
              <span className="relative inline-flex items-center">
                <span>Communications</span>
                {incomingCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] text-[10px] px-1 bg-red-600 text-white rounded-full">
                    {incomingCount}
                  </span>
                )}
              </span>
            </button>

            <button
              onClick={() => setCurrentView("nostr-ecosystem")}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-3 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-1 text-xs"
            >
              <Network className="h-3 w-3" />
              <span>Nostr Resources</span>
            </button>

            <button
              onClick={() => setCurrentView("features-overview" as any)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-3 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-1 text-xs"
            >
              <BookOpen className="h-3 w-3" />
              <span>Features Overview</span>
            </button>

            {/* Sign In Button */}
            <button
              onClick={() => setSignInModalOpen(true)}
              className="bg-purple-800 hover:bg-purple-700 text-white font-bold py-3 px-3 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-1 shadow-lg border-2 border-black text-xs"
            >
              <span>Nostrich Sign-in</span>
            </button>

            <button
              onClick={() => setCurrentView("recovery")}
              className="text-white hover:text-yellow-400 transition-colors duration-200 font-medium text-xs py-3"
            >
              Recovery
            </button>
          </div>

          {/* Session Status Indicator */}
          {auth.authenticated && (
            <div className="ml-auto hidden lg:flex items-center space-x-2">
              <span className="text-purple-200 text-xs flex items-center space-x-1 px-2 py-1 bg-white/10 rounded">
                <User className="h-3 w-3" />
                <span>{displayId}</span>
              </span>
              <button
                onClick={handleLogout}
                className="text-purple-200 hover:text-yellow-400 text-xs flex items-center space-x-1"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut className="h-3 w-3" />
                <span>Logout</span>
              </button>
            </div>
          )}

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
                  src="/SatNam-logo.png"
                  alt="Claim"
                  className="h-4 w-4"
                />
                <span>Name Yourself</span>
              </button>

              {navigationItems.map((item, index) => (
                <button
                  key={index}
                  onClick={() => {
                    // Handle protected routes in mobile menu
                    if (item.label === "Family Financials") {
                      handleProtectedRoute("dashboard");
                    } else if (item.label === "Individual Finances") {
                      handleProtectedRoute("individual-finances");
                    } else if (item.label === "Communications") {
                      handleProtectedRoute("communications");
                    } else {
                      item.action();
                    }
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left text-white hover:text-yellow-400 py-2 px-4 rounded-lg hover:bg-white/10 transition-all duration-300 flex items-center justify-between"
                >
                  <span className="inline-flex items-center">
                    <span>{item.label}</span>
                    {item.label === "Communications" && incomingCount > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] text-[10px] px-1 bg-red-600 text-white rounded-full">
                        {incomingCount}
                      </span>
                    )}
                  </span>
                  {item.external && <ExternalLink className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;