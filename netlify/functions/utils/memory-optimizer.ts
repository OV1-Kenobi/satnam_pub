/**
 * @fileoverview Memory Optimization Utilities for Netlify Functions
 * @description Provides utilities to reduce memory usage and optimize bundle sizes
 * MEMORY OPTIMIZATION: Centralized memory management for Netlify Functions
 */

// Module cache for dynamic imports
const moduleCache = new Map<string, any>();

/**
 * Memory-optimized dynamic import with caching
 * MEMORY OPTIMIZATION: Prevents duplicate module loading
 */
export async function optimizedImport<T = any>(modulePath: string): Promise<T> {
  if (moduleCache.has(modulePath)) {
    return moduleCache.get(modulePath);
  }

  try {
    const module = await import(modulePath);
    moduleCache.set(modulePath, module);
    return module;
  } catch (error) {
    console.error(`Failed to import module: ${modulePath}`, error);
    throw error;
  }
}

/**
 * Clear module cache to free memory
 * MEMORY OPTIMIZATION: Manual memory management
 */
export function clearModuleCache(): void {
  moduleCache.clear();
}

/**
 * Get memory usage statistics
 * MEMORY OPTIMIZATION: Monitor memory consumption
 */
export function getMemoryStats(): {
  used: number;
  total: number;
  percentage: number;
} {
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
 * Lazy loader for common Netlify Functions dependencies
 * MEMORY OPTIMIZATION: Load only when needed
 */
export class LazyLoader {
  private static instance: LazyLoader;
  private loadedModules = new Map<string, any>();

  private constructor() {}

  public static getInstance(): LazyLoader {
    if (!LazyLoader.instance) {
      LazyLoader.instance = new LazyLoader();
    }
    return LazyLoader.instance;
  }

  /**
   * Load Supabase client
   */
  async getSupabase() {
    if (!this.loadedModules.has('supabase')) {
      const module = await optimizedImport('../supabase.js');
      this.loadedModules.set('supabase', module.supabase);
    }
    return this.loadedModules.get('supabase');
  }

  /**
   * Load security utilities
   */
  async getSecurity() {
    if (!this.loadedModules.has('security')) {
      const module = await optimizedImport('../../security.js');
      this.loadedModules.set('security', module);
    }
    return this.loadedModules.get('security');
  }

  /**
   * Load Nostr utilities
   */
  async getNostr() {
    if (!this.loadedModules.has('nostr')) {
      const module = await optimizedImport('../../../src/lib/nostr-browser.js');
      this.loadedModules.set('nostr', module);
    }
    return this.loadedModules.get('nostr');
  }

  /**
   * Load environment utilities
   */
  async getEnv() {
    if (!this.loadedModules.has('env')) {
      const module = await optimizedImport('./env.js');
      this.loadedModules.set('env', module);
    }
    return this.loadedModules.get('env');
  }

  /**
   * Clear all loaded modules
   */
  clearCache(): void {
    this.loadedModules.clear();
  }
}

/**
 * Memory-optimized Netlify Functions response helper
 * MEMORY OPTIMIZATION: Standardized response format with minimal overhead
 */
export function createResponse(
  statusCode: number,
  data: any,
  headers: Record<string, string> = {}
) {
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
export function createErrorResponse(
  statusCode: number,
  message: string,
  details?: any
) {
  return createResponse(statusCode, {
    error: message,
    ...(details && { details })
  });
}

/**
 * CORS preflight handler
 * MEMORY OPTIMIZATION: Lightweight CORS handling
 */
export function handleCORS(event: any) {
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, '');
  }
  return null;
}

/**
 * Memory usage monitor for functions
 * MEMORY OPTIMIZATION: Track memory consumption
 */
export function withMemoryMonitoring<T extends (...args: any[]) => any>(
  fn: T,
  functionName: string
): T {
  return ((...args: any[]) => {
    const startStats = getMemoryStats();
    console.log(`[${functionName}] Memory before: ${startStats.used}MB (${startStats.percentage}%)`);
    
    const result = fn(...args);
    
    // Handle both sync and async functions
    if (result instanceof Promise) {
      return result.finally(() => {
        const endStats = getMemoryStats();
        console.log(`[${functionName}] Memory after: ${endStats.used}MB (${endStats.percentage}%)`);
        console.log(`[${functionName}] Memory delta: ${endStats.used - startStats.used}MB`);
      });
    } else {
      const endStats = getMemoryStats();
      console.log(`[${functionName}] Memory after: ${endStats.used}MB (${endStats.percentage}%)`);
      console.log(`[${functionName}] Memory delta: ${endStats.used - startStats.used}MB`);
      return result;
    }
  }) as T;
}

/**
 * Bundle size analyzer for development
 * MEMORY OPTIMIZATION: Identify heavy imports
 */
export function analyzeBundleSize() {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    const stats = getMemoryStats();
    console.log('📊 Bundle Analysis:');
    console.log(`Memory Usage: ${stats.used}MB / ${stats.total}MB (${stats.percentage}%)`);
    console.log(`Module Cache Size: ${moduleCache.size} modules`);
    
    // List cached modules
    if (moduleCache.size > 0) {
      console.log('Cached Modules:');
      for (const [path] of moduleCache.entries()) {
        console.log(`  - ${path}`);
      }
    }
  }
}

/**
 * Cleanup function for end of request
 * MEMORY OPTIMIZATION: Force garbage collection
 */
export function cleanup() {
  // Clear any temporary caches
  clearModuleCache();
  
  // Force garbage collection if available
  if (typeof global !== 'undefined' && global.gc) {
    global.gc();
  }
}

// Export singleton lazy loader
export const lazyLoader = LazyLoader.getInstance();
