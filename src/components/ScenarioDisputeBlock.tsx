import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  initiateDispute,
  getLatestDisputeByScenario,
  subscribeToDispute,
  voteOnDispute,
  getVoteCounts,
  getMyVote,
  uploadEvidenceAndAttach,
  type DisputeRow,
  type VoteChoice,
} from '../lib/disputeApi';

type Props = { scenarioId: string };

export default function ScenarioDisputeBlock({ scenarioId }: Props) {
  const [dispute, setDispute] = useState<DisputeRow | null>(null);
  const [counts, setCounts] = useState({ executor: 0, customer: 0, total: 0 });
  const [myVote, setMyVote] = useState<VoteChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // INIT
  useEffect(() => {
    let unsub: null | (() => void) = null;
    (async () => {
      const d = await getLatestDisputeByScenario(scenarioId);
      if (d) {
        setDispute(d);
        await refresh(d.id);
        unsub = subscribeToDispute(d.id, () => refresh(d.id));
      }
    })();
    return () => { if (unsub) unsub(); };
  }, [scenarioId]);

  const refresh = async (disputeId: string) => {
    const [c, v] = await Promise.all([
      getVoteCounts(disputeId),
      getMyVote(disputeId).catch(() => null),
    ]);
    setCounts(c);
    setMyVote(v);
  };

  const startDispute = async () => {
    setBusy(true);
    try {
      const d = await initiateDispute({ scenarioId });
      setDispute(d);
      await refresh(d.id);
    } finally {
      setBusy(false);
    }
  };

  const vote = async (choice: VoteChoice) => {
    if (!dispute) return;
    setBusy(true);
    try {
      await voteOnDispute(dispute.id, choice);
      await refresh(dispute.id);
    } finally {
      setBusy(false);
    }
  };

  const onPickEvidence = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!dispute) return;
    const f = e.target.files?.[0];
    if (!f) return;
    setUpBusy(true);
    try {
      // шім: (file, scenarioId) — прив’яже й створить evidence-behavior
      await uploadEvidenceAndAttach(f, scenarioId);
      await refresh(dispute.id);
      alert('✅ Доказ завантажено');
    } catch (err: any) {
      alert('❌ Помилка завантаження: ' + (err?.message || 'невідома'));
    } finally {
      setUpBusy(false);
      e.target.value = '';
    }
  };

  // UI
  if (!dispute) {
    return (
      <div style={wrap}>
        <div style={head}>Спір</div>
        <button style={btn} onClick={startDispute} disabled={busy}>
          {busy ? 'Створюю…' : 'Оскаржити сценарій'}
        </button>
      </div>
    );
  }

  const closed = dispute.status === 'closed';
  return (
    <div style={wrap}>
      <div style={head}>
        Спір: {closed ? 'закритий' : 'відкритий'}
      </div>

      <div style={row}>
        <VoteButton
          active={myVote === 'executor'}
          disabled={busy || closed}
          onClick={() => vote('executor')}
        >
          Виконавець правий ({counts.executor})
        </VoteButton>

        <VoteButton
          active={myVote === 'customer'}
          disabled={busy || closed}
          onClick={() => vote('customer')}
        >
          Замовник правий ({counts.customer})
        </VoteButton>
      </div>

      {!closed && (
        <>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
            Усього голосів: {counts.total}
          </div>

          <div style={{ marginTop: 10 }}>
            <button style={btn} onClick={() => fileRef.current?.click()} disabled={upBusy}>
              {upBusy ? 'Завантажую…' : 'Додати відеодоказ'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              onChange={onPickEvidence}
              style={{ display: 'none' }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ——— стилі ——— */
const wrap: React.CSSProperties = {
  border: '1px solid #eee',
  borderRadius: 12,
  padding: 12,
  marginTop: 10,
  background: '#fff',
};
const head: React.CSSProperties = { fontWeight: 700, marginBottom: 8 };
const row: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };
const btn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid #ddd',
  background: '#111',
  color: '#fff',
  cursor: 'pointer',
};
function VoteButton(props: React.PropsWithChildren<{ active?: boolean; disabled?: boolean; onClick(): void }>) {
  const base: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #ddd',
    cursor: props.disabled ? 'not-allowed' : 'pointer',
    background: props.active ? '#0ea5e9' : '#f6f6f6',
    color: props.active ? '#fff' : '#111',
  };
  return (
    <button style={base} disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  );
}
