import React, { useState } from 'react';
import { Users, Plus, X, ArrowLeft, ArrowRight, Mail, Crown, Shield, User, Baby, AlertCircle, CheckCircle } from 'lucide-react';
import { mapNpubToUserDuid } from '../lib/family-foundry-integration';

interface TrustedPeer {
  id: string;
  name: string;
  npub: string;
  role: string;
  relationship: string;
  invited: boolean;
}

interface FamilyFoundryStep3InviteProps {
  trustedPeers: TrustedPeer[];
  onPeersChange: (peers: TrustedPeer[]) => void;
  onNext: () => void;
  onBack: () => void;
}

const FamilyFoundryStep3Invite: React.FC<FamilyFoundryStep3InviteProps> = ({
  trustedPeers,
  onPeersChange,
  onNext,
  onBack
}) => {
  const [newPeer, setNewPeer] = useState({
    name: '',
    npub: '',
    role: '',
    relationship: ''
  });
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());
  const [isValidating, setIsValidating] = useState(false);
  const [validatedPeers, setValidatedPeers] = useState<Set<string>>(new Set());

  const defaultSuggestions = [
    {
      name: 'Arthur',
      role: 'guardian',
      relationship: 'kin',
      description: 'Family patriarch with ultimate authority'
    },
    {
      name: 'Guinevere',
      role: 'guardian',
      relationship: 'kin',
      description: 'Family matriarch with complete control'
    },
    {
      name: 'Lancelot',
      role: 'steward',
      relationship: 'peer',
      description: 'Trusted family administrator and protector'
    },
    {
      name: 'Merlin',
      role: 'steward',
      relationship: 'peer',
      description: 'Wise family advisor and mentor'
    },
    {
      name: 'Gawain',
      role: 'adult',
      relationship: 'offspring',
      description: 'Mature family member with offspring management'
    },
    {
      name: 'Galahad',
      role: 'offspring',
      relationship: 'offspring',
      description: 'Young family member learning and growing'
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

  /**
   * Validate that an npub exists in the system
   */
  const validateNpubExists = async (npub: string): Promise<boolean> => {
    try {
      // Import supabase dynamically to avoid circular dependencies
      const { supabase } = await import('../lib/supabase');
      await mapNpubToUserDuid(npub, supabase);
      return true;
    } catch (error) {
      return false;
    }
  };

  const addPeer = async () => {
    if (!newPeer.name.trim() || !newPeer.npub.trim() || !newPeer.role || !newPeer.relationship) {
      return;
    }

    // Validate npub exists
    setIsValidating(true);
    const npubExists = await validateNpubExists(newPeer.npub.trim());
    setIsValidating(false);

    if (!npubExists) {
      const errors = new Map(validationErrors);
      errors.set(newPeer.npub, 'User not found for this npub');
      setValidationErrors(errors);
      return;
    }

    const peer: TrustedPeer = {
      id: Date.now().toString(),
      name: newPeer.name.trim(),
      npub: newPeer.npub.trim(),
      role: newPeer.role,
      relationship: newPeer.relationship,
      invited: false
    };
    onPeersChange([...trustedPeers, peer]);
    setValidatedPeers(new Set([...validatedPeers, newPeer.npub.trim()]));
    setNewPeer({ name: '', npub: '', role: '', relationship: '' });

    // Clear any validation errors for this npub
    const errors = new Map(validationErrors);
    errors.delete(newPeer.npub);
    setValidationErrors(errors);
  };

  const removePeer = (id: string) => {
    onPeersChange(trustedPeers.filter(peer => peer.id !== id));
  };

  const addSuggestion = (suggestion: typeof defaultSuggestions[0]) => {
    const peer: TrustedPeer = {
      id: Date.now().toString(),
      name: suggestion.name,
      npub: '', // User needs to fill this
      role: suggestion.role,
      relationship: suggestion.relationship,
      invited: false
    };
    onPeersChange([...trustedPeers, peer]);
  };

  const handleNext = () => {
    // Validate that all peers have npub values
    const allHaveNpubs = trustedPeers.every(peer => peer.npub.trim());
    if (allHaveNpubs && trustedPeers.length > 0) {
      onNext();
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full mb-4">
          <Users className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">Invite Trusted Family Members</h2>
        <p className="text-purple-200 max-w-2xl mx-auto">
          Add family members and trusted peers to your federation using their Nostr public keys
        </p>
      </div>

      {/* Default Suggestions */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h3 className="text-xl font-bold text-white mb-4">Quick Add Suggestions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {defaultSuggestions.map((suggestion, index) => {
            const IconComponent = roleIcons[suggestion.role as keyof typeof roleIcons];
            const colorClass = roleColors[suggestion.role as keyof typeof roleColors];
            const isAdded = trustedPeers.some(peer => peer.name === suggestion.name);

            return (
              <div
                key={index}
                className={`border rounded-lg p-4 transition-all duration-300 ${isAdded
                  ? 'border-green-500/50 bg-green-500/10'
                  : 'border-white/20 bg-white/5 hover:bg-white/10'
                  }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`inline-flex items-center justify-center w-8 h-8 bg-gradient-to-br ${colorClass} rounded-full`}>
                    <IconComponent className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold">{suggestion.name}</h4>
                    <p className="text-purple-200 text-sm capitalize">{suggestion.role}</p>
                  </div>
                </div>
                <p className="text-purple-300 text-sm mb-3">{suggestion.description}</p>
                <button
                  onClick={() => addSuggestion(suggestion)}
                  disabled={isAdded}
                  className={`w-full py-2 px-3 rounded-lg text-sm font-medium transition-colors ${isAdded
                    ? 'bg-green-600/50 text-green-200 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                    }`}
                >
                  {isAdded ? 'Added' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add New Peer */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h3 className="text-xl font-bold text-white mb-4">Add Custom Family Member</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-white font-semibold mb-2">Name</label>
            <input
              type="text"
              value={newPeer.name}
              onChange={(e) => setNewPeer({ ...newPeer, name: e.target.value })}
              placeholder="Enter family member name"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-white font-semibold mb-2">Nostr Public Key (npub)</label>
            <input
              type="text"
              value={newPeer.npub}
              onChange={(e) => setNewPeer({ ...newPeer, npub: e.target.value })}
              placeholder="npub1..."
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-white font-semibold mb-2">Role</label>
            <select
              value={newPeer.role}
              onChange={(e) => setNewPeer({ ...newPeer, role: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select a role</option>
              <option value="guardian">Guardian</option>
              <option value="steward">Steward</option>
              <option value="adult">Adult</option>
              <option value="offspring">Offspring</option>
            </select>
          </div>
          <div>
            <label className="block text-white font-semibold mb-2">Relationship</label>
            <select
              value={newPeer.relationship}
              onChange={(e) => setNewPeer({ ...newPeer, relationship: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select relationship</option>
              <option value="offspring">Offspring</option>
              <option value="kin">Kin</option>
              <option value="peer">Peer</option>
            </select>
          </div>
        </div>
        {validationErrors.has(newPeer.npub) && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span className="text-red-300 text-sm">{validationErrors.get(newPeer.npub)}</span>
          </div>
        )}
        <button
          onClick={addPeer}
          disabled={!newPeer.name.trim() || !newPeer.npub.trim() || !newPeer.role || !newPeer.relationship || isValidating}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isValidating ? (
            <>
              <div className="animate-spin">
                <Plus className="h-4 w-4" />
              </div>
              Validating...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Add Family Member
            </>
          )}
        </button>
      </div>

      {/* Current Peers */}
      {trustedPeers.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-4">Family Members ({trustedPeers.length})</h3>
          <div className="space-y-3">
            {trustedPeers.map((peer) => {
              const IconComponent = roleIcons[peer.role as keyof typeof roleIcons];
              const colorClass = roleColors[peer.role as keyof typeof roleColors];

              return (
                <div key={peer.id} className="flex items-center justify-between bg-white/10 rounded-lg p-4">
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`inline-flex items-center justify-center w-10 h-10 bg-gradient-to-br ${colorClass} rounded-full`}>
                      <IconComponent className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-semibold">{peer.name}</h4>
                      <p className="text-purple-200 text-sm">{peer.npub}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="bg-purple-600 text-white px-2 py-1 rounded text-xs capitalize">
                          {peer.role}
                        </span>
                        <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs capitalize">
                          {peer.relationship}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {validatedPeers.has(peer.npub) && (
                      <div className="flex items-center gap-1 text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-xs">Verified</span>
                      </div>
                    )}
                    <button
                      onClick={() => removePeer(peer.id)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={trustedPeers.length === 0 || !trustedPeers.every(peer => peer.npub.trim())}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next Step
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default FamilyFoundryStep3Invite;