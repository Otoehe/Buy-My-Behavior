/* eslint-disable @typescript-eslint/no-explicit-any */
// Add-only модуль: безпечне підтвердження виконавцем

import { supabase } from "./supabase";
import { getDealOnChain, confirmCompletionOnChain } from "./escrowContract";
import { connectWallet, ensureBSC, type Eip1193Provider } from "./providerBridge";
import { ethers } from "ethers";

type ScenarioRow = {
  id: string;
  status: string | null;
  escrow_tx_hash: string | null;
  is_agreed_by_customer: boolean | null;
  is_agreed_by_executor: boolean | null;
  is_confirmed_by_customer: boolean | null;
  is_confirmed_by_executor: boolean | null;
  creator_id?: string | null;
  executor_id?: string | null;
};

type ScenarioViewRow = ScenarioRow & {
  customer_wallet?: string | null;
  executor_wallet?: string | null;
};

function eqAddr(a?: string | null, b?: string | null) {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
}

async function getWeb3() {
  const { provider } = await connectWallet();
  await ensureBSC(provider);
  const web3 = new ethers.providers.Web3Provider(provider as any, "any");
  const signer = web3.getSigner();
  const addr = await signer.getAddress();
  return { web3, signer, addr };
}

// 1) Спроба читати з view
async function getScenarioViaView(id: string): Promise<ScenarioViewRow | null> {
  const { data, error } = await supabase
    .from("scenarios_view_v1")
    .select(
      "id,status,escrow_tx_hash,is_agreed_by_customer,is_agreed_by_executor,is_confirmed_by_customer,is_confirmed_by_executor,customer_wallet,executor_wallet"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return null; // RLS/доступ
  return data as ScenarioViewRow | null;
}

// 2) Фолбек: клієнтський джойн (якщо view не видно через RLS)
async function getScenarioViaClientJoin(id: string): Promise<ScenarioViewRow | null> {
  const { data: s } = await supabase
    .from("scenarios")
    .select(
      "id,status,escrow_tx_hash,is_agreed_by_customer,is_agreed_by_executor,is_confirmed_by_customer,is_confirmed_by_executor,creator_id,executor_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (!s) return null;

  const { data: profs } = await supabase
    .from("profiles")
    .select("user_id,wallet,wallet_address,metamask_wallet")
    .in("user_id", [s.creator_id, s.executor_id]);

  const pickWallet = (p?: any) =>
    (p?.wallet as string) ??
    (p?.wallet_address as string) ??
    (p?.metamask_wallet as string) ??
    null;

  const cust = profs?.find((p) => p.user_id === s.creator_id);
  const exec = profs?.find((p) => p.user_id === s.executor_id);

  return {
    ...(s as ScenarioRow),
    customer_wallet: pickWallet(cust),
    executor_wallet: pickWallet(exec),
  };
}

// Публічна функція: витягнути сценарій з гаманцями (view або фолбек)
export async function getScenarioWithWallets(id: string): Promise<ScenarioViewRow> {
  const v = await getScenarioViaView(id);
  if (v) return v;
  const j = await getScenarioViaClientJoin(id);
  if (j) return j;
  throw new Error("Не вдалося прочитати сценарій (RLS/доступ).");
}

// Публічна функція: хто може підтверджувати саме зараз
export async function whoCanConfirm(scenarioId: string) {
  const { addr } = await getWeb3();
  const row = await getScenarioWithWallets(scenarioId);
  const deal = await getDealOnChain(scenarioId);
  return {
    current: addr,
    dbExecutor: (row.executor_wallet ?? "").toLowerCase(),
    chainExecutor: (deal.executor ?? "").toLowerCase(),
    ok: eqAddr(addr, row.executor_wallet) && eqAddr(addr, deal.executor),
  };
}

// Основна дія: безпечне підтвердження виконавцем
export async function confirmAsExecutorSafely(
  scenarioId: string
): Promise<{ txHash: string; ok: true }> {
  const { signer, addr } = await getWeb3();

  const row = await getScenarioWithWallets(scenarioId);
  if (!row.executor_wallet) throw new Error("У сценарію відсутній гаманець виконавця в БД.");
  if (!eqAddr(addr, row.executor_wallet))
    throw new Error("Під’єднайтесь MetaMask гаманцем ВИКОНАВЦЯ.");

  const deal = await getDealOnChain(scenarioId);
  if (!deal?.executor) throw new Error("Не вдалося прочитати угоду on-chain.");
  if (!eqAddr(addr, deal.executor))
    throw new Error("На ланцюгу вказано іншого виконавця (lockFunds з іншою адресою).");

  // все збігається — викликаємо on-chain підтвердження
  const tx = await confirmCompletionOnChain({ scenarioId });
  const rc = await tx.wait?.(1);
  const txHash: string = tx?.hash ?? rc?.transactionHash ?? "";

  // оновлюємо РІВНО той прапорець, який використовує UI
  await supabase
    .from("scenarios")
    .update({ is_confirmed_by_executor: true })
    .eq("id", scenarioId);

  return { txHash, ok: true as const };
}

// Опційний хелпер для DevTools
declare global {
  interface Window {
    bmbGuard?: {
      whoCanConfirm: typeof whoCanConfirm;
      confirmAsExecutorSafely: typeof confirmAsExecutorSafely;
      getScenarioWithWallets: typeof getScenarioWithWallets;
    };
  }
}
if (typeof window !== "undefined") {
  window.bmbGuard = { whoCanConfirm, confirmAsExecutorSafely, getScenarioWithWallets };
}
