import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
import { supabase } from "../lib/supabase";
import { isMetaMaskInApp } from "../lib/isMetaMaskBrowser";

const BSC_CHAIN_ID_DEC = 56;
const BSC_CHAIN_ID_HEX = "0x38"; // 56
const ESCROW_AMOUNT_BNB = 0.01;

// Можна винести в .env (VITE_ESCROW_WALLET), але тримаю й fallback
const ESCROW_WALLET =
  import.meta.env.VITE_ESCROW_WALLET ||
  "0x0000000000000000000000000000000000000000";

type EthWin = Window &
  typeof globalThis & {
    ethereum?: any;
  };

function short(addr?: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

export default function EscrowHandoff() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const next = params.get("next") || "/my-orders";

  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCorrectNet = chainId === BSC_CHAIN_ID_DEC;

  const provider = useMemo(() => {
    const eth = (window as EthWin).ethereum;
    if (!eth) return null;
    // ethers v5
    return new ethers.providers.Web3Provider(eth, "any");
  }, []);

  // Підтягнути акаунт, мережу, баланс
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        setError(null);
        if (!provider) return;

        const signer = provider.getSigner();
        const addr = await signer.getAddress().catch(async () => {
          // Якщо ще не дано доступ — попросимо
          await (window as EthWin).ethereum?.request?.({ method: "eth_requestAccounts" });
          return signer.getAddress();
        });

        if (dead) return;

        setAddress(addr);

        const net = await provider.getNetwork();
        if (dead) return;
        setChainId(Number(net.chainId));

        const raw = await provider.getBalance(addr);
        if (dead) return;
        setBalance(ethers.utils.formatEther(raw));
      } catch (e: any) {
        // Якщо ми не у MetaMask-браузері — просто покажемо підказку
        setError(e?.message || String(e));
      }
    })();

    // слухачі зміни акаунта/мережі
    const eth = (window as EthWin).ethereum;
    const onChainChanged = (cid: string) => setChainId(parseInt(cid, 16));
    const onAccountsChanged = (accs: string[]) => setAddress(accs?.[0] || null);

    eth?.on?.("chainChanged", onChainChanged);
    eth?.on?.("accountsChanged", onAccountsChanged);

    return () => {
      dead = true;
      eth?.removeListener?.("chainChanged", onChainChanged);
      eth?.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [provider]);

  async function ensureBsc() {
    const eth = (window as EthWin).ethereum;
    if (!eth) throw new Error("MetaMask не знайдено.");

    if (chainId === BSC_CHAIN_ID_DEC) return;

    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_CHAIN_ID_HEX }],
      });
    } catch (e: any) {
      // Якщо мережа не додана — спробуємо додати
      if (e?.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: BSC_CHAIN_ID_HEX,
              chainName: "BNB Smart Chain",
              nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
              rpcUrls: ["https://bsc-dataseed.binance.org/"],
              blockExplorerUrls: ["https://bscscan.com"],
            },
          ],
        });
      } else {
        throw e;
      }
    }
  }

  async function handleApprove() {
    setError(null);
    setSigning(true);
    try {
      const eth = (window as EthWin).ethereum;
      if (!provider || !eth) throw new Error("Спочатку підʼєднай MetaMask.");

      // 1) Гарантуємо BSC
      await ensureBsc();

      // 2) Виставляємо транзакцію на ескроу-адресу
      const signer = provider.getSigner();

      const valueWei = ethers.utils.parseEther(ESCROW_AMOUNT_BNB.toString());

      const tx = await signer.sendTransaction({
        to: ESCROW_WALLET,
        value: valueWei,
      });

      // 3) Просто чекаємо появи tx.hash (не блокуємо UI на повний confirmation)
      if (!tx?.hash) throw new Error("Не вдалося створити транзакцію.");

      // 4) Фіксуємо в БД (не критично, якщо впаде)
      try {
        await supabase.from("behaviors").insert({
          // приклад: зафіксувати «депозит від користувача»
          user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
          type: "escrow_deposit",
          payload: { txHash: tx.hash, amountBNB: ESCROW_AMOUNT_BNB },
        });
      } catch {}

      // 5) Перехід далі
      navigate(next, { replace: true });
    } catch (e: any) {
      const msg =
        e?.message ||
        (typeof e === "string" ? e : "Невідома помилка під час підтвердження.");
      setError(`Помилка: ${msg}`);
    } finally {
      setSigning(false);
    }
  }

  // Кнопка «Відкрити у MetaMask-браузері» для зовнішніх браузерів
  function openInMetamaskBrowser() {
    const url = `https://metamask.app.link/dapp/${location.hostname}${location.port ? `:${location.port}` : ""
      }${location.pathname}${location.search}`;
    location.href = url;
  }

  return (
    <div className="mx-auto max-w-screen-sm px-4 py-6">
      <h1 className="text-3xl font-extrabold mb-3">Вхід через MetaMask</h1>
      <p className="text-slate-500 mb-4">
        Якщо запит не зʼявився — натисни кнопку нижче.
      </p>

      {/* Кнопка логіну (для надійного eth_requestAccounts) */}
      <button
        onClick={async () => {
          setError(null);
          const eth = (window as EthWin).ethereum;
          if (!eth) {
            setError("MetaMask не знайдено.");
            return;
          }
          try {
            await eth.request({ method: "eth_requestAccounts" });
          } catch (e: any) {
            setError(e?.message || String(e));
          }
        }}
        className="w-full rounded-2xl border border-slate-200 px-5 py-4 text-lg font-semibold flex items-center gap-2 justify-center mb-4 bg-white"
      >
        🦊 Увійти через MetaMask
      </button>

      {/* Блок з інфо про гаманець */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4">
        <div className="text-sm text-slate-500 mb-1">Гаманець</div>
        <div className="text-lg font-semibold">{short(address) || "—"}</div>
        <div className="text-sm text-slate-500">
          Мережа: {chainId ?? "—"}{" "}
          {isCorrectNet ? "(BNB Smart Chain)" : "(інша мережа)"}
          {" · "}Баланс: {balance ? `${Number(balance).toFixed(4)} BNB` : "—"}
        </div>
      </div>

      {/* Основна CTA */}
      <button
        disabled={signing}
        onClick={handleApprove}
        className={`w-full rounded-2xl px-6 py-5 text-lg font-extrabold text-white shadow-sm transition-all
          ${signing
            ? "bg-slate-400"
            : "bg-slate-900 hover:bg-black active:scale-[0.99]"
          }`}
      >
        🔒 Підтвердити ескроу • {ESCROW_AMOUNT_BNB.toFixed(2)} BNB
      </button>

      {/* Лінк відкрити у MetaMask-браузері, якщо ми НЕ в ньому */}
      {!isMetaMaskInApp() && (
        <button
          onClick={openInMetamaskBrowser}
          className="mt-4 text-slate-600 underline underline-offset-4"
        >
          Відкрити у MetaMask-браузері
        </button>
      )}

      {/* Помилка */}
      {error && (
        <div className="mt-5 rounded-xl bg-rose-50 text-rose-700 p-3 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
