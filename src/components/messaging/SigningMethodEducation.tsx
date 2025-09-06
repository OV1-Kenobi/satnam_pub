/**
 * Signing Method Education Component
 * 
 * Provides user education about different message signing methods
 * and their security trade-offs. Integrates with hybrid signing system
 * to guide users toward the most secure options.
 */

import React, { useState, useEffect } from 'react';
import { hybridMessageSigning, SigningMethodInfo } from '../../lib/messaging/hybrid-message-signing';

interface SigningMethodEducationProps {
  onMethodSelected?: (methodId: string) => void;
  showOnlyAvailable?: boolean;
  className?: string;
}

const SecurityLevelBadge: React.FC<{ level: string }> = ({ level }) => {
  const getSecurityColor = (level: string) => {
    switch (level) {
      case 'maximum': return 'bg-green-100 text-green-800 border-green-200';
      case 'high': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSecurityColor(level)}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)} Security
    </span>
  );
};

const SigningMethodCard: React.FC<{
  method: SigningMethodInfo;
  onSelect?: (methodId: string) => void;
}> = ({ method, onSelect }) => {
  const getMethodIcon = (methodId: string) => {
    switch (methodId) {
      case 'nfc':
        return (
          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
            <span className="text-purple-600 font-bold text-sm">NFC</span>
          </div>
        );
      case 'nip07':
        return (
          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
            <span className="text-green-600 font-bold text-sm">🔌</span>
          </div>
        );
      case 'session':
        return (
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <span className="text-blue-600 font-bold text-sm">⏱️</span>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
            <span className="text-gray-600 font-bold text-sm">?</span>
          </div>
        );
    }
  };

  const isRecommended = method.id === 'nip07' && method.available;
  const isMostSecure = method.id === 'nfc';

  return (
    <div className={`relative p-4 border rounded-lg transition-all duration-200 ${
      method.available && !method.comingSoon
        ? 'border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-pointer'
        : 'border-gray-100 bg-gray-50'
    } ${isRecommended ? 'ring-2 ring-green-200 border-green-300' : ''}`}
    onClick={() => method.available && !method.comingSoon && onSelect?.(method.id)}>
      
      {/* Recommended Badge */}
      {isRecommended && (
        <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-medium">
          Recommended
        </div>
      )}
      
      {/* Coming Soon Badge */}
      {method.comingSoon && (
        <div className="absolute -top-2 -right-2 bg-purple-500 text-white text-xs px-2 py-1 rounded-full font-medium">
          Coming Soon
        </div>
      )}

      <div className="flex items-start space-x-3">
        {getMethodIcon(method.id)}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <h3 className="text-sm font-medium text-gray-900">{method.name}</h3>
            <SecurityLevelBadge level={method.securityLevel} />
          </div>
          
          <p className="text-sm text-gray-600 mb-2">{method.description}</p>
          
          {/* Status Indicators */}
          <div className="flex items-center space-x-4 text-xs">
            <div className={`flex items-center space-x-1 ${
              method.available && !method.comingSoon ? 'text-green-600' : 'text-gray-500'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                method.available && !method.comingSoon ? 'bg-green-500' : 'bg-gray-400'
              }`}></span>
              <span>{method.available && !method.comingSoon ? 'Available' : 'Unavailable'}</span>
            </div>
            
            {method.requiresExtension && (
              <span className="text-gray-500">Requires Extension</span>
            )}
            
            {method.requiresAuthentication && (
              <span className="text-gray-500">Requires Sign-in</span>
            )}
          </div>
          
          {/* Special Messages */}
          {isMostSecure && (
            <div className="mt-2 text-xs text-purple-600 font-medium">
              🛡️ Ultimate security with physical device verification
            </div>
          )}
          
          {method.id === 'nip07' && !method.available && (
            <div className="mt-2 text-xs text-blue-600">
              💡 Install a NIP-07 extension like Alby or nos2x for maximum security
            </div>
          )}
          
          {method.id === 'session' && !method.available && (
            <div className="mt-2 text-xs text-blue-600">
              🔑 Sign in to enable convenient session-based signing
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const SigningMethodEducation: React.FC<SigningMethodEducationProps> = ({
  onMethodSelected,
  showOnlyAvailable = false,
  className = ''
}) => {
  const [methods, setMethods] = useState<SigningMethodInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSigningMethods = async () => {
      try {
        const availableMethods = await hybridMessageSigning.getAvailableSigningMethods();
        const filteredMethods = showOnlyAvailable 
          ? availableMethods.filter(method => method.available && !method.comingSoon)
          : availableMethods;
        
        setMethods(filteredMethods);
      } catch (error) {
        console.error('Failed to load signing methods:', error);
        setMethods([]);
      } finally {
        setLoading(false);
      }
    };

    loadSigningMethods();
  }, [showOnlyAvailable]);

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Message Signing Methods
        </h2>
        <p className="text-sm text-gray-600">
          Choose how you want to sign your messages. Higher security methods provide better protection.
        </p>
      </div>

      <div className="space-y-3">
        {methods.map(method => (
          <SigningMethodCard
            key={method.id}
            method={method}
            onSelect={onMethodSelected}
          />
        ))}
      </div>

      {methods.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">No signing methods available.</p>
          <p className="text-xs mt-1">Please install a NIP-07 extension or sign in to continue.</p>
        </div>
      )}

      {/* Security Hierarchy Explanation */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="text-sm font-medium text-blue-900 mb-2">Security Hierarchy</h3>
        <div className="space-y-1 text-xs text-blue-800">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
            <span><strong>NFC Physical MFA:</strong> Ultimate security with hardware verification (coming soon)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span><strong>NIP-07 Extension:</strong> Zero-knowledge signing, keys never leave your device</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            <span><strong>Secure Session:</strong> Convenient but requires trust in session security</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SigningMethodEducation;
