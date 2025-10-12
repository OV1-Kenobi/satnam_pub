import type { SupabaseClient } from "@supabase/supabase-js";

export const supabase: SupabaseClient;
export const supabaseAdmin: SupabaseClient | null;
export function getRequestClient(accessToken?: string): SupabaseClient;
export const isServiceRoleKey: () => boolean;
export const supabaseKeyType: "anon" | "missing";
