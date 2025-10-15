import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function EscrowConfirm() {
  const navigate = useNavigate();
  useEffect(() => {
    const t1 = setTimeout(() => {
      try { navigate("/my-orders", { replace: true }); } catch {}
    }, 200);
    const t2 = setTimeout(() => {
      if (window.location.pathname.startsWith("/escrow/confirm")) {
        try { window.location.replace("/my-orders"); } catch {}
      }
    }, 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [navigate]);

  return (
    <div style={{ minHeight: "calc(100dvh - 56px)", display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid #e5e7eb", borderTopColor: "#000", animation: "spin .9s linear infinite", margin: "0 auto 12px" }} />
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        <div style={{ color: "#6b7280" }}>Завершення підтвердження…</div>
      </div>
    </div>
  );
}
