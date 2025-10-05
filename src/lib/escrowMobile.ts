// src/lib/escrowMobile.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumber, ethers } from 'ethers';
import { connectWallet, ensureBSC } from './providerBridge';
import { ensureAllowance, fetchTokenDecimals, toUnits } from './erc20';

// === ENV ===
export const USDT_ADDRESS   = (import.meta as any).env?.VITE_USDT_ADDRESS as string;
export const ESCROW_ADDRESS = (import.meta as any).env?.VITE_ESCROW_ADDRESS as string;

if (!USDT_ADDRESS)  console.warn('[BMB] VITE_USDT_ADDRESS is empty');
if (!ESCROW_ADDRESS) console.warn('[BMB] VITE_ESCROW_ADDRESS is empty');

// lockFunds(bytes32 scenarioId,address executor,address referrer,uint256 amount,uint256 executionTime) payable
const ESCROW_ABI = [
  'function lockFunds(bytes32 scenarioId,address executor,address referrer,uint256 amount,uint256 executionTime) payable',
];

/** Перетворення scenarioId → bytes32:
 * - якщо вже 0x...64 — лишаємо
 * - інакше keccak256(utf8)
 */
function normalizeScenarioId(input: string): string {
  const hex32 = /^0x[0-9a-fA-F]{64}$/;
  if (hex32.test(input)) return input;
  return ethers.utils.id(input);
}

export type LockFundsParams = {
  scenarioId: string;          // bytes32 або рядок — буде перетворено
  executor: string;            // адреса виконавця
  referrer?: string | null;    // 0x0 якщо немає
  amount: string | number;     // людський USDT (наприклад "10.5")
  executionTime: number;       // unix seconds
  onStatus?: (
    status:
      | 'connecting'
      | 'ensuring_chain'
      | 'checking_allowance'
      | 'approving'
      | 'locking'
      | 'done',
    payload?: any
  ) => void;
  waitConfirms?: number;       // 1 за замовчуванням
};

export type LockFundsResult = {
  address: string;                 // платник (замовник)
  approveTxHash?: string;          // якщо було approve
  lockTxHash: string;              // tx hash lockFunds
  lockReceipt: ethers.providers.TransactionReceipt;
  amountUnits: BigNumber;          // у найменших одиницях
  decimals: number;                // десятковість USDT
};

export async function lockFundsMobileFlow(params: LockFundsParams): Promise<LockFundsResult> {
  const {
    scenarioId,
    executor,
    referrer,
    amount,
    executionTime,
    onStatus,
    waitConfirms = 1,
  } = params;

  if (!USDT_ADDRESS || !ESCROW_ADDRESS) {
    throw new Error('Missing USDT/ESCROW address in env');
  }

  // 1) Конектимо гаманець (MetaMask only) і гарантуємо правильну мережу
  onStatus?.('connecting');
  const { provider, accounts } = await connectWallet();
  if (!provider || typeof (provider as any).request !== 'function') {
    throw new Error('Гаманець не готовий. Відкрийте MetaMask, підтвердіть підключення і спробуйте ще раз.');
  }

  onStatus?.('ensuring_chain');
  await ensureBSC(provider); // ✅ важливо: передаємо provider у ensureBSC

  // 2) Будуємо ethers обгортку і signer
  const ethersProvider = new ethers.providers.Web3Provider(provider as any, 'any');
  const signer = ethersProvider.getSigner();
  const address = (accounts?.[0] ?? (await signer.getAddress())).toLowerCase();

  // 3) Десятковість та amount у найменших одиницях
  const decimals = await fetchTokenDecimals(USDT_ADDRESS, ethersProvider);
  const amountUnits = toUnits(amount as any, decimals);

  // 4) allowance → approve (за потреби рівно на суму)
  onStatus?.('checking_allowance');
  const allowanceRes = await ensureAllowance({
    token: USDT_ADDRESS,
    spender: ESCROW_ADDRESS,
    owner: address,
    amount: amountUnits,
    signer,
    approveMax: false,
    waitConfirms,
  });

  let approveTxHash: string | undefined;
  if (allowanceRes.didApprove) {
    onStatus?.('approving', { txHash: allowanceRes.txHash });
    approveTxHash = allowanceRes.txHash;
  }

  // 5) Викликаємо lockFunds(...)
  const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  const scenarioIdBytes32 = normalizeScenarioId(scenarioId);
  const ZERO = '0x0000000000000000000000000000000000000000';
  const ref  = referrer && referrer !== ZERO ? referrer : ZERO;

  onStatus?.('locking');
  const tx = await escrow.lockFunds(
    scenarioIdBytes32,
    executor,
    ref,
    amountUnits,
    Math.floor(executionTime),
    { value: 0 } // USDT — без нативного value
  );
  const receipt = await tx.wait(waitConfirms);

  onStatus?.('done', { txHash: receipt.transactionHash });

  return {
    address,
    approveTxHash,
    lockTxHash: receipt.transactionHash,
    lockReceipt: receipt,
    amountUnits,
    decimals,
  };
}
