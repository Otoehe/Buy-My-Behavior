// src/lib/providerBridge.ts
import { ethers } from 'ethers';

function getEthereum(): any {
  const w = window as any;
  const eth = w.ethereum?.providers?.find((p: any) => p.isMetaMask) || w.ethereum;
  return eth ?? null;
}

export async function ensureConnectedAndChain(chainIdHex = '0x38') {
  const eth = getEthereum();
  if (!eth) throw new Error('MetaMask не знайдено');

  // 1) Під’єднати акаунт
  try {
    await eth.request({ method: 'eth_requestAccounts' });
  } catch (err: any) {
    // -32002 => "request already pending"
    if (err?.code === -32002) throw new Error('Відкрий MetaMask і заверши активний запит під’єднання');
    throw err;
  }

  // 2) Перемкнутись на BSC (0x38), додати якщо нема
  const cur = await eth.request({ method: 'eth_chainId' });
  if (cur !== chainIdHex) {
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
    } catch (e: any) {
      if (e?.code === 4902) {
        // ланцюг не доданий – додаємо і ще раз свічимо
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chainIdHex,
            chainName: 'BNB Smart Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: ['https://bsc-dataseed.binance.org/'],
            blockExplorerUrls: ['https://bscscan.com'],
          }],
        });
        await eth.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
      } else {
        throw e;
      }
    }
  }

  // 3) Повертаємо signer
  const provider = new ethers.providers.Web3Provider(eth, 'any');
  return provider.getSigner();
}
