import {
  AlertCircle,
  ArrowRight,
  Bitcoin,
  CheckCircle,
  Copy,
  DollarSign,
  Info,
  Loader2,
  QrCode,
  Search,
  Send,
  Shield,
  User,
  XCircle,
  Zap
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

// Import the standardized interface
import { copyText, formatSats } from "../lib/utils";
import { PaymentRequest, PaymentRoute, SatnamFamilyMember, ValidationErrors } from "../types/shared";

interface SmartPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "send" | "receive";
  familyMembers: SatnamFamilyMember[];
  selectedMemberId?: string;
  satsToDollars: number;
  onPaymentSuccess?: (payment: PaymentRequest) => void;
  onInvoiceGenerated?: (invoice: string, qrCode: string) => void;
}



const SmartPaymentModal: React.FC<SmartPaymentModalProps> = ({
  isOpen,
  onClose,
  type,
  familyMembers,
  selectedMemberId,
  satsToDollars,
  onPaymentSuccess,
  onInvoiceGenerated,
}) => {
  // Form state
  const [fromMemberId, setFromMemberId] = useState(selectedMemberId || "");
  const [toMemberId, setToMemberId] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [amountSats, setAmountSats] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [memo, setMemo] = useState("");
  const [privacyEnabled, setPrivacyEnabled] = useState(true);
  
  // UI state
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [paymentRoutes, setPaymentRoutes] = useState<PaymentRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>("lightning");
  const [showRouteDetails, setShowRouteDetails] = useState(false);
  const [invoice, setInvoice] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  
  // Search functionality
  const [searchTerm, setSearchTerm] = useState("");
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  
  // Refs
  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter family members based on search term
  const filteredMembers = familyMembers.filter(member =>
    member.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.lightningAddress.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Reset form when modal opens/closes or type changes
  useEffect(() => {
    if (isOpen) {
      setFromMemberId(selectedMemberId || "");
      setToMemberId("");
      setToAddress("");
      setAmountSats("");
      setAmountUsd("");
      setMemo("");
      setInvoice("");
      setQrCodeUrl("");
      setIsProcessing(false);
      setShowSuccess(false);
      setShowError(false);
      setErrorMessage("");
      setValidationErrors({});
      setSearchTerm("");
      setShowMemberDropdown(false);
      
      // Fetch payment routes if sending
      if (type === "send") {
        fetchPaymentRoutes();
      }
    }
  }, [isOpen, type, selectedMemberId]);

  // Update USD amount when sats amount changes
  useEffect(() => {
    if (amountSats && !isNaN(parseFloat(amountSats))) {
      const sats = parseFloat(amountSats);
      setAmountUsd((sats * satsToDollars).toFixed(2));
    } else if (!amountSats) {
      setAmountUsd("");
    }
  }, [amountSats, satsToDollars]);

  // Update sats amount when USD amount changes
  useEffect(() => {
    if (amountUsd && !isNaN(parseFloat(amountUsd))) {
      const usd = parseFloat(amountUsd);
      setAmountSats(Math.round(usd / satsToDollars).toString());
    } else if (!amountUsd) {
      setAmountSats("");
    }
  }, [amountUsd, satsToDollars]);

  // Handle backdrop click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const fetchPaymentRoutes = async () => {
    try {
      // In a real implementation, this would be an API call
      // const response = await fetch(`/api/payments/routes?from=${fromMemberId}&to=${toAddress}&amount=${amountSats}`);
      // const data = await response.json();
      
      // Mock data for demonstration
      const mockRoutes: PaymentRoute[] = [
        {
          type: "lightning",
          estimatedFee: 10,
          estimatedTime: 3000, // 3 seconds
          privacy: "high",
          reliability: 0.98,
        },
        {
          type: "ecash",
          estimatedFee: 0,
          estimatedTime: 5000, // 5 seconds
          privacy: "high",
          reliability: 0.95,
        },
        {
          type: "internal",
          estimatedFee: 0,
          estimatedTime: 1000, // 1 second
          privacy: "high",
          reliability: 0.99,
        },
      ];
      
      setPaymentRoutes(mockRoutes);
      
      // Select best route by default
      const bestRoute = mockRoutes.sort((a, b) => {
        // Prioritize internal transfers
        if (a.type === "internal") return -1;
        if (b.type === "internal") return 1;
        
        // Then prioritize by fee
        return a.estimatedFee - b.estimatedFee;
      })[0];
      
      setSelectedRoute(bestRoute.type);
    } catch (error) {
      console.error("Failed to fetch payment routes:", error);
    }
  };

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};
    
    if (!fromMemberId) {
      errors.fromMember = "Please select a family member";
    }
    
    if (type === "send") {
      if (!toMemberId && !toAddress) {
        errors.toMember = "Please select a recipient or enter an address";
      }
    }
    
    if (!amountSats || parseFloat(amountSats) <= 0) {
      errors.amount = "Please enter a valid amount";
    }
    
    // Check spending limits for children
    const fromMember = familyMembers.find(m => m.id === fromMemberId);
    if (fromMember && fromMember.role === "child" && fromMember.spendingLimits) {
      const amount = parseFloat(amountSats);
      if (amount > fromMember.spendingLimits.daily) {
        errors.amount = `Amount exceeds daily limit of ${fromMember.spendingLimits.daily} sats`;
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSendPayment = async () => {
    if (!validateForm()) return;
    
    setIsProcessing(true);
    setShowError(false);
    
    try {
      const paymentRequest: PaymentRequest = {
        fromMember: fromMemberId,
        toMember: toMemberId || toAddress,
        amount: parseInt(amountSats),
        memo: memo || undefined,
        privacyRouting: privacyEnabled,
      };

      // In a real implementation, this would be an API call
      // const response = await fetch('/api/payments/send', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     ...paymentRequest,
      //     routeType: selectedRoute,
      //   })
      // });
      // 
      // if (!response.ok) {
      //   throw new Error('Payment failed');
      // }
      // 
      // const data = await response.json();
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulate success
      console.log("Payment sent:", paymentRequest);
      
      setShowSuccess(true);
      onPaymentSuccess?.(paymentRequest);
      
      // Close modal after showing success
      setTimeout(() => {
        onClose();
      }, 2000);
      
    } catch (error) {
      console.error("Payment failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Payment failed");
      setShowError(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!validateForm()) return;
    
    setIsProcessing(true);
    setShowError(false);
    
    try {
      // In a real implementation, this would be an API call
      // const response = await fetch('/api/payments/receive', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     memberId: fromMemberId,
      //     amountSats: parseInt(amountSats),
      //     memo,
      //     privacyEnabled
      //   })
      // });
      // 
      // if (!response.ok) {
      //   throw new Error('Invoice generation failed');
      // }
      // 
      // const data = await response.json();
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock invoice and QR code
      const mockInvoice = "lnbc1500n1pj9xm38pp5yztkwjcz5ftl5laxkav23zmzekaw37zk6kmv80pk4xkku567ksdqqcqzzsxqrrsssp5v4s00u75nk2177xxst6qnk44f7lkawvqkcgdj85xesf87pefwq9qyyssqy4lgd8tj274qzsh9l0hzgwrfmxgkqchh9aum8nc6r8n5lv4c8j3flj09rhzg8xtzvg4l6urt5upk3lv3m3r35npnxldl8vhdqgkgq9qrlqz";
      const mockQrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(mockInvoice);
      
      setInvoice(mockInvoice);
      setQrCodeUrl(mockQrUrl);
      setShowSuccess(true);
      
      onInvoiceGenerated?.(mockInvoice, mockQrUrl);
      
      console.log("Invoice generated:", {
        memberId: fromMemberId,
        amountSats,
        memo,
        privacyEnabled
      });
    } catch (error) {
      console.error("Invoice generation failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Invoice generation failed");
      setShowError(true);
    } finally {
      setIsProcessing(false);
    }
  };



  const getSelectedMember = (id: string) => {
    return familyMembers.find(member => member.id === id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div 
        ref={modalRef}
        className="bg-orange-900 rounded-2xl p-8 max-w-lg w-full border border-orange-400/20 relative max-h-[90vh] overflow-y-auto"
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-orange-300 transition-colors duration-200"
          disabled={isProcessing}
        >
          <XCircle className="h-6 w-6" />
        </button>
        
        {/* Header */}
        <div className="mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-600 to-orange-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Zap className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 text-center">
            {type === "send" ? "Send Lightning Payment" : "Generate Invoice"}
          </h2>
          <div className="flex items-center justify-center space-x-2 mb-2">
            <div className="bg-orange-800 text-orange-200 px-3 py-1 rounded-full text-sm font-medium flex items-center space-x-1">
              <span>⚡</span>
              <span>Payment</span>
            </div>
          </div>
          <div className="flex items-center justify-center space-x-2 text-orange-300">
            <Shield className="h-4 w-4" />
            <span className="text-sm">
              {privacyEnabled ? "LNProxy Enabled" : "Direct Routing"}
            </span>
          </div>
        </div>

        {/* Success Message */}
        {showSuccess && (
          <div className="mb-6 p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
            <div className="flex items-center space-x-2 text-green-300">
              <CheckCircle className="h-5 w-5" />
              <span className="font-semibold">
                {type === "send" ? "Payment Sent Successfully!" : "Invoice Generated!"}
              </span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {showError && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
            <div className="flex items-center space-x-2 text-red-300">
              <AlertCircle className="h-5 w-5" />
              <span className="font-semibold">{errorMessage}</span>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* From/Receiving Member Selection */}
          <div>
            <label className="block text-white font-semibold mb-2">
              {type === "send" ? "From" : "Receiving Member"}
            </label>
            <div className="relative">
              <select 
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-400 transition-all duration-300 appearance-none"
                value={fromMemberId}
                onChange={(e) => setFromMemberId(e.target.value)}
                disabled={isProcessing}
              >
                <option value="" className="bg-gray-800">Select family member</option>
                {familyMembers.map((member) => (
                  <option key={member.id} value={member.id} className="bg-gray-800">
                    {member.username} ({formatSats(member.balance || 0)} sats)
                  </option>
                ))}
              </select>
              <User className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-orange-300 pointer-events-none" />
            </div>
            {validationErrors.fromMember && (
              <p className="text-red-400 text-sm mt-1">{validationErrors.fromMember}</p>
            )}
          </div>

          {/* To Member/Address Selection (Send only) */}
          {type === "send" && (
            <div>
              <label className="block text-white font-semibold mb-2">To</label>
              <div className="space-y-3">
                {/* Family Member Selection */}
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowMemberDropdown(true);
                    }}
                    onFocus={() => setShowMemberDropdown(true)}
                    placeholder="Search family members..."
                    className="w-full px-4 py-3 pl-10 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-orange-400 transition-all duration-300"
                    disabled={isProcessing}
                  />
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-orange-300" />
                  
                  {/* Dropdown */}
                  {showMemberDropdown && filteredMembers.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-orange-500/30 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {filteredMembers.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          className="w-full px-4 py-3 text-left hover:bg-orange-500/20 transition-colors duration-200 text-white"
                          onClick={() => {
                            setToMemberId(member.id);
                            setSearchTerm(member.username);
                            setShowMemberDropdown(false);
                            setToAddress(""); // Clear external address
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span>{member.username}</span>
                            <span className="text-orange-300 text-sm">
                              {formatSats(member.balance || 0)} sats
                            </span>
                          </div>
                          <div className="text-xs text-white/70">{member.lightningAddress}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* OR Divider */}
                <div className="flex items-center space-x-4">
                  <div className="flex-1 h-px bg-white/20"></div>
                  <span className="text-white/50 text-sm">OR</span>
                  <div className="flex-1 h-px bg-white/20"></div>
                </div>

                {/* External Address Input */}
                <input 
                  type="text"
                  value={toAddress}
                  onChange={(e) => {
                    setToAddress(e.target.value);
                    if (e.target.value) {
                      setToMemberId(""); // Clear family member selection
                      setSearchTerm("");
                    }
                  }}
                  placeholder="Lightning Address or Invoice"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-orange-400 transition-all duration-300"
                  disabled={isProcessing}
                />
              </div>
              {validationErrors.toMember && (
                <p className="text-red-400 text-sm mt-1">{validationErrors.toMember}</p>
              )}
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="block text-white font-semibold mb-2">Amount</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <input 
                  type="text"
                  value={amountSats}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    setAmountSats(value);
                  }}
                  placeholder="0"
                  className="w-full px-4 py-3 pr-16 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-orange-400 transition-all duration-300"
                  disabled={isProcessing}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-orange-300 flex items-center">
                  <Bitcoin className="h-4 w-4 mr-1" />
                  <span className="text-sm">sats</span>
                </div>
              </div>
              <div className="relative">
                <input 
                  type="text"
                  value={amountUsd}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9.]/g, '');
                    setAmountUsd(value);
                  }}
                  placeholder="0.00"
                  className="w-full px-4 py-3 pr-16 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-orange-400 transition-all duration-300"
                  disabled={isProcessing}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-orange-300 flex items-center">
                  <DollarSign className="h-4 w-4 mr-1" />
                  <span className="text-sm">USD</span>
                </div>
              </div>
            </div>
            {validationErrors.amount && (
              <p className="text-red-400 text-sm mt-1">{validationErrors.amount}</p>
            )}
          </div>

          {/* Memo Input */}
          <div>
            <label className="block text-white font-semibold mb-2">
              {type === "send" ? "Memo (Optional)" : "Description (Optional)"}
            </label>
            <textarea 
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={type === "send" ? "What's this payment for?" : "What's this invoice for?"}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-orange-400 transition-all duration-300 resize-none"
              rows={2}
              disabled={isProcessing}
            />
          </div>

          {/* Privacy Settings */}
          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-orange-400" />
                <span className="text-white font-semibold">Privacy Routing</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyDetails(!showPrivacyDetails)}
                className="text-orange-300 hover:text-orange-200 transition-colors duration-200"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-white/80">LNProxy Enabled</span>
              <button
                type="button"
                onClick={() => setPrivacyEnabled(!privacyEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                  privacyEnabled ? 'bg-orange-500' : 'bg-white/20'
                }`}
                disabled={isProcessing}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                    privacyEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {showPrivacyDetails && (
              <div className="mt-3 p-3 bg-white/5 rounded-lg">
                <p className="text-white/70 text-sm">
                  {privacyEnabled 
                    ? "Your payment will be routed through LNProxy for enhanced privacy and anonymity."
                    : "Direct routing will be used. Your payment may be less private."
                  }
                </p>
              </div>
            )}
          </div>

          {/* Payment Routes (Send only) */}
          {type === "send" && paymentRoutes.length > 0 && (
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-white font-semibold">Payment Route</span>
                  <button 
                    type="button"
                    onClick={() => setShowRouteDetails(!showRouteDetails)}
                    className="text-orange-300 hover:text-orange-200 transition-colors duration-200"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  {selectedRoute === "lightning" && (
                    <Zap className="h-4 w-4 text-amber-400" />
                  )}
                  {selectedRoute === "ecash" && (
                    <Bitcoin className="h-4 w-4 text-green-400" />
                  )}
                  {selectedRoute === "internal" && (
                    <ArrowRight className="h-4 w-4 text-blue-400" />
                  )}
                  <span className="text-white capitalize">{selectedRoute}</span>
                </div>
              </div>
              
              {showRouteDetails && (
                <div className="space-y-2">
                  {paymentRoutes.map((route) => (
                    <button
                      key={route.type}
                      type="button"
                      className={`w-full p-3 rounded-lg text-left transition-all duration-200 ${
                        selectedRoute === route.type 
                          ? 'bg-orange-500/20 border border-orange-400/30' 
                          : 'bg-white/5 hover:bg-white/10'
                      }`}
                      onClick={() => setSelectedRoute(route.type)}
                      disabled={isProcessing}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          {route.type === "lightning" && (
                            <Zap className="h-4 w-4 text-amber-400" />
                          )}
                          {route.type === "ecash" && (
                            <Bitcoin className="h-4 w-4 text-green-400" />
                          )}
                          {route.type === "internal" && (
                            <ArrowRight className="h-4 w-4 text-blue-400" />
                          )}
                          <span className="text-white capitalize font-medium">{route.type}</span>
                        </div>
                        <span className="text-orange-300 text-sm">
                          {route.estimatedFee} sats fee
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-white/70">
                        <span>~{Math.round(route.estimatedTime / 1000)}s</span>
                        <span>Privacy: {route.privacy}</span>
                        <span>{Math.round(route.reliability * 100)}% reliable</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Generated Invoice Display */}
          {invoice && qrCodeUrl && (
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-3">Generated Invoice</h3>
              <div className="text-center mb-4">
                <img src={qrCodeUrl} alt="Invoice QR Code" className="mx-auto rounded-lg" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-white/70 text-sm">Invoice:</span>
                  <button
                    type="button"
                    onClick={() => copyText(invoice)}
                    className="text-orange-300 hover:text-orange-200 transition-colors duration-200"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <div className="bg-white/5 rounded p-2 text-xs text-white/80 font-mono break-all">
                  {invoice}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-white/10 border border-white/20 rounded-lg text-white hover:bg-white/20 transition-all duration-300"
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={type === "send" ? handleSendPayment : handleGenerateInvoice}
              disabled={isProcessing || showSuccess}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg text-white font-semibold hover:from-orange-600 hover:to-amber-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  {type === "send" ? (
                    <Send className="h-5 w-5" />
                  ) : (
                    <QrCode className="h-5 w-5" />
                  )}
                  <span>
                    {type === "send" ? "Send Payment" : "Generate Invoice"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartPaymentModal;