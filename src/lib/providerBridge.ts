import MetaMaskSDK from '@metamask/sdk';

const APP_URL  = (import.meta as any).env?.VITE_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
const APP_NAME = (import.meta as any).env?.VITE_APP_NAME || 'Buy My Behavior';
const BSC_RPC  = (import.meta as any).env?.VITE_BSC_RPC || 'https://bsc-dataseed.binance.org';

let _sdk: MetaMaskSDK | null = null;
let _provider: any | null = null;

function hasWindow() { return typeof window !== 'undefined'; }

function useInjectedIfAvailable(): any | null {
  if (!hasWindow()) return null;
  const eth = (window as any).ethereum;
  if (eth && eth.isMetaMask) return eth;
  return null;
}

function ensureSDK(): { provider: any } {
  if (_provider) return { provider: _provider };

  const injected = useInjectedIfAvailable();
  if (injected) {
    _provider = injected;
    return { provider: _provider };
  }

  _sdk = new MetaMaskSDK({
    dappMetadata: { name: APP_NAME, url: APP_URL },
    logging: { developerMode: false },
    checkInstallationImmediately: false,
    storage: { enabled: true },
    // WalletConnect не використовуємо
  });
  _provider = _sdk.getProvider();
  return { provider: _provider };
}

export async function connectWallet(): Promise<{ provider: any; accounts: string[]; chainId: string }> {
  const { provider } = ensureSDK();
  const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
  const chainId: string = await provider.request({ method: 'eth_chainId' });
  return { provider, accounts, chainId };
}

export async function ensureBSC(provider?: any) {
  const eth = provider ?? ensureSDK().provider;
  const chainId: string = await eth.request({ method: 'eth_chainId' });
  if (chainId === '0x38') return;

  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x38' }],
    });
  } catch (err: any) {
    if (err?.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x38',
          chainName: 'BNB Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: [BSC_RPC],
          blockExplorerUrls: ['https://bscscan.com']
        }]
      });
    } else {
      throw err;
    }
  }
}

/** Чекаємо повернення з MetaMask (visibility/focus). */
export function waitForReturn(timeoutMs = 15000): Promise<void> {
  if (!hasWindow()) return Promise.resolve();
  if (document.visibilityState === 'visible') return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const onVis = () => {
      if (document.visibilityState === 'visible') { cleanup(); resolve(); }
    };
    const onFocus = () => { cleanup(); resolve(); };
    const t = setTimeout(() => { cleanup(); reject(new Error('Timeout:return')); }, timeoutMs);
    const cleanup = () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
  });
}
