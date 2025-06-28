// This file blocks any Solana-related imports in our Bitcoin-only project
declare module "@solana/wallet-standard-features" {
  // Empty module - prevents any Solana wallet functionality
}

// Block any other potential Solana modules
declare module "@solana/*" {
  // Empty - prevents any Solana imports
}

// If any Solana types leak through, they should be never types
declare namespace Solana {
  export type Never = never;
}
