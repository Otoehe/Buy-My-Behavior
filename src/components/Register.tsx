/* src/components/Register.tsx
 * Redirect-only “реєстрація” → Web3-логін.
 * Без зміни NavigationBar: /register існує, але миттєво веде на /login?next=...
 */
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function getNextFromSearch(search: string): string | null {
  try {
    const p = new URLSearchParams(search);
    const n = p.get("next");
    return n && typeof n === "string" ? n : null;
  } catch {
    return null;
  }
}

export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();

  const next = useMemo<string>(() => {
    // пріоритет: ?next= → sessionStorage('bmb_next_after_auth') → /map
    const fromQuery = getNextFromSearch(location.search);
    const fromSession = sessionStorage.getItem("bmb_next_after_auth");
    return (fromQuery || fromSession || "/map") as string;
  }, [location.search]);

  // Автоматичний редірект на /login?next=...
  useEffect(() => {
    // невеличка затримка, щоб уникнути конфлікту з історією
    const t = setTimeout(() => {
      const url = `/login?next=${encodeURIComponent(next)}`;
      navigate(url, { replace: true });
    }, 0);
    return () => clearTimeout(t);
  }, [navigate, next]);

  // Фолбек UI (якщо авторедірект заблоковано)
  const loginHref = `/login?next=${encodeURIComponent(next)}`;

  return (
    <div
      style={{
        minHeight: "calc(100dvh - 56px)",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          boxShadow: "0 12px 28px rgba(0,0,0,.08)",
          padding: 20,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          Перехід до входу через MetaMask
        </h1>
        <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>
          Ми прибрали email-реєстрацію. Увійди гаманцем MetaMask. Після входу ми повернемо тебе на потрібну сторінку.
        </p>

        <a
          href={loginHref}
          style={{
            display: "inline-block",
            width: "100%",
            padding: "12px 16px",
            borderRadius: 999,
            background: "#000",
            color: "#fff",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Увійти через MetaMask
        </a>

        <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>
          Якщо редірект не спрацював автоматично — натисни кнопку.
        </div>
      </div>
    </div>
  );
}
