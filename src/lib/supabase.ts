// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // критично для магік-лінка та повернення на /auth/callback
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // витягує сесію з URL і зберігає
    flowType: 'pkce',         // ок для OTP/OAuth, сумісно з /auth/callback
  },
});
