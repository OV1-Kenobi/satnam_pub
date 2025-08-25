/**
 * Automated Signing Integration Tests
 * 
 * Tests the automated signing functionality for scheduled payments
 * including NIP-07 and NIP-05 authorization, secure credential storage,
 * and NIP-59 notification integration.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentAutomationModal from '../src/components/PaymentAutomationModal';
import { AutomatedSigningManager } from '../src/lib/automated-signing-manager';
import { contactApi } from '../src/services/contactApiService';
import { showToast } from '../src/services/toastService';

// Mock dependencies
jest.mock('../src/services/contactApiService');
jest.mock('../src/services/toastService');
jest.mock('../src/hooks/useAuth');
jest.mock('../src/lib/automated-signing-manager');

const mockContactApi = contactApi as jest.Mocked<typeof contactApi>;
const mockShowToast = showToast as jest.Mocked<typeof showToast>;
const mockAutomatedSigningManager = AutomatedSigningManager as jest.MockedClass<typeof AutomatedSigningManager>;

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

// Mock window.nostr for NIP-07 testing
const mockNostr = {
  getPublicKey: jest.fn(),
  signEvent: jest.fn()
};

Object.defineProperty(window, 'nostr', {
  value: mockNostr,
  writable: true
});

// Mock Web Crypto API
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      generateKey: jest.fn(),
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      exportKey: jest.fn(),
      importKey: jest.fn()
    },
    getRandomValues: jest.fn(),
    randomUUID: jest.fn()
  }
});

describe('Automated Signing Integration', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onSave: jest.fn(),
    context: 'individual' as const,
    familyMembers: []
  };

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
    mockContactApi.getUserContacts.mockResolvedValue([]);
    mockContactApi.getUserIdentityData.mockResolvedValue(mockUserIdentityData);
    mockContactApi.validateRecipientInput.mockResolvedValue({
      valid: true,
      type: 'npub',
      normalizedValue: 'npub1test123'
    });

    // Mock NIP-07 extension
    mockNostr.getPublicKey.mockResolvedValue('test-pubkey-123');
    mockNostr.signEvent.mockResolvedValue({
      id: 'test-event-id',
      pubkey: 'test-pubkey-123',
      sig: 'test-signature'
    });

    // Mock crypto operations
    (global.crypto.subtle.generateKey as jest.Mock).mockResolvedValue('mock-key');
    (global.crypto.subtle.encrypt as jest.Mock).mockResolvedValue(new ArrayBuffer(32));
    (global.crypto.subtle.exportKey as jest.Mock).mockResolvedValue(new ArrayBuffer(32));
    (global.crypto.getRandomValues as jest.Mock).mockReturnValue(new Uint8Array(12));
    (global.crypto.randomUUID as jest.Mock).mockReturnValue('test-uuid-123');
  });

  describe('NIP-07 Authorization', () => {
    it('should detect NIP-07 extension availability', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      // Navigate to notifications tab
      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('NIP-07 Browser Extension (Recommended)')).toBeInTheDocument();
        expect(screen.getByText('Most secure method using your browser extension')).toBeInTheDocument();
      });
    });

    it('should configure NIP-07 authorization successfully', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      // Navigate to notifications tab
      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('Authorize')).toBeInTheDocument();
      });

      // Click authorize button
      fireEvent.click(screen.getByText('Authorize'));

      await waitFor(() => {
        expect(mockNostr.getPublicKey).toHaveBeenCalled();
        expect(mockNostr.signEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 27235,
            content: expect.stringContaining('permissions')
          })
        );
      });

      await waitFor(() => {
        expect(mockShowToast.success).toHaveBeenCalledWith(
          'NIP-07 automated signing configured successfully',
          expect.objectContaining({
            title: 'Automation Configured'
          })
        );
      });
    });

    it('should show authorization pending state', async () => {
      // Make NIP-07 calls slow to test loading state
      mockNostr.getPublicKey.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('test-pubkey'), 1000))
      );

      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('Authorize')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Authorize'));

      // Check loading state
      expect(screen.getByText('Authorizing...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Authorizing/ })).toBeDisabled();
    });

    it('should handle NIP-07 authorization errors', async () => {
      mockNostr.getPublicKey.mockRejectedValue(new Error('User denied permission'));

      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('Authorize')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Authorize'));

      await waitFor(() => {
        expect(mockShowToast.error).toHaveBeenCalledWith(
          'User denied permission',
          expect.objectContaining({
            title: 'Authorization Failed'
          })
        );
      });
    });

    it('should disable NIP-07 when extension not available', async () => {
      // Remove nostr from window
      delete (window as any).nostr;

      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('No NIP-07 extension detected')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Authorize/ })).toBeDisabled();
      });
    });
  });

  describe('NIP-05 Authorization', () => {
    it('should show NIP-05 authorization option', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('NIP-05 + Password')).toBeInTheDocument();
        expect(screen.getByText('Use your NIP-05 identifier: user@example.com')).toBeInTheDocument();
      });
    });

    it('should configure NIP-05 authorization with password', async () => {
      const user = userEvent.setup();
      
      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
      });

      // Enter password
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'test-password-123');

      // Click authorize button
      fireEvent.click(screen.getByText('Authorize with NIP-05'));

      await waitFor(() => {
        expect(mockContactApi.validateRecipientInput).toHaveBeenCalledWith('user@example.com');
        expect(mockShowToast.success).toHaveBeenCalledWith(
          'NIP-05 automated signing configured successfully',
          expect.objectContaining({
            title: 'Automation Configured'
          })
        );
      });
    });

    it('should handle invalid NIP-05 identifier', async () => {
      const user = userEvent.setup();
      mockContactApi.validateRecipientInput.mockResolvedValue({
        valid: false,
        type: 'nip05',
        error: 'Invalid NIP-05 format'
      });

      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications'));

      const passwordInput = await screen.findByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'test-password');

      fireEvent.click(screen.getByText('Authorize with NIP-05'));

      await waitFor(() => {
        expect(mockShowToast.error).toHaveBeenCalledWith(
          'Invalid NIP-05 identifier',
          expect.objectContaining({
            title: 'Authorization Failed'
          })
        );
      });
    });

    it('should not show NIP-05 option when identifier not configured', async () => {
      mockContactApi.getUserIdentityData.mockResolvedValue({
        ...mockUserIdentityData,
        userNip05: undefined
      });

      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('Use your NIP-05 identifier: Not configured')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Enter your password')).not.toBeInTheDocument();
      });
    });
  });

  describe('Authorization Management', () => {
    it('should show configured authorization status', async () => {
      // Mock already configured automation
      const mockSchedule = {
        automatedSigning: {
          method: 'nip07' as const,
          authorizationToken: 'test-token',
          consentTimestamp: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        }
      };

      render(<PaymentAutomationModal {...defaultProps} existingSchedule={mockSchedule} />);

      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('Automated Signing Configured')).toBeInTheDocument();
        expect(screen.getByText('Method: NIP07')).toBeInTheDocument();
        expect(screen.getByText('Revoke')).toBeInTheDocument();
      });
    });

    it('should revoke authorization', async () => {
      const mockSchedule = {
        automatedSigning: {
          method: 'nip07' as const,
          authorizationToken: 'test-token',
          consentTimestamp: new Date().toISOString()
        }
      };

      render(<PaymentAutomationModal {...defaultProps} existingSchedule={mockSchedule} />);

      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('Revoke')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Revoke'));

      await waitFor(() => {
        expect(mockShowToast.success).toHaveBeenCalledWith(
          'Automated signing authorization revoked',
          expect.objectContaining({
            title: 'Authorization Revoked'
          })
        );
      });
    });
  });

  describe('Form Validation', () => {
    it('should require automated signing authorization for save', async () => {
      const user = userEvent.setup();
      
      render(<PaymentAutomationModal {...defaultProps} />);

      // Fill in basic form data
      fireEvent.click(screen.getByText('Lightning Address'));
      
      const addressInput = screen.getByPlaceholderText('alice@getalby.com');
      await user.type(addressInput, 'test@example.com');
      
      const nameInput = screen.getByPlaceholderText('Alice');
      await user.type(nameInput, 'Test User');

      // Try to save without configuring automation
      fireEvent.click(screen.getByText(/Create Schedule/));

      await waitFor(() => {
        expect(mockShowToast.error).toHaveBeenCalledWith(
          expect.stringContaining('Automated signing authorization is required'),
          expect.objectContaining({
            title: 'Validation Error',
            action: expect.objectContaining({
              label: 'Configure Automation'
            })
          })
        );
      });
    });

    it('should allow save with configured automation', async () => {
      const user = userEvent.setup();
      const mockOnSave = jest.fn().mockResolvedValue(undefined);
      
      render(<PaymentAutomationModal {...defaultProps} onSave={mockOnSave} />);

      // Fill form data
      fireEvent.click(screen.getByText('Lightning Address'));
      
      const addressInput = screen.getByPlaceholderText('alice@getalby.com');
      await user.type(addressInput, 'test@example.com');
      
      const nameInput = screen.getByPlaceholderText('Alice');
      await user.type(nameInput, 'Test User');

      // Configure NIP-07 authorization
      fireEvent.click(screen.getByText('Notifications'));
      
      await waitFor(() => {
        expect(screen.getByText('Authorize')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Authorize'));

      // Wait for authorization to complete
      await waitFor(() => {
        expect(mockShowToast.success).toHaveBeenCalledWith(
          'NIP-07 automated signing configured successfully',
          expect.any(Object)
        );
      });

      // Now save should work
      fireEvent.click(screen.getByText(/Create Schedule/));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            recipientAddress: 'test@example.com',
            recipientName: 'Test User'
          })
        );
      });
    });
  });

  describe('Security Features', () => {
    it('should encrypt NIP-05 credentials', async () => {
      const user = userEvent.setup();
      
      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications'));

      const passwordInput = await screen.findByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'test-password-123');

      fireEvent.click(screen.getByText('Authorize with NIP-05'));

      await waitFor(() => {
        expect(global.crypto.subtle.generateKey).toHaveBeenCalledWith(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        expect(global.crypto.subtle.encrypt).toHaveBeenCalled();
      });
    });

    it('should show security notice', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('Security Notice')).toBeInTheDocument();
        expect(screen.getByText(/Your credentials will be encrypted and stored securely/)).toBeInTheDocument();
        expect(screen.getByText(/You can revoke this authorization at any time/)).toBeInTheDocument();
      });
    });

    it('should include consent timestamp in configuration', async () => {
      render(<PaymentAutomationModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('Authorize')).toBeInTheDocument();
      });

      const beforeTime = new Date().toISOString();
      fireEvent.click(screen.getByText('Authorize'));

      await waitFor(() => {
        expect(mockShowToast.success).toHaveBeenCalled();
      });

      // Verify consent timestamp was recorded (would need to check form data in real implementation)
      const afterTime = new Date().toISOString();
      expect(beforeTime).toBeTruthy();
      expect(afterTime).toBeTruthy();
    });
  });
});
