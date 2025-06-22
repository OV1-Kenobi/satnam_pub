// examples/family-auth-integration.tsx
// Example showing how to integrate Family Federation Authentication

import React from 'react';
import AuthProtectedRoute from '../src/components/auth/AuthProtectedRoute';
import {
  FamilyFederationAuthProvider,
  useAuth
} from '../src/components/auth/FamilyFederationAuth';

// Interface for whitelist member data structure
interface WhitelistMember {
  id: string;
  nip05_address: string;
  family_role: 'parent' | 'child' | 'guardian';
  voting_power: number;
  is_active: boolean;
}

// Example: Protected Family Treasury Component
function FamilyTreasury() {
  const { userAuth } = useAuth();
  
  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Family Treasury</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* User Info */}
        <div className="bg-purple-50 p-4 rounded-lg">
          <h3 className="font-semibold text-purple-800 mb-2">Your Access</h3>
          <p><strong>NIP-05:</strong> {userAuth?.nip05}</p>
          <p><strong>Role:</strong> {userAuth?.federationRole}</p>
          <p><strong>Voting Power:</strong> {userAuth?.votingPower}</p>
          <p><strong>Auth Method:</strong> {userAuth?.authMethod?.toUpperCase()}</p>
        </div>

        {/* Treasury Stats */}
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="font-semibold text-green-800 mb-2">Treasury Overview</h3>
          <p><strong>Total Balance:</strong> 1.5 BTC</p>
          <p><strong>Lightning Channels:</strong> 3 active</p>
          <p><strong>Monthly Allowances:</strong> 0.1 BTC</p>
        </div>

        {/* Role-based Actions */}
        {userAuth?.federationRole === 'parent' && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-800 mb-2">Parent Actions</h3>
            <button className="bg-blue-600 text-white px-4 py-2 rounded mr-2">
              Manage Allowances
            </button>
            <button className="bg-blue-600 text-white px-4 py-2 rounded">
              Treasury Settings
            </button>
          </div>
        )}

        {userAuth?.federationRole === 'guardian' && (
          <div className="bg-orange-50 p-4 rounded-lg">
            <h3 className="font-semibold text-orange-800 mb-2">Guardian Actions</h3>
            <button className="bg-orange-600 text-white px-4 py-2 rounded mr-2">
              Manage Whitelist
            </button>
            <button className="bg-orange-600 text-white px-4 py-2 rounded">
              Emergency Controls
            </button>
          </div>
        )}

        {userAuth?.federationRole === 'child' && (
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold text-green-800 mb-2">Your Allowance</h3>
            <p><strong>This Month:</strong> 0.02 BTC</p>
            <p><strong>Remaining:</strong> 0.015 BTC</p>
            <button className="bg-green-600 text-white px-4 py-2 rounded mt-2">
              Request Payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Example: Family Member Management (Guardian only)
function FamilyMemberManagement() {
  const { userAuth } = useAuth();
  const [members, setMembers] = React.useState<WhitelistMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryCount, setRetryCount] = React.useState(0);

  React.useEffect(() => {
    fetchFamilyMembers();
  }, []);

  const fetchFamilyMembers = async (isRetry = false) => {
    if (!isRetry) {
      setLoading(true);
      setError(null);
    }

    // Set up a 10s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch('/api/auth/federation-whitelist', {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.success) {
        setMembers(result.data.whitelist);
        setRetryCount(0); // Reset retry count on success
      } else {
        throw new Error(result.error || 'Failed to fetch family members');
      }
    } catch (error: any) {
      console.error('Failed to fetch family members:', error);
      
      // Show user-friendly error message
      const errorMessage = error.name === 'AbortError' 
        ? 'Request timed out' 
        : error.message || 'An unexpected error occurred';
      
      setError(errorMessage);

      // Implement retry logic for transient failures (max 3 retries)
      if (retryCount < 3 && (error.name === 'AbortError' || error.name === 'TypeError')) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          fetchFamilyMembers(true);
        }, Math.pow(2, retryCount) * 1000); // Exponential backoff: 1s, 2s, 4s
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
          <span>Loading family members...</span>
          {retryCount > 0 && (
            <span className="ml-2 text-sm text-gray-500">
              (Retry {retryCount}/3)
            </span>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">
                Failed to load family members
              </h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={() => fetchFamilyMembers()}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Family Member Management</h2>
        <button
          onClick={() => fetchFamilyMembers()}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Refresh
        </button>
      </div>
      
      {members.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No family members found</h3>
          <p className="text-gray-500">There are no family members in the federation whitelist.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left">NIP-05</th>
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-left">Voting Power</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member: WhitelistMember) => (
                <tr key={member.id} className="border-t">
                  <td className="px-4 py-2">{member.nip05_address}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      member.family_role === 'parent' ? 'bg-yellow-100 text-yellow-800' :
                      member.family_role === 'guardian' ? 'bg-blue-100 text-blue-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {member.family_role}
                    </span>
                  </td>
                  <td className="px-4 py-2">{member.voting_power}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      member.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {member.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {member.is_active ? (
                      <button className="text-red-600 hover:text-red-800 text-sm">
                        Deactivate
                      </button>
                    ) : (
                      <button className="text-green-600 hover:text-green-800 text-sm">
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Example: Main App with Authentication
function FamilyFinancialsApp() {
  return (
    <FamilyFederationAuthProvider>
      <div className="min-h-screen bg-gray-100">
        
        {/* Family Treasury - Parents and Guardians only */}
        <AuthProtectedRoute 
          allowedRoles={['parent', 'guardian']}
          title="Family Treasury"
          description="Manage your family's Bitcoin treasury and Lightning channels"
        >
          <div className="container mx-auto py-8">
            <FamilyTreasury />
          </div>
        </AuthProtectedRoute>

        {/* Member Management - Guardians only */}
        <AuthProtectedRoute 
          allowedRoles={['guardian']}
          title="Family Member Management"
          description="Manage family federation whitelist and member permissions"
        >
          <div className="container mx-auto py-8">
            <FamilyMemberManagement />
          </div>
        </AuthProtectedRoute>

        {/* Child Dashboard - Children only */}
        <AuthProtectedRoute 
          allowedRoles={['child']}
          title="My Allowance"
          description="View your allowance and make payment requests"
        >
          <div className="container mx-auto py-8">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold mb-4">My Allowance Dashboard</h2>
              <p>Welcome to your personal allowance dashboard!</p>
            </div>
          </div>
        </AuthProtectedRoute>

      </div>
    </FamilyFederationAuthProvider>
  );
}

// Example: Custom Hook for API calls with authentication
export function useAuthenticatedAPI() {
  const { userAuth, logout } = useAuth();

  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    // Use secure HttpOnly cookie-based authentication
    // No need to manually handle tokens - they're automatically included via cookies
    const response = await fetch(endpoint, {
      ...options,
      credentials: 'include', // Important: include HttpOnly cookies
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (response.status === 401) {
      // Session expired or invalid - use proper logout flow
      try {
        await logout();
      } catch (error) {
        console.error('Logout error:', error);
      }
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  };

  return { apiCall, userAuth };
}

// Utility functions for validation
const isValidLightningAddress = (address: string): boolean => {
  // Basic Lightning address validation (user@domain.com format)
  const lightningAddressRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return lightningAddressRegex.test(address);
};

const isValidAmount = (amount: number): boolean => {
  return amount > 0 && amount <= 100000000; // Max 1 BTC in sats
};

// Notification system
interface NotificationState {
  show: boolean;
  type: 'success' | 'error' | 'warning';
  message: string;
}

const useNotification = () => {
  const [notification, setNotification] = React.useState<NotificationState>({
    show: false,
    type: 'success',
    message: ''
  });

  const showNotification = (type: 'success' | 'error' | 'warning', message: string) => {
    setNotification({ show: true, type, message });
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 5000);
  };

  const hideNotification = () => {
    setNotification(prev => ({ ...prev, show: false }));
  };

  return { notification, showNotification, hideNotification };
};

// Notification component
function NotificationBanner({ notification, onClose }: { 
  notification: NotificationState; 
  onClose: () => void; 
}) {
  if (!notification.show) return null;

  const bgColor = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200'
  }[notification.type];

  const textColor = {
    success: 'text-green-800',
    error: 'text-red-800',
    warning: 'text-yellow-800'
  }[notification.type];

  return (
    <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg border ${bgColor} ${textColor} shadow-lg max-w-md`}>
      <div className="flex items-center justify-between">
        <span>{notification.message}</span>
        <button
          onClick={onClose}
          className="ml-4 text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// Enhanced PaymentComponent with proper validation and security
function PaymentComponent() {
  const { apiCall, userAuth } = useAuthenticatedAPI();
  const [loading, setLoading] = React.useState(false);
  const [amount, setAmount] = React.useState<string>('');
  const [recipient, setRecipient] = React.useState<string>('');
  const [errors, setErrors] = React.useState<{amount?: string; recipient?: string}>({});
  const { notification, showNotification, hideNotification } = useNotification();

  // Define spending limits based on role
  const getSpendingLimits = (role: string) => {
    switch (role) {
      case 'child':
        return { daily: 10000, single: 5000 }; // 10k sats daily, 5k per transaction
      case 'parent':
        return { daily: 1000000, single: 500000 }; // 1M sats daily, 500k per transaction
      case 'guardian':
        return { daily: 2000000, single: 1000000 }; // 2M sats daily, 1M per transaction
      default:
        return { daily: 0, single: 0 };
    }
  };

  const validateInputs = (): boolean => {
    const newErrors: {amount?: string; recipient?: string} = {};
    const numAmount = parseInt(amount);

    // Validate amount
    if (!amount || amount.trim() === '') {
      newErrors.amount = 'Amount is required';
    } else if (isNaN(numAmount) || numAmount <= 0) {
      newErrors.amount = 'Please enter a valid amount greater than 0';
    } else if (!isValidAmount(numAmount)) {
      newErrors.amount = 'Amount must be between 1 and 100,000,000 sats';
    } else if (userAuth?.federationRole) {
      const limits = getSpendingLimits(userAuth.federationRole);
      if (numAmount > limits.single) {
        newErrors.amount = `Amount exceeds single transaction limit of ${limits.single.toLocaleString()} sats`;
      }
    }

    // Validate recipient
    if (!recipient || recipient.trim() === '') {
      newErrors.recipient = 'Recipient is required';
    } else if (!isValidLightningAddress(recipient.trim())) {
      newErrors.recipient = 'Please enter a valid Lightning address (user@domain.com)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checkUserPermissions = (): boolean => {
    if (!userAuth) {
      showNotification('error', 'Authentication required to send payments');
      return false;
    }

    if (!userAuth.isWhitelisted) {
      showNotification('error', 'Your account is not whitelisted for payments');
      return false;
    }

    if (!userAuth.guardianApproved && userAuth.federationRole === 'child') {
      showNotification('error', 'Guardian approval required for child accounts');
      return false;
    }

    return true;
  };

  const sendPayment = async () => {
    // Clear previous errors
    setErrors({});

    // Validate inputs
    if (!validateInputs()) {
      return;
    }

    // Check user permissions
    if (!checkUserPermissions()) {
      return;
    }

    const numAmount = parseInt(amount);
    const cleanRecipient = recipient.trim();

    setLoading(true);
    try {
      const result = await apiCall('/api/payments/send', {
        method: 'POST',
        body: JSON.stringify({
          amount: numAmount,
          recipient: cleanRecipient,
          senderRole: userAuth?.federationRole,
          senderNpub: userAuth?.npub,
        }),
      });

      if (result?.success) {
        showNotification('success', 'Payment sent successfully!');
        // Clear form on success
        setAmount('');
        setRecipient('');
      } else {
        showNotification('error', result?.error || 'Payment failed');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      
      // Provide user-friendly error messages
      let errorMessage = 'An unexpected error occurred';
      if (error.name === 'TypeError') {
        errorMessage = 'Network error - please check your connection';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showNotification('error', `Payment error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const limits = userAuth?.federationRole ? getSpendingLimits(userAuth.federationRole) : null;

  return (
    <>
      <NotificationBanner notification={notification} onClose={hideNotification} />
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold mb-4">Send Payment</h3>
        
        {/* User info and limits */}
        {userAuth && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Role:</strong> {userAuth.federationRole} | 
              <strong> Daily Limit:</strong> {limits?.daily.toLocaleString()} sats | 
              <strong> Per Transaction:</strong> {limits?.single.toLocaleString()} sats
            </p>
          </div>
        )}

        <div className="space-y-4">
          {/* Amount input */}
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
              Amount (sats)
            </label>
            <input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount in satoshis"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.amount ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={loading}
            />
            {errors.amount && (
              <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
            )}
          </div>

          {/* Recipient input */}
          <div>
            <label htmlFor="recipient" className="block text-sm font-medium text-gray-700 mb-1">
              Recipient Lightning Address
            </label>
            <input
              id="recipient"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="user@domain.com"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.recipient ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={loading}
            />
            {errors.recipient && (
              <p className="mt-1 text-sm text-red-600">{errors.recipient}</p>
            )}
          </div>

          {/* Send button */}
          <button 
            onClick={sendPayment}
            disabled={loading || !amount || !recipient}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Sending...
              </span>
            ) : (
              'Send Payment'
            )}
          </button>
        </div>
      </div>
    </>
  );
}

export default FamilyFinancialsApp;