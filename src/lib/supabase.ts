import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || (window as any).__ENV__?.NEXT_PUBLIC_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || (window as any).__ENV__?.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default supabase;
