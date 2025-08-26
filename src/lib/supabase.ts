import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,      // зберігати сесію в localStorage
    autoRefreshToken: true,    // автооновлення токенів у фоні
    detectSessionInUrl: true,  // щоб колбек з magic-link зчитувався
    storage: window.localStorage,
  },
});
