/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from 'ethers';
import { supabase } from './supabase';
import { ensureMobileWalletProvider, CHAIN_ID_HEX, CHAIN_ID_DEC } from './walletMobileWC';

// ======= ENV =======
export const USDT_ADDRESS   = import.meta.env.VITE_USDT_ADDRESS as string;
export const ESCROW_ADDRESS = import.meta.env.VITE_ESCROW_ADDRESS as string;

// ======= ABIs =======
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

export type Eip1193 = {
  request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
  on?: (ev: string, cb: (...a: any[]) => void) => void;
  removeListener?: (ev: string, cb: (...a: any[]) => void) => void;
  isMetaMask?: boolean;
};

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

// ======= Helpers =======

function getInjected(): Eip1193 | null {
  if (typeof window === 'undefined') return null;
  return (window as any).ethereum ?? null;
}

async function getProviderEnsured(): Promise<Eip1193> {
  let eth = getInjected();
  if (!eth) {
    await ensureMobileWalletProvider(); // відкриє MetaMask і поверне після pairing
    eth = getInjected();
  }
  if (!eth) throw new Error('Provider is not available');
  return eth;
}

async function ensureNetwork(eth: Eip1193) {
  try {
    const cid = await eth.request({ method: 'eth_chainId' });
    if (String(cid).toLowerCase() !== String(CHAIN_ID_HEX).toLowerCase()) {
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] as any });
      } catch (err: any) {
        if (err?.code === 4902) {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CHAIN_ID_HEX,
              chainName: 'Binance Smart Chain',
              nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
              rpcUrls: ['https://bsc-dataseed.binance.org/'],
              blockExplorerUrls: ['https://bscscan.com'],
            }] as any,
          });
          await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] as any });
        } else {
          throw err;
        }
      }
    }
  } catch {
    // ігноруємо — користувач може вручну перемкнути
  }
}

async function assertContractsExist(web3: ethers.providers.Web3Provider) {
  const [escrowCode, usdtCode] = await Promise.all([
    web3.getCode(ESCROW_ADDRESS),
    web3.getCode(USDT_ADDRESS),
  ]);
  if (!escrowCode || escrowCode === '0x') throw new Error('ESCROW_ADDRESS не є контрактом у цій мережі');
  if (!usdtCode   || usdtCode   === '0x') throw new Error('USDT_ADDRESS не є контрактом у цій мережі');
}

export function generateScenarioIdBytes32(id: string): string {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(id));
}

function escrow(con: ethers.Signer | ethers.providers.Provider) {
  return new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, con);
}

// “розбудити” підпис (після повернення з MetaMask дехто зависає)
async function warmupSignature(signer: ethers.Signer) {
  try { await signer.signMessage('BMB warmup ' + Date.now()); } catch {}
}

async function ensureAllowance(
  signer: ethers.Signer,
  owner: string,
  tokenAddr: string,
  spender: string,
  needAmtWei: ethers.BigNumberish
) {
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
  const have  = await token.allowance(owner, spender);
  if (have.gte(needAmtWei)) return;

  // деякі токени (USDT) вимагають спочатку обнулення
  if (!have.isZero()) {
    const tx0 = await token.approve(spender, 0);
    await tx0.wait(1);
  }
  const tx = await token.approve(spender, needAmtWei);
  await tx.wait(1);
}

// ======= Core bundle =======
async function getWeb3Bundle() {
  const eth = await getProviderEnsured();

  // агресивно витягуємо акаунти (MetaMask Mobile інколи віддає тільки з другого разу)
  try { await eth.request({ method: 'eth_requestAccounts' }); } catch {}
  const accs = (await eth.request({ method: 'eth_accounts' }).catch(() => [])) as string[];
  if (!Array.isArray(accs) || !accs.length) throw new Error('Не отримав акаунт з MetaMask');

  await ensureNetwork(eth);

  const web3   = new ethers.providers.Web3Provider(eth as any, 'any');
  const signer = web3.getSigner();
  const addr   = await signer.getAddress();

  await assertContractsExist(web3);
  return { eth, web3, signer, addr };
}

// ======= Public API =======

export async function quickOneClickSetup(): Promise<{ address: string; approveTxHash?: string }> {
  const { signer, addr } = await getWeb3Bundle();
  const token  = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
  const current: ethers.BigNumber = await token.allowance(addr, ESCROW_ADDRESS);
  let approveTxHash: string | undefined;

  if (current.lt(ethers.constants.MaxUint256.div(2))) {
    const tx = await token.approve(ESCROW_ADDRESS, ethers.constants.MaxUint256);
    const rc = await tx.wait(1);
    approveTxHash = rc.transactionHash;
  }
  return { address: addr, approveTxHash };
}

export async function lockFunds(arg:
  | number
  | string
  | { amount: number | string; scenarioId: string; executorId?: string; referrerWallet?: string | null; executionTime?: number }
) {
  const { web3, signer, addr: from } = await getWeb3Bundle();
  await warmupSignature(signer);

  // ---- parse args
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

  // ---- fetch scenario meta
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
  const execUnix = ((): number => {
    const s = (sc as any)?.execution_time ?? (date ? `${date}T${time || '00:00'}` : '');
    const dt = s ? new Date(s) : new Date();
    return Math.max(1, Math.floor(dt.getTime() / 1000));
  })();

  // ---- resolve wallets
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

  const executorWallet = exId ? await getWalletByUserId(exId) : null;
  if (!executorWallet) throw new Error('Не знайдено гаманець виконавця');

  const refWallet = (referrerWallet !== undefined)
    ? (referrerWallet || null)
    : (custId ? await getReferrerWalletOfUser(custId) : null);

  // ---- amounts & allowance
  const usdt      = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
  const decimals  = await usdt.decimals();
  const amountWei = ethers.utils.parseUnits(String(amountHuman), decimals);
  await ensureAllowance(signer, from, USDT_ADDRESS, ESCROW_ADDRESS, amountWei);

  // ---- call contract
  const c   = escrow(signer);
  const b32 = generateScenarioIdBytes32(scenarioId);

  // simulate
  try {
    await (c as any).callStatic.lockFunds(
      b32, executorWallet, refWallet ?? ethers.constants.AddressZero, amountWei, execUnix
    );
  } catch (e: any) {
    throw new Error(`lockFunds (simulate) reverted: ${e?.message || e}`);
  }

  // estimate
  let gas: ethers.BigNumber;
  try {
    gas = await (c as any).estimateGas.lockFunds(
      b32, executorWallet, refWallet ?? ethers.constants.AddressZero, amountWei, execUnix
    );
  } catch { gas = ethers.BigNumber.from(300_000); }

  const tx = await (c as any).lockFunds(
    b32, executorWallet, refWallet ?? ethers.constants.AddressZero, amountWei, execUnix,
    { gasLimit: gas.mul(12).div(10) }
  );
  await tx.wait(1);
  return tx;
}

export async function confirmCompletion(args: { scenarioId: string }) {
  const { signer } = await getWeb3Bundle();
  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(args.scenarioId);
  const tx = await (c as any).confirmCompletion(b32);
  await tx.wait(1);
  return tx;
}
export const confirmCompletionOnChain = confirmCompletion;

export async function openDisputeOnChain(scenarioId: string) {
  const { signer } = await getWeb3Bundle();
  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(scenarioId);
  const tx = await (c as any).openDispute(b32);
  await tx.wait(1);
  return tx;
}

export async function voteOnChain(scenarioId: string, forExecutor: boolean) {
  const { signer } = await getWeb3Bundle();
  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(scenarioId);
  const tx = await (c as any).vote(b32, forExecutor);
  await tx.wait(1);
  return tx;
}

export async function finalizeDisputeOnChain(scenarioId: string) {
  const { signer } = await getWeb3Bundle();
  const c = escrow(signer);
  const b32 = generateScenarioIdBytes32(scenarioId);
  const tx = await (c as any).finalizeDispute(b32);
  await tx.wait(1);
  return tx;
}

export async function getDealOnChain(scenarioId: string): Promise<DealTuple> {
  const eth  = await getProviderEnsured();
  const web3 = new ethers.providers.Web3Provider(eth as any, 'any');
  const c = escrow(web3);
  const b32 = generateScenarioIdBytes32(scenarioId);
  return (await (c as any).getDeal(b32)) as DealTuple;
}
