/**
 * Runtime Diagnostics Component
 * 
 * Conditionally renders in production when ?debug=true query parameter is present.
 * Provides real-time diagnostics for:
 * - React availability and context initialization
 * - Module loading state
 * - Environment variable access patterns
 * - Feature flag availability
 * - Chunk loading timeline
 */

import React, { useEffect, useState } from 'react';

interface DiagnosticResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}

interface RuntimeDiagnosticsProps {
  forceShow?: boolean;
}

/**
 * Check if debug mode is enabled via query parameter
 */
function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.search.includes('debug=true');
}

/**
 * Runtime Diagnostics Component
 * Only renders when ?debug=true is in the URL
 */
export function RuntimeDiagnostics({ forceShow = false }: RuntimeDiagnosticsProps) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!forceShow && !isDebugMode()) return;
    setIsVisible(true);
    runDiagnostics();
  }, [forceShow]);

  const runDiagnostics = async () => {
    const results: DiagnosticResult[] = [];

    // 1. React Availability
    try {
      const reactVersion = (React as any).version || 'unknown';
      const hasCreateContext = typeof React.createContext === 'function';
      const hasUseState = typeof React.useState === 'function';

      results.push({
        name: 'React Core',
        status: hasCreateContext && hasUseState ? 'pass' : 'fail',
        message: `React ${reactVersion}`,
        details: `createContext: ${hasCreateContext}, useState: ${hasUseState}`
      });
    } catch (e) {
      results.push({
        name: 'React Core',
        status: 'fail',
        message: 'React not available',
        details: e instanceof Error ? e.message : 'Unknown error'
      });
    }

    // 2. Environment Variables (process.env)
    try {
      const env = (process.env || {}) as Record<string, unknown>;
      const envKeys = Object.keys(env);
      const viteVars = envKeys.filter(k => k.startsWith('VITE_'));

      results.push({
        name: 'Environment Variables',
        status: viteVars.length > 0 ? 'pass' : 'warn',
        message: `${viteVars.length} VITE_* variables`,
        details: `Total keys: ${envKeys.length}, NODE_ENV: ${env.NODE_ENV || 'undefined'}`
      });
    } catch (e) {
      results.push({
        name: 'Environment Variables',
        status: 'fail',
        message: 'process.env not available',
        details: e instanceof Error ? e.message : 'Unknown error'
      });
    }

    // 3. import.meta.env (Vite)
    try {
      const importMeta = (import.meta as any);
      const hasEnv = !!importMeta?.env;
      const mode = importMeta?.env?.MODE || 'unknown';

      results.push({
        name: 'Vite import.meta.env',
        status: hasEnv ? 'pass' : 'warn',
        message: `Mode: ${mode}`,
        details: `PROD: ${importMeta?.env?.PROD}, DEV: ${importMeta?.env?.DEV}`
      });
    } catch (e) {
      results.push({
        name: 'Vite import.meta.env',
        status: 'warn',
        message: 'import.meta.env access failed',
        details: e instanceof Error ? e.message : 'Unknown error'
      });
    }

    // 4. Window/Global Objects
    try {
      const hasWindow = typeof window !== 'undefined';
      const hasDocument = typeof document !== 'undefined';
      const hasLocalStorage = typeof localStorage !== 'undefined';

      results.push({
        name: 'Browser Globals',
        status: hasWindow && hasDocument ? 'pass' : 'fail',
        message: 'Browser environment detected',
        details: `window: ${hasWindow}, document: ${hasDocument}, localStorage: ${hasLocalStorage}`
      });
    } catch (e) {
      results.push({
        name: 'Browser Globals',
        status: 'fail',
        message: 'Browser globals not available',
        details: e instanceof Error ? e.message : 'Unknown error'
      });
    }

    // 5. Performance Timing
    try {
      const timing = performance.timing;
      const loadTime = timing.loadEventEnd - timing.navigationStart;
      const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;

      results.push({
        name: 'Page Load Timing',
        status: loadTime > 0 ? 'pass' : 'warn',
        message: `DOM Ready: ${domReady}ms`,
        details: `Full Load: ${loadTime}ms`
      });
    } catch (e) {
      results.push({
        name: 'Page Load Timing',
        status: 'warn',
        message: 'Performance API not available',
        details: e instanceof Error ? e.message : 'Unknown error'
      });
    }

    setDiagnostics(results);
  };

  if (!isVisible) return null;

  const passCount = diagnostics.filter(d => d.status === 'pass').length;
  const failCount = diagnostics.filter(d => d.status === 'fail').length;
  const warnCount = diagnostics.filter(d => d.status === 'warn').length;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] font-mono text-xs max-w-md">
      {isExpanded && (
        <div className="mb-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 max-h-96 overflow-auto">
          <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
            <span className="text-white font-bold">Runtime Diagnostics</span>
            <button
              onClick={runDiagnostics}
              className="text-blue-400 hover:text-blue-300"
            >
              Refresh
            </button>
          </div>

          {diagnostics.map((d, i) => (
            <div key={i} className="mb-2 p-2 bg-gray-800 rounded">
              <div className="flex items-center gap-2">
                <span className={
                  d.status === 'pass' ? 'text-green-400' :
                    d.status === 'fail' ? 'text-red-400' : 'text-yellow-400'
                }>
                  {d.status === 'pass' ? '✓' : d.status === 'fail' ? '✗' : '⚠'}
                </span>
                <span className="text-white font-medium">{d.name}</span>
              </div>
              <div className="text-gray-300 mt-1">{d.message}</div>
              {d.details && (
                <div className="text-gray-500 mt-1 text-[10px]">{d.details}</div>
              )}
            </div>
          ))}

          <div className="mt-3 pt-2 border-t border-gray-700 text-gray-400">
            <div>Build: {process.env.NODE_ENV}</div>
            <div>Time: {new Date().toISOString()}</div>
            <div>URL: {typeof window !== 'undefined' ? window.location.pathname : 'N/A'}</div>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`px-3 py-1 rounded-lg shadow-lg ${failCount > 0 ? 'bg-red-600' : warnCount > 0 ? 'bg-yellow-600' : 'bg-green-600'
          } text-white hover:opacity-90 transition-opacity`}
      >
        🔧 Diagnostics ({passCount}✓ {failCount}✗ {warnCount}⚠)
      </button>
    </div>
  );
}

export default RuntimeDiagnostics;

