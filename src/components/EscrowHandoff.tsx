/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { isMetaMaskInApp } from "../lib/isMetaMaskBrowser";

const USDT = import.meta.env.VITE_USDT_ADDRESS as string;
const ESCROW = import.meta.env.VITE_ESCROW_ADDRESS as string;
const CHAIN_ID_HEX = (import.meta.env.VITE_CHAIN_ID_HEX as string) || "0x38"; // 56
const CHAIN_ID_NUM = parseInt(CHAIN_ID_HEX, 16);

const ERC20_ABI = [
  "function approve(address spender, uint256 value) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
];

export default function EscrowHandoff() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const amountStr = params.get("amount") ?? "0";
  const symbolParam = (params.get("symbol") ?? "USDT").toUpperCase();
  const backNext = params.get("next") || "/my-orders";

  const [address, setAddress] = useState<string>("");
  const [networkOk, setNetworkOk] = useState<boolean>(false);
  const [decimals, setDecimals] = useState<number>(18);
  const [tokenSymbol, setTokenSymbol] = useState<string>(symbolParam);
  const [balance, setBalance] = useState<string>("-");
  const [busy, setBusy] = useState<"idle"|"signing"|"waiting"|"done">("idle");
  const [error, setError] = useState<string>("");

  const amount = useMemo(() => {
    const n = Number(amountStr);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amountStr]);

  // provider/signер (ethers v5)
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [token, setToken] = useState<ethers.Contract | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        if (!(window as any).ethereum) {
          setError("MetaMask не знайдено у вікні.");
          return;
        }

        const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");
        // Запит аккаунта
        await provider.send("eth_requestAccounts", []);
        const s = provider.getSigner();
        const addr = await s.getAddress();
        if (cancelled) return;

        setSigner(s);
        setAddress(addr);

        // Мережа
        const net = await provider.getNetwork();
        if (Number(net.chainId) !== CHAIN_ID_NUM) {
          try {
            await (window as any).ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: CHAIN_ID_HEX }],
            });
            setNetworkOk(true);
          } catch (e: any) {
            // Спроба додати ланцюг, якщо його нема
            if (e?.code === 4902) {
              try {
                await (window as any).ethereum.request({
                  method: "wallet_addEthereumChain",
                  params: [{
                    chainId: CHAIN_ID_HEX,
                    chainName: "BNB Smart Chain",
                    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
                    rpcUrls: [import.meta.env.VITE_BSC_RPC || "https://bsc-dataseed.binance.org"],
                    blockExplorerUrls: ["https://bscscan.com"],
                  }],
                });
                setNetworkOk(true);
              } catch (e2) {
                setError("Не вдалося додати/перемкнути мережу BSC.");
                return;
              }
            } else {
              setError("Перемкни мережу на BSC (56).");
              return;
            }
          }
        } else {
          setNetworkOk(true);
        }
        if (cancelled) return;

        // Токен
        const t = new ethers.Contract(USDT, ERC20_ABI, s);
        const [dec, sym, balRaw] = await Promise.all([
          t.decimals(),
          t.symbol().catch(() => "USDT"),
          t.balanceOf(addr),
        ]);
        if (cancelled) return;

        setToken(t);
        setDecimals(Number(dec) || 18);
        setTokenSymbol(String(sym || "USDT").toUpperCase());
        setBalance(ethers.utils.formatUnits(balRaw, Number(dec) || 18));
      } catch (err: any) {
        setError(err?.message || String(err));
      }
    }

    boot();
    return () => { cancelled = true; };
  }, []);

  async function ensureAllowance() {
    if (!token || !signer || !address) throw new Error("Немає провайдера або токена.");
    if (!amount) throw new Error("Сума дорівнює 0.");

    const need = ethers.utils.parseUnits(amount.toString(), decimals);
    const current = await token.allowance(address, ESCROW);
    if (current.gte(need)) return; // Достатньо — нічого не робимо

    setBusy("signing");
    const tx = await token.approve(ESCROW, need);
    setBusy("waiting");
    await tx.wait();
    setBusy("done");
  }

  async function onApproveClick() {
    setError("");
    try {
      if (!isMetaMaskInApp()) {
        setError("Відкрий цю сторінку у MetaMask-браузері.");
        return;
      }
      if (!networkOk) throw new Error("Неправильна мережа (має бути BSC).");

      await ensureAllowance();

      // Готово — повертаємось
      navigate(backNext, { replace: true });
    } catch (e: any) {
      setBusy("idle");
      setError(e?.message || "Помилка під час approve.");
    }
  }

  return (
    <div style={{maxWidth: 720, margin: "24px auto", padding: "16px"}}>
      <h1 style={{fontSize: 32, fontWeight: 800, margin: "8px 0 16px"}}>Вхід через MetaMask</h1>
      <p style={{opacity: .8, marginBottom: 16}}>Якщо запит не з'явився — натисни кнопку нижче.</p>

      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 6px 30px rgba(0,0,0,.08)",
        marginBottom: 16
      }}>
        <div style={{fontWeight: 600, marginBottom: 8}}>Гаманець</div>
        <div style={{opacity: .85, fontFamily: "monospace"}}>{address ? `${address.slice(0,6)}…${address.slice(-4)}` : "—"}</div>
        <div style={{opacity: .7, marginTop: 6}}>Мережа: {networkOk ? "BNB Smart Chain" : "нез'єднана"}</div>
        <div style={{opacity: .7}}>Баланс: {balance} {tokenSymbol}</div>
      </div>

      <button
        onClick={onApproveClick}
        disabled={!amount || busy !== "idle"}
        style={{
          width: "100%",
          padding: "16px 18px",
          borderRadius: 16,
          border: "none",
          fontSize: 18,
          fontWeight: 800,
          color: "#fff",
          background: busy === "idle" ? "#0b1020" : "#6b7280",
          boxShadow: "0 12px 30px rgba(11,16,32,.25)",
        }}
      >
        {busy === "idle"  && `🔒 Підтвердити ескроу • ${amount} ${symbolParam}`}
        {busy === "signing" && "Підпис…"}
        {busy === "waiting" && "Очікуємо підтвердження…"}
        {busy === "done"    && "Готово"}
      </button>

      {error && (
        <div style={{
          marginTop: 16,
          background: "#fee2e2",
          color: "#991b1b",
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 14
        }}>
          Помилка: {error}
        </div>
      )}

      {!isMetaMaskInApp() && (
        <div style={{marginTop: 16, fontSize: 14, opacity: .75}}>
          Підтвердження ескроу працює лише в браузері MetaMask.
        </div>
      )}
    </div>
  );
}
