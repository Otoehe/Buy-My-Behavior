// 📄 src/lib/saveBehavior.ts
import { supabase } from './supabase';

export type SaveBehaviorInput = {
  user_id: string;
  title: string;
  description: string;
  ipfs_cid?: string | null; // CID з Lighthouse
  file_url?: string | null; // публічний URL із Supabase Storage
};

export async function saveBehavior({
  user_id,
  title,
  description,
  ipfs_cid = null,
  file_url = null,
}: SaveBehaviorInput) {
  if (!ipfs_cid && !file_url) {
    throw new Error('Потрібен або ipfs_cid, або file_url.');
  }

  const row = {
    author_id: user_id,     // правильна назва поля
    title,
    description,
    ipfs_cid,               // string | null
    file_url,               // string | null
  };

  const { data, error } = await supabase.from('behaviors').insert(row).select().single();
  if (error) {
    console.error('❌ Помилка збереження behavior:', error);
    throw error;
  }
  return data;
}

export type UploadResult =
  | { storage: 'lighthouse'; url: string }
  | { storage: 'supabase';   url: string };

export function extractCidFromUrl(url: string): string | null {
  const m = url.match(/\/ipfs\/([^/?#]+)/i);
  return m ? m[1] : null;
}

export async function saveBehaviorFromUploadResult(
  user_id: string,
  title: string,
  description: string,
  upload: UploadResult
) {
  if (upload.storage === 'lighthouse') {
    const cid = extractCidFromUrl(upload.url);
    return saveBehavior({ user_id, title, description, ipfs_cid: cid, file_url: null });
  }
  return saveBehavior({ user_id, title, description, ipfs_cid: null, file_url: upload.url });
}

/** ✅ Сумісність зі старим ім'ям, щоб не міняти інші файли */
export async function saveBehaviorToSupabase({
  user_id,
  title,
  description,
  ipfs_cid,
}: { user_id: string; title: string; description: string; ipfs_cid: string }) {
  return saveBehavior({ user_id, title, description, ipfs_cid, file_url: null });
}
