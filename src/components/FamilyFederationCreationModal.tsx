import React, { useState, useEffect } from 'react';
import { Zap, Shield, Users, Crown, User, Baby, ArrowLeft, CheckCircle, AlertCircle, Loader } from 'lucide-react';

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
  const [selectedRoles, setSelectedRoles] = useState<{[key: string]: string[]}>({
    guardian: [],
    steward: [],
    adult: [],
    offspring: []
  });
  const [thresholds, setThresholds] = useState<{[key: string]: {m: number, n: number}}>({
    guardian: { m: 1, n: 1 },
    steward: { m: 1, n: 1 },
    adult: { m: 1, n: 1 },
    offspring: { m: 1, n: 1 }
  });
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const setupTypes: FederationSetupType[] = [
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
      guardianCount: 3,
      stewardCount: 3,
      adultCount: 3,
      offspringCount: 3
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
        const newSelectedRoles: {[key: string]: string[]} = {
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
        const newThresholds: {[key: string]: {m: number, n: number}} = {
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
      
      const nsecResponse = await fetch('/api/federationnostrprotect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charterId: charter.id,
          selectedRoles,
          thresholds
        })
      });

      if (!nsecResponse.ok) {
        throw new Error('Failed to setup Nsec protection');
      }

      // Step 2: eCash mint setup
      setStatus('Setting up family eCash mint...');
      setProgress(50);

      const ecashResponse = await fetch('/api/federationecashfamily-mint-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charterId: charter.id,
          selectedRoles,
          thresholds
        })
      });

      if (!ecashResponse.ok) {
        throw new Error('Failed to setup eCash mint');
      }

      // Step 3: Federation creation
      setStatus('Creating federation...');
      setProgress(75);

      const federationResponse = await fetch('/api/family/foundry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charter,
          rbac,
          federationConfig: {
            setupType: selectedSetupType,
            selectedRoles,
            thresholds
          }
        })
      });

      if (!federationResponse.ok) {
        throw new Error('Failed to create federation');
      }

      const federationData = await federationResponse.json();
      
      setStatus('Federation created successfully!');
      setProgress(100);

      // Complete the process
      setTimeout(() => {
        onComplete(federationData.data.federationId);
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Federation creation error:', error);
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
                      className={`border rounded-lg p-4 cursor-pointer transition-all duration-300 ${
                        selectedSetupType === type.id
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
                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-300 ${
                                  isSelected
                                    ? 'bg-purple-600/20 border border-purple-400/50'
                                    : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                }`}
                              >
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                  isSelected ? 'bg-purple-600 border-purple-600' : 'border-white/30'
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
              disabled={!selectedSetupType || Object.values(selectedRoles).every(roles => roles.length === 0)}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap className="h-4 w-4" />
              Create Federation
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FamilyFederationCreationModal; 