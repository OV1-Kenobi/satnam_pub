// React provider for crypto utilities with lazy loading
// File: src/components/CryptoProvider.tsx

import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import {
  areCryptoModulesLoaded,
  configureCryptoStrategy,
  preloadCryptoModules,
  type CryptoLoadingState,
  type CryptoLoadingStrategy
} from '../utils/crypto-factory';

interface CryptoContextValue extends CryptoLoadingState {
  loadCrypto: () => Promise<void>;
  retry: () => Promise<void>;
  configure: (strategy: Partial<CryptoLoadingStrategy>) => void;
}

const CryptoContext = createContext<CryptoContextValue | null>(null);

interface CryptoProviderProps {
  children: ReactNode;
  strategy?: Partial<CryptoLoadingStrategy>;
  preload?: boolean;
  fallback?: ReactNode;
  errorFallback?: (error: Error, retry: () => void) => ReactNode;
}

/**
 * Provider component for crypto utilities with lazy loading
 * 
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <CryptoProvider 
 *       preload={true}
 *       strategy={{ useSync: false, enableCaching: true }}
 *       fallback={<div>Loading crypto modules...</div>}
 *       errorFallback={(error, retry) => (
 *         <div>
 *           <p>Failed to load crypto: {error.message}</p>
 *           <button onClick={retry}>Retry</button>
 *         </div>
 *       )}
 *     >
 *       <MyApp />
 *     </CryptoProvider>
 *   );
 * }
 * ```
 */
export function CryptoProvider({
  children,
  strategy,
  preload = false,
  fallback,
  errorFallback
}: CryptoProviderProps) {
  const [state, setState] = useState<CryptoLoadingState>(() => ({
    isLoading: false,
    isLoaded: areCryptoModulesLoaded(),
    error: null
  }));

  const [isLoadingRef, setIsLoadingRef] = useState(false);

  // Configure strategy on mount
  useEffect(() => {
    if (strategy) {
      configureCryptoStrategy(strategy);
    }
  }, [strategy]);

  const loadCrypto = async () => {
    if (isLoadingRef || state.isLoaded) return;

    setIsLoadingRef(true);
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await preloadCryptoModules();
      setState({
        isLoading: false,
        isLoaded: true,
        error: null
      });
    } catch (error) {
      setState({
        isLoading: false,
        isLoaded: false,
        error: error instanceof Error ? error : new Error(String(error))
      });
    } finally {
      setIsLoadingRef(false);
    }
  };

  const retry = async () => {
    setState(prev => ({ ...prev, error: null }));
    await loadCrypto();
  };

  const configure = (newStrategy: Partial<CryptoLoadingStrategy>) => {
    configureCryptoStrategy(newStrategy);
  };

  // Preload on mount if requested
  useEffect(() => {
    if (preload) {
      loadCrypto();
    }
  }, [preload]);

  const contextValue: CryptoContextValue = {
    ...state,
    loadCrypto,
    retry,
    configure
  };

  // Show fallback while loading
  if (state.isLoading && fallback) {
    return <>{fallback}</>;
  }

  // Show error fallback if there's an error
  if (state.error && errorFallback) {
    return <>{errorFallback(state.error, retry)}</>;
  }

  return (
    <CryptoContext.Provider value={contextValue}>
      {children}
    </CryptoContext.Provider>
  );
}

/**
 * Hook to access crypto context
 * Must be used within a CryptoProvider
 */
export function useCryptoContext(): CryptoContextValue {
  const context = useContext(CryptoContext);
  if (!context) {
    throw new Error('useCryptoContext must be used within a CryptoProvider');
  }
  return context;
}

/**
 * Higher-order component that ensures crypto modules are loaded
 * before rendering the wrapped component
 */
export function withCrypto<P extends object>(
  Component: React.ComponentType<P>,
  options: {
    fallback?: ReactNode;
    errorFallback?: (error: Error, retry: () => void) => ReactNode;
  } = {}
) {
  const WrappedComponent = (props: P) => {
    const crypto = useCryptoContext();

    // Show fallback while loading
    if (crypto.isLoading) {
      return options.fallback || <div>Loading crypto modules...</div>;
    }

    // Show error fallback if there's an error
    if (crypto.error) {
      return options.errorFallback 
        ? options.errorFallback(crypto.error, crypto.retry)
        : <div>Failed to load crypto modules: {crypto.error.message}</div>;
    }

    // Only render component when crypto is loaded
    if (!crypto.isLoaded) {
      // Trigger loading if not already loaded
      crypto.loadCrypto();
      return options.fallback || <div>Loading crypto modules...</div>;
    }

    return <Component {...props} />;
  };

  WrappedComponent.displayName = `withCrypto(${Component.displayName || Component.name})`;
  return WrappedComponent;
}

/**
 * Component that conditionally renders children based on crypto loading state
 */
interface CryptoGateProps {
  children: ReactNode;
  fallback?: ReactNode;
  errorFallback?: (error: Error, retry: () => void) => ReactNode;
  autoLoad?: boolean;
}

export function CryptoGate({
  children,
  fallback,
  errorFallback,
  autoLoad = true
}: CryptoGateProps) {
  const crypto = useCryptoContext();

  // Auto-load crypto if requested and not already loaded/loading
  useEffect(() => {
    if (autoLoad && !crypto.isLoaded && !crypto.isLoading && !crypto.error) {
      crypto.loadCrypto();
    }
  }, [autoLoad, crypto]);

  // Show fallback while loading
  if (crypto.isLoading) {
    return <>{fallback || <div>Loading crypto modules...</div>}</>;
  }

  // Show error fallback if there's an error
  if (crypto.error) {
    return <>{
      errorFallback 
        ? errorFallback(crypto.error, crypto.retry)
        : (
          <div>
            <p>Failed to load crypto modules: {crypto.error.message}</p>
            <button onClick={crypto.retry}>Retry</button>
          </div>
        )
    }</>;
  }

  // Only render children when crypto is loaded
  if (!crypto.isLoaded) {
    return <>{fallback || <div>Crypto modules not loaded</div>}</>;
  }

  return <>{children}</>;
}

/**
 * Loading indicator component for crypto operations
 */
interface CryptoLoadingIndicatorProps {
  className?: string;
  text?: string;
}

export function CryptoLoadingIndicator({
  className = "",
  text = "Loading crypto modules..."
}: CryptoLoadingIndicatorProps) {
  const crypto = useCryptoContext();

  if (!crypto.isLoading) return null;

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      <span>{text}</span>
    </div>
  );
}

/**
 * Error display component for crypto operations
 */
interface CryptoErrorDisplayProps {
  className?: string;
  showRetry?: boolean;
  retryText?: string;
}

export function CryptoErrorDisplay({
  className = "",
  showRetry = true,
  retryText = "Retry"
}: CryptoErrorDisplayProps) {
  const crypto = useCryptoContext();

  if (!crypto.error) return null;

  return (
    <div className={`text-red-600 ${className}`}>
      <p>Failed to load crypto modules: {crypto.error.message}</p>
      {showRetry && (
        <button
          onClick={crypto.retry}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          {retryText}
        </button>
      )}
    </div>
  );
}