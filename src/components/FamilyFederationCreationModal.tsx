import { AlertCircle, ArrowLeft, Baby, CheckCircle, Crown, Loader, Shield, User, Users, Zap } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface FederationSetupType {
  id: string;
  name: string;
  description: string;
  icon: any;
  color: string;
  guardianCount: number;
  stewardCount: number;
  adultCount: number;
  offspringCount: number;
}

interface FamilyFederationCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  charter: any;
  rbac: any;
  trustedPeers: any[];
  onComplete: (federationId: string) => void;
}

const FamilyFederationCreationModal: React.FC<FamilyFederationCreationModalProps> = ({
  isOpen,
  onClose,
  onBack,
  charter,
  rbac,
  trustedPeers,
  onComplete
}) => {
  const [selectedSetupType, setSelectedSetupType] = useState<string>('');
  const [selectedRoles, setSelectedRoles] = useState<{ [key: string]: string[] }>({
    guardian: [],
    steward: [],
    adult: [],
    offspring: []
  });
  const [thresholds, setThresholds] = useState<{ [key: string]: { m: number, n: number } }>({
    guardian: { m: 1, n: 1 },
    steward: { m: 1, n: 1 },
    adult: { m: 1, n: 1 },
    offspring: { m: 1, n: 1 }
  });

  // FROST wallet-specific thresholds
  const [walletThresholds, setWalletThresholds] = useState<{
    cashu: { m: number, n: number };
    lightning: { m: number, n: number };
    fedimint: { m: number, n: number };
  }>({
    cashu: { m: 2, n: 3 },
    lightning: { m: 2, n: 3 },
    fedimint: { m: 2, n: 3 }
  });
  // Custom role counts for "custom" setup type
  const [customRoleCounts, setCustomRoleCounts] = useState({
    guardianCount: 3,
    stewardCount: 3,
    adultCount: 3,
    offspringCount: 3
  });
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Guards for async work
  const mountedRef = useRef(true);
  const stepAbortRef = useRef<AbortController | null>(null);
  const completionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (stepAbortRef.current) { stepAbortRef.current.abort(); stepAbortRef.current = null; }
      if (completionTimerRef.current !== null) { clearTimeout(completionTimerRef.current); completionTimerRef.current = null; }
    };
  }, []);

  const setupTypes: FederationSetupType[] = [
    {
      id: 'solo',
      name: 'Solo Founder',
      description: 'Start as the sole guardian and invite family members later',
      icon: User,
      color: 'from-blue-600 to-indigo-600',
      guardianCount: 0,
      stewardCount: 0,
      adultCount: 0,
      offspringCount: 0
    },
    {
      id: 'guardian',
      name: 'Guardian Setup',
      description: 'Minimal setup with 1-2 guardians for small families',
      icon: Shield,
      color: 'from-red-600 to-orange-600',
      guardianCount: 2,
      stewardCount: 0,
      adultCount: 0,
      offspringCount: 0
    },
    {
      id: 'extended',
      name: 'Extended Family',
      description: 'Balanced setup for medium-sized families with multiple roles',
      icon: Users,
      color: 'from-purple-600 to-blue-600',
      guardianCount: 2,
      stewardCount: 2,
      adultCount: 2,
      offspringCount: 2
    },
    {
      id: 'custom',
      name: 'Custom Domain',
      description: 'Advanced setup with custom thresholds and role distribution',
      icon: Crown,
      color: 'from-green-600 to-teal-600',
      // Use dynamic custom counts
      guardianCount: customRoleCounts.guardianCount,
      stewardCount: customRoleCounts.stewardCount,
      adultCount: customRoleCounts.adultCount,
      offspringCount: customRoleCounts.offspringCount
    },
    {
      id: 'sovereign',
      name: 'Full Sovereign',
      description: 'Maximum security with 5-of-7 guardian consensus',
      icon: Zap,
      color: 'from-yellow-600 to-orange-600',
      guardianCount: 7,
      stewardCount: 5,
      adultCount: 5,
      offspringCount: 5
    }
  ];

  const roleIcons = {
    guardian: Crown,
    steward: Shield,
    adult: User,
    offspring: Baby
  };

  const roleColors = {
    guardian: 'from-red-600 to-orange-600',
    steward: 'from-purple-600 to-blue-600',
    adult: 'from-green-600 to-teal-600',
    offspring: 'from-yellow-600 to-orange-600'
  };

  useEffect(() => {
    if (selectedSetupType) {
      const setupType = setupTypes.find(type => type.id === selectedSetupType);
      if (setupType) {
        // Auto-select peers based on setup type
        const newSelectedRoles: { [key: string]: string[] } = {
          guardian: [],
          steward: [],
          adult: [],
          offspring: []
        };

        // Distribute peers based on their roles and setup type requirements
        trustedPeers.forEach(peer => {
          if (newSelectedRoles[peer.role].length < setupType[`${peer.role}Count` as keyof FederationSetupType]) {
            newSelectedRoles[peer.role].push(peer.id);
          }
        });

        setSelectedRoles(newSelectedRoles);

        // Set default thresholds
        const newThresholds: { [key: string]: { m: number, n: number } } = {
          guardian: { m: Math.ceil(setupType.guardianCount / 2), n: setupType.guardianCount },
          steward: { m: Math.ceil(setupType.stewardCount / 2), n: setupType.stewardCount },
          adult: { m: Math.ceil(setupType.adultCount / 2), n: setupType.adultCount },
          offspring: { m: Math.ceil(setupType.offspringCount / 2), n: setupType.offspringCount }
        };
        setThresholds(newThresholds);
      }
    }
  }, [selectedSetupType, trustedPeers]);

  const createFederation = async () => {
    setIsCreating(true);
    setProgress(0);
    setError(null);

    try {
      // Step 1: Nsec protection setup
      setStatus('Setting up Nsec protection...');
      setProgress(25);

      if (stepAbortRef.current) { stepAbortRef.current.abort(); }
      const controller = new AbortController();
      stepAbortRef.current = controller;

      const nsecResponse = await fetch('/api/federationnostrprotect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          charterId: charter.id,
          selectedRoles,
          thresholds
        })
      });

      if (!mountedRef.current) return;
      if (!nsecResponse.ok) {
        throw new Error('Failed to setup Nsec protection');
      }

      // Step 2: eCash mint setup
      setStatus('Setting up family eCash mint...');
      setProgress(50);

      const ecashResponse = await fetch('/api/federationecashfamily-mint-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          charterId: charter.id,
          selectedRoles,
          thresholds
        })
      });

      if (!mountedRef.current) return;
      if (!ecashResponse.ok) {
        throw new Error('Failed to setup eCash mint');
      }

      // Step 3: Federation creation
      setStatus('Creating federation...');
      setProgress(75);

      const federationResponse = await fetch('/api/family/foundry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          charter,
          rbac,
          federationConfig: {
            setupType: selectedSetupType,
            selectedRoles,
            thresholds,
            walletThresholds
          }
        })
      });

      if (!mountedRef.current) return;
      if (!federationResponse.ok) {
        throw new Error('Failed to create federation');
      }

      const federationData = await federationResponse.json();
      if (!mountedRef.current) return;

      setStatus('Federation created successfully!');
      setProgress(100);

      // Complete the process
      completionTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        onComplete(federationData.data.federationId);
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Federation creation error:', error);
      if (!mountedRef.current) return;
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
      setIsCreating(false);
    }
  };

  const getPeersByRole = (role: string) => {
    return trustedPeers.filter(peer => peer.role === role);
  };

  const togglePeerSelection = (role: string, peerId: string) => {
    const currentSelected = selectedRoles[role] || [];
    const isSelected = currentSelected.includes(peerId);

    if (isSelected) {
      setSelectedRoles({
        ...selectedRoles,
        [role]: currentSelected.filter(id => id !== peerId)
      });
    } else {
      const setupType = setupTypes.find(type => type.id === selectedSetupType);
      const maxCount = setupType ? setupType[`${role}Count` as keyof FederationSetupType] : 0;

      if (currentSelected.length < maxCount) {
        setSelectedRoles({
          ...selectedRoles,
          [role]: [...currentSelected, peerId]
        });
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full mb-4">
            <Zap className="h-8 w-8 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Create Family Federation</h3>
          <p className="text-purple-100">Configure your family federation with the selected members</p>
        </div>

        {isCreating ? (
          /* Creation Progress */
          <div className="space-y-6">
            <div className="text-center">
              <Loader className="h-12 w-12 mx-auto mb-4 text-purple-400 animate-spin" />
              <h4 className="text-xl font-bold text-white mb-2">{status}</h4>
              <div className="w-full bg-white/10 rounded-full h-3 mb-4">
                <div
                  className="bg-gradient-to-r from-purple-600 to-blue-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-purple-200">{progress}% Complete</p>
            </div>
          </div>
        ) : error ? (
          /* Error State */
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-red-400" />
            <h4 className="text-xl font-bold text-white">Creation Failed</h4>
            <p className="text-red-300">{error}</p>
            <button
              onClick={() => setError(null)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : (
          /* Configuration Form */
          <div className="space-y-6">
            {/* Setup Type Selection */}
            <div>
              <h4 className="text-lg font-bold text-white mb-4">Select Federation Setup Type</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {setupTypes.map((type) => {
                  const IconComponent = type.icon;
                  return (
                    <div
                      key={type.id}
                      onClick={() => setSelectedSetupType(type.id)}
                      className={`border rounded-lg p-4 cursor-pointer transition-all duration-300 ${selectedSetupType === type.id
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-white/20 bg-white/5 hover:bg-white/10'
                        }`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`inline-flex items-center justify-center w-10 h-10 bg-gradient-to-br ${type.color} rounded-full`}>
                          <IconComponent className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h5 className="text-white font-semibold">{type.name}</h5>
                          <p className="text-purple-200 text-sm">{type.description}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div className="text-center">
                          <div className="text-red-400 font-bold">{type.guardianCount}</div>
                          <div className="text-purple-300">Guardians</div>
                        </div>
                        <div className="text-center">
                          <div className="text-purple-400 font-bold">{type.stewardCount}</div>
                          <div className="text-purple-300">Stewards</div>
                        </div>
                        <div className="text-center">
                          <div className="text-green-400 font-bold">{type.adultCount}</div>
                          <div className="text-purple-300">Adults</div>
                        </div>
                        <div className="text-center">
                          <div className="text-yellow-400 font-bold">{type.offspringCount}</div>
                          <div className="text-purple-300">Offspring</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Role Count Configuration */}
            {selectedSetupType === 'custom' && (
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-6">
                <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Crown className="h-5 w-5 text-green-400" />
                  Custom Role Distribution
                </h4>
                <p className="text-green-200 text-sm mb-6">
                  Configure the number of members for each role in your federation.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label htmlFor="custom-guardian-count" className="block text-red-400 text-sm font-semibold mb-2">Guardians</label>
                    <input
                      id="custom-guardian-count"
                      type="number"
                      min="0"
                      max="10"
                      value={customRoleCounts.guardianCount}
                      onChange={(e) => setCustomRoleCounts({
                        ...customRoleCounts,
                        guardianCount: Math.max(0, Math.min(10, parseInt(e.target.value) || 0))
                      })}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="custom-steward-count" className="block text-purple-400 text-sm font-semibold mb-2">Stewards</label>
                    <input
                      id="custom-steward-count"
                      type="number"
                      min="0"
                      max="10"
                      value={customRoleCounts.stewardCount}
                      onChange={(e) => setCustomRoleCounts({
                        ...customRoleCounts,
                        stewardCount: Math.max(0, Math.min(10, parseInt(e.target.value) || 0))
                      })}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="custom-adult-count" className="block text-green-400 text-sm font-semibold mb-2">Adults</label>
                    <input
                      id="custom-adult-count"
                      type="number"
                      min="0"
                      max="10"
                      value={customRoleCounts.adultCount}
                      onChange={(e) => setCustomRoleCounts({
                        ...customRoleCounts,
                        adultCount: Math.max(0, Math.min(10, parseInt(e.target.value) || 0))
                      })}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="custom-offspring-count" className="block text-yellow-400 text-sm font-semibold mb-2">Offspring</label>
                    <input
                      id="custom-offspring-count"
                      type="number"
                      min="0"
                      max="10"
                      value={customRoleCounts.offspringCount}
                      onChange={(e) => setCustomRoleCounts({
                        ...customRoleCounts,
                        offspringCount: Math.max(0, Math.min(10, parseInt(e.target.value) || 0))
                      })}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Role Selection */}
            {selectedSetupType && (
              <div>
                <h4 className="text-lg font-bold text-white mb-4">Select Federation Members</h4>
                <div className="space-y-4">
                  {Object.entries(selectedRoles).map(([role, selectedPeers]) => {
                    const IconComponent = roleIcons[role as keyof typeof roleIcons];
                    const colorClass = roleColors[role as keyof typeof roleColors];
                    const setupType = setupTypes.find(type => type.id === selectedSetupType);
                    const maxCount = setupType ? setupType[`${role}Count` as keyof FederationSetupType] : 0;
                    const peers = getPeersByRole(role);

                    if (peers.length === 0) return null;

                    return (
                      <div key={role} className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-4">
                          <div className={`inline-flex items-center justify-center w-8 h-8 bg-gradient-to-br ${colorClass} rounded-full`}>
                            <IconComponent className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <h5 className="text-white font-semibold capitalize">{role}s</h5>
                            <p className="text-purple-200 text-sm">
                              {selectedPeers.length} of {maxCount} selected
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {peers.map((peer) => {
                            const isSelected = selectedPeers.includes(peer.id);
                            return (
                              <div
                                key={peer.id}
                                onClick={() => togglePeerSelection(role, peer.id)}
                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-300 ${isSelected
                                  ? 'bg-purple-600/20 border border-purple-400/50'
                                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                  }`}
                              >
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-purple-600 border-purple-600' : 'border-white/30'
                                  }`}>
                                  {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
                                </div>
                                <div>
                                  <div className="text-white font-medium">{peer.name}</div>
                                  <div className="text-purple-200 text-sm">{peer.npub}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Threshold Configuration */}
            {selectedSetupType && (
              <div>
                <h4 className="text-lg font-bold text-white mb-4">Configure Consensus Thresholds</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(thresholds).map(([role, threshold]) => {
                    const IconComponent = roleIcons[role as keyof typeof roleIcons];
                    const colorClass = roleColors[role as keyof typeof roleColors];
                    const selectedCount = selectedRoles[role]?.length || 0;

                    if (selectedCount === 0) return null;

                    return (
                      <div key={role} className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-4">
                          <div className={`inline-flex items-center justify-center w-8 h-8 bg-gradient-to-br ${colorClass} rounded-full`}>
                            <IconComponent className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <h5 className="text-white font-semibold capitalize">{role}s</h5>
                            <p className="text-purple-200 text-sm">
                              {threshold.m}-of-{threshold.n} consensus
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <label className="block text-white text-sm mb-1">Required (M)</label>
                            <input
                              type="number"
                              min="1"
                              max={selectedCount}
                              value={threshold.m}
                              onChange={(e) => setThresholds({
                                ...thresholds,
                                [role]: { ...threshold, m: parseInt(e.target.value) }
                              })}
                              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                          <div className="text-white font-bold">of</div>
                          <div className="flex-1">
                            <label className="block text-white text-sm mb-1">Total (N)</label>
                            <input
                              type="number"
                              min="1"
                              max={selectedCount}
                              value={threshold.n}
                              onChange={(e) => setThresholds({
                                ...thresholds,
                                [role]: { ...threshold, n: parseInt(e.target.value) }
                              })}
                              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* FROST Wallet Threshold Configuration */}
            {selectedSetupType && (
              <div className="mt-8">
                <h4 className="text-lg font-bold text-white mb-4">FROST Multi-Signature Wallet Thresholds</h4>
                <p className="text-purple-200 text-sm mb-6">
                  Configure signature requirements for different wallet types. Higher thresholds provide more security but require more coordination.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Cashu Wallet Threshold */}
                  <div className="bg-black/20 rounded-lg p-4 border border-blue-500/30">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <Shield className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <h5 className="text-white font-semibold">Cashu eCash</h5>
                        <p className="text-blue-200 text-sm">
                          {walletThresholds.cashu.m}-of-{walletThresholds.cashu.n} signatures
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-white text-sm mb-1">Required Signatures</label>
                        <select
                          value={walletThresholds.cashu.m}
                          onChange={(e) => setWalletThresholds({
                            ...walletThresholds,
                            cashu: { ...walletThresholds.cashu, m: parseInt(e.target.value) }
                          })}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value={1}>1 signature</option>
                          <option value={2}>2 signatures</option>
                          <option value={3}>3 signatures</option>
                          <option value={4}>4 signatures</option>
                          <option value={5}>5 signatures</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-white text-sm mb-1">Total Guardians</label>
                        <select
                          value={walletThresholds.cashu.n}
                          onChange={(e) => setWalletThresholds({
                            ...walletThresholds,
                            cashu: { ...walletThresholds.cashu, n: parseInt(e.target.value) }
                          })}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value={2}>2 guardians</option>
                          <option value={3}>3 guardians</option>
                          <option value={4}>4 guardians</option>
                          <option value={5}>5 guardians</option>
                          <option value={6}>6 guardians</option>
                          <option value={7}>7 guardians</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Lightning Wallet Threshold */}
                  <div className="bg-black/20 rounded-lg p-4 border border-orange-500/30">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                        <Zap className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <h5 className="text-white font-semibold">Lightning</h5>
                        <p className="text-orange-200 text-sm">
                          {walletThresholds.lightning.m}-of-{walletThresholds.lightning.n} signatures
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-white text-sm mb-1">Required Signatures</label>
                        <select
                          value={walletThresholds.lightning.m}
                          onChange={(e) => setWalletThresholds({
                            ...walletThresholds,
                            lightning: { ...walletThresholds.lightning, m: parseInt(e.target.value) }
                          })}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value={1}>1 signature</option>
                          <option value={2}>2 signatures</option>
                          <option value={3}>3 signatures</option>
                          <option value={4}>4 signatures</option>
                          <option value={5}>5 signatures</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-white text-sm mb-1">Total Guardians</label>
                        <select
                          value={walletThresholds.lightning.n}
                          onChange={(e) => setWalletThresholds({
                            ...walletThresholds,
                            lightning: { ...walletThresholds.lightning, n: parseInt(e.target.value) }
                          })}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value={2}>2 guardians</option>
                          <option value={3}>3 guardians</option>
                          <option value={4}>4 guardians</option>
                          <option value={5}>5 guardians</option>
                          <option value={6}>6 guardians</option>
                          <option value={7}>7 guardians</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Fedimint Wallet Threshold */}
                  <div className="bg-black/20 rounded-lg p-4 border border-purple-500/30">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                        <Users className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <h5 className="text-white font-semibold">Fedimint</h5>
                        <p className="text-purple-200 text-sm">
                          {walletThresholds.fedimint.m}-of-{walletThresholds.fedimint.n} signatures
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-white text-sm mb-1">Required Signatures</label>
                        <select
                          value={walletThresholds.fedimint.m}
                          onChange={(e) => setWalletThresholds({
                            ...walletThresholds,
                            fedimint: { ...walletThresholds.fedimint, m: parseInt(e.target.value) }
                          })}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value={1}>1 signature</option>
                          <option value={2}>2 signatures</option>
                          <option value={3}>3 signatures</option>
                          <option value={4}>4 signatures</option>
                          <option value={5}>5 signatures</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-white text-sm mb-1">Total Guardians</label>
                        <select
                          value={walletThresholds.fedimint.n}
                          onChange={(e) => setWalletThresholds({
                            ...walletThresholds,
                            fedimint: { ...walletThresholds.fedimint, n: parseInt(e.target.value) }
                          })}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value={2}>2 guardians</option>
                          <option value={3}>3 guardians</option>
                          <option value={4}>4 guardians</option>
                          <option value={5}>5 guardians</option>
                          <option value={6}>6 guardians</option>
                          <option value={7}>7 guardians</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Security Guidance */}
                <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5" />
                    <div>
                      <h6 className="text-yellow-200 font-medium mb-2">Security Recommendations</h6>
                      <ul className="text-yellow-300 text-sm space-y-1">
                        <li>• <strong>1-of-2:</strong> Suitable for couples with high trust (estate planning recovery)</li>
                        <li>• <strong>2-of-3:</strong> Balanced security and usability for small families</li>
                        <li>• <strong>3-of-5:</strong> High security for larger families with multiple guardians</li>
                        <li>• <strong>Lightning:</strong> Consider lower thresholds due to time-sensitive payments</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        {!isCreating && !error && (
          <div className="flex justify-between pt-6">
            <button
              onClick={onBack}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={createFederation}
              disabled={!selectedSetupType}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap className="h-4 w-4" />
              {trustedPeers.length === 0 ? 'Create Solo Federation' : 'Create Federation'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FamilyFederationCreationModal; 