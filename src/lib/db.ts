import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/env";
import { Database } from "@/types/database";

// Typed Supabase client 
export type Supabase = SupabaseClient<Database>;

let supabase: Supabase | null = null;

// single server side client instance
export function getSupabaseAdmin(): Supabase {
  if (supabase) return supabase;

  supabase = createClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  return supabase;
}
