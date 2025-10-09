// src/components/EscrowHandoff.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { BrowserProvider, parseEther, formatEther } from "ethers";

const BSC_CHAIN_ID_HEX = "0x38"; // 56
const BSC_PARAMS = {
  chainId: BSC_CHAIN_ID_HEX,
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com/"],
};

// ⚠️ адреса контракту/скарбнички ескроу
// краще задати у .env як VITE_ESCROW_VAULT
const ESCROW_VAULT =
  (import.meta.env.VITE_ESCROW_VAULT as string) ??
  "0x0000000000000000000000000000000000000000"; // ← заміни на свою

function shorten(addr?: string) {
  return addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "";
}

export default function EscrowHandoff() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // сума для блокування з query (?amount=0.01), дефолт 0.01 BNB
  const requestedAmount = useMemo(() => {
    const raw = searchParams.get("amount");
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0.01;
  }, [searchParams]);

  const next = searchParams.get("next") || "/my-orders";

  const [address, setAddress] = useState<string>("");
  const [chainId, setChainId] = useState<string>("");
  const [balance, setBalance] = useState<string>("");
  const [busy, setBusy] = useState<"idle" | "connecting" | "signing" | "sending">("idle");
  const [error, setError] = useState<string>("");

  const onAccountsChanged = useCallback((accs: string[]) => {
    setAddress(accs?.[0] || "");
  }, []);

  const onChainChanged = useCallback((id: string) => {
    setChainId(id);
  }, []);

  // підключення до MM + читання стану
  const connect = useCallback(async () => {
    setError("");
    try {
      if (!window.ethereum) throw new Error("MetaMask не знайдено.");
      setBusy("connecting");

      // запит акаунтів
      const accs: string[] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      onAccountsChanged(accs);

      const cid: string = await window.ethereum.request({ method: "eth_chainId" });
      onChainChanged(cid);

      // баланс
      const provider = new BrowserProvider(window.ethereum);
      const bal = await provider.getBalance(accs[0]);
      setBalance(formatEther(bal));

      // підпис подій
      window.ethereum.removeListener?.("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener?.("chainChanged", onChainChanged);
      window.ethereum.on?.("accountsChanged", onAccountsChanged);
      window.ethereum.on?.("chainChanged", onChainChanged);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("idle");
    }
  }, [onAccountsChanged, onChainChanged]);

  // перемикач мережі на BSC
  const ensureBsc = useCallback(async () => {
    if (!window.ethereum) throw new Error("MetaMask не знайдено.");
    const current = (await window.ethereum.request({ method: "eth_chainId" })) as string;
    if (current?.toLowerCase() === BSC_CHAIN_ID_HEX.toLowerCase()) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_CHAIN_ID_HEX }],
      });
    } catch (err: any) {
      // якщо мережа не додана
      if (err?.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [BSC_PARAMS],
        });
      } else {
        throw err;
      }
    }
  }, []);

  // основний клік: відправка коштів на ескроу
  const confirmEscrow = useCallback(async () => {
    setError("");
    try {
      if (!window.ethereum) throw new Error("MetaMask не знайдено.");
      if (!address) throw new Error("Спочатку під’єднай MetaMask.");
      if (!ESCROW_VAULT || ESCROW_VAULT === "0x0000000000000000000000000000000000000000") {
        throw new Error("ESCROW_VAULT не налаштований.");
      }

      setBusy("signing");
      await ensureBsc();

      setBusy("sending");
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // значення у wei
      const value = parseEther(String(requestedAmount));

      // простий переказ на адресу ескроу (контракт/скарбничка)
      const tx = await signer.sendTransaction({
        to: ESCROW_VAULT,
        value,
      });

      // можна показати toast з tx.hash
      console.log("Escrow tx:", tx.hash);

      await tx.wait();

      // редірект після успіху
      navigate(next, { replace: true, state: { escrowTx: tx.hash } });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("idle");
    }
  }, [address, ensureBsc, navigate, next, requestedAmount]);

  // авто-конект у MM-браузері
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((accs: string[]) => {
        if (accs?.[0]) {
          setAddress(accs[0]);
          window.ethereum.request({ method: "eth_chainId" }).then((cid: string) => setChainId(cid));
          const provider = new BrowserProvider(window.ethereum);
          provider.getBalance(accs[0]).then((b) => setBalance(formatEther(b)));
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disabled = busy !== "idle";
  const isBsc = chainId?.toLowerCase() === BSC_CHAIN_ID_HEX.toLowerCase();

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 56px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Вхід через MetaMask</h1>
      <p style={{ color: "#6b7280", marginBottom: 20 }}>
        Якщо запит не з'явився — натисни кнопку нижче.
      </p>

      {/* КНОПКА УВІЙТИ */}
      <button
        onClick={connect}
        disabled={disabled}
        style={{
          width: "100%",
          border: "none",
          borderRadius: 16,
          padding: "16px 18px",
          fontSize: 18,
          fontWeight: 700,
          background: disabled ? "#e5e7eb" : "#f3f4f6",
          boxShadow: "0 8px 20px rgba(0,0,0,.08) inset, 0 2px 10px rgba(0,0,0,.04)",
          marginBottom: 14,
        }}
      >
        🦊 Увійти через MetaMask
      </button>

      {/* САММАРІ ГАМАНЦЯ */}
      {!!address && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 14,
            marginBottom: 14,
            background: "#fafafa",
          }}
        >
          <div style={{ fontSize: 14, color: "#6b7280" }}>Гаманець</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{shorten(address)}</div>

          <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 14 }}>
            <span>Мережа: {isBsc ? "BNB Smart Chain" : `chainId ${chainId || "-"}`}</span>
            <span>Баланс: {balance ? `${Number(balance).toFixed(4)} BNB` : "—"}</span>
          </div>
        </div>
      )}

      {/* КНОПКА ЕСКРОУ */}
      <button
        onClick={confirmEscrow}
        disabled={disabled || !address}
        style={{
          width: "100%",
          border: "none",
          borderRadius: 16,
          padding: "18px 20px",
          fontSize: 18,
          fontWeight: 800,
          color: "white",
          background:
            disabled || !address
              ? "linear-gradient(180deg,#9ca3af,#6b7280)"
              : "linear-gradient(180deg,#111827,#111827)",
          boxShadow:
            "0 16px 40px rgba(17,24,39,.35), inset 0 0 0 1px rgba(255,255,255,.04), inset 0 -6px 24px rgba(255,255,255,.06)",
        }}
      >
        🔒 Підтвердити ескроу • {requestedAmount} BNB
      </button>

      {/* СТАТУС */}
      <div style={{ minHeight: 24, marginTop: 12, fontSize: 14, color: "#6b7280" }}>
        {busy === "connecting" && "З'єднання з MetaMask…"}
        {busy === "signing" && "Підготовка транзакції…"}
        {busy === "sending" && "Надсилання у мережу…"}
      </div>

      {/* ПОМИЛКА */}
      {error && (
        <div
          style={{
            marginTop: 10,
            color: "#991b1b",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 14,
          }}
        >
          Помилка: {error}
        </div>
      )}

      {/* Лінк «відкрити в MetaMask-браузері» як запасний варіант */}
      {location.search.includes("deep=1") ? null : (
        <div style={{ marginTop: 18 }}>
          <button
            onClick={() => {
              const url = `metamask://dapp/${location.hostname}${location.pathname}${location.search}`;
              location.href = url;
            }}
            style={{
              fontSize: 14,
              border: "none",
              background: "transparent",
              textDecoration: "underline",
              color: "#1f2937",
            }}
          >
            Відкрити у MetaMask-браузері
          </button>
        </div>
      )}
    </div>
  );
}

// Типізація для window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
      on?: (ev: string, cb: (...a: any[]) => void) => void;
      removeListener?: (ev: string, cb: (...a: any[]) => void) => void;
    };
  }
}
