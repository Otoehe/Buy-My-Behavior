// 📄 src/lib/useBehaviors.ts
import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export function useBehaviors() {
  const [behaviors, setBehaviors] = useState<any[]>([])

  async function fetchBehaviors() {
    const { data, error } = await supabase
      .from('behaviors')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Не вдалося отримати Behaviors:', error.message)
      return
    }

    setBehaviors(data || [])
  }

  useEffect(() => {
    fetchBehaviors()
  }, [])

  return { behaviors, fetchBehaviors }
}
