import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function getNext(search: string): string {
  try {
    const p = new URLSearchParams(search);
    const n = p.get("next");
    if (n && typeof n === "string" && n.trim().length > 0) return n;
  } catch {}
  return "/my-orders";
}

export default function EscrowApprove() {
  const location = useLocation();
  const navigate = useNavigate();
  const next = useMemo(() => getNext(location.search), [location.search]);
  const [blocked, setBlocked] = useState(false);
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;

    const t1 = setTimeout(() => {
      try { navigate(next, { replace: true }); } catch {}
    }, 180);

    const t2 = setTimeout(() => {
      if (window.location.pathname.startsWith("/escrow/approve")) {
        setBlocked(true);
        try { window.location.replace(next); } catch {}
      }
    }, 700);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [navigate, next]);

  const go = () => {
    try { navigate(next, { replace: true }); } catch { window.location.assign(next); }
  };

  return (
    <div style={{ minHeight: "calc(100dvh - 56px)", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, borderRadius: 16, border: "1px solid #e5e7eb", boxShadow: "0 12px 28px rgba(0,0,0,.06)", background: "#fff", padding: 20, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Переходимо до наступного кроку</h1>
        <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 16px" }}>
          Завершення дозволу на витрату коштів. Продовжимо до:
          <span style={{ fontWeight: 700, color: "#111827" }}> {next}</span>
        </p>
        <div style={{ display: "inline-block", width: 36, height: 36, borderRadius: "50%", border: "3px solid #e5e7eb", borderTopColor: "#000", animation: "spin .9s linear infinite", marginBottom: 14 }} />
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        <button type="button" onClick={go} style={{ display: "inline-block", width: "100%", padding: "12px 16px", borderRadius: 999, background: "#000", color: "#fff", fontWeight: 800, border: 0, cursor: "pointer" }}>
          Продовжити
        </button>
        {blocked && <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>Авто-перехід сповільнено — натисніть “Продовжити”.</div>}
      </div>
    </div>
  );
}
