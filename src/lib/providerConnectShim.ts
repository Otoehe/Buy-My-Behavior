// src/lib/providerConnectShim.ts
import { connectWallet, ensureBSC, type Eip1193Provider } from './wallet';

type ReqArgs = { method: string; params?: any[] };

function waitForChain(ethereum: any, expectedHex: `0x${string}`) {
  return new Promise<void>((resolve) => {
    if (!ethereum?.on) return resolve();
    if (ethereum.chainId === expectedHex) return resolve();
    const h = (hex: string) => { if (hex === expectedHex) { ethereum.removeListener?.('chainChanged', h); resolve(); } };
    ethereum.on('chainChanged', h);
    setTimeout(() => { ethereum.removeListener?.('chainChanged', h); resolve(); }, 2500);
  });
}

/** Глобально гарантує connect() перед будь-яким request() */
export async function installProviderConnectShim(
  opts?: { chainIdHex?: `0x${string}`; autoEnsureBSC?: boolean }
) {
  const CHAIN_ID_HEX = (opts?.chainIdHex ?? ('0x38')) as `0x${string}`;
  const autoEnsure = opts?.autoEnsureBSC ?? true;

  // 1) Отримуємо EIP-1193 провайдера: injected або через WalletConnect
  let eip: Eip1193Provider | any = (window as any).ethereum;
  if (!eip) {
    try { eip = await connectWallet(); } catch { /* no-op */ }
  }
  if (!eip || typeof eip.request !== 'function') return; // немає чого шімити

  // 2) Прапорець підключення + слухачі
  let connected = false;
  try {
    if (typeof eip.isConnected === 'function') connected = !!eip.isConnected();
  } catch {}
  try { eip.on?.('connect', () => { connected = true; }); } catch {}

  // 3) ensureConnected: викликає connect() якщо є, і робить eth_requestAccounts
  const ensureConnected = async () => {
    try {
      if (typeof eip.connect === 'function' && !connected) {
        await eip.connect(); connected = true;
      }
    } catch {}
    try { await eip.request({ method: 'eth_requestAccounts' }); } catch {}
    if (autoEnsure) {
      try {
        await eip.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
        await waitForChain(eip, CHAIN_ID_HEX);
      } catch {}
    }
  };

  // 4) Обгортаємо request()
  const originalRequest = eip.request.bind(eip);
  let inFlight = false;

  eip.request = async (args: ReqArgs) => {
    // запам'ятаємо для дебагу
    (eip as any).__lastMethod = args?.method;

    // не викликаємо connect рекурсивно для eth_requestAccounts
    if (!inFlight && args?.method !== 'eth_requestAccounts') {
      inFlight = true;
      try { await ensureConnected(); } finally { inFlight = false; }
    }

    try {
      return await originalRequest(args);
    } catch (err: any) {
      // якщо гаманець просить connect() — спробуємо один auto-retry після ensureConnected
      const msg = String(err?.message || err);
      if (/connect\(\)\s*before\s*request\(\)/i.test(msg)) {
        try {
          await ensureConnected();
          return await originalRequest(args);
        } catch (e2) { throw e2; }
      }
      throw err;
    }
  };

  // 5) Прописуємо у window.ethereum (не ламаючи існуючі імпорти)
  (window as any).ethereum = eip;
}
