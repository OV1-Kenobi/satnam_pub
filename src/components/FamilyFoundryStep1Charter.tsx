import React, { useState } from 'react';
import { Crown, Plus, X, ArrowRight } from 'lucide-react';
import { CharterDefinition } from '../lib/api/family-foundry';

interface FamilyFoundryStep1CharterProps {
  charter: CharterDefinition;
  onCharterChange: (charter: CharterDefinition) => void;
  onNext: () => void;
}

const FamilyFoundryStep1Charter: React.FC<FamilyFoundryStep1CharterProps> = ({
  charter,
  onCharterChange,
  onNext
}) => {
  const [newValue, setNewValue] = useState('');

  const addValue = (value: string) => {
    if (value.trim() && !charter.values.includes(value.trim())) {
      onCharterChange({
        ...charter,
        values: [...charter.values, value.trim()]
      });
      setNewValue('');
    }
  };

  const removeValue = (index: number) => {
    onCharterChange({
      ...charter,
      values: charter.values.filter((_, i) => i !== index)
    });
  };

  const handleNext = () => {
    if (charter.familyName.trim() && charter.foundingDate) {
      onNext();
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full mb-4">
          <Crown className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">Define Your Family Charter</h2>
        <p className="text-purple-200 max-w-2xl mx-auto">
          Establish the foundation of your family federation with a clear vision, mission, and core values
        </p>
      </div>

      {/* Family Name */}
      <div className="space-y-4">
        <label className="block text-white font-semibold">
          Family Name *
        </label>
        <input
          type="text"
          value={charter.familyName}
          onChange={(e) => onCharterChange({ ...charter, familyName: e.target.value })}
          placeholder="Enter your family name"
          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Family Motto */}
      <div className="space-y-4">
        <label className="block text-white font-semibold">
          Family Motto
        </label>
        <input
          type="text"
          value={charter.familyMotto}
          onChange={(e) => onCharterChange({ ...charter, familyMotto: e.target.value })}
          placeholder="e.g., 'Strength in Unity, Wisdom in Action'"
          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Founding Date */}
      <div className="space-y-4">
        <label className="block text-white font-semibold">
          Founding Date *
        </label>
        <input
          type="date"
          value={charter.foundingDate}
          onChange={(e) => onCharterChange({ ...charter, foundingDate: e.target.value })}
          max={new Date().toISOString().split('T')[0]}
          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Mission Statement */}
      <div className="space-y-4">
        <label className="block text-white font-semibold">
          Mission Statement
        </label>
        <textarea
          value={charter.missionStatement}
          onChange={(e) => onCharterChange({ ...charter, missionStatement: e.target.value })}
          placeholder="Describe your family's purpose and goals..."
          rows={4}
          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>

      {/* Core Values */}
      <div className="space-y-4">
        <label className="block text-white font-semibold">
          Core Values
        </label>
        <div className="space-y-3">
          {/* Add new value */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addValue(newValue)}
              placeholder="Add a core value (e.g., Integrity, Courage, Wisdom)"
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={() => addValue(newValue)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Display values */}
          <div className="flex flex-wrap gap-2">
            {charter.values.map((value, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-purple-600/20 border border-purple-400/30 rounded-lg px-3 py-2"
              >
                <span className="text-purple-200 text-sm">{value}</span>
                <button
                  onClick={() => removeValue(index)}
                  className="text-purple-300 hover:text-red-400 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Next Button */}
      <div className="flex justify-end pt-6">
        <button
          onClick={handleNext}
          disabled={!charter.familyName.trim() || !charter.foundingDate}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next Step
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default FamilyFoundryStep1Charter; 