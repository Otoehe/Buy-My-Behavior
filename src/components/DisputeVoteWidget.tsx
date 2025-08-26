// src/components/DisputeVoteWidget.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { voteOnDispute } from '../lib/disputeApi';

// Локальні спрощені типи, щоб не залежати від зовнішніх визначень
type VoteChoice = 'executor' | 'customer';
type DisputeRow = {
  status: 'open' | 'closed' | 'resolved' | 'cancelled' | string;
  winner?: VoteChoice | null;
  deadline_at?: string | null;
  created_at?: string | null;
};

// форматування таймера
function left(deadlineISO?: string | null) {
  if (!deadlineISO) return '—';
  const d = new Date(deadlineISO).getTime() - Date.now();
  const s = Math.max(0, Math.floor(d / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export default function DisputeVoteWidget({ disputeId }: { disputeId: string }) {
  const [uid, setUid] = useState('');
  const [status, setStatus] = useState<DisputeRow['status']>('open');
  const [winner, setWinner] = useState<VoteChoice | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [mine, setMine] = useState<VoteChoice | null>(null);
  const [exec, setExec] = useState(0);
  const [cust, setCust] = useState(0);
  const total = exec + cust;

  const load = useCallback(async () => {
    // поточний користувач
    const { data: u } = await supabase.auth.getUser();
    const me = u?.user?.id || '';
    setUid(me);

    // сам спір
    const { data: d } = await supabase
      .from('disputes')
      .select('status,winner,deadline_at,created_at')
      .eq('id', disputeId)
      .maybeSingle();

    if (d) {
      const row = d as DisputeRow;
      setStatus(row.status);
      setWinner(row.winner ?? null);
      setDeadline(row.deadline_at ?? null); // якщо немає — показуємо "—"
    }

    // усі голоси
    const { data: votes } = await supabase
      .from('dispute_votes')
      .select('user_id, choice')
      .eq('dispute_id', disputeId);

    let e = 0,
      c = 0;
    (votes || []).forEach((v: any) => (v.choice === 'executor' ? e++ : v.choice === 'customer' ? c++ : null));
    setExec(e);
    setCust(c);

    // мій голос
    if (me) {
      const { data: mineVote } = await supabase
        .from('dispute_votes')
        .select('choice')
        .eq('dispute_id', disputeId)
        .eq('user_id', me)
        .maybeSingle();
      setMine((mineVote as any)?.choice ?? null);
    } else {
      setMine(null);
    }
  }, [disputeId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`rt:dv:${disputeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes', filter: `id=eq.${disputeId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispute_votes', filter: `dispute_id=eq.${disputeId}` }, load)
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [disputeId, load]);

  const canVote =
    status === 'open' &&
    total < 101 &&
    (!deadline || new Date(deadline).getTime() > Date.now()); // якщо дедлайну нема — голосувати можна

  const vote = async (choice: VoteChoice) => {
    if (!uid || !canVote) return;
    try {
      // НОВИЙ API: передаємо лише disputeId + choice, user зчитується в API
      await voteOnDispute(disputeId, choice);
      setMine(choice);
    } catch (e: any) {
      alert(e?.message || 'Не вдалося проголосувати');
    }
  };

  // тік для таймера
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const leftStr = useMemo(() => left(deadline), [deadline]);

  return (
    <div className="bmb-dispute-vote">
      <div className="row">
        <span className="badge" title="Відеодоказ спору" />
        <strong>Голосування по спору</strong>
        <span className="ml-auto">⏳ {leftStr}</span>
        <span>🧮 {total}/101</span>
      </div>

      <div className="actions">
        <button className="btn" disabled={!canVote || mine === 'executor'} onClick={() => vote('executor')}>
          ✅ За виконавця ({exec})
        </button>
        <button className="btn" disabled={!canVote || mine === 'customer'} onClick={() => vote('customer')}>
          ↩️ За замовника ({cust})
        </button>
      </div>

      {status !== 'open' && (
        <div className="result">Рішення: {winner === 'executor' ? '✅ Виконавець' : winner === 'customer' ? '↩️ Замовник' : 'Нічия'}</div>
      )}

      <style>{`
        .bmb-dispute-vote{background:#fff;border:1px solid #eee;border-radius:16px;padding:12px;margin-top:8px}
        .row{display:flex;align-items:center;gap:8px}
        .badge{width:10px;height:10px;border-radius:50%;background:gold;box-shadow:0 0 0 2px #333 inset}
        .ml-auto{margin-left:auto}
        .actions{display:flex;gap:8px;margin-top:8px}
        .btn{border:none;border-radius:999px;padding:8px 14px;background:#ffcdd6;cursor:pointer}
        .btn:disabled{opacity:.5;cursor:not-allowed}
        .result{margin-top:8px;font-weight:600}
      `}</style>
    </div>
  );
}
