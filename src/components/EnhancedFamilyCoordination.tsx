/**
 * ENHANCED FAMILY COORDINATION DASHBOARD
 * 
 * Advanced family Bitcoin coordination with liquidity intelligence,
 * automated payments, emergency protocols, and member management
 * Replaces basic FamilyCoordination with superior features
 */

import {
  Activity,
  Bitcoin,
  Brain,
  Crown,
  DollarSign,
  Home,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Users
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EnhancedPhoenixdManager } from '../lib/enhanced-phoenixd-manager.js';
import { LiquidityIntelligenceSystem, LiquidityMetrics } from '../lib/liquidity-intelligence.js';
import EnhancedLiquidityDashboard from './EnhancedLiquidityDashboard';

interface EnhancedFamilyCoordinationProps {
  familyId: string;
  onBack: () => void;
}

interface FamilyMember {
  id: string;
  name: string;
  role: 'guardian' | 'adult' | 'teen' | 'child';
  avatar?: string;
  status: 'active' | 'inactive' | 'pending';
  permissions: {
    canSpend: boolean;
    canReceive: boolean;
    canManagePayments: boolean;
    canViewFamily: boolean;
    maxDailySpend: number;
  };
  stats: {
    totalReceived: number;
    totalSpent: number;
    paymentBalance: number;
    lastActivity: Date;
  };
  preferences: {
    notifications: boolean;
    autoPayments: boolean;
    privacyMode: boolean;
  };
}

interface FamilyCoordinationTask {
  id: string;
  title: string;
  description: string;
  assignee: string;
  dueDate: Date;
  status: 'pending' | 'in-progress' | 'completed' | 'overdue';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'security' | 'education' | 'treasury' | 'infrastructure' | 'governance';
  automationAvailable?: boolean;
  linkedServices?: string[];
}

interface FamilyPaymentRule {
  id: string;
  memberId: string;
  memberName: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  enabled: boolean;
  conditions: {
    minBalance: number;
    maxBalance: number;
    requiresApproval: boolean;
    pauseOnOverspend: boolean;
  };
  automation: {
    enabled: boolean;
    nextDistribution: Date;
    totalDistributed: number;
    distributionCount: number;
  };
}

interface FamilyGovernanceProposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  type: 'payment_change' | 'member_permissions' | 'security_update' | 'infrastructure_change';
  votes: { member: string; vote: 'yes' | 'no' | 'abstain'; weight: number }[];
  status: 'active' | 'passed' | 'rejected' | 'pending';
  deadline: Date;
  impact: {
    affectedMembers: string[];
    financialImpact: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
}

interface FamilyTreasury {
  totalBalance: number;
  allocatedBalance: number;
  unallocatedBalance: number;
  emergencyReserve: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  paymentBudget: number;
  breakdown: {
    onchain: number;
    lightning: number;
    cashu: number;
    fedimint: number;
  };
  performance: {
    growth: number;
    efficiency: number;
    savingsRate: number;
  };
}

export default function EnhancedFamilyCoordination({
  familyId,
  onBack
}: EnhancedFamilyCoordinationProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'payments' | 'treasury' | 'governance' | 'liquidity'>('overview');
  const [loading, setLoading] = useState(true);
  const [familyName] = useState('Nakamoto Family');

  // Enhanced state management
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [paymentRules, setPaymentRules] = useState<FamilyPaymentRule[]>([]);
  const [coordinationTasks, setCoordinationTasks] = useState<FamilyCoordinationTask[]>([]);
  const [governanceProposals, setGovernanceProposals] = useState<FamilyGovernanceProposal[]>([]);
  const [familyTreasury, setFamilyTreasury] = useState<FamilyTreasury | null>(null);
  const [liquidityMetrics, setLiquidityMetrics] = useState<LiquidityMetrics | null>(null);

  // Systems integration
  const [liquiditySystem] = useState(() => new LiquidityIntelligenceSystem());
  const [phoenixdManager] = useState(() => new EnhancedPhoenixdManager(liquiditySystem));

  const loadFamilyCoordinationData = useCallback(async () => {
    try {
      setLoading(true);

      // Load all family coordination data concurrently
      const [members, payments, tasks, proposals, treasury, metrics] = await Promise.all([
        loadFamilyMembers(),
        loadPaymentRules(),
        loadCoordinationTasks(),
        loadGovernanceProposals(),
        loadFamilyTreasury(),
        liquiditySystem.getLiquidityMetrics(familyId)
      ]);

      setFamilyMembers(members);
      setPaymentRules(payments);
      setCoordinationTasks(tasks);
      setGovernanceProposals(proposals);
      setFamilyTreasury(treasury);
      setLiquidityMetrics(metrics);
    } catch (error) {
      console.error('Failed to load family coordination data:', error);
    } finally {
      setLoading(false);
    }
  }, [familyId, liquiditySystem]);

  useEffect(() => {
    loadFamilyCoordinationData();
    const interval = setInterval(loadFamilyCoordinationData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [loadFamilyCoordinationData]);

  const loadFamilyMembers = async (): Promise<FamilyMember[]> => {
    // Mock enhanced family members data - integrate with actual API
    return [
      {
        id: 'member_001',
        name: 'Satoshi',
        role: 'guardian',
        avatar: '👨‍💼',
        status: 'active',
        permissions: {
          canSpend: true,
          canReceive: true,
          canManagePayments: true,
          canViewFamily: true,
          maxDailySpend: 1000000,
        },
        stats: {
          totalReceived: 5000000,
          totalSpent: 2500000,
          paymentBalance: 0,
          lastActivity: new Date(),
        },
        preferences: {
          notifications: true,
          autoPayments: false,
          privacyMode: true,
        },
      },
      {
        id: 'member_002',
        name: 'Alice',
        role: 'teen',
        avatar: '👧',
        status: 'active',
        permissions: {
          canSpend: true,
          canReceive: true,
          canManagePayments: false,
          canViewFamily: true,
          maxDailySpend: 50000,
        },
        stats: {
          totalReceived: 200000,
          totalSpent: 150000,
          paymentBalance: 50000,
          lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
        preferences: {
          notifications: true,
          autoPayments: true,
          privacyMode: false,
        },
      },
      {
        id: 'member_003',
        name: 'Bob',
        role: 'child',
        avatar: '👦',
        status: 'active',
        permissions: {
          canSpend: true,
          canReceive: true,
          canManagePayments: false,
          canViewFamily: false,
          maxDailySpend: 20000,
        },
        stats: {
          totalReceived: 100000,
          totalSpent: 80000,
          paymentBalance: 20000,
          lastActivity: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        preferences: {
          notifications: false,
          autoPayments: true,
          privacyMode: false,
        },
      },
    ];
  };

  const loadPaymentRules = async (): Promise<FamilyPaymentRule[]> => {
    return [
      {
        id: 'payment_001',
        memberId: 'member_002',
        memberName: 'Alice',
        amount: 25000,
        frequency: 'weekly',
        enabled: true,
        conditions: {
          minBalance: 10000,
          maxBalance: 100000,
          requiresApproval: false,
          pauseOnOverspend: true,
        },
        automation: {
          enabled: true,
          nextDistribution: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          totalDistributed: 300000,
          distributionCount: 12,
        },
      },
      {
        id: 'payment_002',
        memberId: 'member_003',
        memberName: 'Bob',
        amount: 10000,
        frequency: 'weekly',
        enabled: true,
        conditions: {
          minBalance: 5000,
          maxBalance: 50000,
          requiresApproval: true,
          pauseOnOverspend: true,
        },
        automation: {
          enabled: true,
          nextDistribution: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          totalDistributed: 120000,
          distributionCount: 12,
        },
      },
    ];
  };

  const loadCoordinationTasks = async (): Promise<FamilyCoordinationTask[]> => {
    return [
      {
        id: 'task_001',
        title: 'Setup Emergency Lightning Recovery',
        description: 'Configure family emergency lightning recovery procedures',
        assignee: 'Satoshi',
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        status: 'in-progress',
        priority: 'high',
        category: 'security',
        automationAvailable: true,
        linkedServices: ['PhoenixD', 'Voltage'],
      },
      {
        id: 'task_002',
        title: 'Optimize Family Liquidity',
        description: 'Review and optimize family Lightning liquidity distribution',
        assignee: 'System',
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        status: 'pending',
        priority: 'medium',
        category: 'treasury',
        automationAvailable: true,
        linkedServices: ['LiquidityIntelligence'],
      },
      {
        id: 'task_003',
        title: 'Update Payment Rules',
        description: 'Review and update automated payment distribution rules',
        assignee: 'Satoshi',
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        status: 'pending',
        priority: 'low',
        category: 'governance',
        automationAvailable: false,
      },
    ];
  };

  const loadGovernanceProposals = async (): Promise<FamilyGovernanceProposal[]> => {
    return [
      {
        id: 'proposal_001',
        title: 'Increase Alice Weekly Payment',
        description: 'Proposal to increase Alice\'s weekly payment from 25k to 35k sats',
        proposer: 'Alice',
        type: 'payment_change',
        votes: [
          { member: 'Satoshi', vote: 'yes', weight: 2 },
          { member: 'Alice', vote: 'yes', weight: 1 },
        ],
        status: 'active',
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        impact: {
          affectedMembers: ['Alice'],
          financialImpact: 40000, // 10k * 4 weeks
          riskLevel: 'low',
        },
      },
    ];
  };

  const loadFamilyTreasury = async (): Promise<FamilyTreasury> => {
    return {
      totalBalance: 8500000,
      allocatedBalance: 6000000,
      unallocatedBalance: 2500000,
      emergencyReserve: 1000000,
      monthlyIncome: 500000,
      monthlyExpenses: 200000,
      paymentBudget: 140000,
      breakdown: {
        onchain: 7000000,
        lightning: 1200000,
        cashu: 200000,
        fedimint: 100000,
      },
      performance: {
        growth: 15.2,
        efficiency: 88.5,
        savingsRate: 60.0,
      },
    };
  };

  const formatSats = (sats: number): string => {
    if (sats >= 100000000) return `${(sats / 100000000).toFixed(2)} BTC`;
    if (sats >= 1000000) return `${(sats / 1000000).toFixed(1)}M`;
    if (sats >= 1000) return `${(sats / 1000).toFixed(0)}K`;
    return sats.toString();
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active': case 'completed': return 'text-green-400';
      case 'pending': case 'in-progress': return 'text-yellow-400';
      case 'overdue': case 'rejected': return 'text-red-400';
      case 'inactive': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'critical': return 'text-red-400 bg-red-500/20';
      case 'high': return 'text-orange-400 bg-orange-500/20';
      case 'medium': return 'text-yellow-400 bg-yellow-500/20';
      case 'low': return 'text-blue-400 bg-blue-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Family Treasury Overview */}
      {familyTreasury && (
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center space-x-2">
            <Bitcoin className="h-6 w-6 text-orange-400" />
            <span>Family Treasury</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-700/30 rounded-lg p-4">
              <div className="text-gray-300 text-sm">Total Balance</div>
              <div className="text-2xl font-bold text-white">{formatSats(familyTreasury.totalBalance)}</div>
              <div className="text-green-400 text-sm">+{familyTreasury.performance.growth}% growth</div>
            </div>
            <div className="bg-gray-700/30 rounded-lg p-4">
              <div className="text-gray-300 text-sm">Available</div>
              <div className="text-2xl font-bold text-white">{formatSats(familyTreasury.unallocatedBalance)}</div>
              <div className="text-gray-400 text-sm">Unallocated funds</div>
            </div>
            <div className="bg-gray-700/30 rounded-lg p-4">
              <div className="text-gray-300 text-sm">Monthly Income</div>
              <div className="text-2xl font-bold text-white">{formatSats(familyTreasury.monthlyIncome)}</div>
              <div className="text-blue-400 text-sm">Avg per month</div>
            </div>
            <div className="bg-gray-700/30 rounded-lg p-4">
              <div className="text-gray-300 text-sm">Savings Rate</div>
              <div className="text-2xl font-bold text-white">{familyTreasury.performance.savingsRate}%</div>
              <div className="text-purple-400 text-sm">Efficiency score</div>
            </div>
          </div>

          {/* Protocol breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-gray-700/20 rounded-lg">
              <div className="font-semibold text-white">{formatSats(familyTreasury.breakdown.onchain)}</div>
              <div className="text-gray-400 text-sm">On-chain</div>
            </div>
            <div className="text-center p-3 bg-gray-700/20 rounded-lg">
              <div className="font-semibold text-white">{formatSats(familyTreasury.breakdown.lightning)}</div>
              <div className="text-gray-400 text-sm">Lightning</div>
            </div>
            <div className="text-center p-3 bg-gray-700/20 rounded-lg">
              <div className="font-semibold text-white">{formatSats(familyTreasury.breakdown.cashu)}</div>
              <div className="text-gray-400 text-sm">Cashu</div>
            </div>
            <div className="text-center p-3 bg-gray-700/20 rounded-lg">
              <div className="font-semibold text-white">{formatSats(familyTreasury.breakdown.fedimint)}</div>
              <div className="text-gray-400 text-sm">Fedimint</div>
            </div>
          </div>
        </div>
      )}

      {/* Active Tasks & Governance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tasks */}
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
          <h4 className="text-lg font-medium text-white mb-4">Active Tasks</h4>
          <div className="space-y-3">
            {coordinationTasks.slice(0, 3).map((task) => (
              <div key={task.id} className="flex items-start space-x-3 p-3 bg-gray-700/30 rounded-lg">
                <div className={`px-2 py-1 rounded text-xs ${getPriorityColor(task.priority)}`}>
                  {task.priority}
                </div>
                <div className="flex-1">
                  <div className="text-white font-medium">{task.title}</div>
                  <div className="text-gray-400 text-sm">{task.description}</div>
                  <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                    <span>Assigned: {task.assignee}</span>
                    <span className={getStatusColor(task.status)}>{task.status}</span>
                  </div>
                </div>
                {task.automationAvailable && (
                  <div className="p-1 bg-purple-500/20 rounded">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Active Governance */}
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
          <h4 className="text-lg font-medium text-white mb-4">Governance</h4>
          <div className="space-y-3">
            {governanceProposals.filter(p => p.status === 'active').map((proposal) => (
              <div key={proposal.id} className="p-3 bg-gray-700/30 rounded-lg">
                <div className="text-white font-medium">{proposal.title}</div>
                <div className="text-gray-400 text-sm mb-2">{proposal.description}</div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    Votes: {proposal.votes.length} | Impact: {formatSats(proposal.impact.financialImpact)}
                  </div>
                  <div className="text-xs text-yellow-400">
                    {Math.ceil((proposal.deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000))} days left
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Family Members Summary */}
      <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
        <h4 className="text-lg font-medium text-white mb-4">Family Members</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {familyMembers.map((member) => (
            <div key={member.id} className="flex items-center space-x-3 p-4 bg-gray-700/30 rounded-lg">
              <div className="text-2xl">{member.avatar}</div>
              <div className="flex-1">
                <div className="text-white font-medium flex items-center space-x-2">
                  <span>{member.name}</span>
                  {member.role === 'guardian' && <Crown className="h-4 w-4 text-yellow-400" />}
                </div>
                <div className="text-gray-400 text-sm capitalize">{member.role}</div>
                <div className="text-gray-500 text-xs">
                  Balance: {formatSats(member.stats.paymentBalance)}
                </div>
              </div>
              <div className={`w-2 h-2 rounded-full ${member.status === 'active' ? 'bg-green-400' : 'bg-gray-400'
                }`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderMembersTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">Family Members</h3>
        <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
          <Plus className="h-4 w-4" />
          <span>Add Member</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {familyMembers.map((member) => (
          <div key={member.id} className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="text-3xl">{member.avatar}</div>
                <div>
                  <div className="text-white font-semibold flex items-center space-x-2">
                    <span>{member.name}</span>
                    {member.role === 'guardian' && <Crown className="h-4 w-4 text-yellow-400" />}
                  </div>
                  <div className="text-gray-400 capitalize">{member.role}</div>
                </div>
              </div>
              <div className={`px-2 py-1 rounded text-xs ${member.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                }`}>
                {member.status}
              </div>
            </div>

            {/* Member Stats */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-700/30 rounded-lg p-3">
                <div className="text-gray-300 text-sm">Balance</div>
                <div className="font-semibold text-white">{formatSats(member.stats.paymentBalance)}</div>
              </div>
              <div className="bg-gray-700/30 rounded-lg p-3">
                <div className="text-gray-300 text-sm">Daily Limit</div>
                <div className="font-semibold text-white">{formatSats(member.permissions.maxDailySpend)}</div>
              </div>
              <div className="bg-gray-700/30 rounded-lg p-3">
                <div className="text-gray-300 text-sm">Total Received</div>
                <div className="font-semibold text-white">{formatSats(member.stats.totalReceived)}</div>
              </div>
              <div className="bg-gray-700/30 rounded-lg p-3">
                <div className="text-gray-300 text-sm">Total Spent</div>
                <div className="font-semibold text-white">{formatSats(member.stats.totalSpent)}</div>
              </div>
            </div>

            {/* Permissions */}
            <div className="space-y-2">
              <div className="text-gray-300 text-sm font-medium">Permissions</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(member.permissions).map(([key, value]) => (
                  typeof value === 'boolean' && (
                    <div key={key} className={`px-2 py-1 rounded text-xs ${value ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                      {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPaymentsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">Automated Payments</h3>
        <button className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
          <Plus className="h-4 w-4" />
          <span>Create Rule</span>
        </button>
      </div>

      <div className="space-y-4">
        {paymentRules.map((rule) => (
          <div key={rule.id} className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-white font-semibold flex items-center space-x-2">
                  <span>{rule.memberName} - {rule.frequency} payment</span>
                  {rule.automation.enabled && <Sparkles className="h-4 w-4 text-purple-400" />}
                </div>
                <div className="text-gray-400">{formatSats(rule.amount)} every {rule.frequency}</div>
              </div>
              <div className={`px-2 py-1 rounded text-xs ${rule.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                }`}>
                {rule.enabled ? 'Active' : 'Paused'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-700/30 rounded-lg p-3">
                <div className="text-gray-300 text-sm">Next Payment</div>
                <div className="font-semibold text-white">
                  {rule.automation.nextDistribution.toLocaleDateString()}
                </div>
              </div>
              <div className="bg-gray-700/30 rounded-lg p-3">
                <div className="text-gray-300 text-sm">Total Distributed</div>
                <div className="font-semibold text-white">{formatSats(rule.automation.totalDistributed)}</div>
              </div>
              <div className="bg-gray-700/30 rounded-lg p-3">
                <div className="text-gray-300 text-sm">Payment Count</div>
                <div className="font-semibold text-white">{rule.automation.distributionCount}</div>
              </div>
            </div>

            {/* Conditions */}
            <div className="space-y-2">
              <div className="text-gray-300 text-sm font-medium">Conditions</div>
              <div className="flex flex-wrap gap-2 text-xs">
                <div className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
                  Min: {formatSats(rule.conditions.minBalance)}
                </div>
                <div className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
                  Max: {formatSats(rule.conditions.maxBalance)}
                </div>
                {rule.conditions.requiresApproval && (
                  <div className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded">
                    Requires Approval
                  </div>
                )}
                {rule.conditions.pauseOnOverspend && (
                  <div className="px-2 py-1 bg-red-500/20 text-red-400 rounded">
                    Pause on Overspend
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderLiquidityTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">Family Liquidity Intelligence</h3>
        <div className="text-sm text-gray-400">
          Powered by Bolt AI
        </div>
      </div>

      <EnhancedLiquidityDashboard
        familyId={familyId}
        onChannelAction={(action, channelId) => {
          console.log(`Channel action: ${action} on ${channelId}`);
        }}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center space-x-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          <span className="text-gray-300">Loading family coordination...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <Home className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center space-x-2">
              <Users className="h-6 w-6 text-blue-400" />
              <span>{familyName}</span>
            </h1>
            <p className="text-gray-400">Advanced family Bitcoin coordination</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 px-3 py-1 bg-green-500/20 text-green-400 rounded-lg text-sm">
            <Brain className="h-4 w-4" />
            <span>AI Enhanced</span>
          </div>
          <button
            onClick={loadFamilyCoordinationData}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-400' : 'text-gray-300'}`} />
            <span className="text-gray-300">Refresh</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
        <nav
          className="flex flex-wrap gap-2"
          aria-label="Family coordination sections"
        >
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'members', label: 'Members', icon: Users },
            { id: 'payments', label: 'Payments', icon: DollarSign },
            { id: 'treasury', label: 'Treasury', icon: Bitcoin },
            { id: 'governance', label: 'Governance', icon: Crown },
            { id: 'liquidity', label: 'Liquidity', icon: Brain },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm md:text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-400 focus-visible:ring-offset-gray-900 ${isActive
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'members' && renderMembersTab()}
        {activeTab === 'payments' && renderPaymentsTab()}
        {activeTab === 'liquidity' && renderLiquidityTab()}
        {activeTab === 'treasury' && (
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
            <h4 className="text-lg font-medium text-white mb-4">Treasury Management</h4>
            <p className="text-gray-400">Advanced treasury management features coming soon...</p>
          </div>
        )}
        {activeTab === 'governance' && (
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
            <h4 className="text-lg font-medium text-white mb-4">Family Governance</h4>
            <p className="text-gray-400">Governance proposals and voting system coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
}