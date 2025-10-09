// src/components/EscrowHandoff.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

type Phase = 'idle' | 'connecting' | 'switching' | 'sending' | 'waiting' | 'done' | 'error';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      isMetaMask?: boolean;
    };
  }
}

// ─── невеличкі утиліти ─────────────────────────────────────────────────────────
function openBmb(payload: {
  kind?: 'success'|'warning'|'error'|'confirm'|'tx'|'info'|'magic'|'congratsCustomer'|'congratsPerformer',
  title?: React.ReactNode,
  subtitle?: React.ReactNode,
  actionLabel?: string,
  noBackdropClose?: boolean,
  hideClose?: boolean,
}) {
  window.dispatchEvent(new CustomEvent('bmb:modal:open', { detail: payload }));
}
function closeBmb() {
  window.dispatchEvent(new Event('bmb:modal:close'));
}

const CHAIN = {
  '0x38': { // BSC Mainnet
    chainId: '0x38',
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org'],
    blockExplorerUrls: ['https://bscscan.com'],
  },
  '0x61': { // BSC Testnet
    chainId: '0x61',
    chainName: 'BNB Smart Chain Testnet',
    nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
    rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
    blockExplorerUrls: ['https://testnet.bscscan.com'],
  },
} as const;

function pad32(hexNo0x: string) {
  return hexNo0x.padStart(64, '0');
}
function strip0x(s: string) {
  return s.startsWith('0x') ? s.slice(2) : s;
}
function pow10(n: number): bigint {
  let x = 1n;
  for (let i = 0; i < n; i++) x *= 10n;
  return x;
}
function parseAmountToUnits(amount: string, decimals: number): bigint {
  const [intPart = '0', fracPartRaw = ''] = amount.split('.');
  const frac = fracPartRaw.slice(0, decimals);
  const fracPadded = frac.padEnd(decimals, '0');
  const bi = BigInt(intPart || '0') * pow10(decimals) + BigInt(fracPadded || '0');
  return bi;
}
/** ERC-20 approve(spender, amount) calldata */
function buildApproveData(spender: string, amountUnits: bigint) {
  const selector = '0x095ea7b3';
  const spender32 = pad32(strip0x(spender).toLowerCase());
  const amt32 = pad32(amountUnits.toString(16));
  return (selector + spender32 + amt32) as `0x${string}`;
}

async function switchOrAddChain(chainId: string) {
  const eth = window.ethereum!;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (e: any) {
    // 4902 — не додано мережу
    if (e?.code === 4902 && (CHAIN as any)[chainId]) {
      await eth.request({ method: 'wallet_addEthereumChain', params: [(CHAIN as any)[chainId]] });
    } else {
      throw e;
    }
  }
}

async function requestAccounts(): Promise<string[]> {
  const eth = window.ethereum!;
  return eth.request({ method: 'eth_requestAccounts' });
}

async function sendTx(tx: {
  from: string;
  to: string;
  data: string;
  value?: string;
}): Promise<string> {
  const eth = window.ethereum!;
  return eth.request({ method: 'eth_sendTransaction', params: [tx] });
}

async function waitForReceipt(hash: string, timeoutMs = 120_000): Promise<any> {
  const eth = window.ethereum!;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const r = await eth.request({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (r && r.blockNumber) return r;
    await new Promise(res => setTimeout(res, 1500));
  }
  throw new Error('Timeout waiting for transaction confirmation');
}

// ─── сам компонент ─────────────────────────────────────────────────────────────
export default function EscrowHandoff() {
  const nav = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const action   = q.get('action') || 'approve';            // 'approve' | 'deposit' (поки робимо approve)
  const chainId  = (q.get('chainId') || '0x38').toLowerCase();
  const token    = q.get('token') || '';                    // адреса ERC-20 (для approve)
  const spender  = q.get('spender') || '';                  // адреса escrow-контракту
  const amount   = q.get('amount') || '0';
  const decimals = parseInt(q.get('decimals') || '18', 10);
  const redirect = q.get('return') || `${window.location.origin}/my-orders`;

  useEffect(() => {
    (async () => {
      try {
        if (!window.ethereum) {
          setError('MetaMask не знайдено. Відкрийте посилання у браузері MetaMask.');
          setPhase('error');
          openBmb({
            kind: 'error',
            title: 'Немає MetaMask',
            subtitle: 'Відкрий посилання у браузері MetaMask або встанови розширення.',
            actionLabel: 'OK',
          });
          return;
        }

        // 1) конект
        setPhase('connecting');
        const [from] = await requestAccounts();

        // 2) перемкнути мережу
        setPhase('switching');
        await switchOrAddChain(chainId);

        if (action === 'approve') {
          if (!token || !spender) throw new Error('Порожній token або spender');
          // 3) готуємо calldata
          const units = parseAmountToUnits(amount, isFinite(decimals) ? decimals : 18);
          const data = buildApproveData(spender, units);

          // 4) відправляємо транзакцію
          setPhase('sending');
          const hash = await sendTx({ from, to: token, data });

          openBmb({
            kind: 'tx',
            title: 'Надіслано транзакцію approve',
            subtitle: <>Tx Hash:<br/>{hash}</>,
            actionLabel: 'OK',
            noBackdropClose: true,
          });

          // 5) чекаємо підтвердження
          setPhase('waiting');
          await waitForReceipt(hash);

          openBmb({
            kind: 'success',
            title: 'Підтверджено ✅',
            subtitle: 'Escrow-approve виконано, повертаю на BMB.',
            actionLabel: 'Повернутись',
          });
          setPhase('done');
          setTimeout(() => { closeBmb(); window.location.assign(redirect); }, 800);
          return;
        }

        // Якщо колись додамо action=deposit — сюди.
        throw new Error(`Невідомий action: ${action}`);
      } catch (err: any) {
        console.error(err);
        setError(String(err?.message || err));
        setPhase('error');
        openBmb({
          kind: 'error',
          title: 'Помилка escrow',
          subtitle: String(err?.message || err),
          actionLabel: 'OK',
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goBack = () => window.location.assign('/my-orders');

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={title}>Escrow</h1>
        {phase !== 'error' ? (
          <>
            <p style={p}>Дію: <b>{action}</b></p>
            <p style={p}>Мережа: <b>{chainId}</b></p>
            {action === 'approve' && (
              <>
                <p style={p}>Token: <code>{token}</code></p>
                <p style={p}>Spender: <code>{spender}</code></p>
                <p style={p}>Amount: <b>{amount}</b> (decimals {decimals})</p>
              </>
            )}
            <p style={{...p, opacity: .7}}>Стан: <b>{phase}</b></p>
            <button onClick={goBack} style={btnBlack}>⬅ Повернутись в BMB</button>
          </>
        ) : (
          <>
            <p style={{...p, color:'#c00'}}>{error}</p>
            <button onClick={goBack} style={btnBlack}>⬅ Повернутись в BMB</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── стилі ─────────────────────────────────────────────────────────────────────
const wrap: React.CSSProperties = {
  minHeight: 'calc(100vh - 120px)',
  display: 'grid',
  placeItems: 'center',
  padding: '32px 16px',
};

const card: React.CSSProperties = {
  width: 'min(720px, 92vw)',
  background: '#fde1e7',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 30px 60px rgba(0,0,0,.12), 0 4px 16px rgba(0,0,0,.08)',
  border: '1px solid #f2b6c2',
};

const title: React.CSSProperties = {
  margin: '8px 0 16px',
  fontSize: 26,
  fontWeight: 900,
  color: '#111',
};

const p: React.CSSProperties = { margin: '6px 0', fontSize: 16, color: '#111' };

const btnBlack: React.CSSProperties = {
  marginTop: 16,
  height: 56,
  borderRadius: 999,
  border: '1px solid #000',
  background: '#000',
  color: '#fff',
  fontWeight: 800,
  fontSize: 16,
  cursor: 'pointer',
  padding: '0 20px',
};
