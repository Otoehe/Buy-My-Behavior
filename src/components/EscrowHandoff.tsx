import React, { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isMetaMaskInApp } from "../lib/isMetaMaskBrowser";

type EthProvider = {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: any[] }) => Promise<any>;
};

declare global {
  interface Window {
    ethereum?: EthProvider;
    location: Location;
  }
}

export default function EscrowHandoff() {
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const next = useMemo(
    () => decodeURIComponent(search.get("next") || "/my-orders"),
    [search]
  );

  const [address, setAddress] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "signing" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const connectAndSign = useCallback(async () => {
    setError(null);
    const provider = window.ethereum;

    try {
      if (!provider || !provider.isMetaMask) {
        throw new Error("Відкрий у MetaMask-браузері або встанови MetaMask.");
      }

      // 1) Request accounts
      const accounts: string[] = await provider.request({
        method: "eth_requestAccounts",
      });
      const addr = (accounts && accounts[0]) || "";
      if (!addr) throw new Error("Адресу гаманця не отримано.");

      setStage("signing");

      // 2) Sign a simple message (без Buffer)
      const msg =
        `BuyMyBehavior Sign-In\n` +
        `Wallet: ${addr}\n` +
        `Time: ${Date.now()}`;

      await provider.request({
        method: "personal_sign",
        params: [msg, addr],
      });

      setAddress(addr);
      setStage("ready");
    } catch (e: any) {
      setStage("error");
      setError(e?.message || "Помилка під час входу через MetaMask.");
    }
  }, []);

  const approveEscrow = useCallback(async () => {
    // Тут можемо викликати ваш контракт/flow,
    // але щоби не чіпати інші файли, просто переводжу на next.
    navigate(next, { replace: true });
  }, [navigate, next]);

  const openInMetaMask = useCallback(() => {
    // Відкрити поточний шлях у MetaMask-браузері
    const host = window.location.host;
    const path = `/escrow/approve?next=${encodeURIComponent(next)}`;
    // схема для мобільного MetaMask
    window.location.href = `metamask://dapp/${host}${path}`;
  }, [next]);

  const inMetaMask = isMetaMaskInApp();

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      {/* локальні стилі кнопок — без окремого css файлу */}
      <style>{`
        .mm-wrap { display:flex; flex-direction:column; gap:12px; }
        .mm-btn {
          display:flex; align-items:center; justify-content:center;
          width:100%;
          padding:14px 18px;
          border-radius:16px;
          font-size:16px; font-weight:600;
          border:1px solid rgba(0,0,0,.12);
          background:#fff; color:#111;
          box-shadow: 0 2px 8px rgba(0,0,0,.06);
          touch-action: manipulation;
        }
        .mm-btn:active { transform: translateY(1px); }
        .mm-btn:disabled { opacity:.5; transform:none; }
        .mm-btn--primary { background:#111; color:#fff; border-color:#111; }
        .mm-btn--lock::before {
          content:"🔒"; margin-right:8px; font-size:18px; line-height:1;
        }
        .mm-hint { font-size:14px; opacity:.7; margin:10px 0 4px; }
        .mm-err { margin-top:10px; color:#b00020; font-size:14px; }
      `}</style>

      <h1 style={{ fontSize: 28, fontWeight: 800, margin: "4px 0 12px" }}>
        Вхід через MetaMask
      </h1>
      <p className="mm-hint">
        Якщо запит не з'явився — натисни кнопку нижче.
      </p>

      <div className="mm-wrap">
        <button
          type="button"
          className="mm-btn"
          onClick={connectAndSign}
          disabled={stage === "signing"}
        >
          🦊 Увійти через MetaMask
        </button>

        <button
          type="button"
          className="mm-btn mm-btn--primary mm-btn--lock"
          onClick={approveEscrow}
          disabled={!address || stage === "signing"}
          title={!address ? "Спочатку увійди через MetaMask" : "Підтвердити ескроу"}
        >
          Підтвердити ескроу
        </button>

        {!inMetaMask && (
          <button type="button" className="mm-btn" onClick={openInMetaMask}>
            Відкрити у MetaMask-браузері
          </button>
        )}
      </div>

      {stage === "signing" && (
        <p className="mm-hint">Підписуємо запит у MetaMask…</p>
      )}
      {error && <p className="mm-err">Помилка: {error}</p>}
    </div>
  );
}
