/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from 'ethers';
import { supabase } from './supabase';
import { connectWallet, ensureBSC, type Eip1193Provider } from './providerBridge';

export const USDT_ADDRESS   = (import.meta.env.VITE_USDT_ADDRESS as string) || '';
export const ESCROW_ADDRESS = (import.meta.env.VITE_ESCROW_ADDRESS as string) || '';

const RAW_CHAIN_ID = (import.meta.env.VITE_CHAIN_ID as string) ?? '0x38';
const CHAIN_ID_HEX = RAW_CHAIN_ID.startsWith('0x') ? RAW_CHAIN_ID : ('0x' + Number(RAW_CHAIN_ID).toString(16));
const CHAIN_ID_DEC = parseInt(CHAIN_ID_HEX, 16);
const BSC_RPC      = (import.meta.env.VITE_BSC_RPC as string) || 'https://bsc-dataseed.binance.org/';

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const ESCROW_ABI = [
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

function escrow(con: ethers.Signer | ethers.providers.Provider) {
  return new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, con);
}
export function generateScenarioIdBytes32(id: string): string {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(id));
}
function toUnixSeconds(dateStr?: string | null, timeStr?: string | null, execution_time?: string | null) {
  const s = execution_time ?? (dateStr ? `${dateStr}T${timeStr || '00:00'}` : '');
  const dt = s ? new Date(s) : new Date();
  const unix = Math.floor(dt.getTime() / 1000);
  return unix > 0 ? unix : Math.floor(Date.now() / 1000);
}
function humanizeEthersError(err: any): string {
  const m = String(err?.error?.message || err?.data?.message || err?.shortMessage || err?.reason || err?.message || '');
  return m.replace(/execution reverted:?/i, '').replace(/\(reason=.*?\)/i, '').trim() || 'Transaction failed';
}

async function getWeb3Bundle() {
  const { provider } = await connectWallet();           // ✅ один-єдиний провайдер
  await ensureBSC(provider);
  const web3   = new ethers.providers.Web3Provider(provider as any, 'any');
  const signer = web3.getSigner();
  const addr   = await signer.getAddress();
  const read   = new ethers.providers.JsonRpcProvider(BSC_RPC, CHAIN_ID_DEC); // 🔒 read-only BSC
  return { eip1193: provider, web3, signer, addr, read };
}

async function assertNetworkAndCode(eip1193: Eip1193Provider, web3: ethers.providers.Web3Provider, read: ethers.providers.Provider) {
  let net = await web3.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID_DEC) {
    await eip1193.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] as any });
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 300));
      net = await web3.getNetwork().catch(() => ({ chainId: 0 } as any));
      if (Number(net.chainId) === CHAIN_ID_DEC) break;
    }
  }
  const [codeEscrow, codeUsdt] = await Promise.all([
    read.getCode(ESCROW_ADDRESS),
    read.getCode(USDT_ADDRESS),
  ]);
  if (!codeEscrow || codeEscrow === '0x') throw new Error('ESCROW_ADDRESS не є контрактом у цій мережі');
  if (!codeUsdt || codeUsdt === '0x')   throw new Error('USDT_ADDRESS не є контрактом у цій мережі');
}

async function ensureAllowance(
  signer: ethers.Signer,
  read: ethers.providers.Provider,
  owner: string,
  tokenAddr: string,
  spender: string,
  needAmtWei: ethers.BigNumberish
) {
  const tokenRead = new ethers.Contract(tokenAddr, ERC20_ABI, read);
  const tokenTx   = new ethers.Contract(tokenAddr, ERC20_ABI, signer);

  let have: ethers.BigNumber = ethers.constants.Zero;
  try {
    have = await tokenRead.allowance(owner, spender);
  } catch (e) {
    // деякі мобільні WC дають CALL_EXCEPTION на eth_call — вважаємо 0
    have = ethers.constants.Zero;
    // console.warn('[BMB] allowance(read) failed:', e);
  }

  if (have.gte(needAmtWei)) return;

  if (!have.isZero()) {
    const tx0 = await tokenTx.approve(spender, 0);
    await tx0.wait(1);
  }
  const tx = await tokenTx.approve(spender, needAmtWei);
  await tx.wait(1);
}

export async function approveUsdtUnlimited(): Promise<{ txHash: string } | null> {
  const { signer, addr, read } = await getWeb3Bundle();
  const tokenRead = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, read);
  const current: ethers.BigNumber = await tokenRead.allowance(addr, ESCROW_ADDRESS).catch(() => ethers.constants.Zero);
  const MAX = ethers.constants.MaxUint256;
  if (current.gte(MAX.div(2))) return null;
  const tokenTx = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
  const tx = await tokenTx.approve(ESCROW_ADDRESS, MAX);
  const rc = await tx.wait(1);
  return { txHash: rc.transactionHash };
}

async function getWalletByUserId(userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await supabase.from('profiles').select('wallet').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as any)?.wallet ?? null;
}
async function getReferrerWalletOfUser(userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await supabase.from('profiles').select('referrer_wallet').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as any)?.referrer_wallet ?? null;
}

// “розбудити” підпис (дешевий спосіб синхронізувати стан провайдера після повернення з MM)
async function warmupSignature(signer: ethers.Signer) {
  try { await signer.signMessage('BMB warmup ' + Date.now()); } catch { /* ігноруємо */ }
}

export async function quickOneClickSetup(): Promise<{ address: string; approveTxHash?: string }> {
  const { signer, addr, read } = await getWeb3Bundle();
  const tokenRead = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, read);
  const tokenTx   = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
  const current: ethers.BigNumber = await tokenRead.allowance(addr, ESCROW_ADDRESS).catch(() => ethers.constants.Zero);
  let approveTxHash: string | undefined;
  if (current.lt(ethers.constants.MaxUint256.div(2))) {
    const tx = await tokenTx.approve(ESCROW_ADDRESS, ethers.constants.MaxUint256);
    const rc = await tx.wait(1);
    approveTxHash = rc.transactionHash;
  }
  return { address: addr, approveTxHash };
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
  const { eip1193, web3, signer, addr: from, read } = await getWeb3Bundle();
  await assertNetworkAndCode(eip1193, web3, read);
  await warmupSignature(signer); // 👈 допомагає мобільним після повернення з MM

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

  if (!amountHuman) throw new Error('Amount is required for lockFunds');
  if (!scenarioId)  throw new Error('ScenarioId is required for the new escrow. Pass { amount, scenarioId }.');

  const { data: sc, error: se } = await supabase
    .from('scenarios')
    .select('executor_id, creator_id, date, time, execution_time')
    .eq('id', scenarioId)
    .maybeSingle();
  if (se) throw se;

  const exId     = executorId ?? (sc as any)?.executor_id ?? undefined;
  const custId   = (sc as any)?.creator_id ?? undefined;
  const date     = (sc as any)?.date ?? null;
  const time     = (sc as any)?.time ?? null;
  const execUnix = executionTime ?? toUnixSeconds(date ?? undefined, time ?? undefined, (sc as any)?.execution_time ?? null);

  const executorWallet = exId ? await getWalletByUserId(exId) : null;
  if (!executorWallet) throw new Error('Не знайдено гаманець виконавця');

  const refWallet = (referrerWallet !== undefined)
    ? (referrerWallet || null)
    : (custId ? await getReferrerWalletOfUser(custId) : null);

  // amount → wei (decimals читаємо через read-only RPC)
  const usdtRead  = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, read);
  const decimals  = await usdtRead.decimals();
  const amountWei = ethers.utils.parseUnits(String(amountHuman), decimals);

  // allowance / approve
  await ensureAllowance(signer, read, from, USDT_ADDRESS, ESCROW_ADDRESS, amountWei);

  const c   = escrow(signer);
  const b32 = generateScenarioIdBytes32(scenarioId);

  // simulate (не блокуємо UX, якщо немає revert data)
  try {
    await (c as any).callStatic.lockFunds(
      b32, executorWallet, refWallet ?? ethers.constants.AddressZero, amountWei, execUnix
    );
  } catch (e: any) {
    const msg = humanizeEthersError(e);
    // Часто WC на мобільному повертає "missing revert data in call exception" — ігноруємо, йдемо далі
    if (!/missing revert data|CALL_EXCEPTION|could not|method not found/i.test(msg)) {
      throw new Error(`lockFunds(simulate) reverted: ${msg}`);
    }
    // console.warn('[BMB] simulate lockFunds warning:', msg);
  }

  // gas estimate + фолбек
  let gas: ethers.BigNumber;
  try {
    gas = await (c as any).estimateGas.lockFunds(
      b32, executorWallet, refWallet ?? ethers.constants.AddressZero, amountWei, execUnix
    );
  } catch {
    gas = ethers.BigNumber.from(300_000);
  }

  try {
    const tx = await (c as any).lockFunds(
      b32, executorWallet, refWallet ?? ethers.constants.AddressZero, amountWei, execUnix,
      { gasLimit: gas.mul(12).div(10) }
    );
    await tx.wait(1);
    return tx;
  } catch (e: any) {
    throw new Error(`lockFunds tx failed: ${humanizeEthersError(e)}`);
  }
}

export async function confirmCompletion(args: { scenarioId: string }) {
  const { eip1193, web3, signer, read } = await getWeb3Bundle();
  await assertNetworkAndCode(eip1193, web3, read);
  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(args.scenarioId);
  const tx = await (c as any).confirmCompletion(b32);
  await tx.wait(1);
  return tx;
}
export const confirmCompletionOnChain = confirmCompletion;

export async function openDisputeOnChain(scenarioId: string) {
  const { eip1193, web3, signer, read } = await getWeb3Bundle();
  await assertNetworkAndCode(eip1193, web3, read);
  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(scenarioId);
  const tx = await (c as any).openDispute(b32);
  await tx.wait(1);
  return tx;
}

export async function voteOnChain(scenarioId: string, forExecutor: boolean) {
  const { eip1193, web3, signer, read } = await getWeb3Bundle();
  await assertNetworkAndCode(eip1193, web3, read);
  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(scenarioId);
  const tx = await (c as any).vote(b32, forExecutor);
  await tx.wait(1);
  return tx;
}

export async function finalizeDisputeOnChain(scenarioId: string) {
  const { eip1193, web3, signer, read } = await getWeb3Bundle();
  await assertNetworkAndCode(eip1193, web3, read);
  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(scenarioId);
  const tx = await (c as any).finalizeDispute(b32);
  await tx.wait(1);
  return tx;
}

export async function getDealOnChain(scenarioId: string): Promise<DealTuple> {
  // читаємо через read-only, щоб не ловити CALL_EXCEPTION на мобільному
  const read = new ethers.providers.JsonRpcProvider(BSC_RPC, CHAIN_ID_DEC);
  const c = escrow(read);
  const b32 = generateScenarioIdBytes32(scenarioId);
  const deal = (await (c as any).getDeal(b32)) as DealTuple;
  return deal;
}
