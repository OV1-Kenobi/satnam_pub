// Crypto preloader component for optimized loading
// File: src/components/CryptoPreloader.tsx

import { useEffect, useState } from "react";

interface CryptoPreloaderProps {
  /**
   * Whether to preload crypto modules immediately
   */
  immediate?: boolean;
  
  /**
   * Delay before preloading (in milliseconds)
   */
  delay?: number;
  
  /**
   * Callback when preloading is complete
   */
  onPreloaded?: () => void;
  
  /**
   * Callback when preloading fails
   */
  onError?: (error: Error) => void;
  
  /**
   * Whether to show loading indicator
   */
  showIndicator?: boolean;
  
  /**
   * Custom loading component
   */
  loadingComponent?: React.ReactNode;
}

/**
 * Component that preloads crypto modules in the background
 * 
 * @example
 * ```tsx
 * // Preload immediately when component mounts
 * <CryptoPreloader immediate />
 * 
 * // Preload with delay and callback
 * <CryptoPreloader 
 *   delay={2000} 
 *   onPreloaded={() => console.log('Crypto ready!')}
 *   showIndicator
 * />
 * ```
 */
export function CryptoPreloader({
  immediate = false,
  delay = 0,
  onPreloaded,
  onError,
  showIndicator = false,
  loadingComponent
}: CryptoPreloaderProps) {
  const [isPreloading, setIsPreloading] = useState(false);
  const [isPreloaded, setIsPreloaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!immediate && delay === 0) return;

    const timeoutId = setTimeout(async () => {
      setIsPreloading(true);
      setError(null);

      try {
        // Dynamic import to avoid bundling crypto modules in main chunk
        const { preloadCryptoModules } = await import("../../utils/crypto-factory");
        await preloadCryptoModules();
        
        setIsPreloaded(true);
        onPreloaded?.();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error);
      } finally {
        setIsPreloading(false);
      }
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [immediate, delay, onPreloaded, onError]);

  if (!showIndicator) {
    return null;
  }

  if (loadingComponent && isPreloading) {
    return <>{loadingComponent}</>;
  }

  if (isPreloading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
        <span>Loading crypto modules...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600">
        Failed to load crypto modules: {error.message}
      </div>
    );
  }

  if (isPreloaded) {
    return (
      <div className="text-sm text-green-600">
        ✓ Crypto modules ready
      </div>
    );
  }

  return null;
}

/**
 * Hook for programmatic crypto preloading
 */
export function useCryptoPreloader() {
  const [state, setState] = useState({
    isPreloading: false,
    isPreloaded: false,
    error: null as Error | null
  });

  const preload = async () => {
    if (state.isPreloading || state.isPreloaded) return;

    setState(prev => ({ ...prev, isPreloading: true, error: null }));

    try {
      const { preloadCryptoModules } = await import("../../utils/crypto-factory");
      await preloadCryptoModules();
      
      setState(prev => ({ ...prev, isPreloaded: true }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState(prev => ({ ...prev, error }));
    } finally {
      setState(prev => ({ ...prev, isPreloading: false }));
    }
  };

  return {
    ...state,
    preload
  };
}

/**
 * Smart crypto preloader that preloads based on user interaction patterns
 */
export function SmartCryptoPreloader() {
  const { preload, isPreloaded, isPreloading } = useCryptoPreloader();
  
  useEffect(() => {
    // Preload crypto modules on user interaction (hover, focus, etc.)
    const handleUserInteraction = () => {
      if (!isPreloaded && !isPreloading) {
        preload();
      }
    };

    // Preload on first user interaction
    const events = ['mouseenter', 'focus', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true, passive: true });
    });

    // Preload after a delay if no interaction
    const timeoutId = setTimeout(() => {
      if (!isPreloaded && !isPreloading) {
        preload();
      }
    }, 3000); // 3 second delay

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction);
      });
      clearTimeout(timeoutId);
    };
  }, [preload, isPreloaded, isPreloading]);

  return null; // This component doesn't render anything
}

/**
 * Higher-order component that preloads crypto modules
 */
export function withCryptoPreloader<P extends object>(
  Component: React.ComponentType<P>,
  options: { immediate?: boolean; delay?: number } = {}
) {
  return function CryptoPreloadedComponent(props: P) {
    const { immediate = true, delay = 0 } = options;

    return (
      <>
        <CryptoPreloader immediate={immediate} delay={delay} />
        <Component {...props} />
      </>
    );
  };
}