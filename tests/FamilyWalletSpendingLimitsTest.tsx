import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, Clock, DollarSign, Users, Zap, Lock } from 'lucide-react';
import { FamilyWalletService, FamilyMemberWallet, PaymentRequest, SpendingLimitViolation } from '../src/lib/family-wallet';

interface TestFamilyMember {
  id: string;
  name: string;
  npub: string;
  role: 'guardian' | 'steward' | 'adult' | 'offspring';
  spendingLimits: {
    daily: number;
    weekly: number;
    monthly: number;
    requiresApproval: number;
    autoApprovalLimit: number;
    approvalRoles: ('guardian' | 'steward' | 'adult')[];
    requiredApprovals: number;
  };
}

const FamilyWalletSpendingLimitsTest: React.FC = () => {
  const [familyWalletService] = useState(FamilyWalletService.getInstance());
  const [selectedMember, setSelectedMember] = useState<TestFamilyMember | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDescription, setPaymentDescription] = useState('');
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [violations, setViolations] = useState<SpendingLimitViolation[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [testResults, setTestResults] = useState<string[]>([]);

  // Sample family members for testing
  const sampleMembers: TestFamilyMember[] = [
    {
      id: '1',
      name: 'Alice Guardian',
      npub: 'npub1aliceguardian123456789',
      role: 'guardian',
      spendingLimits: {
        daily: 50000, // 50k sats daily
        weekly: 250000, // 250k sats weekly
        monthly: 1000000, // 1M sats monthly
        requiresApproval: 10000, // 10k sats requires approval
        autoApprovalLimit: 5000, // 5k sats auto-approved
        approvalRoles: ['guardian', 'steward'],
        requiredApprovals: 1
      }
    },
    {
      id: '2',
      name: 'Bob Steward',
      npub: 'npub1bobsteward123456789',
      role: 'steward',
      spendingLimits: {
        daily: 25000, // 25k sats daily
        weekly: 125000, // 125k sats weekly
        monthly: 500000, // 500k sats monthly
        requiresApproval: 5000, // 5k sats requires approval
        autoApprovalLimit: 2500, // 2.5k sats auto-approved
        approvalRoles: ['guardian', 'steward'],
        requiredApprovals: 1
      }
    },
    {
      id: '3',
      name: 'Charlie Adult',
      npub: 'npub1charlieadult123456789',
      role: 'adult',
      spendingLimits: {
        daily: 10000, // 10k sats daily
        weekly: 50000, // 50k sats weekly
        monthly: 200000, // 200k sats monthly
        requiresApproval: 2500, // 2.5k sats requires approval
        autoApprovalLimit: 1000, // 1k sats auto-approved
        approvalRoles: ['guardian', 'steward', 'adult'],
        requiredApprovals: 2
      }
    },
    {
      id: '4',
      name: 'Diana Offspring',
      npub: 'npub1dianaoffspring123456789',
      role: 'offspring',
      spendingLimits: {
        daily: 5000, // 5k sats daily
        weekly: 25000, // 25k sats weekly
        monthly: 100000, // 100k sats monthly
        requiresApproval: 1000, // 1k sats requires approval
        autoApprovalLimit: 500, // 500 sats auto-approved
        approvalRoles: ['guardian', 'steward', 'adult'],
        requiredApprovals: 2
      }
    }
  ];

  useEffect(() => {
    if (selectedMember) {
      loadTestData();
    }
  }, [selectedMember]);

  const loadTestData = async () => {
    if (!selectedMember) return;

    try {
      // Load violations
      const memberViolations = await familyWalletService.getSpendingLimitViolations(
        selectedMember.id, 
        'test-family-id'
      );
      setViolations(memberViolations);

      // Load pending approvals
      const approvals = await familyWalletService.getPendingApprovals(selectedMember.npub);
      setPendingApprovals(approvals);

    } catch (error) {
      console.error('Error loading test data:', error);
    }
  };

  const requestPayment = async () => {
    if (!selectedMember || paymentAmount <= 0) {
      addTestResult('❌ Please select a member and enter a valid payment amount');
      return;
    }

    try {
      const request: Omit<PaymentRequest, 'id' | 'status' | 'approvalRequired' | 'createdAt' | 'updatedAt'> = {
        familyId: 'test-family-id',
        requesterId: selectedMember.id,
        requesterNpub: selectedMember.npub,
        recipientNpub: 'npub1recipient123456789',
        amount: paymentAmount,
        currency: 'sats',
        method: 'voltage',
        description: paymentDescription || 'Test payment',
        urgency: paymentAmount > 50000 ? 'high' : 'medium'
      };

      const result = await familyWalletService.requestPayment(request);
      setPaymentRequests(prev => [result, ...prev]);

      if (result.approvalRequired) {
        addTestResult(`✅ Payment request created - APPROVAL REQUIRED (${result.amount} sats)`);
        addTestResult(`📋 Approval ID: ${result.approvalId}`);
      } else {
        addTestResult(`✅ Payment request created - AUTO-APPROVED (${result.amount} sats)`);
      }

      // Reload test data
      await loadTestData();

    } catch (error) {
      console.error('Error requesting payment:', error);
      addTestResult(`❌ Payment request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const approvePayment = async (approvalId: string, approved: boolean) => {
    try {
      await familyWalletService.approvePayment(
        approvalId,
        selectedMember?.npub || '',
        approved,
        approved ? 'Approved by test user' : 'Rejected by test user'
      );

      addTestResult(`✅ Payment ${approved ? 'approved' : 'rejected'} successfully`);
      await loadTestData();

    } catch (error) {
      console.error('Error approving payment:', error);
      addTestResult(`❌ Approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testSpendingLimits = async () => {
    if (!selectedMember) {
      addTestResult('❌ Please select a family member first');
      return;
    }

    const { spendingLimits } = selectedMember;
    const testCases = [
      { amount: spendingLimits.autoApprovalLimit - 100, expected: 'auto-approved', description: 'Below auto-approval limit' },
      { amount: spendingLimits.autoApprovalLimit + 100, expected: 'approval-required', description: 'Above auto-approval limit' },
      { amount: spendingLimits.requiresApproval - 100, expected: 'approval-required', description: 'Below approval threshold' },
      { amount: spendingLimits.requiresApproval + 100, expected: 'approval-required', description: 'Above approval threshold' },
      { amount: spendingLimits.daily + 100, expected: 'approval-required', description: 'Exceeds daily limit' },
      { amount: spendingLimits.weekly + 100, expected: 'approval-required', description: 'Exceeds weekly limit' },
      { amount: spendingLimits.monthly + 100, expected: 'approval-required', description: 'Exceeds monthly limit' }
    ];

    addTestResult(`🧪 Testing spending limits for ${selectedMember.name}...`);

    for (const testCase of testCases) {
      try {
        const request: Omit<PaymentRequest, 'id' | 'status' | 'approvalRequired' | 'createdAt' | 'updatedAt'> = {
          familyId: 'test-family-id',
          requesterId: selectedMember.id,
          requesterNpub: selectedMember.npub,
          recipientNpub: 'npub1testrecipient123456789',
          amount: testCase.amount,
          currency: 'sats',
          method: 'voltage',
          description: `Test: ${testCase.description}`,
          urgency: 'low'
        };

        const result = await familyWalletService.requestPayment(request);
        const actual = result.approvalRequired ? 'approval-required' : 'auto-approved';
        
        if (actual === testCase.expected) {
          addTestResult(`✅ ${testCase.description}: ${testCase.amount} sats - ${actual}`);
        } else {
          addTestResult(`❌ ${testCase.description}: ${testCase.amount} sats - Expected ${testCase.expected}, got ${actual}`);
        }

        setPaymentRequests(prev => [result, ...prev]);

      } catch (error) {
        addTestResult(`❌ Test failed for ${testCase.description}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    await loadTestData();
  };

  const addTestResult = (result: string) => {
    setTestResults(prev => [`[${new Date().toLocaleTimeString()}] ${result}`, ...prev.slice(0, 19)]);
  };

  const clearTestResults = () => {
    setTestResults([]);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-600 to-orange-600 rounded-full mb-4">
          <Shield className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Family Wallet Spending Limits Test</h1>
        <p className="text-gray-600">Test spending limits enforcement and approval workflows</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Test Controls */}
        <div className="space-y-6">
          {/* Member Selection */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Family Member</h3>
            <div className="space-y-2">
              {sampleMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => setSelectedMember(member)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedMember?.id === member.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{member.name}</div>
                      <div className="text-sm text-gray-500 capitalize">{member.role}</div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {member.spendingLimits.daily.toLocaleString()} sats/day
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Payment Request */}
          {selectedMember && (
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Payment</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (sats)</label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter amount in satoshis"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={paymentDescription}
                    onChange={(e) => setPaymentDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Payment description"
                  />
                </div>
                <button
                  onClick={requestPayment}
                  disabled={paymentAmount <= 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Request Payment
                </button>
              </div>
            </div>
          )}

          {/* Test Actions */}
          {selectedMember && (
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={testSpendingLimits}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  🧪 Run Spending Limits Test
                </button>
                <button
                  onClick={clearTestResults}
                  className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Clear Test Results
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Member Details & Limits */}
        <div className="space-y-6">
          {selectedMember && (
            <>
              {/* Member Details */}
              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Member Details</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Name:</span>
                    <span className="font-medium">{selectedMember.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Role:</span>
                    <span className="font-medium capitalize">{selectedMember.role}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Npub:</span>
                    <span className="font-mono text-xs text-gray-500 truncate ml-2">
                      {selectedMember.npub.substring(0, 12)}...
                    </span>
                  </div>
                </div>
              </div>

              {/* Spending Limits */}
              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending Limits</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Daily:</span>
                    <span className="font-medium">{selectedMember.spendingLimits.daily.toLocaleString()} sats</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Weekly:</span>
                    <span className="font-medium">{selectedMember.spendingLimits.weekly.toLocaleString()} sats</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Monthly:</span>
                    <span className="font-medium">{selectedMember.spendingLimits.monthly.toLocaleString()} sats</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Auto-approval:</span>
                    <span className="font-medium">{selectedMember.spendingLimits.autoApprovalLimit.toLocaleString()} sats</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Requires approval:</span>
                    <span className="font-medium">{selectedMember.spendingLimits.requiresApproval.toLocaleString()} sats</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Required approvals:</span>
                    <span className="font-medium">{selectedMember.spendingLimits.requiredApprovals}</span>
                  </div>
                </div>
              </div>

              {/* Violations */}
              {violations.length > 0 && (
                <div className="bg-red-50 rounded-xl p-6 border border-red-200">
                  <h3 className="text-lg font-semibold text-red-900 mb-4">Spending Limit Violations</h3>
                  <div className="space-y-2">
                    {violations.map((violation) => (
                      <div key={violation.id} className="flex items-center space-x-2 text-sm">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        <span className="text-red-700">
                          {violation.violationType}: {violation.attemptedAmount.toLocaleString()} sats
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Test Results & Approvals */}
        <div className="space-y-6">
          {/* Test Results */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Results</h3>
            <div className="h-64 overflow-y-auto space-y-1">
              {testResults.length === 0 ? (
                <p className="text-gray-500 text-sm">No test results yet. Run a test to see results here.</p>
              ) : (
                testResults.map((result, index) => (
                  <div key={index} className="text-sm font-mono">
                    {result}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pending Approvals */}
          {pendingApprovals.length > 0 && (
            <div className="bg-yellow-50 rounded-xl p-6 border border-yellow-200">
              <h3 className="text-lg font-semibold text-yellow-900 mb-4">Pending Approvals</h3>
              <div className="space-y-3">
                {pendingApprovals.map((approval) => (
                  <div key={approval.id} className="border border-yellow-300 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-yellow-900">
                        {approval.amount.toLocaleString()} sats
                      </span>
                      <span className="text-xs text-yellow-700">
                        {approval.receivedApprovals}/{approval.requiredApprovals} approvals
                      </span>
                    </div>
                    <p className="text-sm text-yellow-800 mb-2">{approval.description}</p>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => approvePayment(approval.id, true)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-2 rounded transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => approvePayment(approval.id, false)}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-1 px-2 rounded transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Payment Requests */}
          {paymentRequests.length > 0 && (
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Payment Requests</h3>
              <div className="space-y-2">
                {paymentRequests.slice(0, 5).map((request) => (
                  <div key={request.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{request.amount.toLocaleString()} sats</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        request.status === 'approved' ? 'bg-green-100 text-green-800' :
                        request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        request.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {request.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{request.description}</p>
                    {request.approvalRequired && (
                      <p className="text-xs text-blue-600 mt-1">Approval required</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FamilyWalletSpendingLimitsTest; 