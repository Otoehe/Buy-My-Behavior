// 📄 src/lib/web3.ts — ethers v5 сумісний
import { ethers } from 'ethers';
import MetaMaskSDK from '@metamask/sdk';

const BSC_CHAIN_ID_HEX = '0x38'; // 56
const BSC_PARAMS = {
  chainId: BSC_CHAIN_ID_HEX,
  chainName: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: ['https://bsc-dataseed.binance.org/'],
  blockExplorerUrls: ['https://bscscan.com/'],
};

let _sdk: MetaMaskSDK | null = null;
let _sdkProvider: any | null = null;

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function pickInjectedProvider(): any | null {
  const eth: any = (window as any).ethereum;
  if (!eth) return null;
  if (eth.providers?.length) {
    const mm = eth.providers.find((p: any) => p?.isMetaMask);
    return mm || eth.providers[0];
  }
  return eth;
}

/** ethers v5: повертаємо Web3Provider */
export async function getProvider(): Promise<ethers.providers.Web3Provider> {
  const injected = pickInjectedProvider();
  if (injected) {
    return new ethers.providers.Web3Provider(injected, 'any');
  }

  // мобільний сценарій — MetaMask SDK
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

/** ethers v5: повертаємо Signer від Web3Provider */
export async function getSigner(): Promise<ethers.Signer> {
  const provider = await getProvider();
  await ensureBSC();
  await requestAccounts();
  return provider.getSigner();
}

/* -----------------------------------------------------------
   ДРАФТ ФОРМИ СЦЕНАРІЮ (щоб виправити імпорти в ScenarioForm)
----------------------------------------------------------- */
const DRAFT_KEY = 'scenarioFormDraft:v1';

export type ScenarioFormDraft = {
  description?: string;
  donation_amount_usdt?: number | null;
  date?: string;
  time?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  [k: string]: any;
};

export function saveScenarioFormDraft(draft: ScenarioFormDraft): void {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
}

export function loadScenarioFormDraft(): ScenarioFormDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as ScenarioFormDraft) : null;
  } catch {
    return null;
  }
}

/** З мерджем патчу в існуючий драфт */
export function syncScenarioForm(patch: Partial<ScenarioFormDraft>): ScenarioFormDraft {
  const current = loadScenarioFormDraft() || {};
  const next = { ...current, ...patch };
  saveScenarioFormDraft(next);
  return next;
}

export function clearScenarioFormDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}
