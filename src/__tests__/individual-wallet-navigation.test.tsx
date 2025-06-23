// Individual Wallet Navigation Tests
// File: src/__tests__/individual-wallet-navigation.test.tsx

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

// Mock all complex components to focus on navigation
vi.mock('../components/IndividualFinancesDashboard', () => ({
  default: ({ memberId, memberData }: any) => (
    <div data-testid="individual-finances-dashboard">
      <h1>Individual Wallet Dashboard</h1>
      <p data-testid="member-id">Member ID: {memberId}</p>
      <p data-testid="username">Username: {memberData.username}</p>
    </div>
  )
}));

vi.mock('../components/FamilyFinancialsDashboard', () => ({
  default: () => <div data-testid="family-financials-dashboard">Family Dashboard</div>
}));

vi.mock('../components/IdentityForge', () => ({
  default: () => <div data-testid="identity-forge">Identity Forge</div>
}));



vi.mock('../components/SignInModal', () => ({
  default: () => null
}));

vi.mock('../components/NostrEcosystem', () => ({
  default: () => <div data-testid="nostr-ecosystem">Nostr Ecosystem</div>
}));

vi.mock('../components/ServerStatus', () => ({
  default: () => <div data-testid="server-status">Server: Online</div>
}));

vi.mock('../hooks/useAuth', () => ({
  default: () => ({
    user: null,
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn()
  })
}));

describe('Individual Wallet Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should display Individual Wallet button in navigation', () => {
    render(<App />);
    
    const individualWalletButton = screen.getByText('Individual Wallet');
    expect(individualWalletButton).toBeDefined();
  });

  it('should navigate to Individual Wallet when button is clicked', () => {
    render(<App />);
    
    // Find and click the Individual Wallet button
    const individualWalletButton = screen.getByText('Individual Wallet');
    fireEvent.click(individualWalletButton);
    
    // Should show the Individual Wallet Dashboard
    expect(screen.getByTestId('individual-finances-dashboard')).toBeDefined();
    expect(screen.getByText('Individual Wallet Dashboard')).toBeDefined();
  });

  it('should pass correct props to Individual Wallet Dashboard', () => {
    render(<App />);
    
    // Navigate to Individual Wallet
    const individualWalletButton = screen.getByText('Individual Wallet');
    fireEvent.click(individualWalletButton);
    
    // Check that correct props are passed
    expect(screen.getByTestId('member-id')).toBeDefined();
    expect(screen.getByTestId('username')).toBeDefined();
    expect(screen.getByText('Member ID: demo-user-123')).toBeDefined();
    expect(screen.getByText('Username: demo_user')).toBeDefined();
  });

  it('should have Individual Wallet button with correct styling', () => {
    render(<App />);
    
    const individualWalletButton = screen.getByText('Individual Wallet');
    const buttonElement = individualWalletButton.closest('button');
    
    expect(buttonElement).toBeDefined();
    expect(buttonElement?.className).toContain('bg-blue-500');
    expect(buttonElement?.className).toContain('hover:bg-blue-600');
    expect(buttonElement?.className).toContain('font-bold');
  });

  it('should show Individual Wallet alongside Family Financials', () => {
    render(<App />);
    
    const familyFinancialsButtons = screen.getAllByText('Family Financials');
    const individualWalletButton = screen.getByText('Individual Wallet');
    
    // Should have at least one Family Financials button
    expect(familyFinancialsButtons.length).toBeGreaterThan(0);
    expect(individualWalletButton).toBeDefined();
  });
});