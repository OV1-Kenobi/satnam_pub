import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';

// Mock the components
vi.mock('../components/FamilyFinancialsDashboard', () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="family-financials-dashboard">
      <h1>Family Financials Dashboard</h1>
      <button onClick={onBack}>Back to Home</button>
    </div>
  )
}));

vi.mock('../components/IdentityForge', () => ({
  default: ({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) => (
    <div data-testid="identity-forge">
      <h1>Identity Forge</h1>
      <button onClick={onComplete}>Complete</button>
      <button onClick={onBack}>Back</button>
    </div>
  )
}));

vi.mock('../components/FamilyAuthModal', () => ({
  default: ({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: (user: any) => void }) => 
    isOpen ? (
      <div data-testid="family-auth-modal">
        <h2>Family Authentication</h2>
        <button onClick={() => onSuccess({ name: 'Test User', role: 'guardian' })}>
          Authenticate
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
}));

vi.mock('../components/SignInModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => 
    isOpen ? (
      <div data-testid="sign-in-modal">
        <h2>Nostrich Sign-in</h2>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
}));

vi.mock('../components/NostrEcosystem', () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="nostr-ecosystem">
      <h1>Nostr Ecosystem</h1>
      <button onClick={onBack}>Back</button>
    </div>
  )
}));

vi.mock('../components/SmartPaymentModalDemo', () => ({
  default: () => (
    <div data-testid="payment-modal-demo">
      <h1>Payment Modal Demo</h1>
    </div>
  )
}));

describe('App Navigation', () => {
  it('renders the landing page by default', () => {
    render(<App />);
    
    expect(screen.getByText('Satnam.pub')).toBeTruthy();
    expect(screen.getByText('New ID Forge')).toBeTruthy();
    // Use getAllByText for elements that appear multiple times (desktop + mobile)
    expect(screen.getAllByText('Family Financials').length).toBeGreaterThan(0);
  });

  it('navigates to Identity Forge when clicking New ID Forge button', () => {
    render(<App />);
    
    const forgeButton = screen.getByText('New ID Forge');
    fireEvent.click(forgeButton);
    
    expect(screen.getByTestId('identity-forge')).toBeTruthy();
    expect(screen.getByText('Identity Forge')).toBeTruthy();
  });

  it('opens Family Auth Modal when clicking Family Financials', () => {
    render(<App />);
    
    // Get the first Family Financials button (there might be multiple for responsive design)
    const familyFinancialsButtons = screen.getAllByText('Family Financials');
    fireEvent.click(familyFinancialsButtons[0]);
    
    expect(screen.getByTestId('family-auth-modal')).toBeTruthy();
  });

  it('navigates to Family Financials Dashboard after successful authentication', () => {
    render(<App />);
    
    // Open family auth modal
    const familyFinancialsButtons = screen.getAllByText('Family Financials');
    fireEvent.click(familyFinancialsButtons[0]);
    
    // Authenticate
    const authenticateButton = screen.getByText('Authenticate');
    fireEvent.click(authenticateButton);
    
    expect(screen.getByTestId('family-financials-dashboard')).toBeTruthy();
    expect(screen.getByText('Family Financials Dashboard')).toBeTruthy();
  });

  it('navigates back to landing from Family Financials Dashboard', () => {
    render(<App />);
    
    // Navigate to dashboard
    const familyFinancialsButtons = screen.getAllByText('Family Financials');
    fireEvent.click(familyFinancialsButtons[0]);
    const authenticateButton = screen.getByText('Authenticate');
    fireEvent.click(authenticateButton);
    
    // Navigate back
    const backButton = screen.getByText('Back to Home');
    fireEvent.click(backButton);
    
    expect(screen.getByText('Satnam.pub')).toBeTruthy();
  });

  it('opens Sign-in Modal when clicking Nostrich Sign-in', () => {
    render(<App />);
    
    // Get the first Nostrich Sign-in button (there might be multiple for responsive design)
    const signInButtons = screen.getAllByText('Nostrich Sign-in');
    fireEvent.click(signInButtons[0]);
    
    expect(screen.getByTestId('sign-in-modal')).toBeTruthy();
  });

  it('navigates to Nostr Ecosystem', () => {
    render(<App />);
    
    // Get the first Nostr Resources button (there might be multiple for responsive design)
    const nostrButtons = screen.getAllByText('Nostr Resources');
    fireEvent.click(nostrButtons[0]);
    
    expect(screen.getByTestId('nostr-ecosystem')).toBeTruthy();
  });

  it('navigates to Payment Modal Demo', () => {
    render(<App />);
    
    const paymentButton = screen.getByText('Payment Modal');
    fireEvent.click(paymentButton);
    
    expect(screen.getByTestId('payment-modal-demo')).toBeTruthy();
  });

  it('shows recovery page when clicking Recovery', () => {
    render(<App />);
    
    const recoveryButton = screen.getByText('Recovery');
    fireEvent.click(recoveryButton);
    
    expect(screen.getByText('Account Recovery')).toBeTruthy();
    expect(screen.getByText('Recover your sovereign identity using your backup phrase or recovery keys.')).toBeTruthy();
  });

  it('navigates back from recovery page', () => {
    render(<App />);
    
    // Go to recovery
    const recoveryButton = screen.getByText('Recovery');
    fireEvent.click(recoveryButton);
    
    // Navigate back
    const backButton = screen.getByText('Back to Home');
    fireEvent.click(backButton);
    
    expect(screen.getByText('Satnam.pub')).toBeTruthy();
  });

  it('renders external link to Citadel Academy', () => {
    render(<App />);
    
    const citadelLink = screen.getByText('Enter Citadel Academy');
    expect(citadelLink).toBeTruthy();
    
    // Check that it's a proper link with correct attributes
    const linkElement = citadelLink.closest('a');
    expect(linkElement).toBeTruthy();
    expect(linkElement?.getAttribute('href')).toBe('https://citadel.academy');
    expect(linkElement?.getAttribute('target')).toBe('_blank');
  });
});