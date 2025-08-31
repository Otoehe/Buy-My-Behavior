import React from "react";

// ──────────────────────────────────────────────────────────────────────────────
// Класичний степер — фінальна версія (інлайн-стилі, без залежностей)
// ──────────────────────────────────────────────────────────────────────────────
export type StatusState = {
  status?: string; // 'draft' | 'agreed' | 'confirmed' | 'completed' | 'dispute' | 'cancelled' | ...
  is_agreed?: boolean;
  agreed_at?: string | null;
  customer_confirmed?: boolean;
  executor_confirmed?: boolean;
  customer_confirmed_at?: string | null;
  executor_confirmed_at?: string | null;
  paid_out?: boolean;
  completed_at?: string | null;
  is_dispute?: boolean;
  dispute_open?: boolean;
  cancelled?: boolean;
  cancelled_at?: string | null;
};

function calc(state: StatusState) {
  const s = state || {};
  const isDispute = !!(s.is_dispute || s.dispute_open || s.status === "dispute");
  const isCancelled = !!(s.cancelled || s.status === "cancelled" || s.cancelled_at);

  const isAgreed = !!(s.is_agreed || s.agreed_at || s.status === "agreed");
  const cust = !!(s.customer_confirmed || s.customer_confirmed_at);
  const exec = !!(s.executor_confirmed || s.executor_confirmed_at);
  const bothConfirmed = cust && exec;
  const oneConfirmed = (cust ? 1 : 0) + (exec ? 1 : 0) === 1;
  const isCompleted = !!(s.paid_out || s.completed_at || s.status === "completed");

  let step = 0; // 0=Переговори 1=Погоджено 2=Підтвердження 3=Виконано
  if (isAgreed) step = 1;
  if (oneConfirmed || bothConfirmed) step = 2;
  if (isCompleted) step = 3;

  return { isDispute, isCancelled, bothConfirmed, oneConfirmed, isCompleted, step };
}

export function StatusStripClassic({ state, compact = false }: { state: StatusState; compact?: boolean }) {
  const { isDispute, isCancelled, bothConfirmed, oneConfirmed, isCompleted, step } = calc(state);

  // Override бейджі
  if (isDispute) {
    return (
      <div style={badge("#fff3cd", "#664d03", compact)}>
        <span>⚖️</span>
        <span>Спір відкритий — очікуємо рішення спільноти</span>
      </div>
    );
  }
  if (isCancelled) {
    return (
      <div style={badge("#fde2e1", "#842029", compact)}>
        <span>⛔</span>
        <span>Скасовано</span>
      </div>
    );
  }

  const steps = [
    { key: "draft", label: "Переговори" },
    { key: "agreed", label: "Погоджено" },
    { key: "confirm", label: bothConfirmed ? "Підтверджено 2/2" : oneConfirmed ? "Підтверджено 1/2" : "Підтвердження" },
    { key: "done", label: isCompleted ? "Виконано" : "Виконано" },
  ];

  return (
    <div style={{ width: "100%", userSelect: "none" as const }}>
      {/* Лінія з вузлами */}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {/* фон-лінія */}
        <div style={{ position: "absolute", left: 0, right: 0, height: 4, background: "#e5e5e5", borderRadius: 999 }} />
        {/* прогрес-лінія (рожевий) */}
        <div style={{ position: "absolute", left: 0, right: `${(3 - step) * 33.3333}%`, height: 4, background: "#ffcdd6", borderRadius: 999 }} />
        {/* точки */}
        {steps.map((st, i) => {
          const done = i < step;
          const active = i === step;
          const base: React.CSSProperties = {
            zIndex: 1,
            width: compact ? 18 : 24,
            height: compact ? 18 : 24,
            borderRadius: "50%",
            border: `2px solid ${active ? "#ffcdd6" : done ? "#000" : "#d4d4d4"}`,
            background: active ? "#ffcdd6" : done ? "#000" : "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          };
          return (
            <div key={st.key} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div style={base} />
            </div>
          );
        })}
      </div>

      {/* Підписи */}
      <div style={{
        marginTop: 8,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        fontSize: compact ? 12 : 13,
        fontWeight: 700,
        color: "#111",
      }}>
        {steps.map((st, i) => (
          <div key={st.key} style={{ textAlign: "center", opacity: i <= step ? 1 : 0.6 }}>{st.label}</div>
        ))}
      </div>
    </div>
  );
}

function badge(bg: string, color: string, compact: boolean): React.CSSProperties {
  return {
    width: "100%",
    borderRadius: 999,
    padding: compact ? "6px 10px" : "10px 14px",
    background: bg,
    color,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// DEMO (для перегляду в канві). У проєкті використовуйте лише StatusStripClassic.
// ──────────────────────────────────────────────────────────────────────────────
export default function Demo() {
  const card: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #e5e5e5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" };
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", padding: 24 }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Класичний степер — фінальна версія</h1>
        <p style={{ color: "#555", marginBottom: 16 }}>Бренд: рожевий <b>#ffcdd6</b>, чорний текст. Нижче — приклади станів.</p>

        <div style={grid}>
          <div style={card}><div style={{ fontWeight: 700, color: "#666", marginBottom: 8 }}>Переговори</div><StatusStripClassic state={{ status: "draft" }} /></div>
          <div style={card}><div style={{ fontWeight: 700, color: "#666", marginBottom: 8 }}>Погоджено</div><StatusStripClassic state={{ status: "agreed", is_agreed: true }} /></div>
          <div style={card}><div style={{ fontWeight: 700, color: "#666", marginBottom: 8 }}>Підтвердження 1/2</div><StatusStripClassic state={{ status: "agreed", is_agreed: true, customer_confirmed: true }} /></div>
          <div style={card}><div style={{ fontWeight: 700, color: "#666", marginBottom: 8 }}>Підтверджено 2/2</div><StatusStripClassic state={{ status: "agreed", is_agreed: true, customer_confirmed: true, executor_confirmed: true }} /></div>
          <div style={card}><div style={{ fontWeight: 700, color: "#666", marginBottom: 8 }}>Виконано</div><StatusStripClassic state={{ status: "completed", paid_out: true }} /></div>
          <div style={card}><div style={{ fontWeight: 700, color: "#666", marginBottom: 8 }}>Спір / Скасовано</div><div style={{ display: "grid", gap: 12 }}><StatusStripClassic state={{ status: "dispute", is_dispute: true }} /><StatusStripClassic state={{ status: "cancelled", cancelled: true }} /></div></div>
        </div>
      </div>
    </div>
  );
}
