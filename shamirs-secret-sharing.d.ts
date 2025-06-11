/**
 * Type declarations for shamirs-secret-sharing module
 * Based on the shamirs-secret-sharing module which implements Shamir's Secret Sharing algorithm
 * https://github.com/3box/shamirs-secret-sharing
 */

declare module 'shamirs-secret-sharing' {
  interface SplitOptions {
    /**
     * The number of shares to generate
     */
    shares: number;
    
    /**
     * The minimum number of shares required to reconstruct the secret
     */
    threshold: number;
    
    /**
     * The secret to split (Buffer or Uint8Array)
     */
    secret: Buffer | Uint8Array;
    
    /**
     * Optional padding for the secret
     */
    padLength?: number;
    
    /**
     * Optional random number generator function
     */
    random?: (size: number) => Buffer | Uint8Array;
  }

  interface Share {
    /**
     * The share index
     */
    id: number;
    
    /**
     * The share data
     */
    data: Buffer;
    
    /**
     * Convert the share to a hex string
     */
    toString(encoding: string): string;
  }

  interface CombineOptions {
    /**
     * The shares to combine (must meet or exceed the threshold)
     */
    shares: Array<Buffer | Uint8Array>;
    
    /**
     * Optional padding length
     */
    padLength?: number;
  }

  /**
   * Split a secret into multiple shares using Shamir's Secret Sharing
   * @param options - The options for splitting the secret
   * @returns An array of shares
   */
  export function split(options: SplitOptions): Share[];

  /**
   * Combine shares to reconstruct the original secret
   * @param options - The options for combining shares
   * @returns The reconstructed secret as a Buffer
   */
  export function combine(options: CombineOptions): Buffer;
}