import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isMetaMaskInApp, openInMetaMaskDeepLink } from "../lib/isMetaMaskBrowser";

type Step = "idle" | "connecting" | "profile" | "signing" | "done" | "error";

declare global {
  interface Window {
    ethereum?: any;
  }
}

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function EscrowHandoff() {
  const q = useQuery();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("idle");
  const [err, setErr] = useState<string | null>(null);
  const next = q.get("next") || "/my-orders";

  const ensureProfile = useCallback(async (wallet: string) => {
    // уникаємо duplicate key: upsert по wallet_address
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { wallet_address: wallet },
        { onConflict: "wallet_address", ignoreDuplicates: false }
      );

    if (error) throw error;
  }, []);

  const personalSign = useCallback(async (wallet: string) => {
    const msg =
      `BuyMyBehavior Sign-In\n` +
      `Wallet: ${wallet}\n` +
      `Time: ${Date.now()}`;
    const hex = "0x" + Buffer.from(msg, "utf8").toString("hex");

    // деякі клієнти люблять текст, деякі — hex; спробуємо обидва
    try {
      return await window.ethereum.request({
        method: "personal_sign",
        params: [hex, wallet],
      });
    } catch {
      return await window.ethereum.request({
        method: "personal_sign",
        params: [msg, wallet],
      });
    }
  }, []);

  const run = useCallback(async () => {
    if (!isMetaMaskInApp() || !window.ethereum) {
      // якщо не у MetaMask — пропонуємо відкрити в ньому
      openInMetaMaskDeepLink(`/escrow/approve?next=${encodeURIComponent(next)}`);
      return;
    }

    try {
      setErr(null);
      setStep("connecting");

      const accounts: string[] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const wallet = (accounts?.[0] || "").toLowerCase();
      if (!wallet) throw new Error("Не знайдено гаманець");

      setStep("profile");
      await ensureProfile(wallet);

      setStep("signing");
      await personalSign(wallet);

      setStep("done");
      navigate(next, { replace: true });
    } catch (e: any) {
      setErr(e?.message || String(e));
      setStep("error");
    }
  }, [ensureProfile, next, personalSign, navigate]);

  useEffect(() => {
    // автозапуск при вході з MetaMask
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryConnect = () => run();

  const approveEscrow = async () => {
    // Тут буде виклик контракту escrow (коли додасте) — зараз просто редірект
    navigate(next, { replace: true });
  };

  const title =
    step === "connecting" ? "Під’єднання до MetaMask…" :
    step === "profile"    ? "Підготовка профілю…" :
    step === "signing"    ? "Підпис повідомлення…" :
    step === "done"       ? "Готово!" :
    "Вхід через MetaMask";

  return (
    <div className="p-6">
      <div className="mx-auto max-w-md rounded-3xl bg-pink-100 shadow-xl p-6">
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        <p className="text-sm text-gray-700 mb-6">
          Якщо запит не з’явився — натисніть кнопку нижче.
        </p>

        <div className="space-y-3">
          <button
            onClick={tryConnect}
            disabled={step === "connecting" || step === "signing" || step === "profile"}
            className="w-full rounded-full px-6 py-4 text-white bg-black text-base font-semibold active:scale-[.99]"
          >
            🦊 Увійти через MetaMask
          </button>

          <button
            onClick={approveEscrow}
            className="w-full rounded-full px-6 py-4 border border-black text-black bg-white text-base font-semibold active:scale-[.99]"
          >
            🔒 Підтвердити ескроу
          </button>

          <button
            onClick={() => openInMetaMaskDeepLink(`/escrow/approve?next=${encodeURIComponent(next)}`)}
            className="w-full rounded-xl px-4 py-3 text-sm underline"
          >
            Відкрити у MetaMask-браузері
          </button>
        </div>

        {err && (
          <div className="mt-5 rounded-xl bg-white p-3 text-sm text-red-600">
            Помилка: {err}
          </div>
        )}
      </div>
    </div>
  );
}
