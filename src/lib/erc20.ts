// src/lib/erc20.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumber, ethers } from 'ethers';
import type { Eip1193Provider } from './providerBridge';

/**
 * Мінімальний ABI для ERC-20 approve/allowance/decimals.
 * Залишили максимально коротким — сумісний із USDT (BEP-20) на BSC.
 */
export const ERC20_MIN_ABI = [
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

/** Опції для ensureAllowance */
export type EnsureAllowanceOpts = {
  /** Адреса токена (USDT) */
  token: string;
  /** Хто витрачає (EscrowBMB контракт) */
  spender: string;
  /** Адреса власника токенів (поточний користувач) */
  owner: string;
  /**
   * Сума, яку треба забезпечити (у людському вигляді: "12.5" або number),
   * або вже готова BigNumber у найменших одиницях (якщо ви порахували самі).
   */
  amount: string | number | BigNumber;
  /**
   * Підписувач (signer) з ethers — ОБОВ’ЯЗКОВО для approve.
   * Його provider використовуємо і для читання.
   */
  signer: ethers.Signer;
  /**
   * Якщо true — схвалювати "нескінченно" (2^256-1).
   * За замовчуванням false — схвалюємо рівно потрібну суму.
   */
  approveMax?: boolean;
  /**
   * Скільки конфірмів чекати після approve (за промовчанням 1).
   */
  waitConfirms?: number;
};

export type EnsureAllowanceResult = {
  /** Фактичний allowance після операції */
  allowance: BigNumber;
  /** Чи надсилали approve-транзакцію */
  didApprove: boolean;
  /** Хеш транзакції approve (якщо була) */
  txHash?: string;
  /** Десятковість токена */
  decimals: number;
};

/** Створити контракт ERC-20 */
export function getErc20Contract(address: string, providerOrSigner: ethers.Signer | ethers.providers.Provider) {
  return new ethers.Contract(address, ERC20_MIN_ABI, providerOrSigner);
}

/** Дізнатися decimals токена */
export async function fetchTokenDecimals(
  token: string,
  providerOrSigner: ethers.Signer | ethers.providers.Provider,
): Promise<number> {
  const c = getErc20Contract(token, providerOrSigner);
  const d: number = await c.decimals();
  return d;
}

/** Нормалізувати суму до BigNumber (найменші одиниці), враховуючи decimals */
export function toUnits(amount: string | number, decimals: number): BigNumber {
  if (typeof amount === 'string') return ethers.utils.parseUnits(amount, decimals);
  if (typeof amount === 'number') return ethers.utils.parseUnits(amount.toString(), decimals);
  // якщо вже BigNumber — це не для цього хелпера
  throw new Error('toUnits expects string|number; got BigNumber. Pass it directly without toUnits().');
}

/** Прочитати allowance */
export async function getAllowance(
  token: string,
  owner: string,
  spender: string,
  providerOrSigner: ethers.Signer | ethers.providers.Provider,
): Promise<BigNumber> {
  const c = getErc20Contract(token, providerOrSigner);
  const v: BigNumber = await c.allowance(owner, spender);
  return v;
}

/**
 * Схвалити витрату.
 * ПРИМІТКА: Деякі токени (рідко) вимагають approve(0) перед новим approve.
 * Тут реалізовано "м'яку" спробу: спочатку пробуємо прямий approve,
 * якщо фейл — робимо approve(0), потім повторюємо approve(amount).
 */
export async function approveSpending(
  token: string,
  spender: string,
  amount: BigNumber,
  signer: ethers.Signer,
  waitConfirms = 1,
): Promise<{ txHash: string }> {
  const c = getErc20Contract(token, signer);

  // 1) Пряма спроба
  try {
    const tx = await c.approve(spender, amount);
    const rc = await tx.wait(waitConfirms);
    return { txHash: rc.transactionHash };
  } catch (e1: any) {
    // 2) Спроба через approve(0) → approve(amount)
    try {
      const tx0 = await c.approve(spender, ethers.constants.Zero);
      await tx0.wait(waitConfirms);

      const tx = await c.approve(spender, amount);
      const rc = await tx.wait(waitConfirms);
      return { txHash: rc.transactionHash };
    } catch (e2: any) {
      // Проброс помилки з максимальною прозорістю
      (e2 as any).__firstError = e1;
      throw e2;
    }
  }
}

/**
 * Забезпечити достатній allowance для spender.
 * Якщо вже достатній — транзакція не надсилається.
 * Якщо бракує — робиться approve (або approve(0)→approve(amount) при потребі).
 */
export async function ensureAllowance(opts: EnsureAllowanceOpts): Promise<EnsureAllowanceResult> {
  const {
    token,
    spender,
    owner,
    amount,
    signer,
    approveMax = false,
    waitConfirms = 1,
  } = opts;

  const provider = signer.provider as ethers.providers.Provider;
  if (!provider) throw new Error('ensureAllowance: signer has no provider');

  const decimals = await fetchTokenDecimals(token, provider);

  // Обчислюємо необхідну суму у найменших одиницях
  const required: BigNumber =
    BigNumber.isBigNumber(amount)
      ? (amount as BigNumber)
      : toUnits(amount as string | number, decimals);

  // Читаємо поточний allowance
  const current = await getAllowance(token, owner, spender, provider);

  if (current.gte(required)) {
    // Вже достатньо
    return { allowance: current, didApprove: false, decimals };
  }

  const approveAmount = approveMax ? ethers.constants.MaxUint256 : required;

  const { txHash } = await approveSpending(token, spender, approveAmount, signer, waitConfirms);

  // Перечитуємо allowance після підтвердження
  const updated = await getAllowance(token, owner, spender, provider);

  return {
    allowance: updated,
    didApprove: true,
    txHash,
    decimals,
  };
}
