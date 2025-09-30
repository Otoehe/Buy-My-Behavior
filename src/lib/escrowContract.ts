// src/lib/escrowContract.ts
// SDK-only сумісність: беремо provider саме з connectWallet()

import { ethers } from 'ethers';
import { supabase } from './supabase';
import { connectWallet, ensureBSC, type Eip1193Provider } from './wallet';

// ───────── Env ─────────
export const USDT_ADDRESS   = import.meta.env.VITE_USDT_ADDRESS as string;
export const ESCROW_ADDRESS = import.meta.env.VITE_ESCROW_ADDRESS as string;

const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38';
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);

// ───────── ABIs ─────────
const erc20Abi = [
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const escrowAbi = [
  'function lockFunds(bytes32 scenarioId,address executor,address referrer,uint256 amount,uint256 executionTime) payable',
  'function confirmCompletion(bytes32 scenarioId)',
  'function openDispute(bytes32 scenarioId)',
  'function escalateToDispute(bytes32 scenarioId)',
  'function vote(bytes32 scenarioId,bool voteForExecutor)',
  'function finalizeDispute(bytes32 scenarioId)',
  'function getDeal(bytes32 scenarioId) view returns (tuple(address customer,address executor,address referrer,uint128 amount,uint40 execAt,uint40 deadline,uint8 flags,uint8 status,uint40 disputeOpenedAt,uint16 votesExecutor,uint16 votesCustomer))',
];

type DealTuple = {
  customer: string;
  executor: string;
  referrer: string;
  amount: ethers.BigNumber;
  execAt: number;
  deadline: number;
  flags: number;
  status: number;
  disputeOpenedAt: number;
  votesExecutor: number;
  votesCustomer: number;
};

// ───────── Provider / Signer (ethers v5) ─────────
export function getProvider(): ethers.providers.Web3Provider {
  if ((window as any).ethereum) {
    return new ethers.providers.Web3Provider((window as any).ethereum, 'any');
  }
  throw new Error('No EVM provider (window.ethereum)');
}

async function getWeb3Provider(): Promise<ethers.providers.Web3Provider> {
  // injected (desktop або MetaMask Browser)
  if ((window as any).ethereum) {
    return new ethers.providers.Web3Provider((window as any).ethereum, 'any');
  }
  // mobile external browser → MetaMask SDK
  const { provider } = await connectWallet();
  await ensureBSC(provider);
  return new ethers.providers.Web3Provider(provider as any, 'any');
}

async function getSigner(): Promise<ethers.Signer> {
  // injected
  if ((window as any).ethereum) {
    const provider = new ethers.providers.Web3Provider((window as any).ethereum, 'any');
    await provider.send('eth_requestAccounts', []);
    return provider.getSigner();
  }
  // SDK provider
  const { provider } = await connectWallet();
  await ensureBSC(provider);
  const p = new ethers.providers.Web3Provider(provider as any, 'any');
  return p.getSigner();
}

function escrow(signerOrProvider: ethers.Signer | ethers.providers.Provider) {
  return new ethers.Contract(ESCROW_ADDRESS, escrowAbi, signerOrProvider);
}

// ───────── helpers ─────────
export function generateScenarioIdBytes32(id: string): string {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(id));
}

async function assertNetworkAndCode() {
  const provider = await getWeb3Provider();
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID_DEC) {
    try {
      const eip = (provider.provider as Eip1193Provider);
      await eip.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch {
      throw new Error(`Неправильна мережа. Очікується chainId=${CHAIN_ID_DEC}`);
    }
  }
  const [codeEscrow, codeUsdt] = await Promise.all([
    provider.getCode(ESCROW_ADDRESS),
    provider.getCode(USDT_ADDRESS),
  ]);
  if (!codeEscrow || codeEscrow === '0x') throw new Error('ESCROW_ADDRESS не є контрактом у цій мережі');
  if (!codeUsdt || codeUsdt === '0x') throw new Error('USDT_ADDRESS не є контрактом у цій мережі');
}

async function ensureAllowance(
  owner: string,
  tokenAddr: string,
  spender: string,
  needAmtWei: ethers.BigNumberish
) {
  const signer = await getSigner();
  const token  = new ethers.Contract(tokenAddr, erc20Abi, signer);
  const have   = await token.allowance(owner, spender);
  if (have.gte(needAmtWei)) return;

  if (!have.isZero()) {
    const tx0 = await token.approve(spender, 0);
    await tx0.wait();
  }
  const tx = await token.approve(spender, needAmtWei);
  await tx.wait();
}

// опційна «unlimited approve»
export async function approveUsdtUnlimited(): Promise<{ txHash: string } | null> {
  const signer = await getSigner();
  const owner  = await signer.getAddress();
  const token  = new ethers.Contract(USDT_ADDRESS, erc20Abi, signer);
  const current: ethers.BigNumber = await token.allowance(owner, ESCROW_ADDRESS);
  const MAX = ethers.constants.MaxUint256;

  if (current.gte(MAX.div(2))) return null;
  const tx = await token.approve(ESCROW_ADDRESS, MAX);
  const rc = await tx.wait();
  return { txHash: rc.transactionHash };
}

async function getWalletByUserId(userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('wallet')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.wallet ?? null;
}

async function getReferrerWalletOfUser(userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('referrer_wallet')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.referrer_wallet ?? null;
}

function toUnixSeconds(dateStr?: string | null, timeStr?: string | null, execution_time?: string | null) {
  const s = execution_time ?? (dateStr ? `${dateStr}T${timeStr || '00:00'}` : '');
  const dt = s ? new Date(s) : new Date();
  const unix = Math.floor(dt.getTime() / 1000);
  return unix > 0 ? unix : Math.floor(Date.now() / 1000);
}

// ───────── Public API ─────────

export async function quickOneClickSetup(): Promise<{ address: string; approveTxHash?: string }> {
  const { provider } = await connectWallet();
  await ensureBSC(provider);
  const p = new ethers.providers.Web3Provider(provider as any, 'any');
  const signer = p.getSigner();
  const address = await signer.getAddress();
  const res = await approveUsdtUnlimited();
  return { address, approveTxHash: res?.txHash };
}

export async function lockFunds(
  arg:
    | number
    | string
    | {
        amount: number | string;
        scenarioId: string;
        executorId?: string;
        referrerWallet?: string | null;
        executionTime?: number;
      }
) {
  await assertNetworkAndCode();

  const signer = await getSigner();
  const from   = await signer.getAddress();

  let amountHuman: string;
  let scenarioId: string | undefined;
  let executorId: string | undefined;
  let referrerWallet: string | null | undefined;
  let executionTime: number | undefined;

  if (typeof arg === 'object' && arg !== null) {
    amountHuman    = String(arg.amount);
    scenarioId     = arg.scenarioId;
    executorId     = arg.executorId;
    referrerWallet = arg.referrerWallet;
    executionTime  = arg.executionTime;
  } else {
    amountHuman = String(arg);
    scenarioId  = undefined;
  }

  if (!amountHuman || amountHuman === 'undefined') {
    throw new Error('Amount is required for lockFunds');
  }
  if (!scenarioId) throw new Error('ScenarioId is required for the new escrow. Pass { amount, scenarioId }.');

  const { data: sc, error: se } = await supabase
    .from('scenarios')
    .select('executor_id, creator_id, date, time, execution_time')
    .eq('id', scenarioId)
    .maybeSingle();
  if (se) throw se;

  const exId   = executorId ?? (sc as any)?.executor_id ?? undefined;
  const custId = (sc as any)?.creator_id ?? undefined;
  const date   = (sc as any)?.date ?? null;
  const time   = (sc as any)?.time ?? null;
  const execUnix = executionTime ?? toUnixSeconds(date ?? undefined, time ?? undefined, (sc as any)?.execution_time ?? null);

  const executorWallet = exId ? await getWalletByUserId(exId) : null;
  if (!executorWallet) throw new Error('Не знайдено гаманець виконавця');

  const refWallet = (referrerWallet !== undefined)
    ? (referrerWallet || null)
    : (custId ? await getReferrerWalletOfUser(custId) : null);

  const token     = new ethers.Contract(USDT_ADDRESS, erc20Abi, signer);
  const decimals  = await token.decimals();
  const amountWei = ethers.utils.parseUnits(String(amountHuman), decimals);

  await ensureAllowance(from, USDT_ADDRESS, ESCROW_ADDRESS, amountWei);

  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(scenarioId);

  // simulate
  try {
    await (c as any).callStatic.lockFunds(
      b32,
      executorWallet,
      refWallet ?? ethers.constants.AddressZero,
      amountWei,
      execUnix
    );
  } catch (e:any) {
    throw new Error(`lockFunds (simulate) reverted: ${e?.message || e}`);
  }

  let gas: ethers.BigNumber;
  try {
    gas = await (c as any).estimateGas.lockFunds(
      b32,
      executorWallet,
      refWallet ?? ethers.constants.AddressZero,
      amountWei,
      execUnix
    );
  } catch {
    gas = ethers.BigNumber.from(300_000);
  }

  const tx = await (c as any).lockFunds(
    b32,
    executorWallet,
    refWallet ?? ethers.constants.AddressZero,
    amountWei,
    execUnix,
    { gasLimit: gas.mul(12).div(10) }
  );
  await tx.wait();
  return tx;
}

export async function confirmCompletion(args: { scenarioId: string }) {
  const signer = await getSigner();
  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(args.scenarioId);
  const tx = await (c as any).confirmCompletion(b32);
  await tx.wait();
  return tx;
}
export const confirmCompletionOnChain = confirmCompletion;

export async function openDisputeOnChain(scenarioId: string) {
  const signer = await getSigner();
  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(scenarioId);
  const tx = await (c as any).openDispute(b32);
  await tx.wait();
  return tx;
}

export async function voteOnChain(scenarioId: string, forExecutor: boolean) {
  const signer = await getSigner();
  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(scenarioId);
  const tx = await (c as any).vote(b32, forExecutor);
  await tx.wait();
  return tx;
}

export async function finalizeDisputeOnChain(scenarioId: string) {
  const signer = await getSigner();
  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(scenarioId);
  const tx = await (c as any).finalizeDispute(b32);
  await tx.wait();
  return tx;
}

export async function getDealOnChain(scenarioId: string): Promise<DealTuple> {
  const provider = await getWeb3Provider();
  const c = escrow(provider);
  const b32 = generateScenarioIdBytes32(scenarioId);
  const deal = (await (c as any).getDeal(b32)) as DealTuple;
  return deal;
}
