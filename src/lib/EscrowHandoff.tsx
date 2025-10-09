// src/components/EscrowHandoff.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ensureChain, normalizeChainId, requestAccount,
  parseUnits, buildApproveData, sendTx, waitForReceipt, toHexWei, CHAIN_PRESETS,
} from '../lib/eth';

type Phase = 'idle' | 'connecting' | 'signing' | 'confirming' | 'done' | 'error';

const APP_ORIGIN =
  (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'https://buymybehavior.com');

function parseBool(v: string | null, def = true) {
  if (v === null) return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export default function EscrowHandoff() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [msg, setMsg] = useState<string>('Підготовка…');
  const [error, setError] = useState<string>('');
  const [hash, setHash] = useState<string>('');

  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const params = useMemo(() => {
    const action = (sp.get('action') || 'approve').toLowerCase(); // approve | deposit
    const chainId = normalizeChainId(sp.get('chainId') || '0x38'); // за замовчуванням BSC mainnet
    const token = (sp.get('token') || '').toLowerCase();
    const spender = (sp.get('spender') || '').toLowerCase();
    const amountStr = sp.get('amount') || '0';
    const decimals = sp.get('decimals') ? Number(sp.get('decimals')) : 18;
    const returnUrl = sp.get('return') || `${APP_ORIGIN}/my-orders`;
    const autostart = parseBool(sp.get('autostart'), true);
    const title = sp.get('title') || 'Ескроу-блокування';
    const subtitle = sp.get('subtitle') || (action === 'approve'
      ? 'Підтвердіть дозвіл для ескроу-контракту списати токени'
      : 'Підтвердіть переказ у ескроу');

    return { action, chainId, token, spender, amountStr, decimals, returnUrl, autostart, title, subtitle };
  }, [sp]);

  useEffect(() => {
    if (!params.autostart) return;

    (async () => {
      try {
        setPhase('connecting');
        setMsg('З’єднання з MetaMask…');

        if (!params.chainId) throw new Error('Не вказано chainId');
        await ensureChain(params.chainId);

        const from = await requestAccount();

        const amountWei =
          params.action === 'approve'
            ? parseUnits(params.amountStr || '0', params.decimals)
            : parseUnits(params.amountStr || '0', CHAIN_PRESETS.bsc.nativeCurrency.decimals);

        if (params.action === 'approve') {
          if (!params.token || !params.spender) throw new Error('Не вказано token або spender для approve');
          setPhase('signing');
          setMsg('Підпис транзакції approve…');

          const data = buildApproveData(params.spender, amountWei);
          const txHash = await sendTx({ from, to: params.token, data, value: '0x0' });
          setHash(txHash);

          setPhase('confirming');
          setMsg('Очікуємо підтвердження у мережі…');
          await waitForReceipt(txHash);

        } else {
          if (!params.spender) throw new Error('Не вказано адресу ескроу (spender) для депозиту');
          setPhase('signing');
          setMsg('Підпис транзакції депозиту…');

          const txHash = await sendTx({ from, to: params.spender, value: toHexWei(amountWei) });
          setHash(txHash);

          setPhase('confirming');
          setMsg('Очікуємо підтвердження у мережі…');
          await waitForReceipt(txHash);
        }

        setPhase('done');
        setMsg('Готово. Повертаємося до BMB…');

        const url = new URL(params.returnUrl);
        url.searchParams.set('escrow', params.action);
        url.searchParams.set('tx', hash || '');
        url.searchParams.set('ok', '1');
        // Плавне повернення
        window.location.replace(url.toString());
      } catch (e: any) {
        setPhase('error');
        setError(String(e?.message || e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.autostart]); // стартуємо один раз

  const goBack = () => {
    try {
      const url = new URL(params.returnUrl);
      if (!url.searchParams.get('escrow')) url.searchParams.set('escrow', params.action);
      if (hash) url.searchParams.set('tx', hash);
      window.location.replace(url.toString());
    } catch {
      navigate('/my-orders', { replace: true });
    }
  };

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={title}>{params.title}</h1>
        <p style={sub}>{params.subtitle}</p>

        <div style={pill(phase)}>
          <span>
            {phase === 'connecting' && 'З’єднання…'}
            {phase === 'signing' && 'Підписання…'}
            {phase === 'confirming' && 'Підтвердження…'}
            {phase === 'done' && 'Успішно ✅'}
            {phase === 'idle' && 'Готовність до підключення'}
            {phase === 'error' && 'Помилка ❌'}
          </span>
        </div>

        {msg && <p style={{ marginTop: 16, color: '#333' }}>{msg}</p>}
        {error && (
          <div style={errBox}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Помилка</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{error}</div>
          </div>
        )}

        <button onClick={goBack} style={backBtn}>⬅️ Повернутись у BMB</button>

        <div style={hint}>
          Якщо MetaMask не відкрив діалог автоматично — натисни кнопку вище, а потім спробуй знову з посилання.
        </div>
      </div>
    </div>
  );
}

// ───────── стилі ─────────
const wrap: React.CSSProperties = {
  minHeight: 'calc(100vh - 120px)',
  display: 'grid',
  placeItems: 'center',
  padding: '32px 16px',
};
const card: React.CSSProperties = {
  width: 'min(720px, 92vw)',
  background: '#ffe2ea',
  borderRadius: 24,
  padding: 24,
  boxShadow: '0 30px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
  border: '1px solid #ffd0db',
};
const title: React.CSSProperties = { margin: '8px 0 6px', fontSize: 28, fontWeight: 800, color: '#111' };
const sub: React.CSSProperties = { margin: 0, opacity: 0.8 };
const pill = (p: string): React.CSSProperties => ({
  marginTop: 18,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 16px',
  borderRadius: 999,
  background: p === 'error' ? '#fee2e2' : '#111',
  color: p === 'error' ? '#b91c1c' : '#fff',
  fontWeight: 700,
});
const errBox: React.CSSProperties = {
  marginTop: 14,
  background: '#fff',
  border: '1px solid #ffd0db',
  borderRadius: 12,
  padding: 12,
};
const backBtn: React.CSSProperties = {
  marginTop: 18,
  height: 56,
  width: '100%',
  border: '1px solid #000',
  background: '#000',
  color: '#fff',
  borderRadius: 999,
  fontSize: 16,
  fontWeight: 800,
};
const hint: React.CSSProperties = { marginTop: 12, fontSize: 13, opacity: 0.7 };
