/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers, BigNumber } from 'ethers';
import { ensureBSC, connectWallet, ensureProviderOrDeepLink, waitForReturn, toBytes32, openMetaMaskDeepLink, isInsideMetaMaskApp } from './providerBridge';
// ⚠️ ВАЖЛИВО: ми НЕ переписуємо ваші існуючі обгортки escrowContract.
// Ми намагаємось їх використати, а за потреби маємо fallback на прямий виклик.
import * as escrowModule from './escrowContract';

export const USDT_ADDRESS   = import.meta.env.VITE_USDT_ADDRESS   as string; // e.g. 0x55d398326f99059fF775485246999027B3197955
export const ESCROW_ADDRESS = import.meta.env.VITE_ESCROW_ADDRESS as string; // your EscrowBMB
const USDT_DECIMALS = Number(import.meta.env.VITE_USDT_DECIMALS ?? 18);

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)'
];

// ⚠️ Мінімальний ABI для fallback'у. Не міняйте, якщо ваш контракт інший — краще використати ваші обгортки з escrowContract.
const ESCROW_MIN_ABI = [
  'function lockFunds(bytes32 scenarioId, address executor, address referrer, uint256 amount) returns (bool)'
];

type LockFlowOptions = {
  scenarioId: string;           // string або 0x.. bytes32
  amount: string | number;      // у USDT (людський формат), напр. "12.5"
  executor: string;             // адреса виконавця
  referrer?: string | null;     // адреса реферала або null/undefined
  onStatus?: (s: string) => void;
  onHash?: (txHash: string) => void;
  onReceipt?: (rcpt: any) => void;
  saveTxHash?: (txHash: string) => Promise<void>;
};

/** Approve USDT if needed */
async function approveIfNeeded(signer: ethers.Signer, owner: string, spender: string, amountWei: BigNumber, onStatus?: (s: string)=>void) {
  const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
  const allowance: BigNumber = await usdt.allowance(owner, spender);
  if (allowance.gte(amountWei)) return;

  onStatus?.('Requesting USDT approval in MetaMask…');
  const tx = await usdt.approve(spender, amountWei);
  onStatus?.('USDT approve submitted. Waiting for confirmation…');
  const rcpt = await tx.wait(1);
  onStatus?.('USDT approved.');
  return rcpt;
}

/** Convert "12.5" USDT to wei based on decimals (default 18 on BSC) */
function toWei(amount: string | number): BigNumber {
  return ethers.utils.parseUnits(String(amount), USDT_DECIMALS);
}

/**
 * Main mobile flow:
 * - If no provider in normal mobile browser → deeplink into MetaMask app (Dapp Browser)
 * - ensure BSC
 * - connect wallet
 * - approve USDT (if needed)
 * - lockFunds via your escrowContract wrapper; if it fails, fallback to minimal ABI
 */
export async function lockFundsMobileFlow(opts: LockFlowOptions): Promise<string> {
  const { scenarioId, amount, executor } = opts;
  const referrer = opts.referrer ?? ethers.constants.AddressZero;

  // 1) If we're NOT inside MetaMask in-app browser and provider is missing → open deeplink.
  try {
    ensureProviderOrDeepLink();
  } catch (e: any) {
    if (e?.code === 'DEEPLINKED') {
      // Give user time to switch; when they come back, continue from next press.
      return Promise.reject(e);
    }
    throw e;
  }

  // 2) Connect & ensure chain
  const { provider, web3, signer, address } = await connectWallet();
  await ensureBSC(provider);

  // 3) Amount math
  const amountWei = toWei(amount);

  // 4) Approve if needed
  await approveIfNeeded(signer, address, ESCROW_ADDRESS, amountWei, opts.onStatus);

  // 5) Try to use your existing wrapper first (keeps your ABI/signature intact)
  const scenarioIdBytes32 = toBytes32(scenarioId);

  // A small helper to call wrapper if present
  const tryWrapperThenFallback = async (): Promise<string> => {
    // Try well-known function names from your codebase
    const maybeLock = (escrowModule as any)?.lockFunds;
    const maybeOneClick = (escrowModule as any)?.quickOneClickSetup;

    try {
      if (typeof maybeOneClick === 'function') {
        // Not required, but some setups rely on it
        await maybeOneClick();
      }
    } catch {
      // ignore if not needed
    }

    if (typeof maybeLock === 'function') {
      opts.onStatus?.('Submitting lockFunds transaction…');
      // Try common signatures you used earlier, without guessing business logic.
      try {
        // Signature option A: lockFunds(scenarioIdBytes32, executor, referrer, amountWei)
        const txA = await maybeLock(scenarioIdBytes32, executor, referrer, amountWei);
        opts.onHash?.(txA.hash);
        const rcptA = await txA.wait(1);
        opts.onReceipt?.(rcptA);
        await opts.saveTxHash?.(txA.hash);
        opts.onStatus?.('Escrow locked.');
        return txA.hash;
      } catch (eA) {
        // Signature option B: lockFunds({ scenarioId, executor, referrer, amountWei })
        try {
          const txB = await maybeLock({
            scenarioId: scenarioIdBytes32,
            executor,
            referrer,
            amountWei,
          });
          opts.onHash?.(txB.hash);
          const rcptB = await txB.wait(1);
          opts.onReceipt?.(rcptB);
          await opts.saveTxHash?.(txB.hash);
          opts.onStatus?.('Escrow locked.');
          return txB.hash;
        } catch (eB) {
          // Fall through to direct ABI call
        }
      }
    }

    // 6) Fallback: direct minimal ABI call (only if your contract matches this signature!)
    const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_MIN_ABI, signer);
    opts.onStatus?.('Submitting lockFunds via fallback…');
    const tx = await escrow.lockFunds(scenarioIdBytes32, executor, referrer, amountWei);
    opts.onHash?.(tx.hash);
    const rcpt = await tx.wait(1);
    opts.onReceipt?.(rcpt);
    await opts.saveTxHash?.(tx.hash);
    opts.onStatus?.('Escrow locked.');
    return tx.hash;
  };

  const hash = await tryWrapperThenFallback();

  // 7) If user was switched to MetaMask app, wait until they return (esp. iOS)
  if (!isInsideMetaMaskApp()) {
    await waitForReturn(120000, 700);
  }
  return hash;
}

/**
 * Optional helper: open this app directly inside MetaMask Mobile Dapp browser.
 * Корисно для кнопки "Open in MetaMask" у випадку відсутності провайдера.
 */
export function openInMetaMaskNow(): void {
  openMetaMaskDeepLink();
}
