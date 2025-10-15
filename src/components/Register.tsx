// src/components/Register.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

// дістаємо ?next= або з sessionStorage, інакше /map
function resolveNext(search: string): string {
  try {
    const p = new URLSearchParams(search);
    const n = p.get("next");
    if (n && n.trim().length > 0) return n;
  } catch {}
  const fromSess = sessionStorage.getItem("bmb_next_after_auth");
  return fromSess || "/map";
}

function hardRedirect(to: string, replace = true) {
  try {
    if (replace) window.location.replace(to);
    else window.location.assign(to);
  } catch {
    (window.location as any).href = to;
  }
}

export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();
  const fired = useRef(false);
  const [blocked, setBlocked] = useState(false);

  const next = useMemo(() => resolveNext(location.search), [location.search]);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    (async () => {
      // 1) перевіряємо чи користувач вже авторизований
      const { data } = await supabase.auth.getSession();
      const isAuthed = !!data?.session;

      // якщо авторизований → одразу ведемо на next (або /map)
      const targetIfAuthed = next || "/map";
      const targetIfGuest = `/login?next=${encodeURIComponent(targetIfAuthed)}`;

      const target = isAuthed ? targetIfAuthed : targetIfGuest;

      // спочатку пробуємо SPA-навігацію
      try {
        navigate(target, { replace: true, state: { from: "/register" } });
      } catch {}

      // підстраховка системним редіректом (уникнути "білого" екрану)
      const t1 = setTimeout(() => {
        setBlocked(true);
        hardRedirect(target, true);
      }, 150);

      // ще одна підстраховка (деякі вебв’ю)
      const t2 = setTimeout(() => hardRedirect(target, false), 900);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    })();
  }, [navigate, next]);

  // простий фолбек-UI на випадок, якщо браузер блокує авто-перехід
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
          Триває перенаправлення…
        </h1>
        <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>
          Якщо ти вже увійшов — перейдемо на потрібну сторінку.
          Якщо ні — на сторінку входу через MetaMask.
        </p>
        {blocked && (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Якщо авто-перехід не спрацював — онови сторінку.
          </div>
        )}
      </div>
    </div>
  );
}
