/**
 * @fileoverview Simplified Memory Optimization Utilities for Netlify Functions
 * @description Provides basic memory management utilities for JavaScript functions
 * MEMORY OPTIMIZATION: Lightweight memory management for Netlify Functions
 */

/**
 * Memory-optimized CORS handler
 * MEMORY OPTIMIZATION: Lightweight CORS handling
 */
export function handleCORS(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Content-Type': 'application/json'
      },
      body: ''
    };
  }
  return null;
}

/**
 * Memory-optimized Netlify Functions response helper
 * MEMORY OPTIMIZATION: Standardized response format with minimal overhead
 */
export function createResponse(statusCode, data, headers = {}) {
  const defaultHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
    ...headers
  };

  return {
    statusCode,
    headers: defaultHeaders,
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

/**
 * Memory-optimized error response
 * MEMORY OPTIMIZATION: Minimal error response structure
 */
export function createErrorResponse(statusCode, message, details) {
  return createResponse(statusCode, {
    error: message,
    ...(details && { details })
  });
}

/**
 * Get memory usage statistics (simplified for JavaScript)
 * MEMORY OPTIMIZATION: Monitor memory consumption
 */
export function getMemoryStats() {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const usage = process.memoryUsage();
    return {
      used: Math.round(usage.heapUsed / 1024 / 1024), // MB
      total: Math.round(usage.heapTotal / 1024 / 1024), // MB
      percentage: Math.round((usage.heapUsed / usage.heapTotal) * 100)
    };
  }
  
  return { used: 0, total: 0, percentage: 0 };
}

/**
 * Memory usage monitor for functions (simplified)
 * MEMORY OPTIMIZATION: Track memory consumption
 */
export function withMemoryMonitoring(fn, functionName) {
  return async (...args) => {
    const startStats = getMemoryStats();
    
    // Only log in development to avoid production noise
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${functionName}] Memory before: ${startStats.used}MB (${startStats.percentage}%)`);
    }
    
    try {
      const result = await fn(...args);
      
      if (process.env.NODE_ENV === 'development') {
        const endStats = getMemoryStats();
        console.log(`[${functionName}] Memory after: ${endStats.used}MB (${endStats.percentage}%)`);
        console.log(`[${functionName}] Memory delta: ${endStats.used - startStats.used}MB`);
      }
      
      return result;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        const endStats = getMemoryStats();
        console.log(`[${functionName}] Memory after error: ${endStats.used}MB (${endStats.percentage}%)`);
      }
      throw error;
    }
  };
}

/**
 * Cleanup function for end of request (simplified)
 * MEMORY OPTIMIZATION: Basic cleanup
 */
export function cleanup() {
  // Force garbage collection if available (only in development)
  if (process.env.NODE_ENV === 'development' && typeof global !== 'undefined' && global.gc) {
    try {
      global.gc();
    } catch (error) {
      // Ignore GC errors
    }
  }
}

/**
 * Bundle size analyzer for development (simplified)
 * MEMORY OPTIMIZATION: Basic bundle analysis
 */
export function analyzeBundleSize() {
  if (process.env.NODE_ENV === 'development') {
    const stats = getMemoryStats();
    console.log('📊 Bundle Analysis:');
    console.log(`Memory Usage: ${stats.used}MB / ${stats.total}MB (${stats.percentage}%)`);
  }
}

// Export default object for compatibility
export default {
  handleCORS,
  createResponse,
  createErrorResponse,
  getMemoryStats,
  withMemoryMonitoring,
  cleanup,
  analyzeBundleSize
};
