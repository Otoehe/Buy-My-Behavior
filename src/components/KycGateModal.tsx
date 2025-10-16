'use client'

// Single‑file preview for Canvas (no duplicate imports/default exports)
// Contains: KycGateModal (named export), KycToast (named), AccountStateModal (named),
// ensureReadyForLockFunds helper (named), and a Preview default export.
// In your repo, split into separate files as indicated in the comments near the end.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type KycGateVariant = 'L0toL1' | 'L1toL2';

interface KycGateModalProps {
  open: boolean;
  variant: KycGateVariant;
  onClose: () => void;
  onStartKyc: () => void;
  freeKycLeft?: number;
  isKycCostShared?: boolean;
}

// ============================== KycGateModal ===============================
export const KycGateModal: React.FC<KycGateModalProps> = ({
  open,
  variant,
  onClose,
  onStartKyc,
  freeKycLeft,
  isKycCostShared = true,
}) => {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const isFreeWindow = typeof freeKycLeft === 'number' && freeKycLeft > 0;
  const title = variant === 'L0toL1'
    ? 'Підтвердіть особу, щоб забронювати ескроу'
    : 'Підвищити ліміт платежів';

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center',
    zIndex: 999999, padding: 12,
  };
  const cardStyle: React.CSSProperties = {
    width: 'min(420px, 92vw)', maxHeight: '90vh', borderRadius: 20,
    border: '2px solid #ffcdd6', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
    overflow: 'hidden', background: 'linear-gradient(180deg, rgba(255,205,214,0.92), rgba(255,227,232,0.92) 90%)',
    backdropFilter: 'blur(6px)'
  };
  const scrollBodyStyle: React.CSSProperties = { overflowY: 'auto', maxHeight: 'calc(90vh - 64px - 64px)' };
  const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: 16 };
  const chipStyle: React.CSSProperties = { width: 48, height: 48, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.06)', border: '1px solid rgba(0,0,0,.06)' };
  const closeBtnStyle: React.CSSProperties = { marginLeft: 'auto', width: 36, height: 36, borderRadius: 999, background: 'rgba(0,0,0,.85)', color: '#fff', border: 'none', cursor: 'pointer' };
  const footerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 16, borderTop: '1px solid #f1d0d7', background: 'rgba(255,255,255,.5)' };
  const btnPri: React.CSSProperties = { borderRadius: 999, padding: '10px 16px', fontWeight: 800, background: '#000', color: '#fff', border: 'none', cursor: 'pointer' };
  const btnSec: React.CSSProperties = { borderRadius: 999, padding: '10px 16px', fontWeight: 600, background: 'rgba(255,255,255,.8)', color: '#000', border: '1px solid rgba(17,17,17,.15)', cursor: 'pointer' };

  const lawBox = (
    <div style={{ marginTop: 8, borderRadius: 12, border: '1px dashed #f5a9b7', background: '#fff6f8', padding: '8px 10px', color: '#6b2338', fontSize: 13 }}>
      <strong>KYC</strong> — обов’язковий крок згідно законодавства України (AML/КІС) для платежів на платформі.
    </div>
  );

  const modal = (
    <div style={overlayStyle} role="presentation" onClick={onClose}>
      <div ref={dialogRef} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="kyc-modal-title" aria-describedby="kyc-modal-desc" style={cardStyle}>
        {/* Header */}
        <header style={headerStyle}>
          <div style={chipStyle} aria-hidden>🔑</div>
          <h2 id="kyc-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#111' }}>{title}</h2>
          <button aria-label="Закрити" onClick={onClose} style={closeBtnStyle}>×</button>
        </header>

        <div style={scrollBodyStyle}>
          {/* Body */}
          {variant === 'L0toL1' ? (
            <div style={{ padding: '0 20px 14px' }}>
              <p id="kyc-modal-desc" style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(0,0,0,.9)', margin: '4px 0 12px' }}>
                Щоб безпечно забронювати суму в ескроу, швидко підтвердіть особу (<strong>≈2 хв</strong>). Після цього відкриються платежі до <strong>1 000 USDT</strong> і угода буде захищена за правилами платформи.
              </p>

              {isFreeWindow ? (
                <div style={{ marginTop: 8, borderRadius: 12, border: '1px solid rgba(16,185,129,.5)', background: 'rgba(240,253,244,.9)', padding: '8px 10px', color: '#064e3b', fontSize: 14 }}>
                  <strong>Перші 100 користувачів — KYC безкоштовно.</strong> Ми покриваємо вартість перевірки.
                  {typeof freeKycLeft === 'number' && (
                    <span style={{ marginLeft: 8, display: 'inline-block', padding: '2px 8px', background: '#dcfce7', borderRadius: 999, fontSize: 12 }}>Залишилось місць: {freeKycLeft}</span>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 8, borderRadius: 12, border: '1px solid rgba(244,114,182,.6)', background: 'rgba(255,255,255,.8)', padding: '8px 10px', color: '#7a2941', fontSize: 14 }}>
                  Після перших 100 вартість KYC <strong>не списується наперед</strong> — ми компенсуємо її з вашого першого ескроу (до <strong>3 USDT</strong> сумарно).
                  {isKycCostShared && <> Мʼякий варіант: <strong>1.5 USDT</strong> з кожної сторони у першій угоді.</>}
                </div>
              )}

              {lawBox}

              <ul style={{ margin: '8px 0 4px 22px', color: '#222', fontSize: 14 }}>
                <li>Ліміт після KYC: до 1 000 USDT за угоду / 2 000 USDT за день.</li>
                <li>Ваші дані захищені; ми використовуємо сертифікованого провайдера KYC.</li>
              </ul>

              <div style={{ marginTop: 10, borderRadius: 12, border: '1px dashed rgba(17,17,17,.15)', background: 'rgba(255,255,255,.7)', padding: '8px 10px', color: '#111', fontSize: 13 }}>
                <strong>Після активації KYC</strong> — зробіть перше замовлення, щоб <strong>активувати робочий акаунт</strong> і почати отримувати замовлення.
              </div>
            </div>
          ) : (
            <div style={{ padding: '0 20px 14px' }}>
              <p id="kyc-modal-desc" style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(0,0,0,.9)', margin: '4px 0 12px' }}>
                Потрібно більше? Пройдіть <strong>розширену верифікацію</strong> (<strong>≈3–5 хв</strong>) і отримайте ліміт до <strong>10 000 USDT</strong> за угоду та <strong>20 000 USDT</strong> на тиждень.
              </p>
              <div style={{ marginTop: 8, borderRadius: 12, border: '1px solid rgba(59,130,246,.5)', background: 'rgba(239,246,255,.8)', padding: '8px 10px', color: '#1e3a8a', fontSize: 13 }}>
                Якщо ваша поведінка/угоди можуть оцінюватись вище <strong>10 000 USDT</strong>, будь ласка, пройдіть <strong>глибшу верифікацію (EDD)</strong>.
              </div>
              {lawBox}
              <ul style={{ margin: '8px 0 4px 22px', color: '#222', fontSize: 14 }}>
                <li>Стан лімітів відображається у вашому профілі.</li>
                <li>Повторну перевірку робимо лише за необхідності.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer style={footerStyle}>
          <button style={btnSec} onClick={onClose}>Пізніше</button>
          <button style={btnPri} onClick={onStartKyc}>Пройти верифікацію</button>
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

// ================================ KycToast =================================
export const KycToast: React.FC<{ show: boolean; message: string; onClose: () => void; variant?: 'info' | 'success' | 'warning'; autoHideMs?: number; }>
= ({ show, message, onClose, variant = 'info', autoHideMs = 6000 }) => {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onClose, autoHideMs);
    return () => clearTimeout(t);
  }, [show, autoHideMs, onClose]);

  if (!show) return null;
  const bg = variant === 'success' ? 'rgba(240,253,244,.95)' : variant === 'warning' ? 'rgba(254,243,199,.96)' : 'rgba(255,205,214,.96)';
  const border = variant === 'success' ? '1px solid rgba(16,185,129,.5)' : variant === 'warning' ? '1px solid rgba(245,158,11,.5)' : '1px solid #ffcdd6';

  return (
    <div style={{ position: 'fixed', top: 12, left: 0, right: 0, display: 'grid', placeItems: 'center', zIndex: 999998 }}>
      <div style={{ maxWidth: 480, width: 'calc(100% - 24px)', background: bg, border, boxShadow: '0 8px 24px rgba(0,0,0,.18)', borderRadius: 16, padding: '10px 14px', color: '#111', fontWeight: 600 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>🔔</span>
          <div style={{ lineHeight: 1.4 }}>{message}</div>
          <button onClick={onClose} aria-label="Закрити" style={{ marginLeft: 'auto', border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
      </div>
    </div>
  );
};

// ============================ AccountStateModal ============================
export const AccountStateModal: React.FC<{ open: boolean; state: 'pending' | 'active' | 'read_only' | 'suspended'; onClose: () => void; onActivate: () => void; }>
= ({ open, state, onClose, onActivate }) => {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open || !mounted) return null;

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', zIndex: 999999, padding: 12 };
  const card: React.CSSProperties = { width: 'min(420px,92vw)', maxHeight: '90vh', background: 'linear-gradient(180deg, rgba(255,205,214,0.92), rgba(255,227,232,0.92) 90%)', border: '2px solid #ffcdd6', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,.25)', overflow: 'hidden', backdropFilter: 'blur(6px)' };
  const header: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: 16 };
  const chip: React.CSSProperties = { width: 48, height: 48, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.06)', border: '1px solid rgba(0,0,0,.06)' };
  const footer: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 16, borderTop: '1px solid #f1d0d7', background: 'rgba(255,255,255,.5)' };
  const btnPri: React.CSSProperties = { borderRadius: 999, padding: '10px 16px', fontWeight: 800, background: '#000', color: '#fff', border: 'none', cursor: 'pointer' };
  const btnSec: React.CSSProperties = { borderRadius: 999, padding: '10px 16px', fontWeight: 600, background: 'rgba(255,255,255,.8)', color: '#000', border: '1px solid rgba(17,17,17,.15)', cursor: 'pointer' };

  const title = state === 'read_only' ? 'Ваш акаунт у режимі перегляду' : state === 'suspended' ? 'Акаунт призупинено' : 'Статус акаунта';

  const body = (
    <div style={{ padding: '0 20px 14px', overflowY: 'auto', maxHeight: 'calc(90vh - 64px - 64px)' }}>
      {state === 'read_only' ? (
        <>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(0,0,0,.9)', margin: '4px 0 12px' }}>
            Щоб <strong>активувати робочий акаунт</strong> і почати отримувати замовлення, зробіть перше замовлення.
          </p>
          <div style={{ marginTop: 8, borderRadius: 12, border: '1px dashed rgba(17,17,17,.15)', background: 'rgba(255,255,255,.7)', padding: '8px 10px', color: '#111', fontSize: 13 }}>
            Порада: якщо у вас є інвайт амбасадора — введіть його на сторінці замовлення.
          </div>
        </>
      ) : state === 'suspended' ? (
        <p style={{ fontSize: 15 }}>З міркувань безпеки акаунт тимчасово призупинено. Зв’яжіться з підтримкою.</p>
      ) : (
        <p style={{ fontSize: 15 }}>Поточний стан: {state}</p>
      )}
    </div>
  );

  const modal = (
    <div style={overlay} role="presentation" onClick={onClose}>
      <div ref={ref} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="acc-modal-title" style={card}>
        <header style={header}>
          <div style={chip} aria-hidden>⚠️</div>
          <h2 id="acc-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#111' }}>{title}</h2>
          <button aria-label="Закрити" onClick={onClose} style={{ marginLeft: 'auto', width: 36, height: 36, borderRadius: 999, background: 'rgba(0,0,0,.85)', color: '#fff', border: 'none', cursor: 'pointer' }}>×</button>
        </header>
        {body}
        <footer style={footer}>
          <button style={btnSec} onClick={onClose}>Пізніше</button>
          {state === 'read_only' && <button style={btnPri} onClick={onActivate}>Активувати зараз</button>}
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

// ========================= ensureReadyForLockFunds =========================
export type ProfileLike = {
  kyc_status?: 'passed' | 'failed' | 'pending' | null;
  account_state?: 'pending' | 'active' | 'read_only' | 'suspended' | null;
};
export function ensureReadyForLockFunds({ profile, openKyc, openAccountState }: { profile: ProfileLike | null | undefined; openKyc: () => void; openAccountState: () => void; }) {
  if (!profile) { openKyc(); return false; }
  if (profile.account_state === 'read_only' || profile.account_state === 'suspended') { openAccountState(); return false; }
  if (profile.kyc_status !== 'passed') { openKyc(); return false; }
  return true;
}

// ============================== Canvas Preview =============================
export default function KycGatePreview() {
  const [open, setOpen] = useState(true);
  const [variant, setVariant] = useState<KycGateVariant>('L0toL1');
  const [free, setFree] = useState<number>(42);
  const [toast, setToast] = useState<string | null>('Перші 100 — KYC безкоштовно. Далі компенсація до 3 USDT з першого ескроу.');

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => { setOpen(true); setVariant('L0toL1'); }} style={{ padding: '8px 12px', borderRadius: 12, border: '1px solid #ddd', cursor: 'pointer' }}>Показати L0→L1</button>
        <button onClick={() => { setOpen(true); setVariant('L1toL2'); }} style={{ padding: '8px 12px', borderRadius: 12, border: '1px solid #ddd', cursor: 'pointer' }}>Показати L1→L2</button>
        <button onClick={() => setFree((f) => (f > 0 ? f - 1 : 0))} style={{ padding: '8px 12px', borderRadius: 12, border: '1px solid #ddd', cursor: 'pointer' }}>-1 free</button>
        <button onClick={() => setFree(0)} style={{ padding: '8px 12px', borderRadius: 12, border: '1px solid #ddd', cursor: 'pointer' }}>Free = 0</button>
        <button onClick={() => setToast('Перші 100 — KYC безкоштовно. Далі компенсація до 3 USDT з першого ескроу.')} style={{ padding: '8px 12px', borderRadius: 12, border: '1px solid #ddd', cursor: 'pointer' }}>Show toast</button>
      </div>

      <KycGateModal
        open={open}
        onClose={() => setOpen(false)}
        onStartKyc={() => alert('Start KYC')}
        variant={variant}
        freeKycLeft={free}
        isKycCostShared
      />

      <KycToast show={!!toast} message={toast ?? ''} onClose={() => setToast(null)} />
    </div>
  );
}

// ========================= Split into files in repo ========================
// Create these files in your project:
// 1) src/components/KycGateModal.tsx          -> export default KycGateModal
// 2) src/components/KycToast.tsx              -> export default KycToast
// 3) src/components/AccountStateModal.tsx     -> export default AccountStateModal
// 4) src/lib/ensureReadyForLockFunds.ts       -> export function ensureReadyForLockFunds
// (Copy the corresponding blocks from this Canvas file.)
