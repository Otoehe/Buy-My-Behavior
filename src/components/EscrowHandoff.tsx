// src/components/EscrowHandoff.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { AddressLike } from "ethers";
import * as ethersNS from "ethers"; // ✅ Працює і з v5, і з v6
import { supabase } from "../lib/supabase";
import { isMetaMaskInApp } from "../lib/isMetaMaskBrowser";

// ---- Константи мережі/сум ----
const BSC_CHAIN_ID_HEX = "0x38"; // 56
const ESCROW_AMOUNT_STR = "0.01"; // 0.01 BNB у підказці/кнопці

// ---- Допоміжки для ethers v5/v6 ----
function useEthersCompat() {
  const isV6 = !!(ethersNS as any).BrowserProvider;
  const BrowserProvider = (ethersNS as any).BrowserProvider;
  const Web3Provider = (ethersNS as any).providers?.Web3Provider;
  const utils = (ethersNS as any).utils;

  const parseEther =
    (ethersNS as any).parseEther ?? utils?.parseEther ?? ((v: string) => {
      throw new Error("parseEther not found in ethers");
    });

  const formatEther =
    (ethersNS as any).formatEther ?? utils?.formatEther ?? ((v: any) => {
      throw new Error("formatEther not found in ethers");
    });

  const makeProvider = () => {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("MetaMask provider не знайдено");
    return isV6 ? new BrowserProvider(eth) : new Web3Provider(eth);
  };

  const getSigner = async () => {
    const p = makeProvider();
    // v6: await provider.getSigner(); v5: provider.getSigner()
    const s = (p as any).getSigner();
    return s?.then?.((x: any) => x) ?? s;
  };

  return { isV6, makeProvider, getSigner, parseEther, formatEther };
}

// ---- Примітивні стилі під мобільний MetaMask ----
const styles = {
  wrap: { maxWidth: 760, margin: "0 auto", padding: "16px" },
  title: { fontWeight: 800, fontSize: 32, margin: "16px 0 8px" },
  hint: { color: "#555", marginBottom: 16 },
  card: {
    borderRadius: 16,
    background: "#fff",
    boxShadow: "0 6px 30px rgba(0,0,0,0.06)",
    padding: 16,
    marginBottom: 16,
  },
  btn: (variant: "primary" | "ghost" = "primary") =>
    variant === "primary"
      ? {
          width: "100%",
          padding: "14px 16px",
          borderRadius: 16,
          border: "1px solid transparent",
          background: "#0f172a",
          color: "#fff",
          fontWeight: 700 as const,
          fontSize: 18,
          boxShadow: "0 8px 20px rgba(15,23,42,.2)",
        }
      : {
          width: "100%",
          padding: "14px 16px",
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          background: "#fff",
          color: "#111827",
          fontWeight: 700 as const,
          fontSize: 18,
        },
  mmIcon: { marginRight: 8 },
  error: {
    background: "#fee2e2",
    border: "1px solid #fecaca",
    color: "#7f1d1d",
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  mini: { fontSize: 14, color: "#374151" },
  walletRow: { display: "flex", flexDirection: "column" as const, gap: 4 },
};

export default function EscrowHandoff() {
  const { makeProvider, getSigner, parseEther, formatEther } = useEthersCompat();
  const [params] = useSearchParams();
  const next = params.get("next") || "/my-orders";

  const navigate = useNavigate();
  const location = useLocation();

  const [address, setAddress] = useState<string>("");
  const [balance, setBalance] = useState<string>("");
  const [chainId, setChainId] = useState<string>("");
  const [busy, setBusy] = useState<false | "sign" | "tx">(false);
  const [error, setError] = useState<string>("");

  // ------ базові дії з MM ------
  const requestAccounts = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("MetaMask не знайдено");
    const accs: string[] = await eth.request({ method: "eth_requestAccounts" });
    return (accs && accs[0]) || "";
  }, []);

  const ensureBSC = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("MetaMask не знайдено");
    const current = (await eth.request({ method: "eth_chainId" })) as string;
    setChainId(current);

    if (current?.toLowerCase() !== BSC_CHAIN_ID_HEX) {
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BSC_CHAIN_ID_HEX }],
        });
        setChainId(BSC_CHAIN_ID_HEX);
      } catch (e: any) {
        // Якщо мережі нема — можна додати (за потреби)
        throw new Error("Перемкни мережу на BNB Smart Chain у MetaMask.");
      }
    }
  }, []);

  const refreshBalance = useCallback(async (addr: AddressLike) => {
    const p = makeProvider();
    const raw = await (p as any).getBalance(addr);
    setBalance(formatEther(raw));
  }, [formatEther, makeProvider]);

  // ------ логін підписом + профіль у БД ------
  const signIn = useCallback(async () => {
    setError("");
    setBusy("sign");
    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("MetaMask не знайдено");

      const acc = await requestAccounts();
      if (!acc) throw new Error("Адресу гаманця не отримано");
      await ensureBSC();

      const signer = await getSigner();
      const msg =
        `BuyMyBehavior Sign-In\n` +
        `Wallet: ${acc}\n` +
        `Time: ${Date.now()}`;
      await signer.signMessage(msg);

      setAddress(acc);
      await refreshBalance(acc);

      // створюємо/гарантуємо профіль
      const { error: dbErr } = await supabase
        .from("profiles")
        .insert({ wallet_address: acc }, { upsert: true });
      if (dbErr && dbErr.code !== "23505") {
        // 23505 — duplicate, ок
        console.warn("Supabase profiles.insert:", dbErr);
      }
    } catch (e: any) {
      setError(`Помилка входу: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }, [ensureBSC, getSigner, refreshBalance, requestAccounts]);

  // ------ підтвердження «ескроу» (демо-транзакція) ------
  const sendEscrow = useCallback(async () => {
    setError("");
    setBusy("tx");
    try {
      if (!address) throw new Error("Спершу увійди через MetaMask");

      await ensureBSC();
      const signer = await getSigner();

      const to = address as AddressLike; // демо: на себе (щоб не «в нульовий»)
      const value = parseEther(ESCROW_AMOUNT_STR);

      const tx = await signer.sendTransaction({ to, value });
      // За бажанням: чекаємо майнінг
      // await tx.wait();

      // оновимо баланс
      await refreshBalance(address);

      // редирект на наступний екран
      const back = params.get("next") || "/my-orders";
      navigate(back, { replace: true });
    } catch (e: any) {
      if (String(e?.message || e).includes("User denied")) {
        setError("Користувач відхилив транзакцію у MetaMask.");
      } else {
        setError(`Помилка ескроу: ${e?.message ?? e}`);
      }
    } finally {
      setBusy(false);
    }
  }, [address, ensureBSC, getSigner, navigate, params, parseEther, refreshBalance]);

  // ---- авто-фокус у MetaMask-браузері ----
  useEffect(() => {
    if (isMetaMaskInApp()) {
      // авто-підключення акаунта + баланс (без підпису)
      requestAccounts()
        .then((acc) => {
          if (acc) {
            setAddress(acc);
            refreshBalance(acc);
          }
        })
        .catch(() => void 0);
    }
  }, [refreshBalance, requestAccounts]);

  const shortAddr = useMemo(
    () => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ""),
    [address]
  );

  return (
    <div style={styles.wrap}>
      <h1 style={styles.title}>Вхід через MetaMask</h1>
      <div style={styles.hint}>Якщо запит не з’явився — натисни кнопку нижче.</div>

      {/* Кнопка входу */}
      <div style={{ ...styles.card, opacity: busy ? 0.7 : 1 }}>
        <button
          style={styles.btn("ghost")}
          onClick={signIn}
          disabled={busy === "sign"}
          aria-busy={busy === "sign"}
        >
          <span style={styles.mmIcon}>🦊</span> Увійти через MetaMask
        </button>
      </div>

      {/* Інфо про гаманець */}
      {address && (
        <div style={styles.card}>
          <div style={styles.walletRow as any}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Гаманець</div>
            <div style={{ fontFamily: "monospace" }}>{shortAddr}</div>
            <div style={styles.mini}>
              Мережа: {chainId || "—"} &nbsp; Баланс: {balance ? `${balance} BNB` : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Підтвердити ескроу */}
      <div style={{ ...styles.card, opacity: busy ? 0.7 : 1 }}>
        <button
          style={styles.btn("primary")}
          onClick={sendEscrow}
          disabled={!address || busy === "tx"}
          aria-busy={busy === "tx"}
        >
          <span style={{ marginRight: 8 }}>🔒</span>
          Підтвердити ескроу • {ESCROW_AMOUNT_STR} BNB
        </button>
      </div>

      {/* Лінк для відкриття у вбудованому MetaMask-браузері (на всяк випадок) */}
      <div style={{ marginTop: 12 }}>
        <a href="https://metamask.app.link/dapp/www.buymybehavior.com" style={{ color: "#111827" }}>
          Відкрити у MetaMask-браузері
        </a>
      </div>

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}
