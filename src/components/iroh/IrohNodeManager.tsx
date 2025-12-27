/**
 * Iroh Node Manager Component
 * Phase 2B-2 Week 2 Task 3: UI Components
 * 
 * Features:
 * - Add/edit/remove Iroh node ID
 * - Validate node ID format (52-char base32)
 * - Test node reachability
 * - Display node status (reachable/unreachable/pending)
 * - Feature flag gated: VITE_IROH_ENABLED
 * 
 * @compliance Privacy-first, zero-knowledge, no PII display
 */

import { CheckCircle, Copy, Info, Loader2, RefreshCw, Server, Trash2, XCircle } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { showToast } from '../../services/toastService';

// Dynamic import for irohVerificationService to enable code splitting
// This module is also dynamically imported by nip05-verification.ts for lazy loading when Iroh is disabled
const getIrohVerificationService = async () => {
  const { irohVerificationService } = await import('../../services/irohVerificationService');
  return irohVerificationService;
};

interface IrohNodeManagerProps {
  nodeId?: string;
  onChange?: (nodeId: string | undefined) => void;
  compact?: boolean;
  showTestButton?: boolean;
  className?: string;
}

interface NodeStatus {
  isReachable: boolean | null;
  relayUrl: string | null;
  directAddresses: string[] | null;
  lastSeen: number | null;
  cached: boolean;
  testing: boolean;
  error: string | null;
}

const IROH_NODE_ID_REGEX = /^[a-z2-7]{52}$/;

export const IrohNodeManager: React.FC<IrohNodeManagerProps> = ({
  nodeId: initialNodeId,
  onChange,
  compact = false,
  showTestButton = true,
  className = '',
}) => {
  // Check feature flag
  const irohEnabled = import.meta.env.VITE_IROH_ENABLED === 'true';

  const [nodeId, setNodeId] = useState<string>(initialNodeId || '');
  const [isEditing, setIsEditing] = useState<boolean>(!initialNodeId);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>({
    isReachable: null,
    relayUrl: null,
    directAddresses: null,
    lastSeen: null,
    cached: false,
    testing: false,
    error: null,
  });

  // Validate node ID format
  const validateNodeId = useCallback((id: string): boolean => {
    if (!id) {
      setValidationError(null);
      return true; // Empty is valid (optional field)
    }

    if (!IROH_NODE_ID_REGEX.test(id)) {
      setValidationError('Invalid node ID format. Must be 52 lowercase base32 characters (a-z, 2-7)');
      return false;
    }

    setValidationError(null);
    return true;
  }, []);

  // Handle node ID change
  const handleNodeIdChange = useCallback((value: string) => {
    const trimmedValue = value.trim().toLowerCase();
    setNodeId(trimmedValue);
    validateNodeId(trimmedValue);
  }, [validateNodeId]);

  // Test node reachability
  const testNodeReachability = useCallback(async () => {
    if (!nodeId || !validateNodeId(nodeId)) {
      return;
    }

    setNodeStatus(prev => ({ ...prev, testing: true, error: null }));

    try {
      const irohService = await getIrohVerificationService();
      const result = await irohService.verifyNode({ node_id: nodeId });

      setNodeStatus({
        isReachable: result.is_reachable,
        relayUrl: result.relay_url,
        directAddresses: result.direct_addresses,
        lastSeen: result.last_seen,
        cached: result.cached,
        testing: false,
        error: result.error || null,
      });

      if (result.success && result.is_reachable) {
        showToast.success('Node is reachable!', {
          title: 'Iroh Node Verified',
          duration: 3000,
        });
      } else {
        showToast.warning('Node is unreachable or not found', {
          title: 'Iroh Node Test',
          duration: 4000,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setNodeStatus(prev => ({
        ...prev,
        testing: false,
        error: errorMessage,
        isReachable: false,
      }));

      showToast.error(errorMessage, {
        title: 'Node Test Failed',
        duration: 4000,
      });
    }
  }, [nodeId, validateNodeId]);

  // Save node ID
  const handleSave = useCallback(() => {
    if (!validateNodeId(nodeId)) {
      return;
    }

    setIsEditing(false);
    onChange?.(nodeId || undefined);

    if (nodeId) {
      showToast.success('Iroh node ID saved', {
        duration: 2000,
      });
    }
  }, [nodeId, onChange, validateNodeId]);

  // Remove node ID
  const handleRemove = useCallback(() => {
    setNodeId('');
    setIsEditing(true);
    setNodeStatus({
      isReachable: null,
      relayUrl: null,
      directAddresses: null,
      lastSeen: null,
      cached: false,
      testing: false,
      error: null,
    });
    onChange?.(undefined);

    showToast.info('Iroh node ID removed', {
      duration: 2000,
    });
  }, [onChange]);

  // Copy node ID to clipboard
  const handleCopy = useCallback(() => {
    if (nodeId) {
      navigator.clipboard.writeText(nodeId);
      showToast.success('Node ID copied to clipboard', {
        duration: 2000,
      });
    }
  }, [nodeId]);

  // Auto-test on mount if node ID exists
  useEffect(() => {
    if (nodeId && validateNodeId(nodeId) && showTestButton) {
      testNodeReachability();
    }
  }, []); // Only run on mount

  // Don't render if feature flag is disabled
  if (!irohEnabled) {
    return null;
  }

  // Compact view (for Identity Forge)
  if (compact) {
    return (
      <div className={`bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 ${className}`}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Server className="h-5 w-5 text-purple-400" />
            <label className="block text-white font-bold">
              Iroh Node ID (Optional)
            </label>
          </div>
          <button
            type="button"
            onClick={() => window.open('https://iroh.computer/docs', '_blank')}
            className="text-purple-300 hover:text-purple-100 transition-colors"
            aria-label="Learn about Iroh"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        <p className="text-purple-300 text-sm mb-3">
          Add your Iroh node ID for decentralized peer-to-peer verification
        </p>

        <div className="space-y-3">
          <input
            type="text"
            value={nodeId}
            onChange={(e) => handleNodeIdChange(e.target.value)}
            onBlur={handleSave}
            placeholder="Enter 52-character base32 node ID"
            className={`w-full px-4 py-3 bg-black/20 border rounded-lg text-white placeholder-purple-300/50 focus:border-blue-400 focus:outline-none font-mono text-sm ${validationError ? 'border-red-500/50' : 'border-white/30'
              }`}
            aria-label="Iroh node ID"
            aria-invalid={!!validationError}
            aria-describedby={validationError ? 'iroh-error' : undefined}
          />

          {validationError && (
            <p id="iroh-error" className="text-red-400 text-sm" role="alert">
              {validationError}
            </p>
          )}

          {nodeId && !validationError && showTestButton && (
            <button
              type="button"
              onClick={testNodeReachability}
              disabled={nodeStatus.testing}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 text-white rounded-lg transition-colors"
              aria-label="Test node reachability"
            >
              {nodeStatus.testing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  <span>Test Reachability</span>
                </>
              )}
            </button>
          )}

          {nodeStatus.isReachable !== null && !nodeStatus.testing && (
            <div
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm ${nodeStatus.isReachable
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}
              role="status"
              aria-live="polite"
            >
              {nodeStatus.isReachable ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>Node is reachable</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  <span>Node is unreachable</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full view (for Settings page)
  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Server className="h-5 w-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">Iroh Node Configuration</h3>
        </div>
        <button
          type="button"
          onClick={() => window.open('https://iroh.computer/docs', '_blank')}
          className="text-purple-300 hover:text-purple-100 transition-colors text-sm flex items-center space-x-1"
          aria-label="Learn about Iroh"
        >
          <Info className="h-4 w-4" />
          <span>Learn More</span>
        </button>
      </div>

      <p className="text-purple-200 text-sm">
        Iroh provides decentralized peer-to-peer verification using DHT (Distributed Hash Table) technology.
        Adding your Iroh node ID enables an additional verification method for your identity.
      </p>

      {!nodeId && !isEditing ? (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          aria-label="Add Iroh node ID"
        >
          <Server className="h-5 w-5" />
          <span>Add Iroh Node ID</span>
        </button>
      ) : (
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 space-y-3">
          <div>
            <label htmlFor="iroh-node-id" className="block text-white font-medium mb-2">
              Node ID
            </label>
            <div className="flex space-x-2">
              <input
                id="iroh-node-id"
                type="text"
                value={nodeId}
                onChange={(e) => handleNodeIdChange(e.target.value)}
                placeholder="Enter 52-character base32 node ID"
                disabled={!isEditing}
                className={`flex-1 px-4 py-2 bg-black/20 border rounded-lg text-white placeholder-purple-300/50 focus:border-blue-400 focus:outline-none font-mono text-sm disabled:opacity-60 ${validationError ? 'border-red-500/50' : 'border-white/30'
                  }`}
                aria-invalid={!!validationError}
                aria-describedby={validationError ? 'iroh-full-error' : undefined}
              />
              {!isEditing && nodeId && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                  aria-label="Copy node ID"
                  title="Copy node ID"
                >
                  <Copy className="h-4 w-4" />
                </button>
              )}
            </div>

            {validationError && (
              <p id="iroh-full-error" className="text-red-400 text-sm mt-2" role="alert">
                {validationError}
              </p>
            )}
          </div>

          <div className="flex space-x-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!!validationError}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 text-white rounded-lg transition-colors"
                  aria-label="Save node ID"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setNodeId(initialNodeId || '');
                    setValidationError(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  aria-label="Cancel editing"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={testNodeReachability}
                  disabled={nodeStatus.testing || !nodeId}
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 text-white rounded-lg transition-colors"
                  aria-label="Test node reachability"
                >
                  {nodeStatus.testing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      <span>Test</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  aria-label="Edit node ID"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  aria-label="Remove node ID"
                  title="Remove node ID"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {nodeStatus.isReachable !== null && !nodeStatus.testing && (
            <div
              className={`flex items-start space-x-2 px-3 py-2 rounded-lg text-sm ${nodeStatus.isReachable
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}
              role="status"
              aria-live="polite"
            >
              {nodeStatus.isReachable ? (
                <>
                  <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Node is reachable</p>
                    {nodeStatus.relayUrl && (
                      <p className="text-xs mt-1 opacity-80">Relay: {nodeStatus.relayUrl}</p>
                    )}
                    {nodeStatus.cached && (
                      <p className="text-xs mt-1 opacity-80">Cached result</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Node is unreachable</p>
                    {nodeStatus.error && (
                      <p className="text-xs mt-1 opacity-80">{nodeStatus.error}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IrohNodeManager;

