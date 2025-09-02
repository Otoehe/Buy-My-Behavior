// 📄 src/lib/web3.ts
import { ethers } from 'ethers';
import MetaMaskSDK from '@metamask/sdk';

// ───────────────────────────────────────────────────────────
// BSC connection helpers (як і було)
const BSC_CHAIN_ID_HEX = '0x38'; // 56
const BSC_PARAMS = {
  chainId: BSC_CHAIN_ID_HEX,
  chainName: 'Binance Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: ['https://bsc-dataseed.binance.org/'],
  blockExplorerUrls: ['https://bscscan.com/'],
};

let _sdk: MetaMaskSDK | null = null;
let _sdkProvider: any | null = null;

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(
    typeof navigator !== 'undefined' ? navigator.userAgent : ''
  );
}

export async function getProvider(): Promise<ethers.BrowserProvider> {
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    return new ethers.BrowserProvider((window as any).ethereum, 'any');
  }

  if (typeof window !== 'undefined' && isMobile()) {
    if (!_sdk) {
      _sdk = new MetaMaskSDK({
        dappMetadata: {
          name: 'Buy My Behavior',
          url: typeof window !== 'undefined' ? window.location.origin : '',
        },
        checkInstallationImmediately: false,
        communicationLayerPreference: 'webrtc',
        shouldShimWeb3: false,
        useDeeplink: true,
        preferDesktop: false,
      });
    }
    if (!_sdkProvider) {
      _sdkProvider = _sdk.getProvider();
    }
    return new ethers.BrowserProvider(_sdkProvider as any, 'any');
  }

  throw new Error('MetaMask provider is not available.');
}

export async function requestAccounts(): Promise<string[]> {
  const provider = await getProvider();
  // @ts-ignore
  const ethereum = (provider as any).provider || (typeof window !== 'undefined' ? (window as any).ethereum : null);
  if (!ethereum) return [];
  return await ethereum.request({ method: 'eth_requestAccounts' });
}

export async function ensureBSC(): Promise<void> {
  const provider = await getProvider();
  // @ts-ignore
  const ethereum = (provider as any).provider || (typeof window !== 'undefined' ? (window as any).ethereum : null);
  if (!ethereum) return;

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BSC_CHAIN_ID_HEX }],
    });
  } catch (err: any) {
    if (err?.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [BSC_PARAMS],
      });
    } else {
      throw err;
    }
  }
}

export async function getSigner(): Promise<ethers.Signer> {
  const provider = await getProvider();
  await ensureBSC();
  await requestAccounts();
  return await provider.getSigner();
}

// ───────────────────────────────────────────────────────────
// ✅ Draft helpers for ScenarioForm (саме їх не вистачало)
//    Прості збереження чернетки у localStorage
//    Безпечні для SSR/білда — перевіряємо window/localStorage
// ───────────────────────────────────────────────────────────

type Draft = Record<string, any>;
const DRAFT_KEY = 'scenario_form_draft_v1';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** Завантажити чернетку форми сценарію з localStorage */
export function loadScenarioFormDraft<T extends Draft = Draft>(): T | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Зберегти чернетку форми сценарію в localStorage */
export function saveScenarioFormDraft<T extends Draft = Draft>(draft: T): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota errors */
  }
}

/** Очистити чернетку */
export function clearScenarioFormDraft(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Синхронізація стану форми з чернеткою:
 * повертає оновлений об’єкт, збережений у storage.
 * Виклик зручний типу: setState(prev => syncScenarioForm(prev, patch))
 */
export function syncScenarioForm<T extends Draft = Draft>(
  prevDraft: T | null | undefined,
  patch: Partial<T>
): T {
  const next = { ...(prevDraft || ({} as T)), ...(patch as T) } as T;
  saveScenarioFormDraft(next);
  return next;
}
