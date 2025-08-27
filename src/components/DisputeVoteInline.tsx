// src/components/DisputeVoteInline.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  getDispute,
  getMyVote,
  getVoteCounts,
  voteOnDispute,
  subscribeToDispute,
  type VoteChoice,
} from '../lib/disputeApi';

type Props = { disputeId: string };

function formatTimeLeft(ms: number) {
  if (ms <= 0) return 'завершено';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} дн ${h} год`;
  if (h > 0) return `${h} год ${m} хв`;
  return `${m} хв`;
}

export default function DisputeVoteInline({ disputeId }: Props) {
  const [status, setStatus] = useState<'open'|'closed'|string>('open');
  const [createdAt, setCreatedAt] = useState<string|undefined>(undefined);
  const [winner, setWinner] = useState<VoteChoice | null>(null);
  const [counts, setCounts] = useState<{executor:number; customer:number; total:number}>({executor:0, customer:0, total:0});
  const [myVote, setMyVote] = useState<VoteChoice | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const LIMIT = 101;

  const load = async () => {
    const d = await getDispute(disputeId);
    if (d) {
      setStatus(d.status);
      setCreatedAt(d.created_at || undefined);
      setWinner((d.winner as any) ?? null);
    }
    const c = await getVoteCounts(disputeId);
    setCounts(c);
    const mv = await getMyVote(disputeId);
    setMyVote(mv);
  };

  useEffect(() => { load(); }, [disputeId]);
  useEffect(() => {
    const unsub = subscribeToDispute(disputeId, () => load());
    return () => { try { unsub(); } catch {} };
  }, [disputeId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const endsAtMs = useMemo(() => {
    const start = createdAt ? new Date(createdAt).getTime() : Date.now();
    return start + 7*24*60*60*1000;
  }, [createdAt]);

  const timeLeftMs = Math.max(0, endsAtMs - now);
  const isTimeOver = timeLeftMs <= 0;
  const isVotesOver = counts.total >= LIMIT;
  const isClosed = status === 'closed' || isTimeOver || isVotesOver;

  const total = Math.max(1, counts.total);
  const exPct = Math.round((counts.executor / total) * 100);
  const cuPct = 100 - exPct;

  const onVote = async (choice: VoteChoice) => {
    if (isClosed) return;
    try {
      await voteOnDispute(disputeId, choice);
      const [c] = await Promise.all([getVoteCounts(disputeId), getMyVote(disputeId)]);
      setCounts(c);
      setMyVote(choice);
    } catch (e:any) {
      alert(e?.message || 'Не вдалося проголосувати');
    }
  };

  return (
    <div className="bh-vote">
      <div className="bh-vote__top">
        <div className="bh-vote__title">🧑‍⚖️ Спір: голосування</div>
        <div className="bh-vote__meta">
          {isClosed
            ? (winner
                ? <>Завершено · Переможець: <b>{winner === 'executor' ? 'виконавець' : 'замовник'}</b></>
                : <>Завершено</>)
            : <>Залишилось: <b>{formatTimeLeft(timeLeftMs)}</b> · Голосів: <b>{counts.total}/{LIMIT}</b></>
          }
        </div>
      </div>

      <div className="bh-vote__bar" aria-hidden>
        <div className="bh-vote__bar-left"  style={{ width: `${exPct}%` }} title={`Виконавець ${exPct}%`} />
        <div className="bh-vote__bar-right" style={{ width: `${cuPct}%` }} title={`Замовник ${cuPct}%`} />
      </div>

      <div className="bh-vote__btns">
        <button
          type="button"
          onClick={() => onVote('executor')}
          disabled={isClosed}
          className={`bh-vote__btn ${myVote === 'executor' ? 'is-active' : ''}`}
        >👍 За виконавця ({counts.executor})</button>

        <button
          type="button"
          onClick={() => onVote('customer')}
          disabled={isClosed}
          className={`bh-vote__btn ${myVote === 'customer' ? 'is-active' : ''}`}
        >🛑 За замовника ({counts.customer})</button>
      </div>
    </div>
  );
}
