import "server-only";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const serverSupabaseConfigError = !url || !serviceRoleKey
  ? "Server Supabase configuration is missing. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local."
  : null;

export const serverSupabase = serverSupabaseConfigError
  ? null
  : createClient(url!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } });
