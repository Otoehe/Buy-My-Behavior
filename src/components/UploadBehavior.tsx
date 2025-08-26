// src/components/UploadBehavior.tsx
import React, { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadVideoToLighthouse } from '../lib/lighthouseUpload';
// опціонально: якщо хочеш вміти прив’язувати саме до спору
import { uploadEvidenceAndAttach as attachToDispute } from '../lib/disputeApi';

type Props = {
  onClose?: () => void;
  // опціональні контексти
  disputeId?: string;   // якщо переданий — завантаження піде як доказ спору
  scenarioId?: string;  // не обов’язковий (для звичайного behavior не потрібен)
};

export default function UploadBehavior({ onClose, disputeId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = () => inputRef.current?.click();

  const currentUserId = async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) throw new Error('Потрібно увійти.');
    return uid;
  };

  const uploadViaLighthouseWithFallback = async (file: File, namespace: string) => {
    // 1) Lighthouse (нова/стара сигнатура)
    try {
      // @ts-ignore – підтримуємо синтаксис { scenarioId, files }
      const up = await uploadVideoToLighthouse({ scenarioId: namespace, files: [file] });
      const url = typeof up === 'string' ? up : up?.url;
      if (url) return url as string;
    } catch {
      // ignore – спробуємо стару функцію
    }
    try {
      // @ts-ignore – стара сигнатура (file) => string | { url }
      const alt = await uploadVideoToLighthouse(file);
      if (typeof alt === 'string' && alt) return alt;
      if (typeof alt === 'object' && alt?.url) return alt.url as string;
    } catch {
      // ignore – спробуємо Supabase Storage
    }

    // 2) Supabase Storage як fallback
    const ext = file.name.split('.').pop() || 'mp4';
    const path = `general/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('dispute_evidence')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from('dispute_evidence').getPublicUrl(path);
    return pub.publicUrl;
  };

  const insertPlainBehavior = async (userId: string, url: string) => {
    const { error: insErr } = await supabase.from('behaviors').insert([
      {
        author_id: userId,
        title: 'Video evidence',
        description: 'Завантажено з StoryBar',
        ipfs_cid: null,
        file_url: url,
        is_dispute_evidence: false,
        dispute_id: null,
      },
    ]);
    if (insErr) throw insErr;
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const uid = await currentUserId();

      // Завантаження → отримуємо публічний URL (Lighthouse/Storage)
      const url = await uploadViaLighthouseWithFallback(file, disputeId || 'general');

      if (disputeId) {
        // Прив’язка як відеодоказ спору
        await attachToDispute(disputeId, file, uid);
      } else {
        // Звичайний behavior без сценарію/спору
        await insertPlainBehavior(uid, url);
      }

      // нотифікація стрічці + закрити модалку
      window.dispatchEvent(new CustomEvent('behaviorUploaded'));
      onClose?.();
    } catch (err: any) {
      setError(err?.message || 'Помилка завантаження');
      console.error('UploadBehavior error:', err);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

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
      onClick={onClose}
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
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22 }}>
            ×
          </button>
        </div>

        <p style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
          📦 <b>Увага:</b> розмір Behavior не повинен перевищувати <b>30MB</b>
        </p>

        {error && (
          <div style={{ marginTop: 8, color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={onFile}
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
