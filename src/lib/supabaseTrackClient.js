import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// Separate client with its own localStorage slot so verifying OTP here
// never overwrites the main app's logged-in session.
export const supabaseTrack = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { storageKey: "eltop-track-auth" },
    })
  : null;
