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
  return (
    <div className="min-h-screen relative overflow-hidden">
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
      <div className="pt-16">
        {children}
      </div>
    </div>
  );
};

export default PageWrapper; 