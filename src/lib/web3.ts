// src/lib/web3.ts
import { ethers } from 'ethers';

declare global {
  interface Window {
    ethereum?: any;
  }
}

let _provider: ethers.providers.Web3Provider | null = null;

/** Отримати MetaMask-провайдер або кинути помилку */
export function getProvider(): ethers.providers.Web3Provider {
  if (_provider) return _provider;
  if (typeof window !== 'undefined' && window.ethereum) {
    _provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
    return _provider;
  }
  throw new Error('MetaMask не знайдено. Установіть/увімкніть розширення.');
}

/** Повертає signer; запитує доступ до акаунтів за потреби */
export async function getSigner(): Promise<ethers.Signer> {
  const provider = getProvider();
  await provider.send('eth_requestAccounts', []);
  return provider.getSigner();
}

/** Чи підключений гаманець */
export async function isWalletConnected(): Promise<boolean> {
  try {
    const provider = getProvider();
    const accs = await provider.listAccounts();
    return accs.length > 0;
  } catch {
    return false;
  }
}

/** Перемкнути мережу на BSC (56). Додати, якщо її немає. */
export async function switchToBSC(): Promise<void> {
  const eth = window.ethereum;
  if (!eth?.request) return;
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x38' }], // 56
    });
  } catch (e: any) {
    if (e?.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x38',
          chainName: 'Binance Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com'],
        }],
      });
    } else {
      throw e;
    }
  }
}

/* ------------------ Чернетка ScenarioForm у localStorage ------------------ */

const DRAFT_KEYS = ['scenario_form_draft', 'scenario_draft', 'ScenarioFormDraft'];

/** Видалити чернетку */
export function clearScenarioFormDraft(): void {
  try {
    DRAFT_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Зберегти чернетку (опційно використовуй у формі) */
export function saveScenarioFormDraft(obj: any): void {
  try {
    localStorage.setItem('scenario_form_draft', JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

/** Прочитати чернетку */
export function loadScenarioFormDraft<T = any>(): T | null {
  try {
    const raw =
      localStorage.getItem('scenario_form_draft') ||
      localStorage.getItem('scenario_draft') ||
      localStorage.getItem('ScenarioFormDraft');
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Легасі-місток, якого очікує ScenarioForm.tsx.
 * Просто мержить часткові зміни в чернетку, щоб не ламати існуючі імпорти.
 */
export async function syncScenarioForm(partial?: Record<string, unknown>): Promise<void> {
  try {
    if (!partial) return;
    const prev = loadScenarioFormDraft<Record<string, unknown>>() || {};
    saveScenarioFormDraft({ ...prev, ...partial });
  } catch {
    /* ignore */
  }
}

/** Зручний default-експорт (де-не-де можуть імпортувати як web3) */
const web3 = {
  getProvider,
  getSigner,
  isWalletConnected,
  switchToBSC,
  clearScenarioFormDraft,
  saveScenarioFormDraft,
  loadScenarioFormDraft,
  syncScenarioForm,
};

export default web3;
