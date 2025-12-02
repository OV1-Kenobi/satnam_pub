import React, { useState } from 'react';
import { Shield, Plus, X, ArrowLeft, ArrowRight, Crown, Users, User, Baby } from 'lucide-react';
import { RBACDefinition } from '../lib/api/family-foundry.js';

interface FamilyFoundryStep2RBACProps {
  rbac: RBACDefinition;
  onRBACChange: (rbac: RBACDefinition) => void;
  onNext: () => void;
  onBack: () => void;
  disabled?: boolean;
}

const FamilyFoundryStep2RBAC: React.FC<FamilyFoundryStep2RBACProps> = ({
  rbac,
  onRBACChange,
  onNext,
  onBack,
  disabled = false
}) => {
  const [editingRole, setEditingRole] = useState<string | null>(null);

  const roleIcons = {
    guardian: Crown,
    steward: Shield,
    adult: Users,
    offspring: Baby
  };

  const roleColors = {
    guardian: 'from-red-600 to-orange-600',
    steward: 'from-purple-600 to-blue-600',
    adult: 'from-green-600 to-teal-600',
    offspring: 'from-yellow-600 to-orange-600'
  };

  const updateRole = (roleId: string, field: string, value: any) => {
    onRBACChange({
      ...rbac,
      roles: rbac.roles.map(role =>
        role.id === roleId ? { ...role, [field]: value } : role
      )
    });
  };

  const addItem = (roleId: string, field: 'rights' | 'responsibilities' | 'rewards', value: string) => {
    if (value.trim()) {
      updateRole(roleId, field, [...rbac.roles.find(r => r.id === roleId)![field], value.trim()]);
    }
  };

  const removeItem = (roleId: string, field: 'rights' | 'responsibilities' | 'rewards', index: number) => {
    const role = rbac.roles.find(r => r.id === roleId)!;
    updateRole(roleId, field, role[field].filter((_, i) => i !== index));
  };

  const handleNext = () => {
    // Validate that all roles have at least basic configuration
    const isValid = rbac.roles.every(role =>
      role.name.trim() &&
      role.description.trim() &&
      role.rights.length > 0
    );

    if (isValid) {
      onNext();
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full mb-4">
          <Shield className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">Define Family Roles & Permissions</h2>
        <p className="text-purple-200 max-w-2xl mx-auto">
          Set up role-based access control with rights, responsibilities, and rewards for each family member type
        </p>
      </div>

      {/* Roles */}
      <div className="space-y-6">
        {rbac.roles.map((role) => {
          const IconComponent = roleIcons[role.id as keyof typeof roleIcons];
          const colorClass = roleColors[role.id as keyof typeof roleColors];
          const isEditing = editingRole === role.id;

          return (
            <div key={role.id} className="bg-white/5 border border-white/10 rounded-xl p-6">
              {/* Role Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className={`inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br ${colorClass} rounded-full`}>
                  <IconComponent className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">{role.name}</h3>
                  <p className="text-purple-200 text-sm">Hierarchy Level: {role.hierarchyLevel}</p>
                </div>
                <button
                  onClick={() => setEditingRole(isEditing ? null : role.id)}
                  className="text-purple-300 hover:text-white transition-colors"
                >
                  {isEditing ? 'Done' : 'Edit'}
                </button>
              </div>

              {/* Role Description */}
              <div className="mb-6">
                <label className="block text-white font-semibold mb-2">Description</label>
                <textarea
                  value={role.description}
                  onChange={(e) => updateRole(role.id, 'description', e.target.value)}
                  placeholder="Describe this role's purpose and responsibilities..."
                  rows={2}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              {/* Rights, Responsibilities, Rewards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Rights */}
                <div>
                  <label className="block text-white font-semibold mb-3">Rights</label>
                  <div className="space-y-2">
                    {role.rights.map((right, index) => (
                      <div key={index} className="flex items-center gap-2 bg-green-600/20 border border-green-400/30 rounded-lg px-3 py-2">
                        <span className="text-green-200 text-sm flex-1">{right}</span>
                        <button
                          onClick={() => removeItem(role.id, 'rights', index)}
                          className="text-green-300 hover:text-red-400 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add a right..."
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            addItem(role.id, 'rights', e.currentTarget.value);
                            e.currentTarget.value = '';
                          }
                        }}
                        className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                      <button
                        onClick={(e) => {
                          const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                          addItem(role.id, 'rights', input.value);
                          input.value = '';
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Responsibilities */}
                <div>
                  <label className="block text-white font-semibold mb-3">Responsibilities</label>
                  <div className="space-y-2">
                    {role.responsibilities.map((responsibility, index) => (
                      <div key={index} className="flex items-center gap-2 bg-blue-600/20 border border-blue-400/30 rounded-lg px-3 py-2">
                        <span className="text-blue-200 text-sm flex-1">{responsibility}</span>
                        <button
                          onClick={() => removeItem(role.id, 'responsibilities', index)}
                          className="text-blue-300 hover:text-red-400 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add a responsibility..."
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            addItem(role.id, 'responsibilities', e.currentTarget.value);
                            e.currentTarget.value = '';
                          }
                        }}
                        className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                      <button
                        onClick={(e) => {
                          const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                          addItem(role.id, 'responsibilities', input.value);
                          input.value = '';
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Rewards */}
                <div>
                  <label className="block text-white font-semibold mb-3">Rewards</label>
                  <div className="space-y-2">
                    {role.rewards.map((reward, index) => (
                      <div key={index} className="flex items-center gap-2 bg-purple-600/20 border border-purple-400/30 rounded-lg px-3 py-2">
                        <span className="text-purple-200 text-sm flex-1">{reward}</span>
                        <button
                          onClick={() => removeItem(role.id, 'rewards', index)}
                          className="text-purple-300 hover:text-red-400 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add a reward..."
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            addItem(role.id, 'rewards', e.currentTarget.value);
                            e.currentTarget.value = '';
                          }
                        }}
                        className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                      <button
                        onClick={(e) => {
                          const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                          addItem(role.id, 'rewards', input.value);
                          input.value = '';
                        }}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* FROST Threshold Configuration */}
      <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl p-6 mt-8">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-5 w-5 text-blue-400" />
          <h3 className="text-xl font-bold text-white">FROST Signing Threshold</h3>
        </div>
        <p className="text-purple-200 mb-4">
          Configure how many family members must approve critical operations (1-5 signatures required)
        </p>
        <div className="flex items-center gap-4">
          <label className="text-white font-semibold">Signatures Required:</label>
          <select
            value={rbac.frostThreshold || 2}
            onChange={(e) => onRBACChange({
              ...rbac,
              frostThreshold: parseInt(e.target.value)
            })}
            disabled={disabled}
            className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value={1}>1 of 2 (Minimum)</option>
            <option value={2}>2 of 3 (Recommended)</option>
            <option value={3}>3 of 4</option>
            <option value={4}>4 of 5</option>
            <option value={5}>5 of 7 (Maximum)</option>
          </select>
        </div>
        <p className="text-blue-300 text-sm mt-3">
          ℹ️ Higher thresholds require more approvals but provide stronger security. Lower thresholds are faster but less secure.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-6">
        <button
          onClick={onBack}
          disabled={disabled}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={disabled}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next Step
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default FamilyFoundryStep2RBAC; 