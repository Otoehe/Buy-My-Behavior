// src/lib/providerBridge.ts
import MetaMaskSDK from '@metamask/sdk';
import { ethers } from 'ethers';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'Buy My Behavior';
const APP_URL  = import.meta.env.VITE_PUBLIC_APP_URL || 'https://www.buymybehavior.com';

// chainId → hex
function toHexChainId(val: string | number) {
  if (typeof val === 'string' && val.startsWith('0x')) return val.toLowerCase();
  const num = typeof val === 'string' ? Number(val) : val;
  return '0x' + num.toString(16);
}

const TARGET_CHAIN_HEX = toHexChainId(import.meta.env.VITE_CHAIN_ID || 56); // 56 → 0x38
const RPC_URL = import.meta.env.VITE_BSC_RPC || 'https://bsc-dataseed.binance.org';

let mmSdk: MetaMaskSDK | null = null;

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
const hasInjectedMM = () => typeof (window as any).ethereum !== 'undefined';

/**
 * Піднімаємо MetaMask SDK тільки коли треба (мобілка без injected провайдера)
 */
function getOrCreateSdk() {
  if (mmSdk) return mmSdk;
  mmSdk = new MetaMaskSDK({
    dappMetadata: { name: APP_NAME, url: APP_URL },
    useDeeplink: true,
    preferDeepLink: true, // відкриває саме додаток MetaMask
    checkInstallationImmediately: false,
    logging: { developerMode: false }
  });
  return mmSdk;
}

/**
 * 1) Конект до гаманця:
 *    - desktop: використовуємо injected window.ethereum
 *    - mobile: через MetaMask SDK робимо deeplink у додаток і повертаємось назад
 */
export async function connectWallet() {
  if (typeof window === 'undefined') throw new Error('No window');

  let ethereum: any = (window as any).ethereum;

  if (!ethereum && isMobile()) {
    const sdk = getOrCreateSdk();
    ethereum = sdk.getProvider();
    (window as any).ethereum = ethereum;
  }

  if (!ethereum) throw new Error('MetaMask не знайдено. Встановіть розширення/додаток.');

  // запит на підключення
  await ethereum.request({ method: 'eth_requestAccounts' });

  return { provider: ethereum as any };
}

/**
 * 2) Перемикаємо мережу на BNB Smart Chain (0x38), додаємо якщо нема
 */
export async function ensureBSC(provider?: any) {
  const eth = provider || (window as any).ethereum;
  if (!eth) throw new Error('Provider відсутній');

  let cur: string | undefined;
  try { cur = await eth.request({ method: 'eth_chainId' }); } catch {}

  if (cur && cur.toLowerCase() === TARGET_CHAIN_HEX) return eth;

  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: TARGET_CHAIN_HEX }]
    });
  } catch (err: any) {
    // 4902 – мережа не додана в гаманець
    if (err?.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: TARGET_CHAIN_HEX,
          chainName: 'BNB Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: ['https://bscscan.com']
        }]
      });
    } else {
      throw err;
    }
  }
  return eth;
}

/**
 * 3) Зручний хелпер для ethers.js
 */
export function getEthers() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error('Provider відсутній');
  const provider = new ethers.providers.Web3Provider(eth, 'any');
  const signer = provider.getSigner();
  return { provider, signer, eth };
}
