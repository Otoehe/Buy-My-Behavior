import React, { useEffect, useState } from "react";

/**
 * Глобальний хост корпоративних модалок BMB.
 * Відкриття:
 *   window.dispatchEvent(new CustomEvent('bmb:modal:open', {
 *     detail: { kind, title, subtitle, actionLabel, noBackdropClose, hideClose }
 *   }));
 * Закриття:
 *   window.dispatchEvent(new Event('bmb:modal:close'));
 */

type Kind =
  | "success" | "warning" | "error" | "confirm" | "tx" | "info"
  | "magic"  | "congratsCustomer" | "congratsPerformer";

type Payload = {
  kind?: Kind;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actionLabel?: string;
  noBackdropClose?: boolean;
  hideClose?: boolean;
};

function BadgeCircle({
  children,
  bg = "#ffdbe2",
  border = "#11111122",
}: { children: React.ReactNode; bg?: string; border?: string }) {
  return (
    <div
      style={{
        width: 80, height: 80, borderRadius: 9999,
        background: bg, border: `4px solid ${border}`,
        display: "grid", placeItems: "center",
      }}
    >
      {children}
    </div>
  );
}

const WalletBadges = () => (
  <div style={{ display:"flex", gap:12, alignItems:"center", justifyContent:"center" }}>
    <img src="/MetaMask-icon-fox.svg" alt="" width={56} height={56}
         style={{ borderRadius:9999, border:"3px solid #fff", boxShadow:"0 2px 8px rgba(0,0,0,.15)" }}/>
    <img src="/BNB,_native_cryptocurrency_for_the_Binance_Smart_Chain.svg" alt="" width={56} height={56}
         style={{ borderRadius:9999, border:"3px solid #fff", boxShadow:"0 2px 8px rgba(0,0,0,.15)" }}/>
  </div>
);

const WalletDoneBadge = () => (
  <BadgeCircle><img src="/mUSD-icon.svg" alt="" width={52} height={52}/></BadgeCircle>
);

const InfoIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10"/><path d="M12 10v7m0-11h.01"/>
  </svg>
);
const MailIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8">
    <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>
  </svg>
);

function pickIcon(kind?: Kind) {
  switch (kind) {
    case "success":
    case "congratsCustomer":
    case "congratsPerformer":
      return <WalletDoneBadge/>;
    case "warning":
    case "error":
    case "confirm":
    case "tx":
      return <WalletBadges/>;
    case "magic":
      return <MailIcon/>;
    case "info":
    default:
      return <InfoIcon/>;
  }
}

function BmbModal({
  open, onClose, title, subtitle, actionLabel = "Добре",
  noBackdropClose, hideClose, icon, actionsSlot,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actionLabel?: string;
  noBackdropClose?: boolean;
  hideClose?: boolean;
  icon?: React.ReactNode;
  actionsSlot?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div role="presentation" onClick={() => !noBackdropClose && onClose()}
         style={{
           position:"fixed", inset:0, zIndex:9999,
           background:"rgba(0,0,0,.4)", backdropFilter:"blur(2px)",
           display:"flex", alignItems:"center", justifyContent:"center", padding:16
         }}>
      <div role="dialog" aria-modal="true" onClick={(e)=>e.stopPropagation()}
           style={{
             width:"min(640px, 100%)", background:"#ffcdd6",
             border:"3px solid #fff", borderRadius:24,
             boxShadow:"0 20px 60px rgba(0,0,0,.25)",
             padding:"28px 20px", textAlign:"center", color:"#111", position:"relative"
           }}>
        {!hideClose && (
          <button aria-label="Закрити" onClick={onClose}
                  style={{
                    position:"absolute", right:8, top:6, width:36, height:36,
                    borderRadius:9999, border:"none", background:"transparent",
                    fontSize:24, cursor:"pointer"
                  }}>×</button>
        )}
        <div style={{ marginBottom:10, display:"grid", placeItems:"center" }}>{icon}</div>
        {title && <h3 style={{ margin:"6px 0 4px", fontSize:22, fontWeight:800 }}>{title}</h3>}
        {subtitle && <div style={{ margin:"0 auto 14px", maxWidth:560, opacity:.9 }}>{subtitle}</div>}
        <div>
          {actionsSlot ?? (
            <button onClick={onClose}
                    style={{
                      borderRadius:9999, padding:"10px 20px",
                      background:"#111", color:"#fff", fontWeight:800,
                      border:"none", cursor:"pointer",
                      boxShadow:"0 8px 20px rgba(0,0,0,.35)"
                    }}>
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BmbModalHost() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Required<Payload> & { kind: Kind }>({
    kind:"info", title:"Повідомлення", subtitle:"", actionLabel:"Добре",
    noBackdropClose:false, hideClose:false
  });

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<Payload>).detail || {};
      setState({
        kind: (d.kind || "info") as Kind,
        title: d.title ?? "Повідомлення",
        subtitle: d.subtitle ?? "",
        actionLabel: d.actionLabel ?? "Добре",
        noBackdropClose: !!d.noBackdropClose,
        hideClose: !!d.hideClose,
      });
      setOpen(true);
    };
    const onClose = () => setOpen(false);

    window.addEventListener("bmb:modal:open", onOpen as EventListener);
    window.addEventListener("bmb:modal:close", onClose as EventListener);
    return () => {
      window.removeEventListener("bmb:modal:open", onOpen as EventListener);
      window.removeEventListener("bmb:modal:close", onClose as EventListener);
    };
  }, []);

  return (
    <BmbModal
      open={open}
      onClose={() => setOpen(false)}
      title={state.title}
      subtitle={state.subtitle}
      actionLabel={state.actionLabel}
      noBackdropClose={state.noBackdropClose}
      hideClose={state.hideClose}
      icon={pickIcon(state.kind)}
    />
  );
}
