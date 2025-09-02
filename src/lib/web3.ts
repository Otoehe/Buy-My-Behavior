// 📄 src/lib/web3.ts
import { ethers } from 'ethers';
import MetaMaskSDK from '@metamask/sdk';

// ─────────────────────────────────────────────
// BSC network params
// ─────────────────────────────────────────────
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
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ─────────────────────────────────────────────
// Provider / Signer
// ─────────────────────────────────────────────
export async function getProvider(): Promise<ethers.BrowserProvider> {
  if ((window as any).ethereum) {
    return new ethers.BrowserProvider((window as any).ethereum, 'any');
  }

  if (isMobile()) {
    if (!_sdk) {
      _sdk = new MetaMaskSDK({
        dappMetadata: {
          name: 'Buy My Behavior',
          url: window.location.origin,
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
  const ethereum = (provider as any).provider || (window as any).ethereum;
  return await ethereum.request({ method: 'eth_requestAccounts' });
}

export async function ensureBSC(): Promise<void> {
  const provider = await getProvider();
  // @ts-ignore
  const ethereum = (provider as any).provider || (window as any).ethereum;

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

// ─────────────────────────────────────────────
// ScenarioForm draft helpers
// (Потрібні для src/components/ScenarioForm.tsx)
// Безпечні для SSR: не чіпають window/localStorage під час імпорту
// ─────────────────────────────────────────────
export type ScenarioFormDraft = Record<string, any>;
const SCENARIO_FORM_DRAFT_KEY = 'scenario_form_draft_v1';

export function saveScenarioFormDraft(draft: ScenarioFormDraft): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SCENARIO_FORM_DRAFT_KEY, JSON.stringify(draft));
  } catch {}
}

export function loadScenarioFormDraft<T = ScenarioFormDraft>(): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SCENARIO_FORM_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearScenarioFormDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SCENARIO_FORM_DRAFT_KEY);
  } catch {}
}

/**
 * syncScenarioForm:
 * 1) Одноразово підтягує чернетку (onLoad),
 * 2) Далі раз на intervalMs зберігає getCurrent()
 * Повертає cleanup().
 */
export function syncScenarioForm<T = ScenarioFormDraft>(
  getCurrent: () => T,
  onLoad?: (draft: T) => void,
  intervalMs = 1500
): () => void {
  if (typeof window === 'undefined') return () => {};

  const draft = loadScenarioFormDraft<T>();
  if (draft && onLoad) onLoad(draft);

  const save = () => {
    try { saveScenarioFormDraft(getCurrent()); } catch {}
  };

  const id = window.setInterval(save, intervalMs);
  const beforeUnload = () => save();
  window.addEventListener('beforeunload', beforeUnload);

  return () => {
    clearInterval(id);
    window.removeEventListener('beforeunload', beforeUnload);
  };
}
