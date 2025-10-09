// src/components/EscrowHandoff.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const isMetaMask = () =>
  typeof window !== 'undefined' &&
  (window as any).ethereum &&
  (window as any).ethereum.isMetaMask;

const pageWrap: React.CSSProperties = {
  minHeight: 'calc(100vh - 120px)',
  display: 'grid',
  placeItems: 'center',
  padding: '32px 16px',
};
const card: React.CSSProperties = {
  width: 'min(680px, 92vw)',
  background: '#ffe1e8',
  borderRadius: 24,
  padding: 24,
  boxShadow: '0 30px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
  border: '1px solid #f5d0d8',
};
const title: React.CSSProperties = {
  margin: '6px 0 12px',
  fontSize: 28,
  fontWeight: 800,
  textAlign: 'center',
  color: '#111',
};
const subtitle: React.CSSProperties = {
  margin: '0 0 16px',
  textAlign: 'center',
  opacity: 0.85,
};
const btn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 56,
  borderRadius: 28,
  padding: '0 20px',
  border: '1px solid #000',
  background: '#000',
  color: '#fff',
  fontWeight: 800,
  fontSize: 18,
  cursor: 'pointer',
};
const btnGhost: React.CSSProperties = { ...btn, background: '#fff', color: '#000' };

export default function EscrowHandoff() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const nextUrl = useMemo(() => {
    const u = new URL(window.location.href);
    return u.searchParams.get('next') || '/my-orders';
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      try {
        setBusy(true);
        setError(null);

        if (!isMetaMask()) {
          setError('Відкрийте цю сторінку у браузері MetaMask.');
          setBusy(false);
          return;
        }

        const ethereum = (window as any).ethereum;
        await ethereum.request({ method: 'eth_requestAccounts' });
        const accounts: string[] = await ethereum.request({ method: 'eth_accounts' });
        const wallet = (accounts?.[0] || '').toLowerCase();
        if (!wallet) throw new Error('Гаманець не підключено');

        const msg = `BuyMyBehavior Sign-In\nWallet: ${wallet}\nTime: ${Date.now()}`;
        const signature = await ethereum.request({
          method: 'personal_sign',
          params: [msg, wallet],
        });
        if (!signature) throw new Error('Підпис відмінено');

        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert(
            { user_id: crypto.randomUUID(), wallet_address: wallet },
            { onConflict: 'wallet_address' }
          );
        if (upsertErr) throw upsertErr;

        nav(nextUrl, { replace: true });
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setBusy(false);
      }
    }

    run();
  }, [nav, nextUrl]);

  return (
    <div style={pageWrap}>
      <div style={card}>
        <h1 style={title}>Підтвердження escrow через MetaMask</h1>
        <p style={subtitle}>Після підпису повернемо вас у BMB.</p>

        {error && (
          <p style={{ color: '#b00020', textAlign: 'center', marginBottom: 14 }}>{error}</p>
        )}

        <div style={{ display: 'grid', gap: 12, placeItems: 'center' }}>
          <button style={{ ...btn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => window.location.reload()}>
            🦊 Увійти через MetaMask
          </button>
          <button style={btnGhost} onClick={() => nav('/my-orders', { replace: true })}>
            ← Повернутись у BMB
          </button>
        </div>
      </div>
    </div>
  );
}
