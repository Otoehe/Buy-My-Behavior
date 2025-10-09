// src/components/EscrowButton.tsx
import React from "react";
import { useNavigate } from "react-router-dom";

type Props = { scenarioId: string; amountUsdt: string; className?: string };

export default function EscrowButton({ scenarioId, amountUsdt, className }: Props) {
  const navigate = useNavigate();

  function go() {
    // маркер наміру блокування — щоб ніхто не викинув на /my-orders
    sessionStorage.setItem("bmb.lockIntent", "1");
    sessionStorage.setItem("bmb.sid", scenarioId);
    sessionStorage.setItem("bmb.amt", amountUsdt);

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const hasEth   = typeof (window as any).ethereum !== "undefined";

    const path = `/escrow/confirm?sid=${encodeURIComponent(scenarioId)}&amt=${encodeURIComponent(amountUsdt)}`;

    if (isMobile && !hasEth) {
      // відкрити У MetaMask-браузері САМЕ сторінку підтвердження
      const dapp = `https://metamask.app.link/dapp/${location.host}${path}`;
      location.href = dapp; // той самий таб
      return;
    }

    // в тій самій вкладці
    navigate(path);
  }

  return (
    <button onClick={go} className={className ?? "w-full rounded-2xl px-4 py-3 bg-black text-white"}>
      🔒 Забронювати кошти • {amountUsdt} USDT
    </button>
  );
}
