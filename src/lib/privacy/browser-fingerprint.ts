/**
 * Browser Fingerprint Utility
 * Privacy-preserving browser fingerprinting for anti-gaming measures
 * @compliance Master Context - Privacy-first, browser-compatible, no external dependencies
 */

/**
 * Generate a privacy-preserving browser fingerprint
 * Uses only non-identifying characteristics for anti-gaming protection
 */
export async function generateBrowserFingerprint(): Promise<string> {
  try {
    const components: string[] = [];

    // Screen characteristics (non-identifying)
    components.push(`screen:${screen.width}x${screen.height}x${screen.colorDepth}`);
    components.push(`avail:${screen.availWidth}x${screen.availHeight}`);

    // Browser characteristics
    components.push(`userAgent:${navigator.userAgent.length}`);
    components.push(`language:${navigator.language}`);
    components.push(`languages:${navigator.languages?.length || 0}`);

    // Hardware characteristics (non-identifying)
    components.push(`hardwareConcurrency:${navigator.hardwareConcurrency || 0}`);
    components.push(`deviceMemory:${(navigator as any).deviceMemory || 0}`);

    // Canvas fingerprint (privacy-preserving)
    const canvasFingerprint = await generateCanvasFingerprint();
    components.push(`canvas:${canvasFingerprint}`);

    // WebGL fingerprint (privacy-preserving)
    const webglFingerprint = await generateWebGLFingerprint();
    components.push(`webgl:${webglFingerprint}`);

    // Timezone (coarse)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    components.push(`timezone:${timezone}`);

    // Platform
    components.push(`platform:${navigator.platform}`);

    // Cookie enabled
    components.push(`cookies:${navigator.cookieEnabled}`);

    // Do not track
    components.push(`dnt:${navigator.doNotTrack || 'unknown'}`);

    // Create hash of components
    const fingerprint = await hashComponents(components.join('|'));
    return fingerprint;
  } catch (error) {
    console.warn('Failed to generate browser fingerprint:', error);
    // Fallback to basic fingerprint
    return generateBasicFingerprint();
  }
}

/**
 * Generate canvas fingerprint
 */
async function generateCanvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      return 'no-canvas';
    }

    // Draw a simple pattern
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Browser fingerprint test', 2, 2);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Create hash of pixel data
    let hash = 0;
    for (let i = 0; i < data.length; i += 4) {
      hash = ((hash << 5) - hash + data[i]) & 0xffffffff;
    }
    
    return hash.toString(16);
  } catch (error) {
    return 'canvas-error';
  }
}

/**
 * Generate WebGL fingerprint
 */
async function generateWebGLFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    
    if (!gl) {
      return 'no-webgl';
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) {
      return 'no-debug-info';
    }

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    
    // Hash vendor and renderer info
    const combined = `${vendor}|${renderer}`;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash + char) & 0xffffffff;
    }
    
    return hash.toString(16);
  } catch (error) {
    return 'webgl-error';
  }
}

/**
 * Hash components using Web Crypto API
 */
async function hashComponents(input: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16); // Return first 16 characters for privacy
  } catch (error) {
    // Fallback to simple hash
    return simpleHash(input);
  }
}

/**
 * Simple hash function as fallback
 */
function simpleHash(input: string): string {
  let hash = 0;
  if (input.length === 0) return hash.toString(16);
  
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) & 0xffffffff;
  }
  
  return Math.abs(hash).toString(16).substring(0, 16);
}

/**
 * Generate basic fingerprint as fallback
 */
function generateBasicFingerprint(): string {
  const components = [
    navigator.userAgent.length.toString(),
    navigator.language,
    screen.width.toString(),
    screen.height.toString(),
    navigator.platform,
    navigator.cookieEnabled.toString()
  ];
  
  return simpleHash(components.join('|'));
}

/**
 * Compare two fingerprints for similarity
 * Returns similarity score between 0 and 1
 */
export function compareFingerprints(fp1: string, fp2: string): number {
  if (fp1 === fp2) {
    return 1.0;
  }
  
  // Simple similarity check based on common prefixes
  const minLength = Math.min(fp1.length, fp2.length);
  let commonPrefix = 0;
  
  for (let i = 0; i < minLength; i++) {
    if (fp1[i] === fp2[i]) {
      commonPrefix++;
    } else {
      break;
    }
  }
  
  return commonPrefix / Math.max(fp1.length, fp2.length);
}

/**
 * Check if fingerprint is consistent over time
 */
export function isFingerprintConsistent(
  currentFp: string, 
  historicalFps: string[], 
  threshold: number = 0.8
): boolean {
  if (historicalFps.length === 0) {
    return true; // First time user
  }
  
  // Check if current fingerprint is similar to any historical ones
  for (const historicalFp of historicalFps) {
    const similarity = compareFingerprints(currentFp, historicalFp);
    if (similarity >= threshold) {
      return true;
    }
  }
  
  return false;
}

/**
 * Generate privacy-preserving session fingerprint
 * Changes more frequently than device fingerprint
 */
export function generateSessionFingerprint(): string {
  const components = [
    Date.now().toString(36),
    Math.random().toString(36).substring(2),
    navigator.userAgent.length.toString(),
    screen.width.toString()
  ];
  
  return simpleHash(components.join('|'));
} 