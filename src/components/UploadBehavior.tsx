// src/components/UploadBehavior.tsx
import React, { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadVideoToLighthouse } from '../lib/lighthouseUpload';
// опціонально: якщо хочеш прив’язувати саме до спору (не блокує потік, обгорнуто в try/catch)
import { uploadEvidenceAndAttach as attachToDispute } from '../lib/disputeApi';

type Props = {
  onClose?: () => void;
  /** Якщо переданий — завантаження піде як доказ спору (позначимо в behaviors) */
  disputeId?: string;
  /** Необов’язковий простір імен для Lighthouse; на UX не впливає */
  scenarioId?: string;
};

const MAX_MB = 30;
const ACCEPT_MIME = ['video/mp4', 'video/webm'] as const;

type LighthouseResult = { url?: string; cid?: string } | string | null | undefined;

export default function UploadBehavior({ onClose, disputeId, scenarioId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = () => inputRef.current?.click();

  const getCurrentUserId = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) throw new Error('Потрібно увійти в акаунт.');
    return data.user.id as string;
  };

  /** Пробуємо обидві можливі сигнатури вашої функції uploadVideoToLighthouse */
  const tryLighthouse = async (file: File, ns: string): Promise<{ url?: string; cid?: string } | null> => {
    try {
      // Нова/розширена сигнатура: uploadVideoToLighthouse({ scenarioId, files: [file] })
      // @ts-ignore – тримаємо сумісність із різними версіями
      const res1: LighthouseResult = await uploadVideoToLighthouse({ scenarioId: ns, files: [file] });
      if (typeof res1 === 'string') return { url: res1 };
      if (res1 && typeof res1 === 'object' && (res1.url || res1.cid)) return { url: res1.url, cid: res1.cid };
    } catch {
      /* ignore – спробуємо стару сигнатуру нижче */
    }
    try {
      // Стара сигнатура: uploadVideoToLighthouse(file) -> string | { url, cid? }
      // @ts-ignore – сумісність
      const res2: LighthouseResult = await uploadVideoToLighthouse(file);
      if (typeof res2 === 'string') return { url: res2 };
      if (res2 && typeof res2 === 'object' && (res2.url || res2.cid)) return { url: res2.url, cid: res2.cid };
    } catch {
      /* ignore – повернемо null і підемо у fallback */
    }
    return null;
  };

  /** Fallback у Supabase Storage (bucket behaviors) */
  const uploadToStorage = async (uid: string, file: File): Promise<string> => {
    const safeName = file.name.replace(/\s+/g, '_');
    const path = `videos/${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
    const { error: upErr } = await supabase.storage
      .from('behaviors')
      .upload(path, file, { upsert: false, contentType: file.type || 'video/mp4', cacheControl: '3600' });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from('behaviors').getPublicUrl(path);
    if (!pub?.publicUrl) throw new Error('Не вдалося сформувати публічний URL.');
    return pub.publicUrl;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Валідації (тип + розмір)
    if (!ACCEPT_MIME.includes(file.type as any)) {
      setError('Потрібно відео MP4 або WebM.'); e.target.value = ''; return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Розмір відео перевищує ${MAX_MB}MB.`); e.target.value = ''; return;
    }

    setError(null);
    setBusy(true);
    try {
      const uid = await getCurrentUserId();

      // 1) Lighthouse (за наявності/можливості), інакше fallback у Storage
      const ns = scenarioId || disputeId || 'general';
      const light = await tryLighthouse(file, ns);

      let fileUrl: string | undefined = light?.url;
      const ipfsCid: string | null = light?.cid ?? null;

      if (!fileUrl) {
        fileUrl = await uploadToStorage(uid, file);
      }

      // 2) Створюємо запис у behaviors (єдиний джерело правди для StoryBar/фіду)
      const payload = {
        user_id: uid,                                 // 👈 канонічна колонка
        title: disputeId ? 'Video evidence' : null,
        description: disputeId ? 'Доказ для спору' : null,
        ipfs_cid: ipfsCid,                            // буде null, якщо не з Lighthouse
        file_url: fileUrl,                            // обов’язково
        is_dispute_evidence: !!disputeId,
        dispute_id: disputeId ?? null,
      };

      const { error: insErr } = await supabase.from('behaviors').insert([payload]);
      if (insErr) throw insErr;

      // 3) Додатково: стороння прив’язка до спору (не блокує користувача)
      if (disputeId) {
        try { await attachToDispute(disputeId, file, uid); } catch { /* ignore */ }
      }

      // 4) Нотифікуємо локальні слухачі (додатково до Supabase Realtime)
      window.dispatchEvent(new CustomEvent('behaviorUploaded'));

      // Закриваємо модалку
      onClose?.();
    } catch (err: any) {
      console.error('UploadBehavior error:', err);
      setError(err?.message || 'Помилка завантаження.');
    } finally {
      setBusy(false);
      e.target.value = ''; // скинути input, щоб можна було вибрати той самий файл знову
    }
  };

  const handleBackdropClick = () => { if (!busy) onClose?.(); };

  return (
    <div
      className="upload-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 30000,
      }}
      onClick={handleBackdropClick}
    >
      <div
        className="upload-modal"
        onClick={(ev) => ev.stopPropagation()}
        style={{
          width: 420,
          maxWidth: '95vw',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 10px 30px rgba(0,0,0,.15)',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Завантажити відео</h3>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: busy ? 'not-allowed' : 'pointer' }}
            aria-label="Закрити"
          >
            ×
          </button>
        </div>

        <p style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
          MP4 / WebM, максимум&nbsp;<b>{MAX_MB}MB</b>.
        </p>

        {error && (
          <div style={{ marginTop: 8, color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm"
          style={{ display: 'none' }}
          onChange={handleFile}
          disabled={busy}
        />

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button
            onClick={pickFile}
            disabled={busy}
            className="btn"
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 999,
              border: 'none',
              background: '#ffcdd6',
              color: '#000',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Завантаження…' : '📥 Обрати відео'}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="btn"
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              border: 'none',
              background: '#eee',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Відмінити
          </button>
        </div>
      </div>
    </div>
  );
}
