// src/lib/escrowMobile.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumber, ethers } from 'ethers';
import { connectWallet, ensureBSC, type Eip1193Provider } from './providerBridge';
import { ensureAllowance, fetchTokenDecimals, toUnits } from './erc20';

// === ENV ===
export const USDT_ADDRESS   = (import.meta as any).env?.VITE_USDT_ADDRESS as string;
export const ESCROW_ADDRESS = (import.meta as any).env?.VITE_ESCROW_ADDRESS as string;

if (!USDT_ADDRESS)  console.warn('[BMB] VITE_USDT_ADDRESS is empty');
if (!ESCROW_ADDRESS) console.warn('[BMB] VITE_ESCROW_ADDRESS is empty');

// Мінімальний ABI згідно з вашою підтвердженою сигнатурою
// lockFunds(bytes32 scenarioId,address executor,address referrer,uint256 amount,uint256 executionTime)
const ESCROW_ABI = [
  'function lockFunds(bytes32 scenarioId,address executor,address referrer,uint256 amount,uint256 executionTime) payable',
];

/** Нормалізація scenarioId до bytes32:
 * - Якщо вже hex 0x...64 символи — лишаємо як є
 * - Інакше — робимо keccak256 від вхідного рядка (стабільна 32-байтна ідентифікація)
 */
function normalizeScenarioId(input: string): string {
  const hex32 = /^0x[0-9a-fA-F]{64}$/;
  if (hex32.test(input)) return input;
  return ethers.utils.id(input); // keccak256(utf8)
}

export type LockFundsParams = {
  /** bytes32 або довільний рядок, який ми перетворимо на bytes32 */
  scenarioId: string;
  /** Адреса виконавця */
  executor: string;
  /** Адреса реферала або null/undefined, якщо немає */
  referrer?: string | null;
  /** Сума в USDT (людський вигляд: "10.5" або number) */
  amount: string | number;
  /** Unix-час (секунди) коли настане момент "можна підтверджувати виконання" */
  executionTime: number;
  /** onStatus — необов’язковий колбек для оновлення UI статусів */
  onStatus?: (status:
    | 'connecting'
    | 'ensuring_chain'
    | 'checking_allowance'
    | 'approving'
    | 'locking'
    | 'done'
  , payload?: any) => void;
  /** Скільки конфірмів чекати для approve/lock (1 за замовчуванням) */
  waitConfirms?: number;
};

export type LockFundsResult = {
  address: string;                 // адреса платника (замовника)
  approveTxHash?: string;          // хеш approve, якщо був
  lockTxHash: string;              // хеш lockFunds
  lockReceipt: ethers.providers.TransactionReceipt;
  amountUnits: BigNumber;          // сума у найменших одиницях USDT
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

  // 1) Конектимо гаманець і гарантуємо правильну мережу
  onStatus?.('connecting');
  const { signer, address, ethersProvider } = await connectWallet();

  onStatus?.('ensuring_chain');
  await ensureBSC(); // використовує той самий провайдер з connectWallet()

  // 2) Рахуємо десятковість та amount у найменших одиницях
  const decimals = await fetchTokenDecimals(USDT_ADDRESS, ethersProvider);
  const amountUnits = toUnits(amount as any, decimals);

  // 3) Перевіряємо/забезпечуємо allowance (approve за потреби)
  onStatus?.('checking_allowance');
  const allowanceRes = await ensureAllowance({
    token: USDT_ADDRESS,
    spender: ESCROW_ADDRESS,
    owner: address,
    amount: amountUnits,
    signer,
    approveMax: false,       // схвалюємо рівно потрібну суму
    waitConfirms,
  });

  let approveTxHash: string | undefined = undefined;
  if (allowanceRes.didApprove) {
    onStatus?.('approving', { txHash: allowanceRes.txHash });
    approveTxHash = allowanceRes.txHash;
  }

  // 4) Викликаємо lockFunds на EscrowBMB
  const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  const scenarioIdBytes32 = normalizeScenarioId(scenarioId);
  const ref = (referrer && referrer !== '0x0000000000000000000000000000000000000000')
    ? referrer
    : '0x0000000000000000000000000000000000000000';

  onStatus?.('locking');
  const tx = await escrow.lockFunds(
    scenarioIdBytes32,
    executor,
    ref,
    amountUnits,
    Math.floor(executionTime), // у секундах
    { value: 0 }               // USDT — без нативного value
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
