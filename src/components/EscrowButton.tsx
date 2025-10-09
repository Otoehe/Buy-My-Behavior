// src/components/EscrowButton.tsx
import React from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  scenarioId: string;
  amountUsdt: string;   // рядок, наприклад "1" або "2.5"
  className?: string;
};

export default function EscrowButton({ scenarioId, amountUsdt, className }: Props) {
  const navigate = useNavigate();

  function onClick() {
    // ЖОДНИХ window.open / target="_blank" — ідемо в межах того самого таба
    navigate(`/escrow/confirm?sid=${encodeURIComponent(scenarioId)}&amt=${encodeURIComponent(amountUsdt)}`);
  }

  return (
    <button onClick={onClick} className={className ?? "w-full rounded-2xl px-4 py-3 bg-black text-white"}>
      🔒 Забронювати кошти • {amountUsdt} USDT
    </button>
  );
}
