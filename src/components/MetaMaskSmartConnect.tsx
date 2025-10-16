import React, { useCallback, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Props = {
  profileUserId?: string;           // user.id (щоб одразу зберегти адресу в профіль)
  onConnected?: (address: string) => void; // колбек у профіль, якщо треба оновити стан
  bscChainIdHex?: string;           // за замовчуванням 0x38 (BSC mainnet)
  appUrl?: string;                  // публічний URL вашого сайту (для deeplink у MetaMask)
};

const isMobileUA = () =>
  /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

const getInjected = () => (typeof window !== 'undefined' ? (window as any).ethereum : undefined);

const BSC_MAINNET = {
  chainId: '0x38', // 56
  chainName: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: ['https://bsc-dataseed.binance.org/'],
  blockExplorerUrls: ['https://bscscan.com'],
};

async function ensureBscNetwork(eth: any, targetChainIdHex = BSC_MAINNET.chainId) {
  try {
    const current = await eth.request({ method: 'eth_chainId' });
    if (current?.toLowerCase() === targetChainIdHex.toLowerCase()) return;

    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainIdHex }],
    });
  } catch (e: any) {
    // Якщо мережі немає — додаємо
    if (e?.code === 4902 || /Unrecognized chain ID/i.test(String(e?.message))) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [BSC_MAINNET],
      });
    } else {
      throw e;
    }
  }
}

async function connectInjectedAndSave(
  profileUserId: string | undefined,
  onConnected: ((addr: string) => void) | undefined,
  targetChainIdHex: string | undefined,
) {
  const eth = getInjected();
  if (!eth) throw new Error('MetaMask provider is not injected');

  // 1) Запит акаунтів
  const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
  const address = accounts?.[0];
  if (!address) throw new Error('Account not granted');

  // 2) Перемкнути/додати BSC
  await ensureBscNetwork(eth, targetChainIdHex ?? BSC_MAINNET.chainId);

  // 3) Зберегти в профіль (за потреби)
  if (profileUserId) {
    // ЗМІНИ: якщо у вас інша колонка (наприклад, wallet), підправте назву поля тут
    const { error } = await supabase
      .from('profiles')
      .update({ wallet_address: address })
      .eq('user_id', profileUserId);

    if (error) console.warn('[BMB] save wallet_address failed:', error.message);
  }

  onConnected?.(address);
  return address;
}

function toDeeplinkUrl(appUrl: string) {
  // Рекомендовано публічний HTTPS (ngrok/Cloudflare tunnel/виробничий домен)
  // Формат: https://metamask.app.link/dapp/<ВАШ_URL_БЕЗ_схеми?>
  // MetaMask офіційно підтримує https://metamask.app.link/dapp/<full-url>
  // Для безпеки кодуємо URL
  const trimmed = appUrl.replace(/^https?:\/\//i, '');
  return `https://metamask.app.link/dapp/${encodeURIComponent(trimmed)}`;
}

export default function MetaMaskSmartConnect({
  profileUserId,
  onConnected,
  bscChainIdHex,
  appUrl,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicAppUrl = useMemo(() => {
    // Порядок пріоритету:
    // 1) проп appUrl
    // 2) env VITE_PUBLIC_APP_URL (краще мати HTTPS тунель у деві)
    // 3) window.location.origin (може бути http://localhost:5173 — для deeplink не завжди ок)
    const envUrl = (import.meta as any)?.env?.VITE_PUBLIC_APP_URL as string | undefined;
    return appUrl || envUrl || window.location.origin;
  }, [appUrl]);

  const handleClick = useCallback(async () => {
    setError(null);

    try {
      setBusy(true);
      const eth = getInjected();

      // Випадок 1: інжектований провайдер (десктоп з розширенням або мобільний in-app браузер MetaMask)
      if (eth && (eth.isMetaMask || eth.providers?.some((p: any) => p.isMetaMask))) {
        await connectInjectedAndSave(profileUserId, onConnected, bscChainIdHex);
        setBusy(false);
        return;
      }

      // Випадок 2: мобільний браузер БЕЗ інжекції → відкриваємо далі додаток MetaMask з вашим сайтом у вбудованому браузері
      if (isMobileUA()) {
        const deeplink = toDeeplinkUrl(publicAppUrl);
        // Відкриваємо MetaMask
        window.location.href = deeplink;
        setBusy(false);
        return;
      }

      // Випадок 3: немає MetaMask → підказка встановити
      setError(
        'MetaMask не знайдено. Встановіть розширення MetaMask (десктоп) або відкрийте сайт через MetaMask Mobile.',
      );
      setBusy(false);
    } catch (e: any) {
      console.error('[BMB] MetaMask connect failed', e);
      setError(e?.message || 'Помилка підключення MetaMask');
      setBusy(false);
    }
  }, [profileUserId, onConnected, bscChainIdHex, publicAppUrl]);

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 8 }}>
      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          padding: '10px 14px',
          borderRadius: 14,
          border: 'none',
          cursor: 'pointer',
          fontWeight: 700,
          background: '#ffcdd6', // бренд BMB
          color: '#000',
          boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
        }}
      >
        {busy ? 'Підключення…' : 'Підключити MetaMask'}
      </button>

      {error && (
        <div style={{ fontSize: 12, color: '#d33', maxWidth: 320 }}>
          {error}
          <div style={{ marginTop: 6 }}>
            Порада: на мобільному відкрийте сайт у <b>MetaMask Mobile</b> через deeplink.
          </div>
        </div>
      )}
    </div>
  );
}
