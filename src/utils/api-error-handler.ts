/**
 * API Error Handling Utilities
 * Provides standardized error handling for API calls across the application
 */

export interface APIError {
  message: string;
  status?: number;
  code?: string;
  details?: any;
  timestamp: Date;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: APIError;
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

export class APIErrorHandler {
  private static instance: APIErrorHandler;
  private errorCallbacks: Set<(error: APIError) => void> = new Set();

  static getInstance(): APIErrorHandler {
    if (!APIErrorHandler.instance) {
      APIErrorHandler.instance = new APIErrorHandler();
    }
    return APIErrorHandler.instance;
  }

  /**
   * Handle fetch response with standardized error handling
   */
  static async handleFetchResponse<T>(
    response: Response,
    context: string = 'API call'
  ): Promise<T> {
    if (!response.ok) {
      const error: APIError = {
        message: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
        timestamp: new Date(),
      };

      // Try to parse error details from response
      try {
        const errorData = await response.json();
        error.details = errorData;
        error.message = errorData.message || error.message;
        error.code = errorData.code;
      } catch {
        // If response is not JSON, use default error message
      }

      throw error;
    }

    try {
      return await response.json();
    } catch (error) {
      throw {
        message: 'Failed to parse response',
        details: error,
        timestamp: new Date(),
      } as APIError;
    }
  }

  /**
   * Standardized fetch wrapper with error handling
   */
  static async fetchWithErrorHandling<T>(
    url: string,
    options: RequestInit = {},
    context: string = 'API call'
  ): Promise<T> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      return await this.handleFetchResponse<T>(response, context);
    } catch (error) {
      const apiError: APIError = {
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        details: error,
        timestamp: new Date(),
      };

      // Log error for debugging
      console.error(`API Error (${context}):`, apiError);

      // Notify error handlers
      this.getInstance().notifyErrorHandlers(apiError);

      throw apiError;
    }
  }

  /**
   * Register error callback
   */
  onError(callback: (error: APIError) => void): () => void {
    this.errorCallbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.errorCallbacks.delete(callback);
    };
  }

  /**
   * Notify all error handlers
   */
  private notifyErrorHandlers(error: APIError): void {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        console.error('Error in error handler callback:', callbackError);
      }
    });
  }

  /**
   * Get user-friendly error message
   */
  static getErrorMessage(error: APIError): string {
    const { status, message } = error;

    // Network errors
    if (message.includes('fetch')) {
      return 'Network connection failed. Please check your internet connection.';
    }

    // HTTP status codes
    switch (status) {
      case 400:
        return 'Invalid request. Please check your input and try again.';
      case 401:
        return 'Authentication required. Please sign in again.';
      case 403:
        return 'Access denied. You do not have permission to perform this action.';
      case 404:
        return 'Resource not found. The requested data is not available.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'Server error. Please try again later.';
      case 502:
      case 503:
      case 504:
        return 'Service temporarily unavailable. Please try again later.';
      default:
        return message || 'An unexpected error occurred.';
    }
  }

  /**
   * Check if error is retryable
   */
  static isRetryableError(error: APIError): boolean {
    const { status } = error;
    
    // Retry on network errors and server errors
    if (!status) return true; // Network error
    if (status >= 500) return true; // Server error
    if (status === 429) return true; // Rate limit
    
    return false;
  }

  /**
   * Retry function with exponential backoff
   */
  static async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: APIError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as APIError;
        
        if (attempt === maxRetries || !this.isRetryableError(lastError)) {
          throw lastError;
        }

        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}

export default APIErrorHandler; 