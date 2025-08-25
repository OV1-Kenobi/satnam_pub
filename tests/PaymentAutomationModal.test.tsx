/**
 * PaymentAutomationModal Integration Tests
 * 
 * Tests the production-ready payment automation modal with full
 * contact system integration, authentication, and validation.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentAutomationModal from '../src/components/PaymentAutomationModal';
import { contactApi } from '../src/services/contactApiService';
import { showToast } from '../src/services/toastService';

// Mock dependencies
jest.mock('../src/services/contactApiService');
jest.mock('../src/services/toastService');
jest.mock('../src/hooks/useAuth');

const mockContactApi = contactApi as jest.Mocked<typeof contactApi>;
const mockShowToast = showToast as jest.Mocked<typeof showToast>;

// Mock useAuth hook
const mockUseAuth = {
  user: {
    hashedUUID: 'test-user-123',
    id: 'test-user-123'
  },
  authenticated: true
};

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth
}));

// Mock SecureTokenManager
jest.mock('../src/lib/auth/secure-token-manager', () => ({
  SecureTokenManager: {
    getAccessToken: () => 'mock-jwt-token'
  }
}));

describe('PaymentAutomationModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onSave: jest.fn(),
    context: 'individual' as const,
    familyMembers: []
  };

  const mockContacts = [
    {
      id: 'contact-1',
      type: 'contact' as const,
      displayName: 'Alice Bitcoin',
      npub: 'npub1test123',
      lightningAddress: 'alice@getalby.com',
      trustLevel: 'trusted' as const,
      verified: true
    },
    {
      id: 'contact-2',
      type: 'family_member' as const,
      displayName: 'Bob Family',
      nip05: 'bob@family.com',
      familyRole: 'adult' as const,
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

  describe('Authentication Integration', () => {
    it('should initialize with production authentication', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      await waitFor(() => {
        expect(mockContactApi.setAuthToken).toHaveBeenCalledWith('mock-jwt-token');
      });
    });

    it('should load user contacts and identity data on open', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      await waitFor(() => {
        expect(mockContactApi.getUserContacts).toHaveBeenCalledWith('test-user-123');
        expect(mockContactApi.getUserIdentityData).toHaveBeenCalledWith('test-user-123');
      });
    });

    it('should show success toast when contacts are loaded', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      await waitFor(() => {
        expect(mockShowToast.success).toHaveBeenCalledWith(
          'Loaded 2 contacts',
          expect.objectContaining({
            title: 'Contacts Loaded',
            duration: 3000
          })
        );
      });
    });
  });

  describe('Contact System Integration', () => {
    it('should display contact selection for contact recipient type', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      // Wait for contacts to load
      await waitFor(() => {
        expect(screen.getByText('Saved Contact')).toBeInTheDocument();
      });

      // Select contact recipient type
      fireEvent.click(screen.getByText('Saved Contact'));

      await waitFor(() => {
        expect(screen.getByText('Select Contact *')).toBeInTheDocument();
        expect(screen.getByText('Alice Bitcoin')).toBeInTheDocument();
        expect(screen.getByText('Bob Family')).toBeInTheDocument();
      });
    });

    it('should handle contact search', async () => {
      const user = userEvent.setup();
      mockContactApi.searchContacts.mockResolvedValue([mockContacts[0]]);

      render(<PaymentAutomationModal {...defaultProps} />);

      // Wait for contacts to load and select contact type
      await waitFor(() => {
        expect(screen.getByText('Saved Contact')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Saved Contact'));

      // Search for contacts
      const searchInput = screen.getByPlaceholderText(/Search contacts/);
      await user.type(searchInput, 'Alice');

      await waitFor(() => {
        expect(mockContactApi.searchContacts).toHaveBeenCalledWith('test-user-123', 'Alice');
      });
    });

    it('should select contact and populate form data', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Saved Contact')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Saved Contact'));

      await waitFor(() => {
        expect(screen.getByText('Alice Bitcoin')).toBeInTheDocument();
      });

      // Select Alice Bitcoin contact
      fireEvent.click(screen.getByText('Alice Bitcoin'));

      // Verify form is populated
      await waitFor(() => {
        const displayNameInput = screen.getByDisplayValue('Alice Bitcoin');
        expect(displayNameInput).toBeInTheDocument();
      });
    });
  });

  describe('Input Validation', () => {
    it('should validate external npub input', async () => {
      const user = userEvent.setup();
      render(<PaymentAutomationModal {...defaultProps} />);

      // Select npub recipient type
      await waitFor(() => {
        expect(screen.getByText('Nostr Profile (npub)')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Nostr Profile (npub)'));

      // Enter npub
      const npubInput = screen.getByPlaceholderText('npub1...');
      await user.type(npubInput, 'npub1test123');

      await waitFor(() => {
        expect(mockContactApi.validateRecipientInput).toHaveBeenCalledWith('npub1test123');
      });
    });

    it('should show validation feedback', async () => {
      const user = userEvent.setup();
      mockContactApi.validateRecipientInput.mockResolvedValue({
        valid: true,
        type: 'npub',
        normalizedValue: 'npub1test123',
        metadata: { verified: true }
      });

      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Nostr Profile (npub)'));

      const npubInput = screen.getByPlaceholderText('npub1...');
      await user.type(npubInput, 'npub1test123');

      await waitFor(() => {
        expect(screen.getByText('Valid npub (verified)')).toBeInTheDocument();
      });
    });

    it('should show validation errors', async () => {
      const user = userEvent.setup();
      mockContactApi.validateRecipientInput.mockResolvedValue({
        valid: false,
        type: 'npub',
        error: 'Invalid npub format'
      });

      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Nostr Profile (npub)'));

      const npubInput = screen.getByPlaceholderText('npub1...');
      await user.type(npubInput, 'invalid-npub');

      await waitFor(() => {
        expect(screen.getByText('Invalid npub format')).toBeInTheDocument();
      });
    });
  });

  describe('Authentication Method Selection', () => {
    it('should show NIP-07 as preferred when available', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      // Navigate to notifications tab
      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('NIP-07 Browser Extension (Recommended)')).toBeInTheDocument();
      });
    });

    it('should disable NIP-07 when extension not available', async () => {
      mockContactApi.getUserIdentityData.mockResolvedValue({
        ...mockUserIdentityData,
        hasNip07Extension: false,
        preferredSigningMethod: 'nip05'
      });

      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('No NIP-07 extension detected')).toBeInTheDocument();
      });
    });

    it('should show user NIP-05 identifier', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('Use your NIP-05 identifier: user@example.com')).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation and Submission', () => {
    it('should validate required fields before submission', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      // Try to save without filling required fields
      fireEvent.click(screen.getByText(/Create Schedule/));

      await waitFor(() => {
        expect(mockShowToast.error).toHaveBeenCalledWith(
          expect.stringContaining('Recipient information is required'),
          expect.objectContaining({
            title: 'Validation Error'
          })
        );
      });
    });

    it('should validate minimum amount', async () => {
      const user = userEvent.setup();
      render(<PaymentAutomationModal {...defaultProps} />);

      // Fill in recipient info
      fireEvent.click(screen.getByText('Lightning Address'));
      
      const addressInput = screen.getByPlaceholderText('alice@getalby.com');
      await user.type(addressInput, 'test@example.com');
      
      const nameInput = screen.getByPlaceholderText('Alice');
      await user.type(nameInput, 'Test User');

      // Set amount below minimum
      const amountInput = screen.getByDisplayValue('21000');
      await user.clear(amountInput);
      await user.type(amountInput, '500');

      fireEvent.click(screen.getByText(/Create Schedule/));

      await waitFor(() => {
        expect(mockShowToast.error).toHaveBeenCalledWith(
          expect.stringContaining('Amount must be at least 1,000 sats'),
          expect.objectContaining({
            title: 'Validation Error'
          })
        );
      });
    });

    it('should save valid payment schedule', async () => {
      const user = userEvent.setup();
      const mockOnSave = jest.fn().mockResolvedValue(undefined);
      
      render(<PaymentAutomationModal {...defaultProps} onSave={mockOnSave} />);

      // Fill in valid form data
      fireEvent.click(screen.getByText('Lightning Address'));
      
      const addressInput = screen.getByPlaceholderText('alice@getalby.com');
      await user.type(addressInput, 'test@example.com');
      
      const nameInput = screen.getByPlaceholderText('Alice');
      await user.type(nameInput, 'Test User');

      fireEvent.click(screen.getByText(/Create Schedule/));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'test-user-123',
            recipientType: 'ln_address',
            recipientAddress: 'test@example.com',
            recipientName: 'Test User',
            amount: 21000
          })
        );
      });

      expect(mockShowToast.success).toHaveBeenCalledWith(
        'Payment schedule created successfully',
        expect.objectContaining({
          title: 'Schedule Saved'
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle contact loading errors', async () => {
      mockContactApi.getUserContacts.mockRejectedValue(new Error('Network error'));

      render(<PaymentAutomationModal {...defaultProps} />);

      await waitFor(() => {
        expect(mockShowToast.error).toHaveBeenCalledWith(
          'Failed to load contact data',
          expect.objectContaining({
            title: 'Loading Error'
          })
        );
      });
    });

    it('should handle save errors with retry option', async () => {
      const mockOnSave = jest.fn().mockRejectedValue(new Error('Save failed'));
      
      render(<PaymentAutomationModal {...defaultProps} onSave={mockOnSave} />);

      // Fill in valid form data and save
      fireEvent.click(screen.getByText('Lightning Address'));
      
      const addressInput = screen.getByPlaceholderText('alice@getalby.com');
      await userEvent.type(addressInput, 'test@example.com');
      
      const nameInput = screen.getByPlaceholderText('Alice');
      await userEvent.type(nameInput, 'Test User');

      fireEvent.click(screen.getByText(/Create Schedule/));

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

  describe('Loading States', () => {
    it('should show loading state while saving', async () => {
      const mockOnSave = jest.fn(() => new Promise(resolve => setTimeout(resolve, 1000)));
      
      render(<PaymentAutomationModal {...defaultProps} onSave={mockOnSave} />);

      // Fill form and save
      fireEvent.click(screen.getByText('Lightning Address'));
      
      const addressInput = screen.getByPlaceholderText('alice@getalby.com');
      await userEvent.type(addressInput, 'test@example.com');
      
      const nameInput = screen.getByPlaceholderText('Alice');
      await userEvent.type(nameInput, 'Test User');

      fireEvent.click(screen.getByText(/Create Schedule/));

      // Check loading state
      expect(screen.getByText('Saving...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
    });

    it('should show loading state while loading contacts', () => {
      // Mock delayed contact loading
      mockContactApi.getUserContacts.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockContacts), 1000))
      );

      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Saved Contact'));

      expect(screen.getByText('Loading contacts...')).toBeInTheDocument();
    });
  });
});
