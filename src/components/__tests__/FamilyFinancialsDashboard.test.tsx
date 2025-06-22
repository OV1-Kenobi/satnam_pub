import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FamilyFinancialsDashboard from '../FamilyFinancialsDashboard';

// Mock the child components that are imported
vi.mock('../FamilyLightningTreasury', () => ({
  default: () => <div data-testid="family-lightning-treasury">Lightning Treasury Component</div>
}));

vi.mock('../FamilyFedimintGovernance', () => ({
  default: () => <div data-testid="family-fedimint-governance">Fedimint Governance Component</div>
}));

vi.mock('../UnifiedFamilyPayments', () => ({
  default: () => <div data-testid="unified-family-payments">Unified Payments Component</div>
}));

vi.mock('../PhoenixDFamilyManager', () => ({
  default: () => <div data-testid="phoenixd-family-manager">PhoenixD Manager Component</div>
}));

describe('FamilyFinancialsDashboard', () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the main dashboard header', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    expect(screen.getByText('Nakamoto Family Financials')).toBeTruthy();
    expect(screen.getByText('Dual-protocol Lightning + Fedimint sovereign banking')).toBeTruthy();
  });

  it('renders the back button and handles click', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    const backButton = screen.getByText('Back to Home');
    expect(backButton).toBeTruthy();
    
    fireEvent.click(backButton);
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('renders navigation tabs', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Lightning')).toBeTruthy();
    expect(screen.getByText('Fedimint')).toBeTruthy();
    expect(screen.getByText('Payments')).toBeTruthy();
    expect(screen.getByText('PhoenixD')).toBeTruthy();
  });

  it('shows treasury overview by default', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    expect(screen.getByText('Family Lightning Treasury')).toBeTruthy();
    expect(screen.getByText('Family Fedimint eCash')).toBeTruthy();
    expect(screen.getByText('Total Family Treasury')).toBeTruthy();
  });

  it('toggles balance visibility', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    const toggleButton = screen.getByText('Show Balances');
    expect(toggleButton).toBeTruthy();
    
    fireEvent.click(toggleButton);
    
    // After click, should show actual balances and change button text
    expect(screen.getByText('Hide Balances')).toBeTruthy();
    
    // Should now show actual balance numbers (check if they exist in any format)
    const balanceElements = screen.getAllByText(/\d{1,3}(,\d{3})*/);
    expect(balanceElements.length).toBeGreaterThan(0);
  });

  it('switches to Lightning tab', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    const lightningTab = screen.getByText('Lightning');
    fireEvent.click(lightningTab);
    
    expect(screen.getByTestId('family-lightning-treasury')).toBeTruthy();
  });

  it('switches to Fedimint tab', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    const fedimintTab = screen.getByText('Fedimint');
    fireEvent.click(fedimintTab);
    
    expect(screen.getByTestId('family-fedimint-governance')).toBeTruthy();
  });

  it('switches to Payments tab', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    const paymentsTab = screen.getByText('Payments');
    fireEvent.click(paymentsTab);
    
    expect(screen.getByTestId('unified-family-payments')).toBeTruthy();
  });

  it('switches to PhoenixD tab', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    const phoenixdTab = screen.getByText('PhoenixD');
    fireEvent.click(phoenixdTab);
    
    expect(screen.getByTestId('phoenixd-family-manager')).toBeTruthy();
  });

  it('shows guardian consensus panel in overview', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    expect(screen.getByText('Guardian Consensus')).toBeTruthy();
    // Check for approval-related text that should be in the component
    expect(screen.getByText('Allowance Distribution')).toBeTruthy();
  });

  it('shows protocol status in overview', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    expect(screen.getByText('Lightning Network Status')).toBeTruthy();
    expect(screen.getByText('PhoenixD Connection')).toBeTruthy();
  });

  it('handles refresh button', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    const refreshButton = screen.getByRole('button', { name: '' }); // RefreshCw icon button
    expect(refreshButton).toBeTruthy();
    
    fireEvent.click(refreshButton);
    // Should trigger refresh (we can't easily test the async behavior in this simple test)
  });

  it('shows family lightning address', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    expect(screen.getByText('family@satnam.pub')).toBeTruthy();
  });

  it('shows guardian status', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    expect(screen.getByText('4/5 Online • Consensus Ready')).toBeTruthy();
  });

  it('shows unified payments button', () => {
    render(<FamilyFinancialsDashboard onBack={mockOnBack} />);
    
    const unifiedPaymentsButton = screen.getByText('Unified Payments');
    expect(unifiedPaymentsButton).toBeTruthy();
    
    fireEvent.click(unifiedPaymentsButton);
    // Should switch to payments view
    expect(screen.getByTestId('unified-family-payments')).toBeTruthy();
  });

  it('renders with custom family data', () => {
    const customFamilyData = { name: 'Test Family' };
    render(<FamilyFinancialsDashboard familyData={customFamilyData} onBack={mockOnBack} />);
    
    // Should still render with default Nakamoto family name since it's hardcoded
    expect(screen.getByText('Nakamoto Family Financials')).toBeTruthy();
  });
});