/**
 * Dashboard Payment Automation Integration Tests
 * 
 * Tests the integration of the production-ready PaymentAutomationModal
 * with both FamilyFinancialsDashboard and IndividualFinancesDashboard.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FamilyFinancialsDashboard from '../src/components/FamilyFinancialsDashboard';
import IndividualFinancesDashboard from '../src/components/IndividualFinancesDashboard';
import { contactApi } from '../src/services/contactApiService';
import { showToast } from '../src/services/toastService';

// Mock dependencies
jest.mock('../src/services/contactApiService');
jest.mock('../src/services/toastService');
jest.mock('../src/hooks/useAuth');
jest.mock('../src/hooks/useNWCWallet');

const mockContactApi = contactApi as jest.Mocked<typeof contactApi>;
const mockShowToast = showToast as jest.Mocked<typeof showToast>;

// Mock useAuth hook
const mockUseAuth = {
  user: {
    hashedUUID: 'test-user-123',
    id: 'test-user-123',
    username: 'testuser'
  },
  authenticated: true,
  userRole: 'adult'
};

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth
}));

// Mock useNWCWallet hook
jest.mock('../src/hooks/useNWCWallet', () => ({
  useNWCWallet: () => ({
    connections: [],
    primaryConnection: null,
    balance: 0,
    isConnected: false
  })
}));

// Mock SecureTokenManager
jest.mock('../src/lib/auth/secure-token-manager', () => ({
  SecureTokenManager: {
    getAccessToken: () => 'mock-jwt-token'
  }
}));

// Mock family wallet API
jest.mock('../src/services/familyWalletApi', () => ({
  getAllFamilyWalletData: jest.fn().mockResolvedValue({
    familyBalance: 1000000,
    permissions: { canApproveSpending: true },
    members: []
  }),
  checkFamilyPermissions: jest.fn().mockResolvedValue({
    canApproveSpending: true,
    votingPower: 1,
    familyRole: 'adult'
  })
}));

describe('Dashboard Payment Automation Integration', () => {
  const mockContacts = [
    {
      id: 'contact-1',
      type: 'contact' as const,
      displayName: 'Alice Bitcoin',
      npub: 'npub1test123',
      lightningAddress: 'alice@getalby.com',
      trustLevel: 'trusted' as const,
      verified: true
    }
  ];

  const mockUserIdentityData = {
    userNpub: 'npub1user123',
    userNip05: 'user@example.com',
    userLightningAddress: 'user@wallet.com',
    preferredSigningMethod: 'nip07' as const,
    hasNip07Extension: true
  };

  const mockFamilyMembers = [
    {
      id: 'member-1',
      username: 'alice',
      name: 'Alice Family',
      role: 'adult',
      avatar: 'A',
      lightningAddress: 'alice@family.com',
      nostrPubkey: 'test123pubkey',
      nip05: 'alice@family.com'
    },
    {
      id: 'member-2',
      username: 'bob',
      name: 'Bob Family',
      role: 'offspring',
      avatar: 'B',
      nostrPubkey: 'test456pubkey'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    mockContactApi.getUserContacts.mockResolvedValue(mockContacts);
    mockContactApi.getUserIdentityData.mockResolvedValue(mockUserIdentityData);
    mockContactApi.searchContacts.mockResolvedValue([]);
    mockContactApi.validateRecipientInput.mockResolvedValue({
      valid: true,
      type: 'npub',
      normalizedValue: 'npub1test123'
    });
  });

  describe('FamilyFinancialsDashboard Integration', () => {
    const familyProps = {
      familyFederationData: {
        federationDuid: 'family-123',
        familyName: 'Test Family',
        members: mockFamilyMembers
      },
      onBack: jest.fn()
    };

    it('should render Create Payment Schedule button in Quick Actions', async () => {
      render(<FamilyFinancialsDashboard {...familyProps} />);

      await waitFor(() => {
        expect(screen.getByText('Create Payment Schedule')).toBeInTheDocument();
      });
    });

    it('should open PaymentAutomationModal with family context', async () => {
      render(<FamilyFinancialsDashboard {...familyProps} />);

      // Click Create Payment Schedule button
      const createButton = await screen.findByText('Create Payment Schedule');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Payment Automation')).toBeInTheDocument();
        expect(screen.getByText('Family Member')).toBeInTheDocument();
      });
    });

    it('should pass correct family member data to modal', async () => {
      render(<FamilyFinancialsDashboard {...familyProps} />);

      // Open modal
      const createButton = await screen.findByText('Create Payment Schedule');
      fireEvent.click(createButton);

      // Select family member recipient type
      await waitFor(() => {
        expect(screen.getByText('Family Member')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Family Member'));

      // Check if family members are displayed
      await waitFor(() => {
        expect(screen.getByText('Alice Family')).toBeInTheDocument();
        expect(screen.getByText('Bob Family')).toBeInTheDocument();
      });

      // Verify Lightning addresses and npubs are shown
      expect(screen.getByText('⚡ alice@family.com')).toBeInTheDocument();
      expect(screen.getByText('🔑 npub1test123pubkey...')).toBeInTheDocument();
    });

    it('should handle payment schedule save with family context', async () => {
      const mockOnSave = jest.fn().mockResolvedValue(undefined);
      
      render(<FamilyFinancialsDashboard {...familyProps} />);

      // Open modal and fill form
      const createButton = await screen.findByText('Create Payment Schedule');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Family Member')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Family Member'));

      // Select Alice as recipient
      await waitFor(() => {
        expect(screen.getByText('Alice Family')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Alice Family'));

      // Save the schedule
      const saveButton = screen.getByText(/Create Schedule/);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockShowToast.success).toHaveBeenCalledWith(
          'Payment schedule created successfully',
          expect.objectContaining({
            title: 'Schedule Saved'
          })
        );
      });
    });
  });

  describe('IndividualFinancesDashboard Integration', () => {
    it('should render Create Payment Schedule button in Quick Actions', async () => {
      render(<IndividualFinancesDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Create Payment Schedule')).toBeInTheDocument();
      });
    });

    it('should open PaymentAutomationModal with individual context', async () => {
      render(<IndividualFinancesDashboard />);

      // Click Create Payment Schedule button
      const createButton = await screen.findByText('Create Payment Schedule');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Payment Automation')).toBeInTheDocument();
        // Should not show Family Member option in individual context
        expect(screen.queryByText('Family Member')).not.toBeInTheDocument();
        // Should show contact and external options
        expect(screen.getByText('Saved Contact')).toBeInTheDocument();
        expect(screen.getByText('Lightning Address')).toBeInTheDocument();
      });
    });

    it('should handle contact selection in individual context', async () => {
      render(<IndividualFinancesDashboard />);

      // Open modal
      const createButton = await screen.findByText('Create Payment Schedule');
      fireEvent.click(createButton);

      // Select contact recipient type
      await waitFor(() => {
        expect(screen.getByText('Saved Contact')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Saved Contact'));

      // Check if contacts are loaded and displayed
      await waitFor(() => {
        expect(mockContactApi.getUserContacts).toHaveBeenCalledWith('test-user-123');
        expect(screen.getByText('Alice Bitcoin')).toBeInTheDocument();
      });
    });

    it('should handle external recipient validation', async () => {
      const user = userEvent.setup();
      render(<IndividualFinancesDashboard />);

      // Open modal
      const createButton = await screen.findByText('Create Payment Schedule');
      fireEvent.click(createButton);

      // Select Lightning Address type
      await waitFor(() => {
        expect(screen.getByText('Lightning Address')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Lightning Address'));

      // Enter Lightning address
      const addressInput = screen.getByPlaceholderText('alice@getalby.com');
      await user.type(addressInput, 'test@example.com');

      await waitFor(() => {
        expect(mockContactApi.validateRecipientInput).toHaveBeenCalledWith('test@example.com');
      });
    });

    it('should show individual-specific signing methods', async () => {
      render(<IndividualFinancesDashboard />);

      // Open modal and navigate to notifications tab
      const createButton = await screen.findByText('Create Payment Schedule');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Notifications'));

      // Check for signing method options
      await waitFor(() => {
        expect(screen.getByText('NIP-07 Browser Extension (Recommended)')).toBeInTheDocument();
        expect(screen.getByText('Use your NIP-05 identifier: user@example.com')).toBeInTheDocument();
      });
    });
  });

  describe('Context-Aware Styling', () => {
    it('should use orange theme for family context', async () => {
      const familyProps = {
        familyFederationData: {
          federationDuid: 'family-123',
          familyName: 'Test Family',
          members: mockFamilyMembers
        },
        onBack: jest.fn()
      };

      render(<FamilyFinancialsDashboard {...familyProps} />);

      const createButton = await screen.findByText('Create Payment Schedule');
      fireEvent.click(createButton);

      await waitFor(() => {
        // Check for orange-themed elements in family context
        const familyMemberOption = screen.getByText('Family Member');
        expect(familyMemberOption.closest('button')).toHaveClass('focus:ring-orange-500');
      });
    });

    it('should use blue theme for individual context', async () => {
      render(<IndividualFinancesDashboard />);

      const createButton = await screen.findByText('Create Payment Schedule');
      fireEvent.click(createButton);

      await waitFor(() => {
        // Check for blue-themed elements in individual context
        const contactOption = screen.getByText('Saved Contact');
        expect(contactOption.closest('button')).toHaveClass('focus:ring-blue-500');
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle contact loading errors gracefully', async () => {
      mockContactApi.getUserContacts.mockRejectedValue(new Error('Network error'));

      render(<IndividualFinancesDashboard />);

      const createButton = await screen.findByText('Create Payment Schedule');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockShowToast.error).toHaveBeenCalledWith(
          'Failed to load contact data',
          expect.objectContaining({
            title: 'Loading Error'
          })
        );
      });
    });

    it('should handle save errors with retry functionality', async () => {
      const user = userEvent.setup();
      
      render(<IndividualFinancesDashboard />);

      // Open modal and fill minimal form
      const createButton = await screen.findByText('Create Payment Schedule');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Lightning Address')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Lightning Address'));

      const addressInput = screen.getByPlaceholderText('alice@getalby.com');
      await user.type(addressInput, 'test@example.com');
      
      const nameInput = screen.getByPlaceholderText('Alice');
      await user.type(nameInput, 'Test User');

      // Mock save failure
      const mockHandleRefresh = jest.fn().mockRejectedValue(new Error('Save failed'));

      const saveButton = screen.getByText(/Create Schedule/);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockShowToast.error).toHaveBeenCalledWith(
          'Failed to save payment schedule',
          expect.objectContaining({
            title: 'Save Error',
            action: expect.objectContaining({
              label: 'Retry'
            })
          })
        );
      });
    });
  });

  describe('Dashboard State Management', () => {
    it('should refresh family dashboard data after successful save', async () => {
      const familyProps = {
        familyFederationData: {
          federationDuid: 'family-123',
          familyName: 'Test Family',
          members: mockFamilyMembers
        },
        onBack: jest.fn()
      };

      render(<FamilyFinancialsDashboard {...familyProps} />);

      // Open modal, select family member, and save
      const createButton = await screen.findByText('Create Payment Schedule');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Family Member')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Family Member'));

      await waitFor(() => {
        expect(screen.getByText('Alice Family')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Alice Family'));

      const saveButton = screen.getByText(/Create Schedule/);
      fireEvent.click(saveButton);

      // Verify success and modal closure
      await waitFor(() => {
        expect(mockShowToast.success).toHaveBeenCalledWith(
          'Payment schedule created successfully',
          expect.objectContaining({
            title: 'Schedule Saved'
          })
        );
      });
    });
  });
});
