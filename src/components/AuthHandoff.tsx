import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Технічна сторінка, на яку веде диплінк.
 * Сама сесія підхоплюється у bootstrapSessionHandoff().
 * Тут лише показуємо короткий текст/fallback.
 */
export default function AuthHandoff() {
  const loc = useLocation();
  useEffect(() => {
    // якщо користувач сюди потрапив напряму — спробуємо повернути на /my-orders
    const t = setTimeout(() => {
      if (location.pathname.includes("/auth/handoff")) {
        location.replace("/my-orders");
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [loc]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Відкриваємо у MetaMask…</h2>
      <p>Якщо ця сторінка зависла — натисніть «Назад» або оновіть вкладку.</p>
    </div>
  );
}
