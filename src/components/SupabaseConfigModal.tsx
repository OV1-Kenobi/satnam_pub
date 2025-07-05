import React, { useState } from 'react';
import { setSupabaseConfig } from '../lib/supabase';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SupabaseConfigModal({ isOpen, onClose }: SupabaseConfigModalProps) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      setSupabaseConfig(url, key);
      // The page will reload automatically after setting the config
    } catch (error) {
      console.error('Failed to set Supabase config:', error);
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-purple-900 rounded-2xl p-8 max-w-md w-full border border-yellow-400/20">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Supabase Configuration</h2>
          <p className="text-purple-200 text-sm">
            Enter your Supabase project URL and anon key for development
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white font-semibold mb-2">Project URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://rhfqfftkizyengcuhuvq.supabase.co"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-yellow-400"
              required
            />
          </div>

          <div>
            <label className="block text-white font-semibold mb-2">Anon Key</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-yellow-400"
              required
            />
          </div>

          <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <span className="text-yellow-400 text-lg">⚠️</span>
              <div className="text-left">
                <p className="text-yellow-300 font-semibold text-sm">Development Only</p>
                <p className="text-yellow-200 text-sm mt-1">
                  This configuration is stored locally for development. In production, use Supabase Vault for secure credential management.
                </p>
              </div>
            </div>
          </div>

          <div className="flex space-x-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !url || !key}
              className="flex-1 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
            >
              {isLoading ? 'Configuring...' : 'Set Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SupabaseConfigModal; 