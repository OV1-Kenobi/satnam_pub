/**
 * Supabase client for Netlify Functions
 * MASTER CONTEXT COMPLIANCE: Re-exports singleton client to prevent multiple GoTrueClient instances
 *
 * This file re-exports the singleton Supabase client from src/lib/supabase.ts
 * to ensure only ONE GoTrueClient instance exists across the entire application.
 */

// Re-export the singleton client to prevent multiple GoTrueClient instances
// Using .ts extension explicitly for Netlify's build system
export { supabase } from "../../src/lib/supabase.ts";

// Export for compatibility with existing code
export { supabase as default } from "../../src/lib/supabase.ts";

