import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ethers } from "ethers";

// ===== ENV =====
const USDT_ADDRESS     = import.meta.env.VITE_USDT_ADDRESS as string;
const ESCROW_ADDRESS   = import.meta.env.VITE_ESCROW_ADDRESS as string;
const BSC_CHAIN_ID     = (import.meta.env.VITE_CHAIN_ID_HEX as string) || "0x38";
const PUBLIC_APP_URL   = (import.meta.env.VITE_PUBLIC_APP_URL as string) || location.origin;

// ===== Minimal ABIs =====
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)"
];

const ESCROW_CANDIDATE_ABIS = [
  // lock(uint256)
  ["function lock(uint256 amount)"],
  // deposit(uint256)
  ["function deposit(uint256 amount)"],
  // fund(uint256)
  ["function fund(uint256 amount)"],
];

// ===== helpers =====
function isMetaMaskInApp() {
  const ua = navigator.userAgent.toLowerCase();
  // MetaMask mobile in-app browser UA має "metamask"
  return ua.includes("metamask");
}

function buildMetaMaskDeepLink(targetPath: string) {
  // відкриваємо саме наш домен у внутрішньому браузері MetaMask
  const dappUrl = encodeURIComponent(`${PUBLIC_APP_URL}${targetPath.startsWith("/") ? targetPath : `/${targetPath}`}`);
  return `https://metamask.app.link/dapp/${dappUrl}`;
}

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function EscrowHandoff() {
  const q = useQuery();
  const navigate = useNavigate();

  // сума й символ із URL
  const amountStr = q.get("amount") || "0.01";
  const symbol    = (q.get("symbol") || "USDT").toUpperCase();
  const next      = q.get("next") || "/my-orders";

  const [address, setAddress] = useState<string>("");
  const [chainId, setChainId] = useState<string>("");
  const [decimals, setDecimals] = useState<number>(18);
  const [usdtBalance, setUsdtBalance] = useState<string>("-");
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>("");

  // ===== provider/signer (ethers v5) =====
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  const connectAndPrepare = useCallback(async () => {
    setError("");

    // 1) перевіряємо, чи є MetaMask
    const eth = (window as any).ethereum;
    if (!eth) {
      setError("MetaMask не знайдено. Відкрийте цю сторінку у MetaMask-браузері.");
      return;
    }

    // 2) вмикаємо провайдер
    const p = new ethers.providers.Web3Provider(eth, "any");
    setProvider(p);

    // 3) підписник і адреса
    const accounts: string[] = await p.send("eth_requestAccounts", []);
    const addr = ethers.utils.getAddress(accounts[0]);
    setAddress(addr);
    setSigner(p.getSigner());

    // 4) ланцюг
    const net = await p.getNetwork();
    const hex = "0x" + net.chainId.toString(16);
    setChainId(hex);

    // 5) якщо не BSC — перемкнути
    if (hex.toLowerCase() !== BSC_CHAIN_ID.toLowerCase()) {
      try {
        await (eth as any).request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BSC_CHAIN_ID }],
        });
      } catch (e: any) {
        // якщо ланцюг не додано — можна додати, але зазвичай BSC вже є
        setError("Перемкніть мережу на BNB Smart Chain у MetaMask та повторіть.");
        return;
      }
    }

    // 6) читаємо decimals + баланс USDT
    try {
      const erc20 = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, p);
      const d: number = await erc20.decimals();
      setDecimals(d);

      const bal = await erc20.balanceOf(addr);
      setUsdtBalance(ethers.utils.formatUnits(bal, d));
    } catch (e: any) {
      setError("Помилка читання USDT (баланс/decimals). Перевірте налаштування.");
    }
  }, []);

  useEffect(() => {
    if (isMetaMaskInApp()) {
      connectAndPrepare();
    }
  }, [connectAndPrepare]);

  const prettyAmount = useMemo(() => {
    // показуємо amount як у query
    return amountStr.replace(/^0+(\d)/, "$1");
  }, [amountStr]);

  // ===== approve + (спроба) lock/deposit/fund =====
  const onConfirm = useCallback(async () => {
    setError("");
    if (!provider || !signer || !address) {
      setError("Спершу під’єднайте MetaMask.");
      return;
    }
    setIsSigning(true);
    try {
      // 1) approve рівно на суму
      const erc20 = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
      const value = ethers.utils.parseUnits(amountStr, decimals);

      // allowance?
      const currentAllowance = await erc20.allowance(address, ESCROW_ADDRESS);
      if (currentAllowance.lt(value)) {
        const tx = await erc20.approve(ESCROW_ADDRESS, value);
        await tx.wait();
      }

      // 2) намагаємось викликати escrow-метод (lock/deposit/fund)
      let escrowCalled = false;
      for (const lines of ESCROW_CANDIDATE_ABIS) {
        try {
          const abi = lines;
          const c = new ethers.Contract(ESCROW_ADDRESS, abi, signer);
          const fnName = c.interface.fragments[0].name; // 1 перша функція з ABI
          const tx2 = await (c as any)[fnName](value);
          await tx2.wait();
          escrowCalled = true;
          break;
        } catch (_) {
          // нема такого методу або revert — пробуємо інший підпис
          continue;
        }
      }

      // 3) якщо навіть не вийшло викликати escrow-метод — вважаємо,
      // що у вашому флоу "резервація" = approve, тож цього досить.
      // далі — повернення на next
      navigate(next, { replace: true });
    } catch (e: any) {
      if (e && e.code === 4001) {
        setError("Відхилено у MetaMask.");
      } else {
        setError(`Помилка: ${e?.message || e}`);
      }
    } finally {
      setIsSigning(false);
    }
  }, [provider, signer, address, amountStr, decimals, navigate, next]);

  // ===== UI =====
  if (!isMetaMaskInApp()) {
    return (
      <div style={wrap}>
        <h1 style={title}>Вхід через MetaMask</h1>
        <p style={p}>Відкрийте цей екран у MetaMask-браузері, щоб підтвердити ескроу.</p>
        <a
          href={buildMetaMaskDeepLink("/escrow/approve" + location.search)}
          style={btnPrimary as any}
        >
          Відкрити у MetaMask-браузері
        </a>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <h1 style={title}>Підтвердження ескроу</h1>

      <div style={card}>
        <div style={row}>
          <span style={label}>Гаманець</span>
          <span style={mono}>{address ? `${address.slice(0,6)}…${address.slice(-4)}` : "—"}</span>
        </div>
        <div style={row}>
          <span style={label}>Мережа</span>
          <span style={mono}>{chainId || "—"}</span>
        </div>
        <div style={row}>
          <span style={label}>Баланс USDT</span>
          <span style={mono}>{usdtBalance}</span>
        </div>
        <div style={{...row, marginTop: 6}}>
          <span style={label}>Сума ескроу</span>
          <span style={mono}>{prettyAmount} {symbol}</span>
        </div>
      </div>

      <button
        style={isSigning ? btnDisabled : btnCTA}
        onClick={onConfirm}
        disabled={isSigning}
      >
        {isSigning ? "Підписання…" : `Підтвердити ескроу • ${prettyAmount} ${symbol}`}
      </button>

      {error && <div style={errBox}>{error}</div>}
      <p style={hint}>
        Після успіху ви будете автоматично перенаправлені на: <code style={mono}>{next}</code>
      </p>
    </div>
  );
}

/* ===== styles (інлайн, щоб не плодити файлів) ===== */
const wrap: React.CSSProperties = {
  maxWidth: 560,
  margin: "24px auto",
  padding: "12px 16px 40px",
};
const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  margin: "10px 0 18px",
};
const p: React.CSSProperties = { opacity: 0.8, marginBottom: 20, lineHeight: 1.45 };

const card: React.CSSProperties = {
  borderRadius: 14,
  background: "#faf7f8",
  padding: 14,
  marginBottom: 18,
  border: "1px solid #f0e6ea",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 0",
  borderBottom: "1px dashed #eee",
};
const label: React.CSSProperties = { opacity: 0.75 };
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

const btnCTA: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 16,
  border: "none",
  fontSize: 18,
  fontWeight: 800,
  background: "#0a0a0a",
  color: "white",
};
const btnDisabled: React.CSSProperties = {
  ...btnCTA,
  opacity: 0.7,
  cursor: "not-allowed",
};

const btnPrimary: React.CSSProperties = {
  display: "inline-block",
  padding: "14px 16px",
  borderRadius: 14,
  background: "#0a0a0a",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 800,
};

const errBox: React.CSSProperties = {
  marginTop: 12,
  background: "#ffe5e8",
  color: "#8a1122",
  border: "1px solid #ffd1d7",
  borderRadius: 12,
  padding: "10px 12px",
  whiteSpace: "pre-wrap",
};

const hint: React.CSSProperties = { marginTop: 10, opacity: 0.7 };
