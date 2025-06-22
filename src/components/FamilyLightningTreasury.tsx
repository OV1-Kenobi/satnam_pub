import {
    AlertCircle,
    Bitcoin,
    CheckCircle,
    Copy,
    ExternalLink,
    Loader2,
    QrCode,
    RefreshCw,
    Send,
    Shield,
    TrendingUp,
    Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { LightningTransaction } from '../../types/family';

interface FamilyLightningTreasuryProps {
  familyId: string;
  onSendZap?: (recipient: string, amount: number, message?: string) => void;
  onGenerateInvoice?: (amount: number, description: string) => void;
}

interface LightningTreasuryData {
  lightningBalance: number;
  lightningAddress: string;
  phoenixdStatus: {
    connected: boolean;
    automatedLiquidity: boolean;
    channelCount: number;
    totalCapacity: number;
    liquidityRatio: number;
  };
  recentLightningTransactions: LightningTransaction[];
  zapStats: {
    received24h: number;
    sent24h: number;
    totalReceived24h: number;
    totalSent24h: number;
  };
  channelHealth: {
    status: string;
    inboundLiquidity: number;
    outboundLiquidity: number;
    recommendedAction: string;
  };
}

const FamilyLightningTreasury: React.FC<FamilyLightningTreasuryProps> = ({
  familyId,
  onSendZap,
  onGenerateInvoice,
}) => {
  const [treasuryData, setTreasuryData] = useState<LightningTreasuryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showZapModal, setShowZapModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [zapRecipient, setZapRecipient] = useState('');
  const [zapAmount, setZapAmount] = useState('');
  const [zapMessage, setZapMessage] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceDescription, setInvoiceDescription] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Fetch Lightning treasury data
  const fetchTreasuryData = async () => {
    try {
      setError(null);
      const response = await fetch(`/api/family/lightning/treasury?familyId=${familyId}`);
      const result = await response.json();
      
      if (result.success) {
        setTreasuryData(result.data);
      } else {
        setError(result.error || 'Failed to load Lightning treasury data');
      }
    } catch (err) {
      setError('Network error loading Lightning treasury');
      console.error('Lightning treasury fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTreasuryData();
  };

  // Send zap
  const handleSendZap = async () => {
    if (!zapRecipient || !zapAmount) return;

    try {
      const response = await fetch('/api/family/lightning/zaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyId,
          recipient: zapRecipient,
          amount: parseInt(zapAmount),
          message: zapMessage,
          fromMember: 'current_user', // In real app, get from auth context
        }),
      });

      const result = await response.json();
      if (result.success) {
        setShowZapModal(false);
        setZapRecipient('');
        setZapAmount('');
        setZapMessage('');
        onSendZap?.(zapRecipient, parseInt(zapAmount), zapMessage);
        await fetchTreasuryData(); // Refresh data
      } else {
        setError(result.error || 'Failed to send zap');
      }
    } catch (err) {
      setError('Failed to send zap');
      console.error('Zap send error:', err);
    }
  };

  // Generate invoice
  const handleGenerateInvoice = async () => {
    if (!invoiceAmount || !invoiceDescription) return;

    try {
      // In real implementation, this would call the invoice generation API
      onGenerateInvoice?.(parseInt(invoiceAmount), invoiceDescription);
      setShowInvoiceModal(false);
      setInvoiceAmount('');
      setInvoiceDescription('');
    } catch (err) {
      setError('Failed to generate invoice');
      console.error('Invoice generation error:', err);
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
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

  useEffect(() => {
    fetchTreasuryData();
    
    // Set up periodic refresh
    const interval = setInterval(fetchTreasuryData, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [familyId]);

  if (loading) {
    return (
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 text-orange-400 animate-spin" />
          <span className="ml-3 text-orange-200">Loading Lightning Treasury...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-orange-900 rounded-2xl p-6 border border-red-400/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-6 w-6 text-red-400" />
            <h3 className="text-lg font-semibold text-white">Lightning Treasury Error</h3>
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

  if (!treasuryData) return null;

  return (
    <div className="space-y-6">
      {/* Lightning Treasury Header */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-full flex items-center justify-center">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Lightning Treasury</h2>
              <p className="text-orange-300">External payments & Nostr zaps</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 text-orange-400 hover:text-orange-300 transition-colors"
            disabled={refreshing}
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Balance and Address */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">Lightning Balance</span>
              <Bitcoin className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {formatSats(treasuryData.lightningBalance)} sats
            </div>
            <div className="text-sm text-orange-300">
              ≈ ${(treasuryData.lightningBalance * 0.00003).toFixed(2)} USD
            </div>
          </div>

          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-300">Lightning Address</span>
              <div className="flex space-x-2">
                <button
                  onClick={() => copyToClipboard(treasuryData.lightningAddress)}
                  className="text-orange-400 hover:text-orange-300"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <ExternalLink className="h-4 w-4 text-orange-400" />
              </div>
            </div>
            <div className="text-lg font-mono text-white break-all">
              {treasuryData.lightningAddress}
            </div>
          </div>
        </div>

        {/* PhoenixD Status */}
        <div className="bg-orange-800/30 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">PhoenixD Status</h3>
            <div className={`flex items-center space-x-2 ${
              treasuryData.phoenixdStatus.connected ? 'text-green-400' : 'text-red-400'
            }`}>
              {treasuryData.phoenixdStatus.connected ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              <span>{treasuryData.phoenixdStatus.connected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-orange-300 text-sm">Channels</div>
              <div className="text-white font-semibold">{treasuryData.phoenixdStatus.channelCount}</div>
            </div>
            <div>
              <div className="text-orange-300 text-sm">Capacity</div>
              <div className="text-white font-semibold">{formatSats(treasuryData.phoenixdStatus.totalCapacity)}</div>
            </div>
            <div>
              <div className="text-orange-300 text-sm">Liquidity Ratio</div>
              <div className="text-white font-semibold">{(treasuryData.phoenixdStatus.liquidityRatio * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-orange-300 text-sm">Auto Liquidity</div>
              <div className={`font-semibold ${
                treasuryData.phoenixdStatus.automatedLiquidity ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {treasuryData.phoenixdStatus.automatedLiquidity ? 'Enabled' : 'Disabled'}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowZapModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
            <Zap className="h-4 w-4" />
            <span>Send Zap</span>
          </button>
          <button
            onClick={() => setShowInvoiceModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <QrCode className="h-4 w-4" />
            <span>Generate Invoice</span>
          </button>
        </div>
      </div>

      {/* Zap Stats */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <h3 className="text-lg font-semibold text-white mb-4">24h Zap Activity</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="text-orange-300 text-sm">Zaps Received</div>
            <div className="text-2xl font-bold text-white">{treasuryData.zapStats.received24h}</div>
            <div className="text-sm text-green-400">+{formatSats(treasuryData.zapStats.totalReceived24h)} sats</div>
          </div>
          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="text-orange-300 text-sm">Zaps Sent</div>
            <div className="text-2xl font-bold text-white">{treasuryData.zapStats.sent24h}</div>
            <div className="text-sm text-red-400">-{formatSats(treasuryData.zapStats.totalSent24h)} sats</div>
          </div>
          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="text-orange-300 text-sm">Net Flow</div>
            <div className="text-2xl font-bold text-white">
              {formatSats(treasuryData.zapStats.totalReceived24h - treasuryData.zapStats.totalSent24h)}
            </div>
            <div className="text-sm text-green-400">sats</div>
          </div>
          <div className="bg-orange-800/50 rounded-xl p-4">
            <div className="text-orange-300 text-sm">Channel Health</div>
            <div className={`text-lg font-semibold ${
              treasuryData.channelHealth.status === 'good' ? 'text-green-400' : 
              treasuryData.channelHealth.status === 'warning' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {treasuryData.channelHealth.status.charAt(0).toUpperCase() + treasuryData.channelHealth.status.slice(1)}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Lightning Transactions */}
      <div className="bg-orange-900 rounded-2xl p-6 border border-orange-400/20">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Lightning Transactions</h3>
        <div className="space-y-3">
          {treasuryData.recentLightningTransactions.map((tx) => (
            <div key={tx.id} className="bg-orange-800/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    tx.direction === 'incoming' ? 'bg-green-500/20' : 'bg-red-500/20'
                  }`}>
                    {tx.direction === 'incoming' ? (
                      <TrendingUp className="h-4 w-4 text-green-400" />
                    ) : (
                      <Send className="h-4 w-4 text-red-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-white font-medium">{tx.description}</div>
                    <div className="text-orange-300 text-sm">
                      {tx.direction === 'incoming' ? 'From' : 'To'}: {tx.direction === 'incoming' ? tx.from : tx.to}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${
                    tx.direction === 'incoming' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {tx.direction === 'incoming' ? '+' : '-'}{formatSats(tx.amount)} sats
                  </div>
                  <div className="text-orange-300 text-sm">
                    {formatTimeAgo(tx.timestamp)}
                  </div>
                </div>
              </div>
              {tx.privacyRouted && (
                <div className="mt-2 flex items-center space-x-1 text-xs text-blue-400">
                  <Shield className="h-3 w-3" />
                  <span>Privacy routed via LNProxy</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Zap Modal */}
      {showZapModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-orange-900 rounded-2xl p-6 max-w-md w-full border border-orange-400/20">
            <h3 className="text-xl font-bold text-white mb-4">Send Nostr Zap</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-orange-300 text-sm mb-2">Recipient</label>
                <input
                  type="text"
                  value={zapRecipient}
                  onChange={(e) => setZapRecipient(e.target.value)}
                  placeholder="npub... or user@domain.com"
                  className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-orange-300 text-sm mb-2">Amount (sats)</label>
                <input
                  type="number"
                  value={zapAmount}
                  onChange={(e) => setZapAmount(e.target.value)}
                  placeholder="1000"
                  className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-orange-300 text-sm mb-2">Message (optional)</label>
                <textarea
                  value={zapMessage}
                  onChange={(e) => setZapMessage(e.target.value)}
                  placeholder="Great post! ⚡"
                  rows={3}
                  className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowZapModal(false)}
                className="flex-1 px-4 py-2 bg-orange-700 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendZap}
                disabled={!zapRecipient || !zapAmount}
                className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send Zap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-orange-900 rounded-2xl p-6 max-w-md w-full border border-orange-400/20">
            <h3 className="text-xl font-bold text-white mb-4">Generate Lightning Invoice</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-orange-300 text-sm mb-2">Amount (sats)</label>
                <input
                  type="number"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  placeholder="10000"
                  className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-orange-300 text-sm mb-2">Description</label>
                <input
                  type="text"
                  value={invoiceDescription}
                  onChange={(e) => setInvoiceDescription(e.target.value)}
                  placeholder="Payment to family treasury"
                  className="w-full px-3 py-2 bg-orange-800 text-white rounded-lg border border-orange-600 focus:border-orange-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowInvoiceModal(false)}
                className="flex-1 px-4 py-2 bg-orange-700 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateInvoice}
                disabled={!invoiceAmount || !invoiceDescription}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyLightningTreasury;