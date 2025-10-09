// src/components/EscrowHandoff.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BrowserProvider, parseEther, formatEther } from "ethers";

const BSC_CHAIN_ID_HEX = "0x38"; // 56
const BSC_CHAIN_ID = 56n;

// .env (Vercel/локально)
// VITE_ESCROW_WALLET=0x...  -> адреса одержувача ескроу
// VITE_ESCROW_AMOUNT=0.01   -> сума у BNB
const ESCROW_ADDRESS = (import.meta.env.VITE_ESCROW_WALLET || "").trim() as `0x${string}`;
const ESCROW_AMOUNT = (import.meta.env.VITE_ESCROW_AMOUNT || "0.01").trim();

type UIState = "idle" | "signing" | "pending" | "done";

export default function EscrowHandoff() {
  const [search] = useSearchParams();
  const next = search.get("next") || "/my-orders";

  const navigate = useNavigate();

  const [address, setAddress] = useState<string>("");
  const [balance, setBalance] = useState<bigint>(0n);
  const [state, setState] = useState<UIState>("idle");
  const [error, setError] = useState<string>("");

  const amountWei = useMemo(() => {
    try {
      return parseEther(ESCROW_AMOUNT);
    } catch {
      return 0n;
    }
  }, []);

  const misconfigured = !ESCROW_ADDRESS || !ESCROW_ADDRESS.startsWith("0x") || amountWei === 0n;

  // ---- helpers -------------------------------------------------------------

  const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

  const refreshAccountAndBalance = async () => {
    try {
      const eth = (window as any).ethereum;
      if (!eth) return;

      const provider = new BrowserProvider(eth);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);

      const bal = await provider.getBalance(addr);
      setBalance(bal);
    } catch (e) {
      console.warn("[Escrow] refreshAccountAndBalance:", e);
    }
  };

  // ---- effects -------------------------------------------------------------

  useEffect(() => {
    refreshAccountAndBalance();

    const eth = (window as any).ethereum;
    if (!eth) return;

    const onAccounts = () => refreshAccountAndBalance();
    const onChain = () => refreshAccountAndBalance();

    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);

    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- actions -------------------------------------------------------------

  const handleLogin = async () => {
    try {
      const eth = (window as any).ethereum;
      if (!eth) return;
      await eth.request({ method: "eth_requestAccounts" });
      await refreshAccountAndBalance();
    } catch (e) {
      console.warn(e);
    }
  };

  const handleApprove = async () => {
    setError("");
    setState("signing");

    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("MetaMask не знайдено");

      // 1) Перемкнутися на BSC
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BSC_CHAIN_ID_HEX }],
        });
      } catch (e: any) {
        if (e?.code === 4902) {
          // якщо мережу не додано — пропонуємо додати
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: BSC_CHAIN_ID_HEX,
                chainName: "BNB Smart Chain",
                nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
                rpcUrls: ["https://bsc-dataseed.binance.org/"],
                blockExplorerUrls: ["https://bscscan.com/"],
              },
            ],
          });
        } else {
          throw e;
        }
      }

      const provider = new BrowserProvider(eth);
      const net = await provider.getNetwork();
      if (net.chainId !== BSC_CHAIN_ID) {
        throw new Error("Перемкніть мережу на BNB Smart Chain.");
      }

      const signer = await provider.getSigner();
      const from = await signer.getAddress();

      // 2) Перевірити баланс з запасом на комісію
      const gasPrice = await provider.getGasPrice(); // bigint
      const feeEstimate = gasPrice * 21000n;
      if (balance < amountWei + feeEstimate) {
        throw new Error("Недостатньо BNB для суми та комісії мережі.");
      }

      // 3) Надіслати legacy-транзакцію (BSC любить type:0)
      const tx = await signer.sendTransaction({
        to: ESCROW_ADDRESS,
        value: amountWei,
        type: 0,       // legacy
        gasPrice,      // явний gasPrice
        // gasLimit: 21000n, // можна явно зафіксувати за бажання
      });

      setState("pending");
      await tx.wait(); // 1 підтвердження достатньо

      setState("done");
      // TODO: за потреби — записати tx.hash / from / amount у вашу БД (Supabase)

      navigate(next, { replace: true });
    } catch (e: any) {
      if (e?.code === 4001 || /User denied/i.test(e?.message || "")) {
        setError("Ви відхилили транзакцію в MetaMask.");
      } else {
        setError(e?.message || "Сталася помилка під час виконання транзакції.");
      }
      setState("idle");
    }
  };

  const disabled = state !== "idle" || misconfigured || !address || balance === 0n;

  // ---- UI ------------------------------------------------------------------

  return (
    <div className="p-4 max-w-screen-sm mx-auto">
      <h1 className="text-3xl font-bold mb-2">Вхід через MetaMask</h1>
      <p className="text-gray-500 mb-4">Якщо запит не з'явився — натисни кнопку нижче.</p>

      {/* Логін через MetaMask */}
      <button
        className="w-full rounded-2xl px-5 py-4 bg-white border text-black shadow-sm mb-3"
        onClick={handleLogin}
      >
        🦊 Увійти через MetaMask
      </button>

      {/* Інфо про гаманець/баланс */}
      <div className="rounded-2xl border bg-white p-4 mb-4">
        <div className="text-sm text-gray-500 mb-1">Гаманець</div>
        <div className="font-semibold">{address ? short(address) : "—"}</div>
        <div className="text-sm text-gray-500 mt-1">
          Мережа: BNB Smart Chain · Баланс: {formatEther(balance)} BNB
        </div>
      </div>

      {/* Кнопка підтвердження ескроу */}
      <button
        className={`w-full rounded-2xl px-5 py-4 text-white font-semibold transition
          ${disabled ? "bg-gray-400" : "bg-black hover:opacity-90 active:opacity-80"}
        `}
        disabled={disabled}
        onClick={handleApprove}
      >
        {state === "signing" && "Підписання…"}
        {state === "pending" && "Очікуємо підтвердження…"}
        {state === "done" && "Готово!"}
        {state === "idle" && `🔒 Підтвердити ескроу · ${ESCROW_AMOUNT} BNB`}
      </button>

      {error && (
        <div className="mt-4 rounded-xl bg-rose-50 text-rose-700 p-3 text-sm">
          Помилка: {error}
        </div>
      )}

      <div className="mt-5">
        <a
          href="https://metamask.app.link/dapp/www.buymybehavior.com/escrow/approve"
          className="underline text-gray-600"
        >
          Відкрити у MetaMask-браузері
        </a>
      </div>

      {/* Діагностика env (не показувати у проді — за бажанням прибереш) */}
      {misconfigured && (
        <div className="mt-6 text-xs text-amber-700 bg-amber-50 p-3 rounded-xl">
          <div className="font-semibold mb-1">Попередження конфігурації:</div>
          <div>VITE_ESCROW_WALLET: {ESCROW_ADDRESS || "—"}</div>
          <div>VITE_ESCROW_AMOUNT: {ESCROW_AMOUNT || "—"}</div>
        </div>
      )}
    </div>
  );
}

