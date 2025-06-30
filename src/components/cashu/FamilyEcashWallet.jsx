import { useEffect, useState } from 'react';
import { FamilyNostrFederation } from '../fedimint/FamilyNostrFederation';

export function FamilyEcashWallet({ familyMember }) {
  const [ecashBalance, setEcashBalance] = useState(0);
  const [lightningBalance, setLightningBalance] = useState(0);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDirection, setTransferDirection] = useState('lightning-to-ecash');
  
  const federation = new FamilyNostrFederation();

  useEffect(() => {
    loadBalances();
  }, [familyMember.id]);

  const loadBalances = async () => {
    try {
      const balances = await federation.getFamilyEcashBalances();
      setEcashBalance(balances[familyMember.id]?.ecash || 0);
      setLightningBalance(balances[familyMember.id]?.lightning || 0);
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  };

  const handleTransfer = async () => {
    if (!transferAmount || transferAmount <= 0) return;
    
    try {
      if (transferDirection === 'lightning-to-ecash') {
        await federation.transferLightningToEcash(parseInt(transferAmount), familyMember.id);
      } else {
        await federation.transferEcashToLightning(parseInt(transferAmount), familyMember.id);
      }
      await loadBalances();
      setTransferAmount('');
    } catch (error) {
      console.error('Transfer error:', error);
      alert(`Transfer failed: ${error.message}`);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {familyMember.username} - Federated Banking
        </h3>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
          <span className="text-xs text-gray-500">Federation Protected</span>
        </div>
      </div>
      
      {/* Balance Display */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-orange-50 rounded-lg p-4">
          <div className="text-sm font-medium text-orange-900">Lightning</div>
          <div className="text-2xl font-bold text-orange-700">
            {lightningBalance.toLocaleString()} sats
          </div>
          <div className="text-xs text-orange-600">Public payments</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-sm font-medium text-purple-900">eCash</div>
          <div className="text-2xl font-bold text-purple-700">
            {ecashBalance.toLocaleString()} sats
          </div>
          <div className="text-xs text-purple-600">Private payments</div>
        </div>
      </div>
      
      {/* Transfer Interface */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="font-medium text-gray-900 mb-3">Transfer Between Wallets</h4>
        <div className="space-y-3">
          <select 
            value={transferDirection} 
            onChange={(e) => setTransferDirection(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="lightning-to-ecash">Lightning → eCash (for privacy)</option>
            <option value="ecash-to-lightning">eCash → Lightning (for external payments)</option>
          </select>
          
          <div className="flex space-x-2">
            <input 
              type="number" 
              value={transferAmount} 
              onChange={(e) => setTransferAmount(e.target.value)}
              placeholder="Amount in sats"
              className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
            />
            <button 
              onClick={handleTransfer}
              disabled={!transferAmount}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50"
            >
              Transfer
            </button>
          </div>
        </div>
      </div>

      {/* Family Governance Indicator */}
      {familyMember.role === 'child' && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="text-sm text-blue-800">
            <strong>Guardian Protection:</strong> Large transactions require parent approval
          </div>
          <div className="text-xs text-blue-600 mt-1">
            Daily limit: {familyMember.spendingLimits?.daily.toLocaleString()} sats
          </div>
        </div>
      )}
    </div>
  );
}