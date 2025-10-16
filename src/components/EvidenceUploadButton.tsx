// src/components/EvidenceUploadButton.tsx
import React, { useRef, useState } from 'react';
import { uploadEvidence } from '../lib/lighthouseUpload';
import { supabase } from '../lib/supabase';

type Props = {
  scenarioId: string;
  // якщо треба — що робити з URL після аплоаду
  onUploaded?: (url: string) => void;
};

export default function EvidenceUploadButton({ scenarioId, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false); // захист від повторного відкриття діалогу

  const openDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy || opening) return;
    setOpening(true);
    fileRef.current?.click();
  };

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = e.target.files;
      if (!files || !files.length) return; // користувач міг скасувати
      setBusy(true);

      const res = await uploadEvidence({ scenarioId, files });
      // збереження у вашу БД (приклад: поле evidence_url у disputes)
      await supabase
        .from('disputes')
        .update({ evidence_url: res.url })
        .eq('scenario_id', scenarioId)
        .eq('status', 'open');

      onUploaded?.(res.url);
      alert(`✅ Завантажено (${res.storage}): ${res.url}`);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Помилка завантаження');
    } finally {
      setBusy(false);
      setOpening(false);
      if (fileRef.current) fileRef.current.value = ''; // дозволяє вибрати той самий файл ще раз
    }
  };

  return (
    <>
      <button type="button" className="btn" onClick={openDialog} disabled={busy}>
        {busy ? '…' : '📼 ЗАВАНТАЖИТИ ВІДЕОДОКАЗ'}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        hidden
        onClick={(e) => {
          // хак, щоб щоразу можна було вибрати той самий файл
          (e.currentTarget as HTMLInputElement).value = '';
        }}
        onChange={onChange}
      />
    </>
  );
}
