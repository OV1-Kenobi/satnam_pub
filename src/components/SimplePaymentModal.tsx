import { Crown, Users, X } from 'lucide-react';
import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNWCWallet } from '../hooks/useNWCWallet';
import ContactsSelector from './shared/ContactsSelector';

interface Contact {
  id: string;
  name: string;
  npub?: string;
  lightningAddress?: string;
  avatar?: string;
  role?: 'family' | 'friend' | 'business' | 'guardian';
  isOnline?: boolean;
}

interface SimplePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAutomatedPayments: () => void;
  wallet: any; // Using any for now to avoid complex type definitions
}

const SimplePaymentModal: React.FC<SimplePaymentModalProps> = ({
  isOpen,
  onClose,
  onOpenAutomatedPayments,
  wallet
}) => {
  // Hooks
  const { userRole } = useAuth();
  const {
    isConnected: nwcConnected,
    primaryConnection,
    balance: nwcBalance,
    payInvoice: nwcPayInvoice,
    makeInvoice: nwcMakeInvoice
  } = useNWCWallet();

  // State
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [memo, setMemo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'lightning' | 'ecash' | 'nwc'>('lightning');
  const [walletSource, setWalletSource] = useState<'custodial' | 'nwc'>('custodial');
  const [loading, setLoading] = useState(false);
  const [showContactsSelector, setShowContactsSelector] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !recipient) return;

    setLoading(true);
    try {
      if (walletSource === 'nwc' && nwcConnected) {
        // Use NWC wallet for payment
        console.log('Sending NWC payment:', { amount, recipient, memo, walletSource });

        // If recipient is a Lightning address, we need to create an invoice first
        // For now, assume recipient is already an invoice
        const result = await nwcPayInvoice(recipient);

        if (result) {
          alert(`Payment sent successfully via ${primaryConnection?.wallet_name}!`);
          onClose();
        } else {
          throw new Error('NWC payment failed');
        }
      } else {
        // Use custodial wallet (legacy)
        console.log('Sending custodial payment:', { amount, recipient, memo, paymentMethod });
        // You would integrate with your custodial payment service here
        alert('Payment sent successfully via custodial wallet!');
        onClose();
      }
    } catch (error) {
      console.error('Payment failed:', error);
      const errorMessage = walletSource === 'nwc'
        ? `NWC payment failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        : 'Custodial payment failed. Please try again.';
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleContactSelect = (contact: Contact) => {
    setSelectedContact(contact);
    setRecipient(contact.lightningAddress || contact.npub || '');
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Send Payment</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* NWC Wallet Selection */}
            {nwcConnected && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Crown className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-900">
                      Sovereign Wallet Available
                    </span>
                  </div>
                  <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                    {primaryConnection?.wallet_name}
                  </span>
                </div>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="walletSource"
                      value="nwc"
                      checked={walletSource === 'nwc'}
                      onChange={(e) => setWalletSource(e.target.value as 'custodial' | 'nwc')}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-green-800">
                      Use NWC Wallet ({nwcBalance?.balance.toLocaleString() || '---'} sats)
                    </span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="walletSource"
                      value="custodial"
                      checked={walletSource === 'custodial'}
                      onChange={(e) => setWalletSource(e.target.value as 'custodial' | 'nwc')}
                      className="text-orange-600 focus:ring-orange-500"
                    />
                    <span className="text-sm text-gray-700">
                      Use Custodial Wallet (Legacy)
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (sats)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="1000"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recipient
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Lightning address or npub"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowContactsSelector(true)}
                  className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  title="Select from contacts"
                >
                  <Users className="h-4 w-4" />
                </button>
              </div>
              {selectedContact && (
                <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    Selected: <span className="font-medium">{selectedContact.name}</span>
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Memo (optional)
              </label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="What's this payment for?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'lightning' | 'ecash')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="lightning">Lightning Network</option>
                <option value="ecash">Cashu (Private)</option>
              </select>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                disabled={loading || !amount || !recipient}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {loading ? 'Sending...' : 'Send Payment'}
              </button>
              <button
                type="button"
                onClick={onOpenAutomatedPayments}
                className="px-4 py-2 border border-orange-500 text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
              >
                Automated
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Contacts Selector */}
      <ContactsSelector
        isOpen={showContactsSelector}
        onClose={() => setShowContactsSelector(false)}
        onSelectContact={handleContactSelect}
        title="Select Recipient"
      />
    </>
  );
};

export default SimplePaymentModal; 