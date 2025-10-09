import React from "react";

type Props = {
  onConnect: () => void;
  onApprove: () => void;
  mmDeepLink?: string;            // посилання на dapp у MM: https://metamask.app.link/dapp/...
  busy?: boolean;                 // коли підключаємося / підписуємо
  canApprove?: boolean;           // коли є адреса гаманця тощо
  className?: string;
};

export default function MobileMMButtons({
  onConnect,
  onApprove,
  mmDeepLink,
  busy = false,
  canApprove = false,
  className = "",
}: Props) {
  const base =
    "h-12 w-full rounded-2xl text-[16px] font-semibold tracking-wide active:scale-[.98] transition " +
    "disabled:opacity-60 disabled:pointer-events-none";
  const primary   = "bg-black text-white shadow-[0_8px_24px_rgba(0,0,0,.25)]";
  const secondary = "bg-white border border-black/15";
  const linkBtn   = "text-sm font-medium underline underline-offset-2";

  return (
    <div
      className={
        "fixed inset-x-0 bottom-0 z-30 " +
        "bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/65 " +
        "border-t border-black/5"
      }
    >
      <div
        className={
          "mx-auto w-full max-w-screen-sm px-4 pt-3 " +
          // safe-area внизу + комфортний падинг
          "pb-[max(env(safe-area-inset-bottom),0.875rem)] " + className
        }
      >
        <div className="grid grid-cols-1 gap-3">
          {/* Увійти через MetaMask */}
          <button
            type="button"
            className={`${base} ${primary} flex items-center justify-center gap-2`}
            onClick={onConnect}
            disabled={busy}
            aria-busy={busy}
          >
            <MetaMaskIcon className="h-5 w-5" />
            {busy ? "З’єднання…" : "Увійти через MetaMask"}
            {busy && <Spinner />}
          </button>

          {/* Підтвердити ескроу */}
          <button
            type="button"
            className={`${base} ${secondary} flex items-center justify-center gap-2`}
            onClick={onApprove}
            disabled={!canApprove || busy}
            title={!canApprove ? "Спочатку під’єднай MetaMask" : "Підтвердити ескроу"}
          >
            <LockIcon className="h-5 w-5" />
            Підтвердити ескроу
          </button>

          {/* Посилання відкрити у MetaMask-браузері (опційно) */}
          {mmDeepLink && (
            <a
              className={`text-center ${linkBtn}`}
              href={mmDeepLink}
              rel="noopener"
            >
              Відкрити у MetaMask-браузері
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Дрібні іконки і спіннер ---------- */

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="4" fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10V8a4 4 0 118 0v2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function MetaMaskIcon({ className = "" }: { className?: string }) {
  // cпрощена «лисиця»; можна замінити на свій SVG
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#E17726" d="M3 3l8 5v4L3 3zm18 0l-8 5v4l8-9zM3 21l8-6v-3L3 21zm18 0l-8-6v-3l8 9z" />
      <path fill="#000000" d="M9 14h6v2H9z" />
    </svg>
  );
}
