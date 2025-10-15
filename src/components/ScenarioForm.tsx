/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type Draft = {
  description: string;
  amount: number | null;
  date: string;
  time: string;
};

function readNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function ScenarioForm() {
  const navigate = useNavigate();
  const { search, state } = useLocation();

  const sp = useMemo(() => new URLSearchParams(search), [search]);

  // executor_id беремо з query/state/localStorage
  const executorId: string =
    sp.get('executor_id') ||
    (state as any)?.executor_id ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('scenario_receiverId') || '' : '');

  // координати — з localStorage (MapView їх кладе при підтвердженні)
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // стейти форми (мінімальні — підстав свої реальні, якщо інакше називаються)
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | null>(1);
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');

  // 1) Відновити координати та чернетку при монтуванні
  useEffect(() => {
    try {
      const a = readNumber(localStorage.getItem('latitude'));
      const b = readNumber(localStorage.getItem('longitude'));
      setLat(a);
      setLng(b);
    } catch {}

    try {
      const raw = sessionStorage.getItem('scenario_form_draft');
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        if (typeof d.description === 'string') setDescription(d.description);
        if (d.amount == null || Number.isFinite(d.amount)) setAmount(d.amount ?? null);
        if (typeof d.date === 'string') setDate(d.date);
        if (typeof d.time === 'string') setTime(d.time);
      }
    } catch {}
  }, []);

  // 2) Зберігати чернетку при змінах (щоб не загубити при поході на карту)
  useEffect(() => {
    try {
      const draft: Draft = { description, amount, date, time };
      sessionStorage.setItem('scenario_form_draft', JSON.stringify(draft));
    } catch {}
  }, [description, amount, date, time]);

  // Перехід на мапу вибору місця
  const goPickPlace = (e?: React.MouseEvent) => {
    e?.preventDefault?.();
    const qs = executorId ? `?executor_id=${encodeURIComponent(executorId)}` : '';
    navigate(`/map/select${qs}`, { state: { from: '/scenario/new' } });
  };

  // Назад
  const goBack = () => {
    if ((state as any)?.from === '/map/select') {
      navigate(-1);
      return;
    }
    const qs = executorId ? `?executor_id=${encodeURIComponent(executorId)}` : '';
    navigate(`/map${qs}`);
  };

  // Сабміт (постав свою логіку збереження/створення)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!executorId) {
      alert('Не обрано виконавця.');
      return;
    }
    if (!amount || amount <= 0) {
      alert('Сума має бути > 0');
      return;
    }
    if (!lat || !lng) {
      alert('Оберіть місце виконання на карті.');
      return;
    }

    // TODO: тут встав свою логіку створення сценарію (supabase/бекенд)
    // Приклад-заглушка:
    console.log('[ScenarioForm] create', {
      executorId, description, amount, date, time, latitude: lat, longitude: lng,
    });

    // Очистити чернетку
    try { sessionStorage.removeItem('scenario_form_draft'); } catch {}

    // Перейти у "Мої замовлення"
    navigate('/my-orders', { replace: true });
  };

  const dateToday = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          onClick={goBack}
          style={{
            padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb',
            background: '#fff', cursor: 'pointer', fontWeight: 600,
          }}
        >
          ← Назад
        </button>
        <h1 style={{ margin: 0, fontSize: 24 }}>Новий сценарій</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Опис */}
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Опис</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Опишіть сценарій…"
          style={{
            width: '100%', resize: 'vertical', borderRadius: 12, padding: 12,
            border: '1px solid #e5e7eb', marginBottom: 14, background: '#fff5f7',
          }}
        />

        {/* Сума */}
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Сума (USDT)</label>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={amount ?? ''}
          onChange={(e) => setAmount(readNumber(e.target.value))}
          placeholder="1"
          style={{
            width: '100%', borderRadius: 12, padding: '10px 12px',
            border: '1px solid #e5e7eb', marginBottom: 14,
          }}
        />

        {/* Дата */}
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Дата</label>
        <input
          type="date"
          value={date || dateToday}
          min={dateToday}
          onChange={(e) => setDate(e.target.value)}
          style={{
            width: '100%', borderRadius: 12, padding: '10px 12px',
            border: '1px solid #e5e7eb', marginBottom: 14,
          }}
        />

        {/* Час */}
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Час</label>
        <input
          type="time"
          value={time || '16:00'}
          onChange={(e) => setTime(e.target.value)}
          style={{
            width: '100%', borderRadius: 12, padding: '10px 12px',
            border: '1px solid #e5e7eb', marginBottom: 14,
          }}
        />

        {/* Місце виконання */}
        <div style={{ margin: '18px 0' }}>
          <button
            type="button"
            onClick={goPickPlace}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 999,
              border: '1px solid #f8c6cf', background: '#ffd7e0',
              fontWeight: 800, cursor: 'pointer',
            }}
          >
            📍 Обери місце виконання
          </button>

          {lat != null && lng != null && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#475569' }}>
              Обрано: <b>{lat.toFixed(6)}, {lng.toFixed(6)}</b>
            </div>
          )}
        </div>

        {/* Сабміт */}
        <button
          type="submit"
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 999,
            border: '1px solid #c7f2c7', background: '#e7ffe7',
            fontWeight: 800, cursor: 'pointer',
          }}
        >
          ✅ Надіслати сценарій
        </button>
      </form>
    </div>
  );
}
