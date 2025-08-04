import {
  ExternalLink,
  Menu,
  Network,
  X
} from "lucide-react";

interface NavigationProps {
  currentView: string;
  setCurrentView: (view: "landing" | "forge" | "dashboard" | "individual-finances" | "onboarding" | "education" | "coordination" | "recovery" | "nostr-ecosystem") => void;
  setSignInModalOpen: (open: boolean) => void;
  handleProtectedRoute: (destination: 'dashboard' | 'individual-finances' | 'communications') => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

const Navigation: React.FC<NavigationProps> = ({
  currentView,
  setCurrentView,
  setSignInModalOpen,
  handleProtectedRoute,
  mobileMenuOpen,
  setMobileMenuOpen,
}) => {
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

  const setShowCommunications = (show: boolean) => {
    // This would need to be passed as a prop or handled differently
    // For now, we'll use a placeholder
    console.log("Show communications:", show);
  };

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
              <img src="/ID-forge-icon.png" alt="Forge" className="h-3 w-3" />
              <span>Forge ID</span>
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
              Communications
            </button>

            <button
              onClick={() => setCurrentView("nostr-ecosystem")}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-3 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-1 text-xs"
            >
              <Network className="h-3 w-3" />
              <span>Nostr Resources</span>
            </button>

            <a
              href="https://citadel.academy"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-3 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-1 text-xs"
            >
              <img
                src="/Citadel Academy Logo.png"
                alt="Citadel Academy"
                className="h-3 w-3"
              />
              <span>Citadel Academy</span>
              <ExternalLink className="h-2 w-2" />
            </a>

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
                  src="/ID-forge-icon.png"
                  alt="Forge"
                  className="h-4 w-4"
                />
                <span>Forge Identity</span>
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
                  <span>{item.label}</span>
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