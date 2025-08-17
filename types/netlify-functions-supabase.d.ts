declare module "../netlify/functions/supabase.js" {
  import type { SupabaseClient } from "@supabase/supabase-js";
  export const supabase: SupabaseClient;
  export const isServiceRoleKey: () => boolean;
  export const supabaseKeyType: "service" | "anon" | "unknown";
}

declare module "../netlify/functions/supabase" {
  import type { SupabaseClient } from "@supabase/supabase-js";
  export const supabase: SupabaseClient;
  export const isServiceRoleKey: () => boolean;
  export const supabaseKeyType: "service" | "anon" | "unknown";
}
