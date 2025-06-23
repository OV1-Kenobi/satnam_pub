// Individual Wallet Integration Tests
// File: src/__tests__/individual-wallet-integration.test.tsx

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

// Mock the IndividualFinancesDashboard component
vi.mock('../components/IndividualFinancesDashboard', () => ({
  default: ({ memberId, memberData, onBack }: any) => (
    <div data-testid="individual-finances-dashboard">
      <h1>Individual Wallet Dashboard</h1>
      <p>Member ID: {memberId}</p>
      <p>Username: {memberData.username}</p>
      <p>Lightning Address: {memberData.lightningAddress}</p>
      <p>Role: {memberData.role}</p>
      <button onClick={onBack}>Back to Home</button>
    </div>
  )
}));

// Mock other components to avoid rendering complexity
vi.mock('../components/FamilyFinancialsDashboard', () => ({
  default: ({ onBack }: any) => (
    <div data-testid="family-financials-dashboard">
      <h1>Family Financials Dashboard</h1>
      <button onClick={onBack}>Back to Home</button>
    </div>
  )
}));

vi.mock('../components/IdentityForge', () => ({
  default: ({ onComplete, onBack }: any) => (
    <div data-testid="identity-forge">
      <h1>Identity Forge</h1>
      <button onClick={onComplete}>Complete</button>
      <button onClick={onBack}>Back</button>
    </div>
  )
}));



vi.mock('../components/SignInModal', () => ({
  default: ({ isOpen, onClose }: any) => 
    isOpen ? (
      <div data-testid="sign-in-modal">
        <h2>Nostrich Sign-in</h2>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
}));

vi.mock('../components/NostrEcosystem', () => ({
  default: ({ onBack }: any) => (
    <div data-testid="nostr-ecosystem">
      <h1>Nostr Ecosystem</h1>
      <button onClick={onBack}>Back</button>
    </div>
  )
}));

vi.mock('../components/ServerStatus', () => ({
  default: ({ className }: any) => (
    <div className={className} data-testid="server-status">
      Server: Online
    </div>
  )
}));

// Mock useAuth hook
vi.mock('../hooks/useAuth', () => ({
  default: () => ({
    user: null,
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn()
  })
}));

describe('Individual Wallet Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Navigation Integration', () => {
    it('should display Individual Wallet button in desktop navigation', () => {
      render(<App />);
      
      const individualWalletButton = screen.getByRole('button', { 
        name: /individual wallet/i 
      });
      
      expect(individualWalletButton).toBeInTheDocument();
      expect(individualWalletButton).toHaveClass('bg-blue-500');
    });

    it('should display Individual Wallet button alongside Family Financials', () => {
      render(<App />);
      
      const familyFinancialsButton = screen.getByRole('button', { 
        name: /family financials/i 
      });
      const individualWalletButton = screen.getByRole('button', { 
        name: /individual wallet/i 
      });
      
      expect(familyFinancialsButton).toBeInTheDocument();
      expect(individualWalletButton).toBeInTheDocument();
      
      // Check they have similar styling (both are prominent buttons)
      expect(familyFinancialsButton).toHaveClass('bg-orange-500');
      expect(individualWalletButton).toHaveClass('bg-blue-500');
      expect(familyFinancialsButton).toHaveClass('font-bold');
      expect(individualWalletButton).toHaveClass('font-bold');
    });

    it('should navigate to Individual Wallet when button is clicked', async () => {
      render(<App />);
      
      const individualWalletButton = screen.getByRole('button', { 
        name: /individual wallet/i 
      });
      
      fireEvent.click(individualWalletButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('individual-finances-dashboard')).toBeInTheDocument();
      });
      
      expect(screen.getByText('Individual Wallet Dashboard')).toBeInTheDocument();
    });

    it('should display Individual Wallet in mobile navigation menu', async () => {
      render(<App />);
      
      // Open mobile menu
      const mobileMenuButton = screen.getByRole('button', { 
        name: /menu/i 
      });
      fireEvent.click(mobileMenuButton);
      
      await waitFor(() => {
        const individualWalletLink = screen.getByText('Individual Wallet');
        expect(individualWalletLink).toBeInTheDocument();
      });
    });

    it('should navigate from mobile menu to Individual Wallet', async () => {
      render(<App />);
      
      // Open mobile menu
      const mobileMenuButton = screen.getByRole('button', { 
        name: /menu/i 
      });
      fireEvent.click(mobileMenuButton);
      
      await waitFor(() => {
        const individualWalletLink = screen.getByText('Individual Wallet');
        fireEvent.click(individualWalletLink);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('individual-finances-dashboard')).toBeInTheDocument();
      });
    });
  });

  describe('Individual Wallet Dashboard Integration', () => {
    it('should render Individual Wallet Dashboard with correct props', async () => {
      render(<App />);
      
      const individualWalletButton = screen.getByRole('button', { 
        name: /individual wallet/i 
      });
      fireEvent.click(individualWalletButton);
      
      await waitFor(() => {
        expect(screen.getByText('Member ID: demo-user-123')).toBeInTheDocument();
        expect(screen.getByText('Username: demo_user')).toBeInTheDocument();
        expect(screen.getByText('Lightning Address: demo_user@satnam.pub')).toBeInTheDocument();
        expect(screen.getByText('Role: child')).toBeInTheDocument();
      });
    });

    it('should allow navigation back to landing page', async () => {
      render(<App />);
      
      // Navigate to Individual Wallet
      const individualWalletButton = screen.getByRole('button', { 
        name: /individual wallet/i 
      });
      fireEvent.click(individualWalletButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('individual-finances-dashboard')).toBeInTheDocument();
      });
      
      // Navigate back
      const backButton = screen.getByRole('button', { name: /back to home/i });
      fireEvent.click(backButton);
      
      await waitFor(() => {
        expect(screen.getByText('Forge Your True Name')).toBeInTheDocument();
      });
    });
  });

  describe('Button Styling and Accessibility', () => {
    it('should have proper button styling for Individual Wallet', () => {
      render(<App />);
      
      const individualWalletButton = screen.getByRole('button', { 
        name: /individual wallet/i 
      });
      
      // Check styling classes
      expect(individualWalletButton).toHaveClass(
        'bg-blue-500',
        'hover:bg-blue-600',
        'text-white',
        'font-bold',
        'py-2',
        'px-4',
        'rounded-lg',
        'transition-all',
        'duration-300',
        'transform',
        'hover:scale-105',
        'shadow-lg'
      );
    });

    it('should have proper accessibility attributes', () => {
      render(<App />);
      
      const individualWalletButton = screen.getByRole('button', { 
        name: /individual wallet/i 
      });
      
      expect(individualWalletButton).toBeVisible();
      expect(individualWalletButton).toBeEnabled();
      expect(individualWalletButton).toHaveAttribute('type', 'button');
    });

    it('should include Lightning icon in Individual Wallet button', () => {
      render(<App />);
      
      const individualWalletButton = screen.getByRole('button', { 
        name: /individual wallet/i 
      });
      
      // Check that the button contains an icon (Zap/Lightning icon)
      const icon = individualWalletButton.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Navigation State Management', () => {
    it('should maintain separate navigation states for Family and Individual', async () => {
      render(<App />);
      
      // Navigate to Family Financials (should open modal)
      const familyFinancialsButton = screen.getByRole('button', { 
        name: /family financials/i 
      });
      fireEvent.click(familyFinancialsButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('family-auth-modal')).toBeInTheDocument();
      });
      
      // Close modal
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);
      
      // Navigate to Individual Wallet (should go directly)
      const individualWalletButton = screen.getByRole('button', { 
        name: /individual wallet/i 
      });
      fireEvent.click(individualWalletButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('individual-finances-dashboard')).toBeInTheDocument();
      });
      
      // Should not show auth modal for individual wallet
      expect(screen.queryByTestId('family-auth-modal')).not.toBeInTheDocument();
    });

    it('should handle view transitions correctly', async () => {
      render(<App />);
      
      // Start at landing
      expect(screen.getByText('Forge Your True Name')).toBeInTheDocument();
      
      // Go to Individual Wallet
      const individualWalletButton = screen.getByRole('button', { 
        name: /individual wallet/i 
      });
      fireEvent.click(individualWalletButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('individual-finances-dashboard')).toBeInTheDocument();
        expect(screen.queryByText('Forge Your True Name')).not.toBeInTheDocument();
      });
      
      // Go back to landing
      const backButton = screen.getByRole('button', { name: /back to home/i });
      fireEvent.click(backButton);
      
      await waitFor(() => {
        expect(screen.getByText('Forge Your True Name')).toBeInTheDocument();
        expect(screen.queryByTestId('individual-finances-dashboard')).not.toBeInTheDocument();
      });
    });
  });

  describe('Mobile Responsiveness', () => {
    it('should show Individual Wallet in mobile navigation items', async () => {
      render(<App />);
      
      // Open mobile menu
      const mobileMenuButton = screen.getByRole('button', { 
        name: /menu/i 
      });
      fireEvent.click(mobileMenuButton);
      
      await waitFor(() => {
        // Check that Individual Wallet appears after Family Financials
        const navigationItems = screen.getAllByRole('button');
        const itemTexts = navigationItems.map(item => item.textContent);
        
        const familyIndex = itemTexts.findIndex(text => text?.includes('Family Financials'));
        const individualIndex = itemTexts.findIndex(text => text?.includes('Individual Wallet'));
        
        expect(familyIndex).toBeGreaterThan(-1);
        expect(individualIndex).toBeGreaterThan(-1);
        expect(individualIndex).toBeGreaterThan(familyIndex);
      });
    });

    it('should close mobile menu when Individual Wallet is selected', async () => {
      render(<App />);
      
      // Open mobile menu
      const mobileMenuButton = screen.getByRole('button', { 
        name: /menu/i 
      });
      fireEvent.click(mobileMenuButton);
      
      await waitFor(() => {
        expect(screen.getByText('Individual Wallet')).toBeInTheDocument();
      });
      
      // Click Individual Wallet
      const individualWalletLink = screen.getByText('Individual Wallet');
      fireEvent.click(individualWalletLink);
      
      await waitFor(() => {
        // Should navigate to dashboard and close menu
        expect(screen.getByTestId('individual-finances-dashboard')).toBeInTheDocument();
        // Menu should be closed (mobile menu items should not be visible)
        expect(screen.queryByText('Bitcoin Education')).not.toBeInTheDocument();
      });
    });
  });
});