/* eslint-disable @typescript-eslint/no-explicit-any */
import { lockFunds } from "./escrowContract";

/**
 * Уніфікований мобільний флоу блокування коштів.
 * НІЯКИХ прямих estimateGas тут немає — усе робить escrowContract.lockFunds
 */
export async function lockFundsMobileFlow(args: {
  scenarioId: string;
  executor: string;
  referrer?: string | null;
  amount: number;             // у USDT
  executionTime?: number;     // unix seconds (опц.)
  onStatus?: (s:
    | "start"
    | "connect"
    | "ensure-network"
    | "prepare"
    | "approve-check"
    | "approve-send"
    | "simulate"
    | "estimate-gas"
    | "send"
    | "mined"
    | "done"
  ) => void;
}): Promise<string> {
  const {
    scenarioId,
    executor,
    referrer = null,
    amount,
    executionTime,
    onStatus,
  } = args;

  // Позначаємо намір — RouterGuard/MyOrders триматиме користувача на /escrow/confirm
  try {
    sessionStorage.setItem("bmb.lockIntent", "1");
    sessionStorage.setItem("bmb.sid", scenarioId);
    sessionStorage.setItem("bmb.amt", String(amount));
  } catch {}

  onStatus?.("start");

  // Викликаємо надійний хелпер: він робить callStatic, safe-estimate і fallback gas
  const tx = await lockFunds(
    {
      scenarioId,
      executorId: undefined,            // не потрібен — адресу вже передали
      referrerWallet: referrer ?? null,
      amount,
      executionTime,
    },
    {
      onStep: (s) => onStatus?.(s as any),
      preferUnlimitedApprove: true,     // щоби не впертись в allowance при повторній броні
      minConfirmations: 1,
      gasMultiplier: 1.25,              // невелика страховка
    }
  );

  onStatus?.("done");

  // Прибираємо намір — флоу завершився
  try {
    sessionStorage.removeItem("bmb.lockIntent");
  } catch {}

  return tx.hash ?? tx.transactionHash ?? String((tx as any).hash || "");
}
