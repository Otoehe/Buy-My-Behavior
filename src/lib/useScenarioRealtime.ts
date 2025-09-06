// src/lib/useScenarioRealtime.ts (новий, additive)
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useScenarioRealtime(id: string, onChange: (row: any)=>void) {
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`scenario:${id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scenarios', filter: `id=eq.${id}` },
        (payload) => onChange(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, onChange]);
}
