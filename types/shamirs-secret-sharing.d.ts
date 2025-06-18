// Type declarations for shamirs-secret-sharing
declare module "shamirs-secret-sharing" {
  interface SplitOptions {
    secret: Buffer;
    shares: number;
    threshold: number;
    random?: () => number;
  }

  interface CombineOptions {
    shares: Buffer[];
  }

  export function split(options: SplitOptions): Buffer[];
  export function combine(options: CombineOptions): Buffer;
}
