/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers, BigNumber } from 'ethers';
import { ensureBSC, connectWallet, ensureProviderOrDeepLink, waitForReturn, toBytes32, isInsideMetaMaskApp } from './providerBridge';
import * as escrowModule from './escrowContract';

export const USDT_ADDRESS   = import.meta.env.VITE_USDT_ADDRESS   as string;
export const ESCROW_ADDRESS = import.meta.env.VITE_ESCROW_ADDRESS as string;
const USDT_DECIMALS = Number(import.meta.env.VITE_USDT_DECIMALS ?? 18);

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)'
];

/** ВАЖЛИВО: сигнатура із executionTime */
const ESCROW_MIN_ABI = [
  'function lockFunds(bytes32 scenarioId,address executor,address referrer,uint256 amount,uint256 executionTime) payable'
];

type LockFlowOptions = {
  scenarioId: string;
  amount: string | number;
  executor: string;
  referrer?: string | null;
  executionTime?: number; // unix seconds
  onStatus?: (s: string) => void;
  onHash?: (txHash: string) => void;
  onReceipt?: (rcpt: any) => void;
  saveTxHash?: (txHash: string) => Promise<void>;
};

async function approveIfNeeded(signer: ethers.Signer, owner: string, spender: string, amountWei: BigNumber, onStatus?: (s: string)=>void) {
  const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
  const allowance: BigNumber = await usdt.allowance(owner, spender);
  if (allowance.gte(amountWei)) return;

  onStatus?.('Requesting USDT approval…');
  const tx = await usdt.approve(spender, amountWei);
  onStatus?.('USDT approve sent. Waiting…');
  const rcpt = await tx.wait(1);
  onStatus?.('USDT approved.');
  return rcpt;
}

function toWei(amount: string | number): BigNumber {
  return ethers.utils.parseUnits(String(amount), USDT_DECIMALS);
}

export async function lockFundsMobileFlow(opts: LockFlowOptions): Promise<string> {
  const { scenarioId, amount, executor } = opts;
  const referrer = opts.referrer ?? ethers.constants.AddressZero;
  const executionTime = opts.executionTime ?? Math.floor(Date.now() / 1000) + 3600; // fallback 1h

  // 1) Провайдер або deeplink
  try {
    ensureProviderOrDeepLink();
  } catch (e: any) {
    if (e?.code === 'DEEPLINKED') {
      return Promise.reject(e);
    }
    throw e;
  }

  // 2) Конект і мережа
  const { provider, web3, signer, address } = await connectWallet();
  await ensureBSC(provider);

  // 3) Баланси/approve
  const amountWei = toWei(amount);
  await approveIfNeeded(signer, address, ESCROW_ADDRESS, amountWei, opts.onStatus);

  // 4) Спробувати рідну обгортку з escrowContract з executionTime
  const tryWrapperThenFallback = async (): Promise<string> => {
    const maybeLock = (escrowModule as any)?.lockFunds;

    if (typeof maybeLock === 'function') {
      try {
        opts.onStatus?.('Submitting lockFunds via wrapper…');
        const tx = await maybeLock({
          amount,
          scenarioId,
          executorId: undefined,
          referrerWallet: referrer,
          executionTime,
        });
        opts.onHash?.(tx.hash);
        const rcpt = await tx.wait(1);
        opts.onReceipt?.(rcpt);
        await opts.saveTxHash?.(tx.hash);
        opts.onStatus?.('Escrow locked.');
        return tx.hash;
      } catch {
        // fall to ABI
      }
    }

    // 5) Fallback: прямий виклик з правильними 5 аргументами
    const b32 = toBytes32(scenarioId);
    const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_MIN_ABI, signer);
    opts.onStatus?.('Submitting lockFunds via fallback…');
    const tx = await escrow.lockFunds(b32, executor, referrer, amountWei, executionTime, { value: 0 });
    opts.onHash?.(tx.hash);
    const rcpt = await tx.wait(1);
    opts.onReceipt?.(rcpt);
    await opts.saveTxHash?.(tx.hash);
    opts.onStatus?.('Escrow locked.');
    return tx.hash;
  };

  const hash = await tryWrapperThenFallback();

  // 6) Повернення з MetaMask (для iOS/Android браузерів поза in-app)
  if (!isInsideMetaMaskApp()) {
    await waitForReturn(120000, 700);
  }
  return hash;
}
