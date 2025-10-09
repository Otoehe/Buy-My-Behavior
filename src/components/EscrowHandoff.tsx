// src/components/EscrowHandoff.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import MetaMaskSDK from '@metamask/sdk';
import { ethers } from 'ethers';

// Fix "Buffer is not defined" (Vite, мобільний браузер)
import { Buffer } from 'buffer';
if (!(window as any).Buffer) (window as any).Buffer = Buffer;

type ConnState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'signing'
  | 'ready';

export default function EscrowHandoff() {
  const [state, setState] = useState<ConnState>('idle');
  const [address, setAddress] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Ініціалізація MetaMask SDK (fallback, якщо немає window.ethereum)
  const sdk = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      return new MetaMaskSDK({
        checkInstallationImmediately: false,
        useDeeplink: true,
        dappMetadata: { name: 'Buy My Behavior', url: window.location.origin },
      });
    } catch {
      return null;
    }
  }, []);

  const provider: any = useMemo(() => {
    // 1) якщо ми в MetaMask-браузері — вже є window.ethereum
    if ((window as any).ethereum) return (window as any).ethereum;
    // 2) інакше беремо з SDK
    return sdk?.getProvider();
  }, [sdk]);

  // Автовхід: якщо провайдер уже є — пробуємо підтягнути акаунт
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        if (!provider) return;
        const accounts: string[] =
          (await provider.request?.({ method: 'eth_accounts' })) ?? [];
        if (ignore || !accounts?.length) return;
        await onConnected(accounts[0]);
      } catch (_) {}
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const connect = async () => {
    setError('');
    try {
      if (!provider) throw new Error('MetaMask provider не знайдено');
      setState('connecting');
      const accounts: string[] = await provider.request({
        method: 'eth_requestAccounts',
      });
      if (!accounts?.length) throw new Error('Користувач скасував підключення');
      await onConnected(accounts[0]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setState('idle');
    }
  };

  const onConnected = async (addr: string) => {
    setAddress(ethers.getAddress(addr)); // нормалізуємо checksum
    // створюємо/оновлюємо профіль у Supabase
    // у тебе унікальний індекс на wallet_address => upsert по ньому
    const { error: upErr } = await supabase
      .from('profiles')
      .upsert(
        { wallet_address: ethers.getAddress(addr) },
        { onConflict: 'wallet_address' }
      );

    if (upErr) {
      // якщо політики/схема все ще суворі — не валимо UX, просто показуємо помилку
      console.warn('profiles upsert error:', upErr);
      setError(upErr.message);
    }
    setState('connected');
  };

  const signEscrowApprove = async () => {
    setError('');
    try {
      if (!provider || !address) throw new Error('Спочатку під’єднай MetaMask');
      setState('signing');

      // простий офчейн-підпис як "підтвердження ескроу"
      const message = `BMB Escrow Approval\nWallet: ${address}\nTime: ${Date.now()}`;
      const from = address;
      // personal_sign очікує hex/utf8 message
      const signature: string = await provider.request({
        method: 'personal_sign',
        params: [ethers.hexlify(ethers.toUtf8Bytes(message)), from],
      });

      // Можеш зберегти підпис у таблицю escrow_approvals, якщо така є
      // await supabase.from('escrow_approvals').insert({ wallet_address: address, signature });

      setState('ready');
      alert('Ескроу підтверджено ✅');
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setState('connected');
    }
  };

  const openInMMBrowser = () => {
    // deep-link для відкриття саме MetaMask-браузера на нашому /handoff
    const dappUrl = encodeURIComponent(`${location.origin}/handoff`);
    location.href = `https://metamask.app.link/dapp/${dappUrl}`;
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-4xl font-extrabold mb-4">Вхід через MetaMask</h1>
      <p className="text-lg mb-6">
        Якщо запит не з'явився — натисни кнопку нижче.
      </p>

      {/* Кнопка «Увійти через MetaMask» — овальна як ми робили */}
      <button
        onClick={connect}
        disabled={state === 'connecting'}
        className="w-full rounded-full bg-black text-white text-lg py-4 px-6 shadow-md disabled:opacity-60 mb-3"
      >
        🦊 {state === 'connecting' ? 'Під’єднання…' : 'Увійти через MetaMask'}
      </button>

      {/* «Підтвердити ескроу» стане активною після конекту */}
      <button
        onClick={signEscrowApprove}
        disabled={state !== 'connected'}
        className="w-full rounded-full bg-pink-500 text-black text-lg py-4 px-6 shadow-md disabled:opacity-40"
      >
        🔒 Підтвердити ескроу
      </button>

      <div className="mt-4">
        <button
          onClick={openInMMBrowser}
          className="rounded-md border px-3 py-2 text-sm"
        >
          Відкрити у MetaMask-браузері
        </button>
      </div>

      {address && (
        <div className="mt-4 text-sm text-gray-600">
          Підключено: <span className="font-mono">{address}</span>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          Помилка: {error}
        </div>
      )}
    </div>
  );
}
