// src/lib/lighthouseUpload.ts
import lighthouse from '@lighthouse-web3/sdk';
import { supabase } from './supabase';

const LH_API_KEY = import.meta.env.VITE_LIGHTHOUSE_API_KEY as string;
const BUCKET = 'dispute_evidence';

export type UploadResult =
  | { storage: 'lighthouse'; url: string; cid: string }
  | { storage: 'supabase'; url: string; key: string };

function safeName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * ВАЖЛИВО: ця функція НІКОЛИ не відкриває файл-діалог.
 * Вона працює ТІЛЬКИ з уже вибраними файлами (FileList | File[]),
 * які ти передаєш із onChange прихованого <input type="file">.
 */
export async function uploadEvidence(opts: {
  scenarioId: string;
  files: FileList | File[];
}): Promise<UploadResult> {
  const arr = Array.from(opts.files);
  if (!arr.length) throw new Error('Файл не обрано');
  const file = arr[0];

  // 1) Lighthouse
  try {
    if (!LH_API_KEY) throw new Error('VITE_LIGHTHOUSE_API_KEY не заданий');
    const res = await lighthouse.upload(file, LH_API_KEY);
    const cid = (res as any)?.data?.Hash as string | undefined;
    if (!cid) throw new Error('Lighthouse не повернув CID');
    const url = `https://gateway.lighthouse.storage/ipfs/${cid}`;
    return { storage: 'lighthouse', url, cid };
  } catch (e) {
    console.warn('[LH upload fail] → fallback to Supabase:', e);
  }

  // 2) Fallback у Supabase Storage
  const key = `${opts.scenarioId}/${Date.now()}-${safeName(file.name)}`;
  const up = await supabase.storage.from(BUCKET).upload(key, file, {
    upsert: true,
    contentType: file.type || 'video/mp4',
    cacheControl: '3600',
  });
  if (up.error) throw up.error;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return { storage: 'supabase', url: pub.publicUrl, key };
}

// зворотна сумісність зі старими імпортами
export const uploadVideoToLighthouse = uploadEvidence;
