import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Дістаємо next з ?next= або з sessionStorage, fallback — /map */
function resolveNext(search: string): string {
  try {
    const p = new URLSearchParams(search);
    const n = p.get("next");
    if (n && typeof n === "string" && n.trim().length > 0) return n;
  } catch {}
  const fromSess = sessionStorage.getItem("bmb_next_after_auth");
  return fromSess || "/map";
}

/** Безпечна утиліта, яка спочатку намагається SPA-редірект, а потім — системний replace */
function hardRedirect(to: string, useReplace = true) {
  try {
    if (useReplace) window.location.replace(to);
    else window.location.assign(to);
  } catch {
    // останній шанс — змінити location.href
    try { (window.location as any).href = to; } catch {}
  }
}

export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();
  const [blocked, setBlocked] = useState(false);
  const fired = useRef(false);

  const next = useMemo(() => resolveNext(location.search), [location.search]);
  const loginHref = `/login?next=${encodeURIComponent(next)}`;

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // 1) спроба через react-router (миттєво)
    try {
      navigate(loginHref, { replace: true });
    } catch {
      // ігноруємо — підстрахуємось нижче
    }

    // 2) через 120мс — системний replace (на випадок throttling навігації)
    const t1 = setTimeout(() => {
      if (window.location.pathname.startsWith("/register")) {
        setBlocked(true);
        hardRedirect(loginHref, true);
      }
    }, 120);

    // 3) ще одна страховка через 800мс — assign (деякі мобільні вебв’ю)
    const t2 = setTimeout(() => {
      if (window.location.pathname.startsWith("/register")) {
        hardRedirect(loginHref, false);
      }
    }, 800);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [loginHref, navigate]);

  // Фолбек UI, якщо авто-редірект заблоковано
  return (
    <div
      style={{
        minHeight: "calc(100dvh - 56px)",
        display: "grid",
        placeItems: "center",
        padding: 24,
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
          Email-реєстрацію вимкнено. Використовуй вхід через MetaMask.
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

        {blocked && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>
            Ваш браузер сповільнив авто-перехід. Натисніть кнопку вище.
          </div>
        )}
      </div>
    </div>
  );
}
