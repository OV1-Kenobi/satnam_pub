import {
    AlertTriangle,
    CheckCircle,
    Clock,
    Eye,
    Gavel,
    Loader2,
    Lock,
    Plus,
    RefreshCw,
    Shield,
    TrendingUp,
    Users,
    Vote,
    XCircle
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
    FamilyApproval,
    FamilyGuardian,
    FedimintTransaction
} from '../../types/family';

interface FamilyFedimintGovernanceProps {
  familyId: string;
  onCreateProposal?: (type: string, description: string, amount?: number, recipient?: string) => void;
  onApproveProposal?: (proposalId: string, approved: boolean) => void;
}

interface FedimintGovernanceData {
  fedimintEcashBalance: number;
  federationInfo: {
    federationId: string;
    name: string;
    guardiansTotal: number;
    guardiansOnline: number;
    consensusThreshold: number;
    epochHeight: number;
    lastConsensus: Date;
  };
  guardians: FamilyGuardian[];
  pendingApprovals: FamilyApproval[];
  recentFedimintTransactions: FedimintTransaction[];
  governanceStats: {
    totalProposals: number;
    approvedProposals: number;
    rejectedProposals: number;
    pendingProposals: number;
    averageApprovalTime: number;
    consensusHealth: string;
  };
}

const FamilyFedimintGovernance: React.FC<FamilyFedimintGovernanceProps> = ({
  familyId,
  onCreateProposal,
  onApproveProposal,
}) => {
  const [governanceData, setGovernanceData] = useState<FedimintGovernanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateProposal, setShowCreateProposal] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<FamilyApproval | null>(null);
  const [proposalType, setProposalType] = useState<string>('payment_distribution');
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposalAmount, setProposalAmount] = useState('');
  const [proposalRecipient, setProposalRecipient] = useState('');

  // Fetch Fedimint governance data
  const fetchGovernanceData = async () => {
    try {
      setError(null);
      const response = await fetch(`/api/family/fedimint/governance?familyId=${familyId}`);
      const result = await response.json();
      
      if (result.success) {
        setGovernanceData(result.data);
      } else {
        setError(result.error || 'Failed to load Fedimint governance data');
      }
    } catch (err) {
      setError('Network error loading Fedimint governance');
      console.error('Fedimint governance fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchGovernanceData();
  };

  // Create proposal
  const handleCreateProposal = async () => {
    if (!proposalDescription.trim()) return;

    try {
      const response = await fetch('/api/family/fedimint/governance/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyId,
          type: proposalType,
          description: proposalDescription,
          amount: proposalAmount ? parseInt(proposalAmount) : undefined,
          recipient: proposalRecipient || undefined,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setShowCreateProposal(false);
        setProposalDescription('');
        setProposalAmount('');
        setProposalRecipient('');
        onCreateProposal?.(proposalType, proposalDescription, 
          proposalAmount ? parseInt(proposalAmount) : undefined, proposalRecipient);
        await fetchGovernanceData(); // Refresh data
      } else {
        setError(result.error || 'Failed to create proposal');
      }
    } catch (err) {
      setError('Failed to create proposal');
      console.error('Create proposal error:', err);
    }
  };

  // Approve/reject proposal
  const handleApproveProposal = async (proposalId: string, approved: boolean) => {
    try {
      // In real implementation, this would call the approval API
      onApproveProposal?.(proposalId, approved);
      await fetchGovernanceData(); // Refresh data
    } catch (err) {
      setError('Failed to process approval');
      console.error('Approval error:', err);
    }
  };

  // Format numbers
  const formatSats = (sats: number): string => {
    return new Intl.NumberFormat().format(sats);
  };

  const formatTimeAgo = (date: Date) => {
    const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours === 1) return "1 hour ago";
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-400';
      case 'offline': return 'text-red-400';
      case 'syncing': return 'text-yellow-400';
      case 'pending': return 'text-yellow-400';
      case 'approved': return 'text-green-400';
      case 'rejected': return 'text-red-400';
      default: return 'text-orange-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <CheckCircle className="h-4 w-4" />;
      case 'offline': return <XCircle className="h-4 w-4" />;
      case 'syncing': return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'approved': return <CheckCircle className="h-4 w-4" />;
      case 'rejected': return <XCircle className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  useEffect(() => {
    fetchGovernanceData();
    
    // Set up periodic refresh
    const interval = setInterval(fetchGovernanceData, 45000); // 45 seconds
    return () => clearInterval(interval);
  }, [familyId]);

  if (loading) {
    return (
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 text-orange-400 animate-spin" />
          <span className="ml-3 text-orange-200">Loading Fedimint Governance...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-orange-900 rounded-2xl p-6 border border-red-400/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            <h3 className="text-lg font-semibold text-white">Fedimint Governance Error</h3>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 text-orange-400 hover:text-orange-300 transition-colors"
            disabled={refreshing}
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-red-300">{error}</p>
        <button
          onClick={handleRefresh}
          className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!governanceData) return null;

  return (
    <div className="space-y-6">
      {/* Fedimint Governance Header */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Fedimint Governance</h2>
              <p className="text-orange-300">Internal family consensus & eCash</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowCreateProposal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>New Proposal</span>
            </button>
            <button
              onClick={handleRefresh}
              className="p-2 text-orange-400 hover:text-orange-300 transition-colors"
              disabled={refreshing}
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Federation Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">eCash Balance</span>
              <Lock className="h-5 w-5 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {formatSats(governanceData.fedimintEcashBalance)} sats
            </div>
            <div className="text-sm text-orange-300">
              Zero-fee internal transfers
            </div>
          </div>

          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">Guardian Consensus</span>
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {governanceData.federationInfo.guardiansOnline}/{governanceData.federationInfo.guardiansTotal}
            </div>
            <div className="text-sm text-orange-300">
              Threshold: {governanceData.federationInfo.consensusThreshold}
            </div>
          </div>

          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">Pending Approvals</span>
              <Vote className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {governanceData.pendingApprovals.length}
            </div>
            <div className="text-sm text-orange-300">
              Awaiting guardian votes
            </div>
          </div>
        </div>

        {/* Federation Info */}
        <div className="bg-orange-800/30 rounded-xl p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Federation Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-orange-300 text-sm">Federation</div>
              <div className="text-white font-semibold">{governanceData.federationInfo.name}</div>
            </div>
            <div>
              <div className="text-orange-300 text-sm">Epoch Height</div>
              <div className="text-white font-semibold">{governanceData.federationInfo.epochHeight}</div>
            </div>
            <div>
              <div className="text-orange-300 text-sm">Last Consensus</div>
              <div className="text-white font-semibold">{formatTimeAgo(governanceData.federationInfo.lastConsensus)}</div>
            </div>
            <div>
              <div className="text-orange-300 text-sm">Health</div>
              <div className="text-green-400 font-semibold">{governanceData.governanceStats.consensusHealth}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Guardians Status */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <h3 className="text-lg font-semibold text-white mb-4">Family Guardians</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {governanceData.guardians.map((guardian) => (
            <div key={guardian.id} className="bg-orange-800/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-white">{guardian.name}</div>
                <div className={`flex items-center space-x-1 ${getStatusColor(guardian.status)}`}>
                  {getStatusIcon(guardian.status)}
                  <span className="text-sm capitalize">{guardian.status}</span>
                </div>
              </div>
              <div className="text-sm text-orange-300 mb-2">
                Role: {guardian.familyRole.replace('_', ' ')}
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-orange-300">
                  Voting Power: {guardian.votingPower}
                </div>
                <div className="text-xs text-orange-400">
                  {formatTimeAgo(guardian.lastSeen)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Approvals */}
      {governanceData.pendingApprovals.length > 0 && (
        <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
          <h3 className="text-lg font-semibold text-white mb-4">Pending Approvals</h3>
          <div className="space-y-4">
            {governanceData.pendingApprovals.map((approval) => (
              <div key={approval.id} className="bg-orange-800/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-white">{approval.description}</div>
                    <div className="text-sm text-orange-300">
                      Type: {approval.type.replace('_', ' ')} • 
                      {approval.amount && ` Amount: ${formatSats(approval.amount)} sats • `}
                      Created {formatTimeAgo(approval.createdAt)}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedApproval(approval)}
                    className="p-2 text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="text-sm text-orange-300">
                      Signatures: {approval.currentSignatures}/{approval.requiredSignatures}
                    </div>
                    <div className="flex space-x-1">
                      {approval.guardianApprovals.map((guardianApproval, index) => (
                        <div
                          key={index}
                          className={`w-3 h-3 rounded-full ${
                            guardianApproval.approved ? 'bg-green-400' : 'bg-gray-600'
                          }`}
                          title={`${guardianApproval.guardianName}: ${guardianApproval.approved ? 'Approved' : 'Pending'}`}
                        />
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleApproveProposal(approval.id, false)}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApproveProposal(approval.id, true)}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Governance Stats */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <h3 className="text-lg font-semibold text-white mb-4">Governance Analytics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="text-orange-300 text-sm">Total Proposals</div>
            <div className="text-2xl font-bold text-white">{governanceData.governanceStats.totalProposals}</div>
          </div>
          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="text-orange-300 text-sm">Approved</div>
            <div className="text-2xl font-bold text-green-400">{governanceData.governanceStats.approvedProposals}</div>
          </div>
          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="text-orange-300 text-sm">Rejected</div>
            <div className="text-2xl font-bold text-red-400">{governanceData.governanceStats.rejectedProposals}</div>
          </div>
          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="text-orange-300 text-sm">Avg. Approval Time</div>
            <div className="text-2xl font-bold text-white">
              {Math.round(governanceData.governanceStats.averageApprovalTime / (1000 * 60))}m
            </div>
          </div>
        </div>
      </div>

      {/* Recent Fedimint Transactions */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <h3 className="text-lg font-semibold text-white mb-4">Recent eCash Transactions</h3>
        <div className="space-y-3">
          {governanceData.recentFedimintTransactions.map((tx) => (
            <div key={tx.id} className="bg-orange-800/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    tx.direction === 'incoming' ? 'bg-green-500/20' : 'bg-blue-500/20'
                  }`}>
                    {tx.direction === 'incoming' ? (
                      <TrendingUp className="h-4 w-4 text-green-400" />
                    ) : (
                      <Gavel className="h-4 w-4 text-blue-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-white font-medium">{tx.description}</div>
                    <div className="text-orange-300 text-sm">
                      {tx.direction === 'incoming' ? 'From' : 'To'}: {tx.direction === 'incoming' ? tx.from : tx.to}
                      {tx.requiresApproval && (
                        <span className="ml-2 text-xs bg-purple-600 text-white px-2 py-1 rounded">
                          Guardian Approved
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${
                    tx.direction === 'incoming' ? 'text-green-400' : 'text-blue-400'
                  }`}>
                    {tx.direction === 'incoming' ? '+' : '-'}{formatSats(tx.amount)} sats
                  </div>
                  <div className="text-orange-300 text-sm">
                    {formatTimeAgo(tx.timestamp)} • No fees
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Proposal Modal */}
      {showCreateProposal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-orange-900 rounded-2xl p-6 max-w-md w-full border border-orange-400/20">
            <h3 className="text-xl font-bold text-white mb-4">Create Governance Proposal</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-orange-300 text-sm mb-2">Proposal Type</label>
                <select
                  value={proposalType}
                  onChange={(e) => setProposalType(e.target.value)}
                  className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none"
                >
                  <option value="payment_distribution">Payment Distribution</option>
                  <option value="emergency_withdrawal">Emergency Withdrawal</option>
                  <option value="spending_limit_change">Spending Limit Change</option>
                  <option value="guardian_change">Guardian Change</option>
                </select>
              </div>
              <div>
                <label className="block text-orange-300 text-sm mb-2">Description</label>
                <textarea
                  value={proposalDescription}
                  onChange={(e) => setProposalDescription(e.target.value)}
                  placeholder="Describe the proposal and its purpose..."
                  rows={3}
                  className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none resize-none"
                />
              </div>
              {(proposalType === 'payment_distribution' || proposalType === 'emergency_withdrawal' || proposalType === 'spending_limit_change') && (
                <div>
                  <label className="block text-orange-300 text-sm mb-2">Amount (sats)</label>
                  <input
                    type="number"
                    value={proposalAmount}
                    onChange={(e) => setProposalAmount(e.target.value)}
                    placeholder="50000"
                    className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none"
                  />
                </div>
              )}
              {(proposalType === 'payment_distribution' || proposalType === 'spending_limit_change') && (
                <div>
                  <label className="block text-orange-300 text-sm mb-2">Recipient</label>
                  <input
                    type="text"
                    value={proposalRecipient}
                    onChange={(e) => setProposalRecipient(e.target.value)}
                    placeholder="alice, bob, or all_children"
                    className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none"
                  />
                </div>
              )}
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowCreateProposal(false)}
                className="flex-1 px-4 py-2 bg-orange-700 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProposal}
                disabled={!proposalDescription.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Proposal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Details Modal */}
      {selectedApproval && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-orange-900 rounded-2xl p-6 max-w-lg w-full border border-orange-400/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Proposal Details</h3>
              <button
                onClick={() => setSelectedApproval(null)}
                className="text-orange-400 hover:text-orange-300"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="text-orange-300 text-sm">Description</div>
                <div className="text-white">{selectedApproval.description}</div>
              </div>
              
              {selectedApproval.amount && (
                <div>
                  <div className="text-orange-300 text-sm">Amount</div>
                  <div className="text-white">{formatSats(selectedApproval.amount)} sats</div>
                </div>
              )}
              
              {selectedApproval.recipient && (
                <div>
                  <div className="text-orange-300 text-sm">Recipient</div>
                  <div className="text-white">{selectedApproval.recipient}</div>
                </div>
              )}
              
              <div>
                <div className="text-orange-300 text-sm">Guardian Approvals</div>
                <div className="space-y-2 mt-2">
                  {selectedApproval.guardianApprovals.map((approval, index) => (
                    <div key={index} className="flex items-center justify-between bg-orange-800/30 rounded p-2">
                      <span className="text-white">{approval.guardianName}</span>
                      <div className={`flex items-center space-x-1 ${
                        approval.approved ? 'text-green-400' : 'text-gray-400'
                      }`}>
                        {approval.approved ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                        <span className="text-sm">
                          {approval.approved ? 'Approved' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-orange-300 text-sm">Created</div>
                  <div className="text-white text-sm">{formatTimeAgo(selectedApproval.createdAt)}</div>
                </div>
                <div>
                  <div className="text-orange-300 text-sm">Expires</div>
                  <div className="text-white text-sm">{formatTimeAgo(selectedApproval.expiresAt)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyFedimintGovernance;