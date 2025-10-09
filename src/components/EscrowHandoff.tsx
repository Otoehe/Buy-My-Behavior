// src/components/EscrowHandOff.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PostgrestError } from "@supabase/supabase-js";

// ⚠️ Підігнайте імпорт під ваш проєкт:
// якщо у вас файл клієнта в іншому місці — змініть шлях нижче.
import { supabase } from "../lib/supabaseClient";

declare global {
  interface Window {
    ethereum?: any;
  }
}

type Step = "idle" | "connecting" | "signing" | "saving" | "done";

const isMetaMaskMobile = () =>
  /MetaMaskMobile/i.test(window.navigator.userAgent) ||
  /metamask/i.test(window.navigator.userAgent) && /Mobile/i.test(window.navigator.userAgent);

const buildMetaMaskDeepLink = () => {
  // metamask://dapp/<host><path><query>
  const { host, pathname, search } = window.location;
  return `metamask://dapp/${host}${pathname}${search}`;
};

export default function EscrowHandOff() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("idle");
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasEthereum = typeof window !== "undefined" && !!window.ethereum;

  const uiDisabled = useMemo(
    () => step === "connecting" || step === "signing" || step === "saving",
    [step]
  );

  // -------- personal_sign без Buffer ----------
  const personalSign = useCallback(async (wallet: string) => {
    const msg =
      `BuyMyBehavior Sign-In\n` +
      `Wallet: ${wallet}\n` +
      `Time: ${Date.now()}`;

    // 1) Пробуємо підписати plain text (краще працює у мобільному MM)
    try {
      return await window.ethereum.request({
        method: "personal_sign",
        params: [msg, wallet],
      });
    } catch {
      // 2) Фолбек: кодуємо у hex без Buffer (через TextEncoder)
      const bytes = new TextEncoder().encode(msg);
      const hex =
        "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return await window.ethereum.request({
        method: "personal_sign",
        params: [hex, wallet],
      });
    }
  }, []);
  // --------------------------------------------

  const upsertProfile = useCallback(async (wallet: string) => {
    // Upsert по унікальному полю wallet_address
    // (припускаємо, що в таблиці profiles є унікальний індекс на wallet_address).
    const { error: dbErr } = await supabase
      .from("profiles")
      .upsert({ wallet_address: wallet }, { onConflict: "wallet_address" });

    return dbErr;
  }, []);

  const connectAndSign = useCallback(async () => {
    setError(null);
    try {
      if (!window.ethereum) {
        throw new Error("MetaMask не знайдено. Відкрийте сторінку у MetaMask-браузері.");
      }

      setStep("connecting");
      const accounts: string[] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const wallet = (accounts?.[0] || "").toLowerCase();
      if (!wallet) throw new Error("Не вдалося отримати адресу гаманця.");
      setAccount(wallet);

      setStep("signing");
      await personalSign(wallet);

      setStep("saving");
      const dbErr: PostgrestError | null = await upsertProfile(wallet);
      if (dbErr) {
        // якщо дубль — це теж ок, upsert не має падати, але на всяк випадок:
        if (dbErr.code !== "23505") {
          throw new Error(dbErr.message);
        }
      }

      setStep("done");
      // Після успіху ведемо на ваш список замовлень:
      navigate("/my-orders", { replace: true });
    } catch (e: any) {
      console.error(e);
      setStep("idle");
      setError(e?.message || "Невідома помилка під час входу.");
    }
  }, [navigate, personalSign, upsertProfile]);

  // Автоспроба підключення, якщо є MetaMask
  useEffect(() => {
    if (hasEthereum) {
      // Легка затримка, щоб встиг завантажитись інтерфейс
      const t = setTimeout(() => {
        if (step === "idle") void connectAndSign();
      }, 200);
      return () => clearTimeout(t);
    }
  }, [hasEthereum, connectAndSign, step]);

  const handleApproveEscrow = useCallback(async () => {
    setError(null);
    try {
      if (!account) throw new Error("Спочатку підключіть MetaMask.");

      // Тут місце для вашої логіки підтвердження ескроу.
      // Зараз – лише приклад «порожнього» підпису-підтвердження,
      // аби викликати вікно MetaMask (можете замінити на виклик контракту).
      const message = `BMB Escrow Approve\nWallet: ${account}\nTime: ${Date.now()}`;
      await window.ethereum.request({
        method: "personal_sign",
        params: [message, account],
      });

      navigate("/my-orders", { replace: true });
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Не вдалося підтвердити ескроу.");
    }
  }, [account, navigate]);

  return (
    <div className="mx-auto max-w-screen-sm px-4 py-8">
      <h1 className="text-3xl sm:text-4xl font-bold mb-4">Вхід через MetaMask</h1>
      <p className="text-gray-600 mb-6">
        Якщо запит не з’явився — натисніть кнопку нижче.
      </p>

      {!hasEthereum && (
        <div className="mb-4 text-sm rounded-xl bg-yellow-50 border border-yellow-200 p-3">
          MetaMask у цьому браузері не знайдено. Відкрийте сторінку у
          MetaMask-браузері на телефоні.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          disabled={uiDisabled}
          onClick={connectAndSign}
          className={`rounded-full px-5 py-3 font-semibold shadow-sm transition
            ${uiDisabled ? "bg-gray-300 text-gray-600" : "bg-black text-white hover:opacity-90"}`}
        >
          🦊 Увійти через MetaMask
        </button>

        <button
          disabled={!account || uiDisabled}
          onClick={handleApproveEscrow}
          className={`rounded-full px-5 py-3 font-semibold shadow-sm transition
            ${!account || uiDisabled ? "bg-gray-200 text-gray-500" : "bg-pink-500 text-white hover:opacity-90"}`}
        >
          🔒 Підтвердити ескроу
        </button>

        {isMetaMaskMobile() && (
          <a
            href={buildMetaMaskDeepLink()}
            className="rounded-full px-4 py-2 text-sm border border-gray-300 hover:bg-gray-50"
          >
            Відкрити у MetaMask-браузері
          </a>
        )}
      </div>

      {step !== "idle" && step !== "done" && (
        <div className="text-sm text-gray-500 mb-3">
          {step === "connecting" && "З’єднання з MetaMask…"}
          {step === "signing" && "Підпис повідомлення…"}
          {step === "saving" && "Збереження профілю…"}
        </div>
      )}

      {error && (
        <div className="mt-2 text-red-600">
          Помилка: {error}
        </div>
      )}
    </div>
  );
}
