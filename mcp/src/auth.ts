import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://rpywqbtporjdhwtmvwkf.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJweXdxYnRwb3JqZGh3dG12d2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4NjA4MDIsImV4cCI6MjA4MzQzNjgwMn0.1nn9F2y1JZBoSgB33CnP-k-6OM5HcEMdUs50RLJ89i4";

let supabase: SupabaseClient | null = null;

export function getSupabaseUrl(): string {
  return process.env.WELLGROW_SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
}

export function getSupabaseAnonKey(): string {
  return process.env.WELLGROW_SUPABASE_ANON_KEY ?? DEFAULT_SUPABASE_ANON_KEY;
}

export async function getSupabase(): Promise<SupabaseClient> {
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) return supabase;
  }

  supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.WELLGROW_EMAIL!,
    password: process.env.WELLGROW_PASSWORD!,
  });

  if (error) {
    throw new Error(`Authentication failed: ${error.message}`);
  }

  return supabase;
}

export async function getUserId(): Promise<string> {
  const sb = await getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}
