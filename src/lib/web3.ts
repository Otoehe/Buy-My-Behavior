// 📄 src/lib/web3.ts — v5-compatible + form-draft helpers

import { ethers } from 'ethers';
import MetaMaskSDK from '@metamask/sdk';

const BSC_CHAIN_ID_HEX = '0x38'; // 56
const BSC_PARAMS = {
  chainId: BSC_CHAIN_ID_HEX,
  chainName: 'Binance Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: ['https://bsc-dataseed.binance.org/'],
  blockExplorerUrls: ['https://bscscan.com/'],
} as const;

// ---------------- Form draft helpers (вимагає ScenarioForm.tsx)
const DRAFT_KEY = 'scenario_form_draft';

type Draft = {
  description?: string;
  price?: string;
  date?: string;
  time?: string;
};

export function saveScenarioFormDraft(partial: Draft) {
  if (typeof window === 'undefined') return;
  const prev: Draft = loadScenarioFormDraft() || {};
  const next = { ...prev, ...partial };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
}

export function loadScenarioFormDraft(): Draft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function syncScenarioForm(field: keyof Draft, value: string) {
  saveScenarioFormDraft({ [field]: value } as Draft);
}

export function clearScenarioFormDraft() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DRAFT_KEY);
}

// ---------------- MetaMask / ethers v5

let _sdk: MetaMaskSDK | null = null;
let _sdkProvider: any | null = null;

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export async function getProvider(): Promise<ethers.providers.Web3Provider> {
  if (typeof window === 'undefined') {
    throw new Error('Window is not available');
  }

  // звичайний інжектed провайдер
  const anyWin = window as any;
  if (anyWin.ethereum) {
    return new ethers.providers.Web3Provider(anyWin.ethereum, 'any');
  }

  // мобільний MetaMask SDK
  if (isMobile()) {
    if (!_sdk) {
      _sdk = new MetaMaskSDK({
        dappMetadata: { name: 'Buy My Behavior', url: window.location.origin },
        checkInstallationImmediately: false,
        communicationLayerPreference: 'webrtc',
        shouldShimWeb3: false,
        useDeeplink: true,
        preferDesktop: false,
      });
    }
    if (!_sdkProvider) _sdkProvider = _sdk.getProvider();
    return new ethers.providers.Web3Provider(_sdkProvider as any, 'any');
  }

  throw new Error('MetaMask provider is not available.');
}

export async function requestAccounts(): Promise<string[]> {
  const provider = await getProvider();
  // у v5 .provider — це оригінальний інжектed провайдер
  const ethereum = (provider as any).provider || (window as any).ethereum;
  return await ethereum.request({ method: 'eth_requestAccounts' });
}

export async function ensureBSC(): Promise<void> {
  const provider = await getProvider();
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
  return provider.getSigner();
}
