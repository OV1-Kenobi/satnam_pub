import { ArrowLeft, ArrowRight, Shield } from "lucide-react";
import React from "react";
import { Transaction } from "./types";
import { formatDollars, formatSats, formatTimeAgo, getStatusColor } from "./utils";

interface TransactionHistorySectionProps {
  transactions: Transaction[];
  satsToDollars: number;
}

const TransactionHistorySection: React.FC<TransactionHistorySectionProps> = ({
  transactions,
  satsToDollars,
}) => {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <h2 className="text-2xl font-bold text-white mb-6">Recent Transactions</h2>

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
            {transactions.map((tx) => (
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
                    <span className="text-purple-200 text-xs">{formatDollars(tx.amount, satsToDollars)}</span>
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
                  <span className={`text-sm ${getStatusColor(tx.status)}`}>
                    {tx.status === "completed" ? "Completed" : tx.status === "pending" ? "Pending" : "Failed"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {transactions.length === 0 && (
        <div className="text-center py-8">
          <p className="text-purple-200">No transactions yet</p>
        </div>
      )}
    </div>
  );
};

export default TransactionHistorySection;