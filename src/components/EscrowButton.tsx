/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  scenarioId: string;     // ID сценарію
  amountUsdt: string;     // "1" | "2.5"
  className?: string;
};

export default function EscrowButton({ scenarioId, amountUsdt, className }: Props) {
  const navigate = useNavigate();

  function onClick() {
    // ЖОДНИХ window.open / target="_blank"
    navigate(
      `/escrow/confirm?sid=${encodeURIComponent(scenarioId)}&amt=${encodeURIComponent(amountUsdt)}`,
      { replace: false }
    );
  }

  return (
    <button
      onClick={onClick}
      className={className ?? "w-full rounded-2xl px-4 py-3 bg-black text-white"}
    >
      🔒 Забронювати кошти • {amountUsdt} USDT
    </button>
  );
}
