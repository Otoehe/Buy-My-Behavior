// src/components/EscrowButton.tsx
import React from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  scenarioId: string;
  amountUsdt: string;   // "1" | "2.5" тощо
  className?: string;
};

export default function EscrowButton({ scenarioId, amountUsdt, className }: Props) {
  const navigate = useNavigate();

  function onClick() {
    // Переходимо в межах ТІЄЇ САМОЇ вкладки, щоб не ловити "Maximum tabs reached"
    const url = `/escrow/confirm?sid=${encodeURIComponent(scenarioId)}&amt=${encodeURIComponent(amountUsdt)}`;
    navigate(url);
  }

  return (
    <button onClick={onClick} className={className ?? "w-full rounded-2xl px-4 py-3 bg-black text-white"}>
      🔒 Забронювати кошти • {amountUsdt} USDT
    </button>
  );
}
