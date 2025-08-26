// • src/pages/api/update-status.ts — серверна API-функція для оновлення статусу в Supabase

import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // ОБОВ’ЯЗКОВО: service role key
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id } = req.query;
  const { status } = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid scenario ID' });
  }

  try {
    const { data, error } = await supabase
      .from('scenarios')
      .update({ status })
      .eq('id', id);

    if (error) {
      console.error('[update-status] Supabase update error:', error);
      return res.status(500).json({ error: 'Failed to update status' });
    }

    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error('[update-status] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
