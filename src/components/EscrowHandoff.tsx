// src/components/EscrowHandoff.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isMetaMaskInApp } from "../lib/isMetaMaskBrowser";

type EthereumProvider = {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  isMetaMask?: boolean;
};
declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function EscrowHandoff() {
  const q = useQuery();
  const navigate = useNavigate();

  const [address, setAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "signing" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const nextUrl = q.get("next") || "/my-orders";

  const connect = useCallback(async () => {
    try {
      setError(null);
      setStatus("connecting");

      const provider = window.ethereum;
      if (!provider) {
        throw new Error("MetaMask не знайдено. Відкрий додаток MetaMask і зайди на цю сторінку.");
      }

      const accounts: string[] = await provider.request({
        method: "eth_requestAccounts",
      });
      const wallet = accounts?.[0];
      if (!wallet) throw new Error("Не вдалося отримати адресу гаманця.");

      setAddress(wallet);

      // Створюємо/оновлюємо профіль (унікальність по wallet_address)
      const { error: upsertErr } = await supabase
        .from("profiles")
        .upsert({ wallet_address: wallet }, { onConflict: "wallet_address", ignoreDuplicates: false });

      // Якщо унікальний ключ — нічого страшного (23505)
      if (upsertErr && upsertErr.code !== "23505") {
        throw upsertErr;
      }

      // Підпис (plain string, без Buffer)
      setStatus("signing");
      const msg = `BuyMyBehavior Sign-In\nWallet: ${wallet}\nTime: ${Date.now()}`;

      // деякі провайдери хочуть [message, address], інші — [address, message]
      let signature: string | undefined;
      try {
        signature = await provider.request({
          method: "personal_sign",
          params: [msg, wallet],
        });
      } catch {
        signature = await provider.request({
          method: "personal_sign",
          params: [wallet, msg],
        });
      }

      if (!signature) {
        throw new Error("Користувач скасував підпис або сталася помилка підпису.");
      }

      setStatus("ready");

      // у нас немає e-mail логіну через Supabase; після успіху просто ведемо на next
      navigate(nextUrl, { replace: true });
    } catch (e: any) {
      console.error(e);
      setStatus("error");
      setError(e?.message || "Невідома помилка");
    }
  }, [navigate, nextUrl]);

  const approveEscrow = useCallback(async () => {
    try {
      setError(null);
      // Тут зробиш виклик свого смарт-контракту ескроу/BNB — поки заглушка:
      alert("Ескроу підтверджено (заглушка). Тут виклик контракту.");
      navigate(nextUrl, { replace: true });
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Помилка підтвердження ескроу");
    }
  }, [navigate, nextUrl]);

  const mmDeepLink = useMemo(() => {
    // відкриє поточну сторінку в мобільному MM
    const url = typeof window !== "undefined" ? window.location.href : "https://www.buymybehavior.com/escrow/approve";
    return `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}`;
  }, []);

  useEffect(() => {
    // у вбудованому браузері MetaMask пробуємо одразу конектитись
    if (isMetaMaskInApp()) {
      void connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="p-4 max-w-screen-sm mx-auto">
      <h1 className="text-3xl font-bold mb-4">Вхід через MetaMask</h1>

      <p className="mb-4">
        Якщо запит не з'явився — натисни кнопку нижче. Після підпису автоматично перейдемо на <code>{nextUrl}</code>.
      </p>

      <div className="flex gap-2 flex-wrap mb-4">
        <button
          className="px-3 py-2 rounded bg-black text-white"
          disabled={status === "connecting" || status === "signing"}
          onClick={connect}
        >
          🦊 Увійти через MetaMask
        </button>

        <button
          className="px-3 py-2 rounded border"
          disabled={!address || status === "signing"}
          onClick={approveEscrow}
          title={!address ? "Спочатку під'єднай MetaMask" : "Підтвердити ескроу"}
        >
          🔒 Підтвердити ескроу
        </button>

        <a className="px-3 py-2 rounded border" href={mmDeepLink}>
          Відкрити у MetaMask-браузері
        </a>
      </div>

      <div className="text-sm text-gray-600 space-y-1">
        <div>Статус: {status}</div>
        {address && <div>Адреса: {address}</div>}
        {error && <div className="text-red-600">Помилка: {error}</div>}
      </div>
    </main>
  );
}
