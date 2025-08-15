
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bmbxyzproject.supabase.co'; // ваш актуальний проект
const supabaseAnonKey = 'YOUR_ANON_KEY_HERE'; // вставити актуальний ключ

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
