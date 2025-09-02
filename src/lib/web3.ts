// src/lib/web3.ts — сумісний з ethers v5 і експортує драфт-функції для ScenarioForm

import { ethers } from 'ethers';
import MetaMaskSDK from '@metamask/sdk';

// ---------------------- BSC ----------------------
const BSC_CHAIN_ID_HEX = '0x38';
const BSC_PARAMS = {
  chainId: BSC_CHAIN_ID_HEX,
  chainName: 'Binance Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: ['https://bsc-dataseed.binance.org/'],
  blockExplorerUrls: ['https://bscscan.com/'],
};

// ---------------------- SDK ----------------------
let _sdk: MetaMaskSDK | null = null;
let _sdkProvider: any | null = null;

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function getSdkProvider() {
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
  return _sdkProvider;
}

// ---------------------- Web3 (ethers v5) ----------------------
export async function getProvider(): Promise<ethers.providers.Web3Provider> {
  const base =
    (window as any).ethereum ||
    (isMobile() ? await getSdkProvider() : null);

  if (!base) throw new Error('MetaMask provider is not available.');
  return new ethers.providers.Web3Provider(base, 'any');
}

export async function requestAccounts(): Promise<string[]> {
  const provider = await getProvider();
  const ethereum = (provider.provider as any) || (window as any).ethereum;
  return await ethereum.request({ method: 'eth_requestAccounts' });
}

export async function ensureBSC(): Promise<void> {
  const provider = await getProvider();
  const ethereum = (provider.provider as any) || (window as any).ethereum;

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

// ---------------------- ScenarioForm draft helpers ----------------------
// Щоб не правити імпорт у ScenarioForm.tsx, експортуємо тут.
// Працюють через localStorage. Можна викликати з uid або без.
export type ScenarioDraft = {
  description?: string;
  donation_amount_usdt?: number | null;
};

const DKEY = (uid?: string) => (uid ? `scenario_draft:${uid}` : 'scenario_draft');

export async function saveScenarioFormDraft(a: any, b?: any) {
  let uid: string | undefined;
  let data: ScenarioDraft;

  if (typeof a === 'string') { uid = a; data = b || {}; }
  else { data = a || {}; }

  try { localStorage.setItem(DKEY(uid), JSON.stringify(data)); } catch {}
}

export async function loadScenarioFormDraft(a?: any): Promise<ScenarioDraft | null> {
  const uid = typeof a === 'string' ? a : undefined;
  try {
    const raw = localStorage.getItem(DKEY(uid));
    return raw ? (JSON.parse(raw) as ScenarioDraft) : null;
  } catch {
    return null;
  }
}

// Залишено як заглушка, щоб не ламати існуючі виклики
export async function syncScenarioForm() { /* no-op */ }

export async function clearScenarioFormDraft(a?: any) {
  const uid = typeof a === 'string' ? a : undefined;
  try { localStorage.removeItem(DKEY(uid)); } catch {}
}
