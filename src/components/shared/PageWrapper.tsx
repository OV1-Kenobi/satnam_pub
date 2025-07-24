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
  // Views that should have the lightning background
  const backgroundViews = ['contacts', 'nostr-ecosystem'];
  const hasBackground = backgroundViews.includes(currentView);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Image for specific views */}
      {hasBackground && (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url('/Nostr Zapstorm.jpg')`,
          }}
        >
          {/* Gradient overlay for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/70 via-purple-800/60 to-purple-600/50"></div>
          {/* Additional overlay for enhanced contrast */}
          <div className="absolute inset-0 bg-black/20"></div>
        </div>
      )}

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
      <div className={`pt-16 ${hasBackground ? 'relative z-10' : ''}`}>
        {children}
      </div>
    </div>
  );
};

export default PageWrapper; 