/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/SafeOrderButton.tsx — кнопка “Замовити поведінку” з безпечним тапом
import React from "react";
import { useNavigate } from "react-router-dom";
import { useSafeTap } from "../lib/useSafeTap";
import "./SafeOrderButton.css";

export interface SafeOrderButtonProps {
  to?: string;           // шлях, куди вести (дефолтний — /scenario/new)
  className?: string;    // дозволяємо твій існуючий стиль
  disabled?: boolean;    // на випадок, якщо треба відключити
  children?: React.ReactNode; // текст/контент кнопки
}

export default function SafeOrderButton({
  to = "/scenario/new",
  className = "",
  disabled = false,
  children = "Замовити поведінку",
}: SafeOrderButtonProps) {
  const navigate = useNavigate();

  const tapHandlers = useSafeTap(() => {
    if (disabled) return;
    // Якщо у тебе гарди поважають ?next= — можеш замінити на navigate(`/login?next=${encodeURIComponent(to)}`)
    navigate(to, { replace: false });
  });

  return (
    <button
      type="button"
      {...tapHandlers}
      className={`bmb-safe-order-btn ${className}`}
      aria-disabled={disabled ? "true" : "false"}
    >
      {children}
    </button>
  );
}
