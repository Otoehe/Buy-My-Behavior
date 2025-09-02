// src/lib/web3.ts — сумісно з ethers v5
import { ethers } from 'ethers';
import MetaMaskSDK from '@metamask/sdk';

const BSC_CHAIN_ID_HEX = '0x38';
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
