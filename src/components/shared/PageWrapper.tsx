import React from 'react';
import Navigation from './Navigation';

interface PageWrapperProps {
  children: React.ReactNode;
  currentView: string;
  setCurrentView: (view: "landing" | "forge" | "dashboard" | "individual-finances" | "onboarding" | "education" | "coordination" | "recovery" | "nostr-ecosystem") => void;
  setSignInModalOpen: (open: boolean) => void;
  handleProtectedRoute: (destination: 'dashboard' | 'individual-finances' | 'communications') => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  showCommunications?: boolean;
  setShowCommunications?: (show: boolean) => void;
}

const PageWrapper: React.FC<PageWrapperProps> = ({
  children,
  currentView,
  setCurrentView,
  setSignInModalOpen,
  handleProtectedRoute,
  mobileMenuOpen,
  setMobileMenuOpen,
  showCommunications,
  setShowCommunications,
}) => {
  // Views that should have specific backgrounds
  const nostrViews = ['contacts', 'nostr-ecosystem', 'communications'];
  const financialViews = ['dashboard', 'individual-finances', 'ln-node-management'];

  const useNostrBackground = nostrViews.includes(currentView);
  const useFinancialBackground = financialViews.includes(currentView);

  // Determine which background image to use
  const getBackgroundImage = () => {
    if (useNostrBackground) {
      console.log('Using Nostr background for view:', currentView);
      return `url('/Nostr%20Zapstorm.jpg')`;
    } else if (useFinancialBackground) {
      console.log('Using Financial background for view:', currentView);
      return `url('/Energized%20Bitcoin.jpg')`;
    } else {
      console.log('Using default background for view:', currentView);
      return `url('/Bitcoin%20Citadel%20Valley.jpg')`;
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-purple-900">
      {/* Background Image - Different images for different page types */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0"
        style={{
          backgroundImage: getBackgroundImage(),
          backgroundColor: '#581c87', // fallback purple color
        }}
      >
        {/* Gradient overlay with 50% reduced opacity compared to landing page */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/35 via-purple-800/30 to-purple-600/25"></div>
        {/* Additional overlay with 50% reduced opacity */}
        <div className="absolute inset-0 bg-black/10"></div>
      </div>

      {/* Navigation */}
      <Navigation
        currentView={currentView}
        setCurrentView={setCurrentView}
        setSignInModalOpen={setSignInModalOpen}
        handleProtectedRoute={handleProtectedRoute}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* Page Content */}
      <div className="pt-16 relative z-10">
        {children}
      </div>
    </div>
  );
};

export default PageWrapper; 