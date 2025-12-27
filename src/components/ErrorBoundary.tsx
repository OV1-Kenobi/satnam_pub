
/**
 * ErrorBoundary Component
 * 
 * Comprehensive error boundary for the Privacy-First Contacts system.
 * Compatible with Bolt.new and Netlify serverless deployments.
 * Provides fallback UI and error reporting for production stability.
 */

import { AlertTriangle, ArrowLeft, Home, RefreshCw } from 'lucide-react';
import React, { useCallback, useState, type ComponentType, type ErrorInfo, type ReactNode } from 'react';

// Temporary production diagnostics for React import resolution
if (process.env.NODE_ENV === 'production') {
  try {
    // Minimal diagnostics without secrets
    // eslint-disable-next-line no-console
    console.warn('[ErrorBoundary] React import diagnostics:', {
      hasDefault: !!React,
      hasComponent: !!(React as any)?.Component,
      keys: Object.keys((React as any) || {}),
    });
  } catch { }
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

// Lazy class factory to avoid chunk init order/TDZ issues in production
let __ErrorBoundaryClass__: any;
function getErrorBoundaryClass() {
  if (!__ErrorBoundaryClass__) {
    const R: any = React;
    class ErrorBoundaryImpl extends R.Component<Props, State> {
      constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
      }

      static getDerivedStateFromError(error: Error): State {
        // This method must be pure with no side effects (React requirement)
        // TDZ logging is handled in componentDidCatch
        return { hasError: true, error };
      }

      /**
       * Detect if an error is a Temporal Dead Zone (TDZ) error
       * These occur when variables are accessed before their declaration in production builds
       */
      static detectTDZError(error: Error): boolean {
        const message = error.message;
        const stack = error.stack || '';

        // Actual TDZ error pattern - very specific to avoid false positives
        // True TDZ errors have signature: "Cannot access 'variableName' before initialization"
        const tdzPatterns = [
          /cannot access ['"]?\w+['"]? before initialization/i,
        ];

        // Check if error matches TDZ patterns
        const isTDZ = tdzPatterns.some(pattern =>
          pattern.test(message) || pattern.test(stack)
        );

        // Additional check: if error occurs in chunk files during initialization
        const isChunkError = stack.includes('chunk') ||
          stack.includes('vendor') ||
          stack.includes('.js:') && !stack.includes('node_modules');

        return isTDZ && isChunkError;
      }

      componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        const isTDZError = ErrorBoundaryImpl.detectTDZError(error);

        // Enhanced error logging with TDZ detection
        console.error('ErrorBoundary caught an error:', {
          error,
          errorInfo,
          isTDZError,
          chunkInfo: this.extractChunkInfo(errorInfo),
          timestamp: new Date().toISOString()
        });

        // Call the onError callback if provided
        if (this.props.onError) {
          this.props.onError(error, errorInfo);
        }

        // Update state with error info
        this.setState({ error, errorInfo });
      }

      /**
       * Extract chunk information from error stack for debugging
       */
      extractChunkInfo(errorInfo: ErrorInfo): object {
        const stack = errorInfo?.componentStack || '';
        const chunkMatches = stack.match(/([a-zA-Z0-9-]+)-[A-Za-z0-9]+\.js/g);
        return {
          chunks: chunkMatches || [],
          componentStack: stack.split('\n').slice(0, 5).join('\n')
        };
      }

      handleRetry = () => {
        this.setState({ hasError: false, error: undefined, errorInfo: undefined });
      };

      handleGoHome = () => {
        window.location.href = '/';
      };

      handleGoBack = () => {
        window.history.back();
      };

      render() {
        if (this.state.hasError) {
          // Custom fallback UI
          if (this.props.fallback) {
            return this.props.fallback;
          }

          // Default error UI
          return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
              <div className="max-w-md w-full bg-gray-800 rounded-lg border border-gray-700 p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
                    <p className="text-gray-400 text-sm">An unexpected error occurred</p>
                  </div>
                </div>

                {/* TDZ Error indicator for production debugging */}
                {this.state.error && ErrorBoundaryImpl.detectTDZError(this.state.error) && (
                  <div className="mb-4 p-3 bg-yellow-900/30 rounded border border-yellow-600/50">
                    <div className="text-yellow-400 text-sm font-medium mb-1">
                      ⚠️ Module Initialization Error Detected
                    </div>
                    <p className="text-yellow-300/70 text-xs">
                      This may be caused by a chunk loading order issue.
                      Try refreshing the page or clearing your browser cache.
                    </p>
                  </div>
                )}

                {/* Debug mode: show details when ?debug=true in production */}
                {(process.env.NODE_ENV === 'development' ||
                  (typeof window !== 'undefined' && window.location.search.includes('debug=true'))) &&
                  this.state.error && (
                    <div className="mb-4 p-3 bg-gray-700/50 rounded border border-gray-600">
                      <details className="text-sm" open={process.env.NODE_ENV === 'development'}>
                        <summary className="text-gray-300 cursor-pointer mb-2">
                          Error Details {process.env.NODE_ENV === 'production' ? '(Debug Mode)' : '(Development)'}
                        </summary>
                        <div className="text-red-400 font-mono text-xs">
                          <div className="mb-2">
                            <strong>Error:</strong> {this.state.error.message}
                          </div>
                          <div className="mb-2">
                            <strong>Type:</strong> {ErrorBoundaryImpl.detectTDZError(this.state.error) ? 'TDZ/Module Init' : 'Runtime'}
                          </div>
                          {this.state.errorInfo && (
                            <div>
                              <strong>Component Stack:</strong>
                              <pre className="mt-1 overflow-auto max-h-40">
                                {this.state.errorInfo.componentStack}
                              </pre>
                            </div>
                          )}
                          {this.state.error.stack && (
                            <div className="mt-2">
                              <strong>Error Stack:</strong>
                              <pre className="mt-1 overflow-auto max-h-40 text-gray-400">
                                {this.state.error.stack.split('\n').slice(0, 10).join('\n')}
                              </pre>
                            </div>
                          )}
                        </div>
                      </details>
                    </div>
                  )}

                <div className="space-y-3">
                  <button
                    onClick={this.handleRetry}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Try Again</span>
                  </button>

                  <div className="flex space-x-2">
                    <button
                      onClick={this.handleGoBack}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Go Back</span>
                    </button>

                    <button
                      onClick={this.handleGoHome}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                    >
                      <Home className="h-4 w-4" />
                      <span>Home</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-500">
                    If this problem persists, please contact support
                  </p>
                </div>
              </div>
            </div>
          );
        }

        return this.props.children;
      }
    }
    __ErrorBoundaryClass__ = ErrorBoundaryImpl;
  }
  return __ErrorBoundaryClass__;
}

export function ErrorBoundary(props: Props) {
  const Boundary = getErrorBoundaryClass();
  return <Boundary {...props} />;
}


// Higher-order component for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  WrappedComponent: ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback} onError={onError}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

// Hook for error handling in functional components
export function useErrorHandler() {
  const [error, setError] = useState<Error | null>(null);

  const handleError = useCallback((error: Error) => {
    console.error('Component error:', error);
    setError(error);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { error, handleError, clearError };
}

export default ErrorBoundary;