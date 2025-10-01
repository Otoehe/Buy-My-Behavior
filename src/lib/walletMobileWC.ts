/* eslint-disable @typescript-eslint/no-explicit-any */
import EthereumProvider from '@walletconnect/ethereum-provider';

let _providerReady = false;

/**
 * Ініціалізує WalletConnect v2 як window.ethereum на мобільному.
 * На Android/iOS відкриє MetaMask автоматично (deeplink), без "Chrome або MetaMask?".
 */
export async function ensureMobileWalletProvider(): Promise<void> {
  if (_providerReady) return;

  const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string;
  if (!projectId) throw new Error('В env немає VITE_WALLETCONNECT_PROJECT_ID');

  const provider = await EthereumProvider.init({
    projectId,
    chains: [56],            // BSC mainnet
    methods: [
      'eth_requestAccounts','eth_accounts','eth_chainId','wallet_switchEthereumChain',
      'wallet_addEthereumChain','eth_sendTransaction','eth_sign','personal_sign'
    ],
    optionalMethods: ['eth_signTypedData','eth_signTypedData_v4'],
    showQrModal: false,
    metadata: {
      name: 'Buy My Behavior',
      description: 'BMB',
      url: window.location.origin,
      icons: [window.location.origin + '/icon.png'],
    }
  });

  await provider.connect();
  (window as any).ethereum = provider as any;

  _providerReady = true;
}
