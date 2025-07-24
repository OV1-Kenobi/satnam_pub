// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("../src/lib/supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

// NIP-05 verification utilities
export interface Nip05VerificationResult {
  verified: boolean;
  identifier: string;
  pubkey: string;
  nip05?: string;
  error?: string;
}

export async function verifyNip05(
  identifier: string,
  pubkey: string
): Promise<boolean> {
  try {
    // Simple verification - in production, this would query the actual NIP-05 endpoint
    const [username, domain] = identifier.split("@");
    if (!username || !domain) {
      return false;
    }

    // For now, just check if the identifier matches the expected format
    return identifier.includes("@") && pubkey.length > 0;
  } catch (error) {
    console.error("NIP-05 verification failed:", error);
    return false;
  }
}
