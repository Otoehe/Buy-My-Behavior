import React from "react";

export type StatusLike = {
  status?: string;
  is_agreed_by_customer?: boolean;
  is_agreed_by_executor?: boolean;
  is_completed_by_executor?: boolean;
  escrow_tx_hash?: string | null;
  agreed_at?: string | null;
  completed_at?: string | null;
  paid_out?: boolean;
  is_dispute?: boolean;
  dispute?: boolean;
  cancelled?: boolean;
  customer_confirmed?: boolean;
  executor_confirmed?: boolean;
};

export function StatusStripClassic({
  state,
  compact = false,
}: {
  state: StatusLike;
  compact?: boolean;
}) {
  const st = (state?.status || "").toLowerCase();

  const isDispute =
    state?.is_dispute === true ||
    state?.dispute === true ||
    st === "dispute" ||
    st === "disputed";

  const isCancelled = state?.cancelled === true || st === "cancelled";

  const bothAgreed =
    !!state?.is_agreed_by_customer && !!state?.is_agreed_by_executor;

  const isAgreed =
    st === "agreed" || bothAgreed || !!state?.agreed_at || !!state?.escrow_tx_hash;

  const customerConfirmed =
    state?.customer_confirmed === true ||
    (!!state?.completed_at && st !== "pending");

  const executorConfirmed =
    state?.executor_confirmed === true ||
    state?.is_completed_by_executor === true;

  const bothConfirmed = !!customerConfirmed && !!executorConfirmed;
  const oneConfirmed = !bothConfirmed && (customerConfirmed || executorConfirmed);

  const isCompleted =
    st === "confirmed" ||
    st === "completed" ||
    bothConfirmed ||
    !!state?.paid_out ||
    (!!state?.completed_at && st !== "pending");

  let step = 0; // 0=Переговори 1=Погоджено 2=Підтвердження 3=Виконано
  if (isAgreed) step = 1;
  if (oneConfirmed || bothConfirmed) step = 2;
  if (isCompleted) step = 3;

  const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
  const title: React.CSSProperties = { fontWeight: 700, color: "#111", marginBottom: 4 };
  const sub: React.CSSProperties = { fontSize: 12, color: "#555" };
  const muted: React.CSSProperties = { fontSize: 12, color: "#888" };

  const badge = (bg: string, color: string): React.CSSProperties => ({
    background: bg,
    color,
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 12,
    padding: compact ? "6px 10px" : "10px 14px",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: compact ? 12 : 13,
    fontWeight: 600,
  });

  const dot: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: 9999,
    background: "#111",
    boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
  };

  const stepDot = (active: boolean): React.CSSProperties => ({
    width: 10,
    height: 10,
    borderRadius: 9999,
    background: active ? "#111" : "#d9d9d9",
    boxShadow: active ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
  });

  const stepLine = (active: boolean): React.CSSProperties => ({
    height: 2,
    background: active ? "#111" : "#e8e8e8",
    borderRadius: 2,
  });

  if (isDispute) {
    return (
      <div style={badge("#fff3cd", "#664d03")}>
        <span>⚖️</span>
        <span>Спір відкрито — очікуємо рішення спільноти</span>
      </div>
    );
  }
  if (isCancelled) {
    return (
      <div style={badge("#ffe2e8", "#7a1a2b")}>
        <span>⛔</span>
        <span>Угоду скасовано</span>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={row}>
        <div style={dot} />
        <div style={title}>
          {step === 0 && "Переговори"}
          {step === 1 && "Погоджено"}
          {step === 2 && (bothConfirmed ? "Підтверджено обома" : "Очікуємо підтвердження")}
          {step === 3 && "Виконано"}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={stepDot(true)} />
        <div style={{ flex: 1, ...stepLine(step >= 1) }} />
        <div style={stepDot(step >= 1)} />
        <div style={{ flex: 1, ...stepLine(step >= 2) }} />
        <div style={stepDot(step >= 2)} />
        <div style={{ flex: 1, ...stepLine(step >= 3) }} />
        <div style={stepDot(step >= 3)} />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {step === 0 && <div style={muted}>Сторони узгоджують опис та суму донату</div>}
        {step === 1 && (
          <div style={sub}>
            Угоду погоджено
            {state?.escrow_tx_hash ? " — кошти заблоковані в Escrow" : " — очікуємо блокування коштів"}
          </div>
        )}
        {step === 2 && (
          <div style={sub}>
            {bothConfirmed
              ? "Обидві сторони підтвердили виконання"
              : "Одна сторона підтвердила — чекаємо другу"}
          </div>
        )}
        {step === 3 && (
          <div style={sub}>Виконано — кошти розподілено за правилами BMB (90/10 або 90/5/5)</div>
        )}
      </div>
    </div>
  );
}

export function StatusStripClassicDemo() {
  const Card: React.CSSProperties = {
    background: "#fff",
    borderRadius: 12,
    padding: 12,
    border: "1px solid #e5e5e5",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  };
  const Wrap: React.CSSProperties = { display: "grid", gap: 12 };
  return (
    <div style={Wrap}>
      <div style={Card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Переговори</div>
        <StatusStripClassic state={{ status: "pending" }} />
      </div>
      <div style={Card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Погоджено</div>
        <StatusStripClassic state={{ status: "agreed", escrow_tx_hash: null, is_agreed_by_customer: true, is_agreed_by_executor: true }} />
      </div>
      <div style={Card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Підтвердження</div>
        <StatusStripClassic state={{ status: "confirmed", executor_confirmed: true }} />
      </div>
      <div style={Card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Виконано</div>
        <StatusStripClassic state={{ status: "confirmed", paid_out: true }} />
      </div>
      <div style={Card}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "#7a1a2b" }}>Скасовано</div>
        <StatusStripClassic state={{ status: "cancelled", cancelled: true }} />
      </div>
      <div style={Card}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "#664d03" }}>Спір</div>
        <StatusStripClassic state={{ status: "disputed", is_dispute: true }} />
      </div>
    </div>
  );
}

/* default-експорт для сумісності з `import StatusStripClassic from '...'` */
export default StatusStripClassic;
