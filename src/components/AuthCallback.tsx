// 📄 src/components/AuthCallback.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const PINK = '#ffcdd6';
const BLACK = '#000000';
const BSC_CHAIN_ID_HEX = '0x38'; // 56

function parseHashParams() {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const sp = new URLSearchParams(hash);
  const params: Record<string, string> = {};
  sp.forEach((v, k) => (params[k] = v));
  return params;
}

function isMobileUA() {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

function isMetaMaskInApp() {
  const ua = navigator.userAgent || '';
  return /MetaMaskMobile/i.test(ua) || (window.ethereum && window.ethereum.isMetaMask);
}

function isInAppWebView() {
  const ua = navigator.userAgent || '';
  // Найчастіші вбудовані браузери, де немає web3-провайдера і некоректно працюють редіректи
  return /FBAN|FBAV|FB_IAB|Instagram|Line|WeChat|MiuiBrowser|GSA|Gmail|Twitter|VkIntent|wv/i.test(ua);
}

async function ensureBSC() {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BSC_CHAIN_ID_HEX }],
    });
  } catch (err: any) {
    // Якщо мережі немає — додаємо
    if (err?.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: BSC_CHAIN_ID_HEX,
            chainName: 'BNB Smart Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: ['https://bsc-dataseed.binance.org/'],
            blockExplorerUrls: ['https://bscscan.com'],
          },
        ],
      });
    }
  }
}

export default function AuthCallback() {
  const nav = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [interstitial, setInterstitial] = useState<{
    show: boolean;
    deepLink: string;
    chromeIntent: string | null;
    plainUrl: string;
    isAndroid: boolean;
    isIOS: boolean;
  }>({
    show: false,
    deepLink: '',
    chromeIntent: null,
    plainUrl: '',
    isAndroid: false,
    isIOS: false,
  });

  const fullURL = useMemo(() => {
    // Повний поточний URL (включає токени у hash) — передамо в MetaMask dapp-deeplink
    const origin = window.location.origin.replace(/^https?:\/\//, '');
    const path = window.location.pathname + window.location.search + window.location.hash;
    return { origin, path, absolute: window.location.href };
  }, [location]);

  useEffect(() => {
    (async () => {
      const hashParams = parseHashParams();
      const urlSearch = new URLSearchParams(window.location.search);
      const hasMagicTokens =
        !!hashParams['access_token'] || !!hashParams['refresh_token'] || !!urlSearch.get('code');

      const ua = navigator.userAgent || '';
      const isAndroid = /Android/i.test(ua);
      const isIOS = /iPhone|iPad|iPod/i.test(ua);

      // Якщо ми вбудовані (Gmail/FB/IG/TG...), і це перехід з magic-link (є токени),
      // блокуємо виконання логіки та пропонуємо відкрити «чисто»
      if (isInAppWebView() && hasMagicTokens && !isMetaMaskInApp()) {
        const scheme = window.location.protocol.replace(':', '');
        const chromeIntent = isAndroid
          ? `intent://${fullURL.origin}${fullURL.path}#Intent;scheme=${scheme};package=com.android.chrome;end`
          : null;

        const deepLink = `https://metamask.app.link/dapp/${fullURL.origin}${fullURL.path}`;
        setInterstitial({
          show: true,
          deepLink,
          chromeIntent,
          plainUrl: fullURL.absolute,
          isAndroid,
          isIOS,
        });
        setLoading(false);
        return;
      }

      // 1) Обмін за code (PKCE)
      const code = urlSearch.get('code');
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
          // Прибираємо ?code із URL
          const url = new URL(window.location.href);
          url.searchParams.delete('code');
          window.history.replaceState({}, '', url.toString());
        } catch (e) {
          console.error('exchangeCodeForSession error:', e);
        }
      }

      // 2) Пряме встановлення сесії за hash-токенами
      if (hashParams['access_token'] && hashParams['refresh_token']) {
        try {
          await supabase.auth.setSession({
            access_token: hashParams['access_token'],
            refresh_token: hashParams['refresh_token'],
          });
          // Чистимо hash
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        } catch (e) {
          console.error('setSession error:', e);
        }
      }

      // 3) Якщо вже є активна сесія — ок
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        // Немає сесії — покажемо м’яке повідомлення і відправимо на /register
        setLoading(false);
        // Невелика пауза, щоб користувач побачив екран і не «мигало»
        setTimeout(() => nav('/register'), 800);
        return;
      }

      // 4) Підготуємо мережу (BSC) та перейдемо на карту
      try {
        await ensureBSC();
      } catch (e) {
        // нехай не блокує перехід
      }

      setLoading(false);
      nav('/map', { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (interstitial.show) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.logo}>B<span style={{ color: BLACK }}>M</span>B</div>
          <h2 style={styles.title}>Відкрий «чисто», щоб завершити вхід</h2>
          <p style={styles.text}>
            Зараз посилання відкрито у вбудованому переглядачі (наприклад Gmail/Instagram). Тут MetaMask не працює.
            Обери спосіб нижче:
          </p>

          {interstitial.isAndroid && interstitial.chromeIntent && (
            <a href={interstitial.chromeIntent} style={styles.primaryBtn}>
              Відкрити в Chrome
            </a>
          )}

          {!interstitial.isAndroid && (
            <a href={interstitial.plainUrl} target="_blank" rel="noopener noreferrer" style={styles.primaryBtn}>
              Відкрити в браузері (нова вкладка)
            </a>
          )}

          <a href={interstitial.deepLink} style={styles.secondaryBtn}>
            Відкрити в MetaMask (рекомендовано)
          </a>

          <details style={styles.details}>
            <summary>Або скопіювати посилання вручну</summary>
            <div style={{ marginTop: 8 }}>
              <code style={styles.codeBox}>{interstitial.plainUrl}</code>
              <button
                style={styles.copyBtn}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(interstitial.plainUrl);
                    alert('Посилання скопійовано. Встав у Safari/Chrome/MetaMask.');
                  } catch {
                    alert('Скопіюй вручну: виділи текст і натисни Copy.');
                  }
                }}
              >
                Копіювати
              </button>
            </div>
            {interstitial.isIOS && (
              <p style={styles.hint}>
                iOS: натисни <strong>•••</strong> у правому верхньому куті та обери <strong>Open in Safari</strong>.
              </p>
            )}
          </details>

          <p style={styles.footerNote}>
            Після відкриття у чистому браузері/MetaMask вхід завершиться автоматично, а далі я запропоную додати іконку BMB
            на головний екран 📲
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.loadingWrap}>
      <div style={styles.spinner} />
      <div style={{ marginTop: 12, color: '#666' }}>Завершуємо авторизацію…</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    background: '#f7f7f9',
    display: 'grid',
    placeItems: 'center',
    padding: 16,
  },
  card: {
    maxWidth: 560,
    width: '100%',
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
    padding: 20,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: PINK,
    color: BLACK,
    display: 'grid',
    placeItems: 'center',
    fontWeight: 900,
    marginBottom: 8,
    userSelect: 'none',
  },
  title: {
    margin: '8px 0 6px',
    fontSize: 20,
  },
  text: {
    margin: '0 0 14px',
    color: '#444',
    lineHeight: 1.4,
  },
  primaryBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'center',
    background: PINK,
    color: BLACK,
    border: 'none',
    padding: '12px 16px',
    borderRadius: 12,
    fontWeight: 700,
    textDecoration: 'none',
    marginBottom: 10,
  },
  secondaryBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'center',
    background: '#fff',
    color: BLACK,
    border: `2px solid ${PINK}`,
    padding: '10px 16px',
    borderRadius: 12,
    fontWeight: 700,
    textDecoration: 'none',
    marginBottom: 6,
  },
  details: {
    marginTop: 10,
    fontSize: 14,
    color: '#444',
  },
  codeBox: {
    display: 'block',
    wordBreak: 'break-all',
    background: '#f3f3f6',
    borderRadius: 8,
    padding: 8,
    fontSize: 12,
  },
  copyBtn: {
    marginTop: 8,
    padding: '8px 12px',
    borderRadius: 10,
    border: `1px solid ${PINK}`,
    background: '#fff',
    fontWeight: 600,
  },
  hint: { marginTop: 6, color: '#666' },
  footerNote: {
    marginTop: 14,
    fontSize: 13,
    color: '#666',
  },
  loadingWrap: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: '#fff',
  },
  spinner: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: '3px solid #eee',
    borderTopColor: PINK,
    animation: 'spin 0.9s linear infinite',
  },
};
