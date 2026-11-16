import { createClient } from "@supabase/supabase-js";

// This browser client uses the publishable key only.
// Never place a Supabase service-role or secret key in frontend code.
export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://rgyhdivtvjkbgantrdpe.supabase.co";

export const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_Iald7l70fuel-MeVRapgkw_JJT4_uGG";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
