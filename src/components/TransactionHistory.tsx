import {
    ArrowLeft,
    ArrowRight,
    CheckCircle,
    Clock,
    Download,
    RefreshCw,
    Search,
    Shield,
    XCircle
} from "lucide-react";
import React, { useEffect, useState } from "react";

interface Transaction {
  id: string;
  type: "sent" | "received";
  amount: number;
  from: string;
  to: string;
  memo?: string;
  timestamp: Date;
  privacyRouted: boolean;
  status: "completed" | "pending" | "failed";
}

interface TransactionHistoryProps {
  familyId: string;
  limit?: number;
  showFilters?: boolean;
}

const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  familyId,
  limit = 10,
  showFilters = false,
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "sent" | "received">("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [satsToDollars, setSatsToDollars] = useState(0.0004); // Mock rate: 1 sat = $0.0004 (1 BTC = $40,000)

  // Fetch transactions
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setIsLoading(true);
        // In a real implementation, this would be an API call
        // const response = await fetch(`/api/payments/history?familyId=${familyId}&limit=${limit}`);
        // const data = await response.json();
        
        // Mock data for demonstration
        const mockTransactions: Transaction[] = [
          {
            id: "tx1",
            type: "received",
            amount: 50000,
            from: "alice@getalby.com",
            to: "david@satnam.pub",
            memo: "Payment for services",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
            privacyRouted: true,
            status: "completed",
          },
          {
            id: "tx2",
            type: "sent",
            amount: 25000,
            from: "david@satnam.pub",
            to: "emma@satnam.pub",
            memo: "Weekly allowance",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4),
            privacyRouted: true,
            status: "completed",
          },
          {
            id: "tx3",
            type: "sent",
            amount: 15000,
            from: "sarah@satnam.pub",
            to: "bob@walletofsatoshi.com",
            memo: "Dinner payment",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
            privacyRouted: true,
            status: "completed",
          },
          {
            id: "tx4",
            type: "received",
            amount: 10000,
            from: "john@strike.me",
            to: "bob@satnam.pub",
            memo: "Birthday gift",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
            privacyRouted: true,
            status: "completed",
          },
          {
            id: "tx5",
            type: "sent",
            amount: 5000,
            from: "emma@satnam.pub",
            to: "friend@ln.tips",
            memo: "Game purchase",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72),
            privacyRouted: true,
            status: "completed",
          },
          {
            id: "tx6",
            type: "received",
            amount: 75000,
            from: "client@btcpay.com",
            to: "sarah@satnam.pub",
            memo: "Consulting fee",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 96),
            privacyRouted: true,
            status: "completed",
          },
          {
            id: "tx7",
            type: "sent",
            amount: 30000,
            from: "david@satnam.pub",
            to: "store@ln.store",
            memo: "Online purchase",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 120),
            privacyRouted: false, // Example of non-privacy routed
            status: "completed",
          },
          {
            id: "tx8",
            type: "sent",
            amount: 12000,
            from: "bob@satnam.pub",
            to: "game@zebedee.io",
            memo: "Game credits",
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 144),
            privacyRouted: true,
            status: "pending",
          },
        ];
        
        setTransactions(mockTransactions);
        setIsLoading(false);
      } catch (err) {
        setError("Failed to load transaction history");
        setIsLoading(false);
        console.error("Error fetching transactions:", err);
      }
    };

    fetchTransactions();
  }, [familyId, limit]);

  const refreshTransactions = async () => {
    setIsRefreshing(true);
    try {
      // In a real implementation, this would be an API call
      // const response = await fetch(`/api/payments/history?familyId=${familyId}&limit=${limit}`);
      // const data = await response.json();
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // For demo, we'll just use the same mock data
      setIsRefreshing(false);
    } catch (err) {
      console.error("Error refreshing transactions:", err);
      setIsRefreshing(false);
    }
  };

  const formatSats = (sats: number): string => {
    return new Intl.NumberFormat().format(sats);
  };

  const formatDollars = (sats: number): string => {
    const dollars = sats * satsToDollars;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(dollars);
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "completed":
        return "text-green-400";
      case "pending":
        return "text-yellow-400";
      default:
        return "text-red-400";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      case "pending":
        return <Clock className="h-4 w-4" />;
      default:
        return <XCircle className="h-4 w-4" />;
    }
  };

  const formatTimeAgo = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds} seconds ago`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  };

  // Filter transactions based on search term and filter type
  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = 
      searchTerm === "" || 
      tx.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.to.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.memo && tx.memo.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = 
      filterType === "all" || 
      tx.type === filterType;
    
    return matchesSearch && matchesType;
  });

  if (isLoading) {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-white">Loading transaction history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 backdrop-blur-sm rounded-2xl p-6 border border-red-500/50 text-center">
        <XCircle className="h-8 w-8 text-red-400 mx-auto mb-4" />
        <p className="text-white font-bold mb-2">Failed to load transactions</p>
        <p className="text-red-200">{error}</p>
        <button 
          className="mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 flex items-center space-x-2 mx-auto"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-4 w-4" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Transaction History</h2>
        
        <div className="flex items-center space-x-3">
          {showFilters && (
            <>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-200 focus:outline-none focus:border-yellow-400 transition-all duration-300"
                />
                <Search className="h-4 w-4 text-purple-200 absolute left-3 top-1/2 transform -translate-y-1/2" />
              </div>
              
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as "all" | "sent" | "received")}
                className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-yellow-400 transition-all duration-300"
              >
                <option value="all">All</option>
                <option value="sent">Sent</option>
                <option value="received">Received</option>
              </select>
            </>
          )}
          
          <button 
            onClick={refreshTransactions}
            disabled={isRefreshing}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all duration-300 disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 text-white ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          
          <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all duration-300">
            <Download className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th className="pb-3 text-purple-200 font-semibold">Type</th>
              <th className="pb-3 text-purple-200 font-semibold">Amount</th>
              <th className="pb-3 text-purple-200 font-semibold">From</th>
              <th className="pb-3 text-purple-200 font-semibold">To</th>
              <th className="pb-3 text-purple-200 font-semibold">Time</th>
              <th className="pb-3 text-purple-200 font-semibold">Privacy</th>
              <th className="pb-3 text-purple-200 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((tx) => (
              <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3">
                  <span className={`inline-flex items-center space-x-1 ${tx.type === "received" ? "text-green-400" : "text-red-400"}`}>
                    {tx.type === "received" ? (
                      <ArrowLeft className="h-4 w-4" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    <span className="capitalize">{tx.type}</span>
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex flex-col">
                    <span className="text-white font-semibold">{formatSats(tx.amount)} sats</span>
                    <span className="text-purple-200 text-xs">{formatDollars(tx.amount)}</span>
                  </div>
                </td>
                <td className="py-3">
                  <span className="text-white font-mono text-sm">{tx.from}</span>
                </td>
                <td className="py-3">
                  <span className="text-white font-mono text-sm">{tx.to}</span>
                </td>
                <td className="py-3">
                  <span className="text-purple-200 text-sm">{formatTimeAgo(tx.timestamp)}</span>
                </td>
                <td className="py-3">
                  {tx.privacyRouted ? (
                    <div className="flex items-center space-x-1 text-green-400">
                      <Shield className="h-4 w-4" />
                      <span className="text-xs">Protected</span>
                    </div>
                  ) : (
                    <span className="text-yellow-400 text-xs">Standard</span>
                  )}
                </td>
                <td className="py-3">
                  <div className={`flex items-center space-x-1 ${getStatusColor(tx.status)}`}>
                    {getStatusIcon(tx.status)}
                    <span className="text-sm capitalize">{tx.status}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {filteredTransactions.length === 0 && (
        <div className="text-center py-8">
          <p className="text-purple-200">No transactions found</p>
        </div>
      )}
      
      {transactions.length > limit && (
        <div className="mt-4 text-center">
          <button className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300">
            View All Transactions
          </button>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;