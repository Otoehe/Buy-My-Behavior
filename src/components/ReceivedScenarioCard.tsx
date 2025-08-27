// src/components/ReceivedScenarioCard.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ScenarioDisputeBlock from './ScenarioDisputeBlock'; // ⬅️ ДОДАНО

interface ReceivedScenarioCardProps { scenarioId: string; }
interface Scenario {
  id: string;
  title?: string;
  description: string;
  donation_amount_usdt: number | null;
  address?: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
}

export default function ReceivedScenarioCard({ scenarioId }: ReceivedScenarioCardProps) {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('scenarios')            // ✅ правильна таблиця
        .select('*')
        .eq('id', scenarioId)
        .single();
      if (!error) setScenario(data as any);
      setLoading(false);
    })();
  }, [scenarioId]);

  const agreeToScenario = async () => {
    const { error } = await supabase
      .from('scenarios')
      .update({ status: 'agreed' })
      .eq('id', scenarioId);
    if (!error) setScenario((prev) => prev ? { ...prev, status: 'agreed' } : null);
  };

  if (loading) return <div className="text-center">Завантаження…</div>;
  if (!scenario) return <div className="text-red-500">Сценарій не знайдено.</div>;

  return (
    <div className="bg-white p-5 rounded-2xl shadow-xl space-y-3 border border-gray-200">
      <h2 className="text-xl font-bold text-gray-800">{scenario.title || 'Сценарій'}</h2>
      <p className="text-gray-700">{scenario.description}</p>
      <p><strong>💰 Сума:</strong> {scenario.donation_amount_usdt ?? '—'} USDT</p>
      {scenario.address && <p><strong>📍 Адреса:</strong> {scenario.address}</p>}
      <p><strong>🕓 Дата:</strong> {scenario.date || '—'} о {scenario.time || '—'}</p>
      <p><strong>📌 Статус:</strong> {scenario.status || '—'}</p>

      {scenario.status === 'created' && (
        <button
          onClick={agreeToScenario}
          className="bg-black hover:bg-gray-800 text-white px-5 py-2 rounded-full transition"
        >
          ✅ ПОГОДИТИ ЗАМОВЛЕННЯ
        </button>
      )}

      {/* ⬇️ Блок спору/голосування/завантаження відеодоказів */}
      <ScenarioDisputeBlock scenarioId={scenarioId} />
    </div>
  );
}
