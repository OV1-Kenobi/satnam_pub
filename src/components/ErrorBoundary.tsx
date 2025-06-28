/**
 * ErrorBoundary Component
 * 
 * Comprehensive error boundary for the Privacy-First Contacts system.
 * Compatible with Bolt.new and Netlify serverless deployments.
 * Provides fallback UI and error reporting for production stability.
 */

import { AlertTriangle, RefreshCw, Shield } from 'lucide-react';
import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  maxRetries?: number;
  showDetails?: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error);
    console.error('Error info:', errorInfo);

    // Update state with error info
    this.setState({
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Report error to monitoring service (if available)
    this.reportError(error, errorInfo);
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private reportError = (error: Error, errorInfo: React.ErrorInfo) => {
    // In a production environment, you would send this to your error reporting service
    // For now, we'll just log it to the console
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    console.warn('Error report:', errorReport);

    // In production, send to error reporting service:
    // sendToErrorReporting(errorReport);
  };

  private handleRetry = () => {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount < maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1,
      }));
    } else {
      // Max retries reached, reload the page
      window.location.reload();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  private renderErrorDetails = () => {
    const { error, errorInfo } = this.state;
    const { showDetails = false } = this.props;

    if (!showDetails || !error) return null;

    return (
      <details className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <summary className="cursor-pointer text-red-400 font-medium mb-2">
          Technical Details (Developer Mode)
        </summary>
        <div className="space-y-2 text-sm">
          <div>
            <h4 className="font-medium text-red-300">Error Message:</h4>
            <code className="text-red-200 bg-red-500/20 p-2 rounded block mt-1 text-xs">
              {error.message}
            </code>
          </div>
          {error.stack && (
            <div>
              <h4 className="font-medium text-red-300">Stack Trace:</h4>
              <pre className="text-red-200 bg-red-500/20 p-2 rounded text-xs overflow-auto max-h-32">
                {error.stack}
              </pre>
            </div>
          )}
          {errorInfo?.componentStack && (
            <div>
              <h4 className="font-medium text-red-300">Component Stack:</h4>
              <pre className="text-red-200 bg-red-500/20 p-2 rounded text-xs overflow-auto max-h-32">
                {errorInfo.componentStack}
              </pre>
            </div>
          )}
        </div>
      </details>
    );
  };

  private renderFallbackUI = () => {
    const { retryCount } = this.state;
    const { maxRetries = 3 } = this.props;
    const canRetry = retryCount < maxRetries;

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-8 max-w-lg w-full text-center">
          {/* Error Icon */}
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>

          {/* Error Message */}
          <h1 className="text-2xl font-bold text-white mb-4">
            Something went wrong
          </h1>
          <p className="text-purple-200 mb-6">
            We encountered an unexpected error in the Privacy-First Contacts system. 
            Your data remains secure and encrypted.
          </p>

          {/* Privacy Assurance */}
          <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <Shield className="h-5 w-5 text-blue-400" />
              <span className="text-blue-400 font-medium">Privacy Protected</span>
            </div>
            <p className="text-blue-300 text-sm">
              This error does not compromise your encrypted contact data or privacy settings.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4">
            {canRetry && (
              <button
                onClick={this.handleRetry}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                <RefreshCw className="h-5 w-5" />
                <span>Try Again</span>
                {retryCount > 0 && (
                  <span className="text-blue-200 text-sm">({retryCount}/{maxRetries})</span>
                )}
              </button>
            )}
            <button
              onClick={this.handleReload}
              className="flex-1 px-6 py-3 bg-white/10 border border-white/20 hover:bg-white/20 text-white font-medium rounded-lg transition-all duration-300"
            >
              Reload App
            </button>
          </div>

          {/* Retry Information */}
          {!canRetry && (
            <div className="mt-4 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-400 text-sm">
                Maximum retry attempts reached. Please reload the application.
              </p>
            </div>
          )}

          {/* Error Details */}
          {this.renderErrorDetails()}

          {/* Contact Information */}
          <div className="mt-6 pt-6 border-t border-white/20 text-purple-300 text-sm">
            <p>
              If this problem persists, this might be a compatibility issue with your browser or network.
              The app works best with modern browsers and stable internet connections.
            </p>
          </div>
        </div>
      </div>
    );
  };

  render() {
    const { hasError } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Render custom fallback UI if provided, otherwise use default
      return fallback || this.renderFallbackUI();
    }

    return children;
  }
}

export default ErrorBoundary;