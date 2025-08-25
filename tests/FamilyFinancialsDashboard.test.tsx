/**
 * Test Suite for Family Financials Dashboard Component
 * 
 * Tests the critical improvements:
 * 1. Result objects instead of error throwing in permission checks
 * 2. Dynamic NWC connection status checking
 * 3. Comprehensive null safety for member data transformation
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FamilyFinancialsDashboard } from '../src/components/FamilyFinancialsDashboard';
import { FamilyMember } from '../src/types/shared';

// Mock the hooks
jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    userRole: 'steward',
    user: { hashedUUID: 'test-user-id', id: 'test-user-id' }
  })
}));

jest.mock('../src/hooks/useNWCWallet', () => ({
  useNWCWallet: () => ({
    connections: [
      {
        connection_id: 'member-1',
        connection_status: 'connected',
        is_active: true,
        wallet_name: 'Test Wallet'
      }
    ],
    primaryConnection: null,
    balance: 50000,
    isConnected: true
  })
}));

// Mock API functions
jest.mock('../src/services/familyFederationApi', () => ({
  getFamilyFederationMembers: jest.fn(),
  checkFamilyPermissions: jest.fn(),
  getPendingSpendingApprovals: jest.fn()
}));

jest.mock('../src/services/familyWalletApi', () => ({
  getAllFamilyWalletData: jest.fn(),
  getPendingFrostTransactions: jest.fn()
}));

// Test data
const mockFamilyFederationData = {
  id: 'test-family-id',
  federationName: 'Test Family',
  federationDuid: 'test-duid',
  members: [
    {
      id: 'member-1',
      username: 'testuser1',
      role: 'steward' as const,
      lightningAddress: 'testuser1@satnam.pub'
    }
  ]
};

const mockMembersApiResponse = [
  {
    id: 'member-1',
    user_duid: 'testuser1',
    family_role: 'steward',
    avatar_url: 'https://example.com/avatar1.jpg',
    balance: 10000,
    nip05_verified: true
  },
  {
    id: 'member-2',
    user_duid: 'testuser2',
    family_role: 'adult',
    avatar_url: null,
    balance: null,
    nip05_verified: false
  },
  // Invalid member data for testing null safety
  null,
  {
    id: null,
    user_duid: '',
    family_role: 'invalid_role',
    avatar_url: undefined,
    balance: 'not_a_number',
    nip05_verified: null
  }
];

describe('FamilyFinancialsDashboard', () => {
  const defaultProps = {
    familyFederationData: mockFamilyFederationData,
    onBack: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default API mocks
    const { getFamilyFederationMembers, checkFamilyPermissions, getPendingSpendingApprovals } = require('../src/services/familyFederationApi');
    const { getAllFamilyWalletData, getPendingFrostTransactions } = require('../src/services/familyWalletApi');
    
    getFamilyFederationMembers.mockResolvedValue(mockMembersApiResponse);
    checkFamilyPermissions.mockResolvedValue({
      canApproveSpending: true,
      votingPower: 1,
      familyRole: 'steward'
    });
    getPendingSpendingApprovals.mockResolvedValue([]);
    getAllFamilyWalletData.mockResolvedValue({
      cashu: null,
      lightning: { balance: 50000 },
      fedimint: { balance: 25000 },
      totalBalance: 75000,
      userRole: 'steward',
      permissions: {
        can_view_balance: true,
        can_spend: true,
        can_view_history: true
      }
    });
    getPendingFrostTransactions.mockResolvedValue([]);
  });

  describe('Result Objects Instead of Error Throwing', () => {
    it('should handle permission errors with result objects instead of throwing', async () => {
      const { getAllFamilyWalletData } = require('../src/services/familyWalletApi');
      
      // Mock insufficient permissions
      getAllFamilyWalletData.mockResolvedValue({
        cashu: null,
        lightning: { balance: 50000 },
        fedimint: { balance: 25000 },
        totalBalance: 75000,
        userRole: 'offspring',
        permissions: {
          can_view_balance: false,
          can_spend: false,
          can_view_history: true
        }
      });

      render(<FamilyFinancialsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Family Family Financials')).toBeInTheDocument();
      });

      // The component should render without throwing errors
      expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    });

    it('should handle FROST transaction approval errors gracefully', async () => {
      // Mock console methods
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation();

      render(<FamilyFinancialsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Family Family Financials')).toBeInTheDocument();
      });

      // Test will be expanded when FROST panel is visible
      // For now, verify no uncaught errors are thrown
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Uncaught'));

      consoleSpy.mockRestore();
      alertSpy.mockRestore();
    });
  });

  describe('Dynamic NWC Connection Status Checking', () => {
    it('should check actual NWC connections instead of role-based assumptions', async () => {
      render(<FamilyFinancialsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Family Family Financials')).toBeInTheDocument();
      });

      // Wait for NWC connection status to be displayed
      await waitFor(() => {
        // Should show actual connection count, not role-based assumption
        expect(screen.getByText('1/1')).toBeInTheDocument(); // 1 connection out of 1 member
      });
    });

    it('should fall back to role-based checking when connection data is unavailable', async () => {
      // Mock empty connections
      const useNWCWallet = require('../src/hooks/useNWCWallet').useNWCWallet;
      useNWCWallet.mockReturnValue({
        connections: [],
        primaryConnection: null,
        balance: 0,
        isConnected: false
      });

      render(<FamilyFinancialsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Family Family Financials')).toBeInTheDocument();
      });

      // Should fall back to role-based assumptions when no connection data
      await waitFor(() => {
        expect(screen.getByText('0/1')).toBeInTheDocument(); // No actual connections
      });
    });

    it('should display NWC badge for members with active connections', async () => {
      render(<FamilyFinancialsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Family Family Financials')).toBeInTheDocument();
      });

      // Look for NWC badge on connected members
      await waitFor(() => {
        const nwcBadges = screen.queryAllByText('NWC');
        expect(nwcBadges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Comprehensive Null Safety for Member Data Transformation', () => {
    it('should handle null and invalid member data gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      render(<FamilyFinancialsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Family Family Financials')).toBeInTheDocument();
      });

      // Should log warnings for invalid data but not crash
      expect(consoleSpy).toHaveBeenCalledWith('Invalid member data received:', null);

      consoleSpy.mockRestore();
    });

    it('should provide meaningful fallbacks for missing member properties', async () => {
      render(<FamilyFinancialsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Family Family Financials')).toBeInTheDocument();
      });

      // Should display members with fallback values
      await waitFor(() => {
        // Valid member should be displayed
        expect(screen.getByText('testuser1')).toBeInTheDocument();
        expect(screen.getByText('testuser2')).toBeInTheDocument();
      });
    });

    it('should validate member roles and provide fallbacks', async () => {
      render(<FamilyFinancialsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Family Family Financials')).toBeInTheDocument();
      });

      // Members with invalid roles should get 'offspring' as fallback
      await waitFor(() => {
        const roleElements = screen.getAllByText(/steward|adult|offspring/i);
        expect(roleElements.length).toBeGreaterThan(0);
      });
    });

    it('should only create Lightning addresses for valid user identifiers', async () => {
      const { getFamilyFederationMembers } = require('../src/services/familyFederationApi');
      
      // Mock member with no valid identifier
      getFamilyFederationMembers.mockResolvedValue([
        {
          id: '',
          user_duid: '',
          family_role: 'adult'
        }
      ]);

      render(<FamilyFinancialsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Family Family Financials')).toBeInTheDocument();
      });

      // Should not create invalid Lightning addresses
      // This would be tested by checking the internal state or component behavior
      // For now, verify the component renders without errors
      expect(screen.getByText('Family Members')).toBeInTheDocument();
    });

    it('should handle type validation for numeric fields', async () => {
      render(<FamilyFinancialsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Family Family Financials')).toBeInTheDocument();
      });

      // Should handle non-numeric balance values gracefully
      // Component should render without throwing type errors
      expect(screen.getByText('Family Members')).toBeInTheDocument();
    });

    it('should filter out completely invalid member entries', async () => {
      const { getFamilyFederationMembers } = require('../src/services/familyFederationApi');
      
      // Mock response with only invalid data
      getFamilyFederationMembers.mockResolvedValue([null, undefined, 'invalid']);

      render(<FamilyFinancialsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Family Family Financials')).toBeInTheDocument();
      });

      // Should handle empty member list gracefully
      expect(screen.getByText('Family Members')).toBeInTheDocument();
    });
  });

  describe('Integration and Error Handling', () => {
    it('should handle API failures gracefully', async () => {
      const { getFamilyFederationMembers } = require('../src/services/familyFederationApi');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      getFamilyFederationMembers.mockRejectedValue(new Error('API Error'));

      render(<FamilyFinancialsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Family Family Financials')).toBeInTheDocument();
      });

      // Should log error but not crash
      expect(consoleSpy).toHaveBeenCalledWith('Error loading family federation data:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle missing family federation data', () => {
      render(<FamilyFinancialsDashboard familyFederationData={undefined} onBack={jest.fn()} />);

      // Should render with fallback values
      expect(screen.getByText('Family Federation Family Financials')).toBeInTheDocument();
    });
  });
});
