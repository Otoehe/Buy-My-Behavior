import React, { useEffect, useState } from "react";

/**
 * BMBModal — корпоративна модалка Buy My Behavior
 * ▸ Ніжно‑рожевий фон (#ffcdd6), великі радіуси, чорні контрасти
 * ▸ Легкі білі кола («бульбашки») на фоні
 * ▸ Окантовка картки 3px біла; кнопка — чорна за замовчуванням
 */
function BMBModal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  actionLabel = "Добре",
  onAction,
  noBackdropClose = false,
  hideClose = false,
  actionsSlot = null,
  wrapIcon = true,
  children,
}) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    if (isOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => !noBackdropClose && onClose?.()}
      role="presentation"
    >
      <div
        className="relative w-full max-w-xl rounded-3xl border-[3px] border-white bg-[#ffcdd6] px-6 py-7 text-center text-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Бульбашки фону */}
        <div className="pointer-events-none absolute -left-10 -top-12 h-56 w-56 rounded-full bg-white/40 blur-[1px]" />
        <div className="pointer-events-none absolute -right-8 -bottom-10 h-56 w-56 rounded-full bg-white/35 blur-[1px]" />

        {/* Хрестик */}
        {!hideClose && (
          <button
            onClick={onClose}
            aria-label="Закрити"
            className="absolute right-3 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-2xl text-black/70 hover:bg-black/5"
          >
            ×
          </button>
        )}

        {/* Іконка у верхній частині */}
        {icon && (wrapIcon ? (
          <div className="relative mx-auto mb-2 grid h-20 w-20 place-items-center rounded-full border-4 border-black/15 bg-[#ffdbe2] text-4xl">
            {icon}
          </div>
        ) : (
          <div className="relative mx-auto mb-2 grid place-items-center">{icon}</div>
        ))}

        {title && <h3 className="relative mb-1 text-2xl font-extrabold tracking-tight">{title}</h3>}
        {subtitle && (
          <p className="relative mx-auto mb-3 max-w-lg text-base leading-snug text-neutral-800">{subtitle}</p>
        )}

        {children && <div className="relative mb-4">{children}</div>}

        <div className="relative flex items-center justify-center gap-3">
          {actionsSlot ?? (
            <button
              onClick={onAction ?? onClose}
              className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-base font-extrabold text-white shadow-[0_8px_20px_rgba(0,0,0,.35)] active:translate-y-[1px]"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* =====================
   Тонкі SVG‑іконки / бейджі
   ===================== */
const PhoneIcon = ({ className = "h-10 w-10", stroke = "currentColor" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={stroke} strokeWidth="1.6">
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <circle cx="12" cy="18" r="1.4" />
  </svg>
);

const InfoIcon = ({ className = "h-10 w-10", stroke = "currentColor" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={stroke} strokeWidth="1.8">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 10v7m0-11h.01" />
  </svg>
);

/**
 * LogoBadge — круглий бейдж без фону; лого заповнює весь круг; біла окантовка = ringWidth
 */
const LogoBadge = ({ src, size = 80, ringWidth = 3 }) => {
  const style = { width: size, height: size, border: `${ringWidth}px solid #fff` };
  return (
    <div className="relative grid place-items-center overflow-hidden rounded-full" style={style}>
      <img
        src={src}
        alt=""
        role="presentation"
        aria-hidden="true"
        draggable={false}
        className="h-full w-full object-contain"
      />
    </div>
  );
};

/* ======= Пара MetaMask + BNB (для смарт‑контрактних дій) ======= */
const WalletBadges = () => (
  <div className="flex items-center justify-center gap-3">
    <LogoBadge src="/MetaMask-icon-fox.svg" ringWidth={3} />
    <LogoBadge src="/BNB,_native_cryptocurrency_for_the_Binance_Smart_Chain.svg" ringWidth={3} />
  </div>
);

/* ======= Великий mUSD (фінальні вітання) ======= */
const WalletDoneBadge = () => <LogoBadge src="/mUSD-icon.svg" size={120} ringWidth={3} />;

export default function DemoBMBModals() {
  // A2HS Gate
  const [forceGate, setForceGate] = useState(false);
  const [bipEvent, setBipEvent] = useState(null);
  const [installed, setInstalled] = useState(false);

  // Other modals
  const [openSuccess, setOpenSuccess] = useState(false);
  const [openWarning, setOpenWarning] = useState(false);
  const [openError, setOpenError] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openTx, setOpenTx] = useState(false);
  const [openInfo, setOpenInfo] = useState(false);
  const [openCongratsCustomer, setOpenCongratsCustomer] = useState(false);
  const [openCongratsPerformer, setOpenCongratsPerformer] = useState(false);

  // Standalone check
  const checkStandalone = () =>
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    (window.navigator && window.navigator.standalone === true);

  useEffect(() => {
    const onBIP = (e) => {
      e.preventDefault();
      setBipEvent(e);
    };
    const onInstalled = () => {
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    setInstalled(checkStandalone());
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (forceGate && !installed && !checkStandalone()) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [forceGate, installed]);

  const handleInstallClick = async () => {
    if (bipEvent) {
      bipEvent.prompt();
      const choice = await bipEvent.userChoice;
      if (choice && choice.outcome === "accepted") {
        setTimeout(() => setInstalled(checkStandalone()), 1500);
      }
      setBipEvent(null);
    }
  };

  const mustShowGate = forceGate && !installed && !checkStandalone();

  // 🔎 smoke‑тести (лог у консоль)
  useEffect(() => {
    console.assert(typeof LogoBadge === "function", "LogoBadge має бути функцією");
    console.assert(
      [
        "/MetaMask-icon-fox.svg",
        "/BNB,_native_cryptocurrency_for_the_Binance_Smart_Chain.svg",
        "/mUSD-icon.svg",
      ].every(Boolean),
      "Шляхи до логотипів визначені"
    );
  }, []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-gray-100 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 text-3xl font-extrabold">BMB — корпоративні модалки</h1>
        <p className="mb-6 text-neutral-700">
          Натисни кнопки, щоб побачити всі варіанти, які будемо використовувати на платформі.
        </p>

        <div className="mb-3 flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={forceGate}
              onChange={(e) => setForceGate(e.target.checked)}
            />
            Показати A2HS-гейт (демо)
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setOpenSuccess(true)} className="rounded-full bg-black px-4 py-2 text-white">
            Success (Escrow виплачено)
          </button>
          <button onClick={() => setOpenWarning(true)} className="rounded-full bg-black px-4 py-2 text-white">
            Warning (Потрібна дія)
          </button>
          <button onClick={() => setOpenError(true)} className="rounded-full bg-black px-4 py-2 text-white">
            Error (Помилка мережі)
          </button>
          <button onClick={() => setOpenConfirm(true)} className="rounded-full bg-black px-4 py-2 text-white">
            Confirm (Погодити угоду)
          </button>
          <button onClick={() => setOpenTx(true)} className="rounded-full bg-black px-4 py-2 text-white">
            Tx Progress (Escrow)
          </button>
          <button onClick={() => setOpenInfo(true)} className="rounded-full bg-black px-4 py-2 text-white">
            Info (Чернетку збережено)
          </button>
          <button onClick={() => setOpenCongratsCustomer(true)} className="rounded-full bg-black px-4 py-2 text-white">
            Congrats (Замовник)
          </button>
          <button onClick={() => setOpenCongratsPerformer(true)} className="rounded-full bg-black px-4 py-2 text-white">
            Congrats (Виконавець)
          </button>
        </div>
      </div>

      {/* A2HS — Жорсткий гейт */}
      {mustShowGate && (
        <div className="fixed inset-0 z-[9999] flex select-none items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-3xl border-[3px] border-white bg-[#ffcdd6] px-6 py-8 text-center shadow-2xl">
            <div className="pointer-events-none absolute -left-10 -top-12 h-56 w-56 rounded-full bg-white/35" />
            <div className="pointer-events-none absolute -right-8 -bottom-10 h-56 w-56 rounded-full bg-white/30" />

            <div className="relative mx-auto mb-3 grid h-20 w-20 place-items-center rounded-full border-2 border-black/70 bg-yellow-300 text-black">
              <PhoneIcon />
            </div>

            <h3 className="relative mb-2 text-2xl font-semibold tracking-tight text-neutral-900">
              Додайте BMB на головний екран
            </h3>
            <p className="relative mx-auto mb-5 max-w-xl text-neutral-800">
              Відкриватимете платформу в один тап — швидше та стабільніше.
            </p>

            <div className="relative">
              <button
                onClick={handleInstallClick}
                className="relative inline-flex items-center justify-center rounded-full bg-black px-6 py-2.5 text-base font-semibold text-white shadow-[0_8px_20px_rgba(0,0,0,.35)] active:translate-y-[1px]"
              >
                Ок
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success — Escrow виплачено */}
      <BMBModal
        isOpen={openSuccess}
        onClose={() => setOpenSuccess(false)}
        wrapIcon={false}
        icon={<WalletDoneBadge />}
        title="Ваш сценарій виконаний"
        subtitle="Escrow завершив виплату. Дякуємо за використання BMB!"
        actionLabel="Добре"
      />

      {/* Congrats — фінальне вітання для Замовника */}
      <BMBModal
        isOpen={openCongratsCustomer}
        onClose={() => setOpenCongratsCustomer(false)}
        wrapIcon={false}
        icon={<WalletDoneBadge />}
        title="Вітаємо! Замовлення виконано"
        subtitle="Escrow завершив виплату. Дякуємо, що обрали BMB!"
        actionLabel="Добре"
      />

      {/* Congrats — фінальне вітання для Виконавця */}
      <BMBModal
        isOpen={openCongratsPerformer}
        onClose={() => setOpenCongratsPerformer(false)}
        wrapIcon={false}
        icon={<WalletDoneBadge />}
        title="Вітаємо! Сценарій виконано"
        subtitle="Вам нараховано бонус — перевірте гаманець MetaMask (mUSD)."
        actionLabel="Добре"
      />

      {/* Warning — Потрібно погодити угоду / реферал тощо */}
      <BMBModal
        isOpen={openWarning}
        onClose={() => setOpenWarning(false)}
        wrapIcon={false}
        icon={<WalletBadges />}
        title="Увага!"
        subtitle="Щоб продовжити, потрібно погодити угоду та забронювати кошти в escrow."
        actionLabel="Зрозуміло"
      />

      {/* Error — Неправильна мережа MetaMask / збій */}
      <BMBModal
        isOpen={openError}
        onClose={() => setOpenError(false)}
        wrapIcon={false}
        icon={<WalletBadges />}
        title="Помилка мережі"
        subtitle="Будь ласка, перемкніть MetaMask на Binance Smart Chain та спробуйте ще раз."
        actionLabel="Зрозуміло"
      />

      {/* Confirm — Погодити угоду? з двома кнопками */}
      <BMBModal
        isOpen={openConfirm}
        onClose={() => setOpenConfirm(false)}
        wrapIcon={false}
        icon={<WalletBadges />}
        title="Погодити угоду?"
        subtitle="Після погодження кошти буде заблоковано в escrow до виконання."
        actionsSlot={
          <>
            <button
              className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-base font-extrabold text-white shadow-[0_8px_20px_rgba(0,0,0,.35)]"
              onClick={() => setOpenConfirm(false)}
            >
              Так, погодити
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full border border-black/60 bg-transparent px-5 py-2.5 text-base font-semibold text-neutral-900"
              onClick={() => setOpenConfirm(false)}
           >
              Скасувати
            </button>
          </>
        }
      />

      {/* Tx Progress — блокуюча модалка під час транзакції */}
      <BMBModal
        isOpen={openTx}
        onClose={() => setOpenTx(false)}
        wrapIcon={false}
        icon={<WalletBadges />}
        hideClose
        noBackdropClose
        title="Йде транзакція…"
        subtitle="Підтвердіть дію в MetaMask та зачекайте підтвердження мережі."
      >
        <div className="relative mt-2">
          <button className="inline-flex cursor-not-allowed items-center justify-center rounded-full bg-black/60 px-5 py-2.5 text-base font-extrabold text-white">
            Очікуємо…
          </button>
        </div>
      </BMBModal>

      {/* Info — Чернетку збережено */}
      <BMBModal
        isOpen={openInfo}
        onClose={() => setOpenInfo(false)}
        icon={<InfoIcon />}
        title="Чернетку збережено"
        subtitle="Можете повернутися до редагування будь-коли — ми все відновимо."
        actionLabel="Добре"
      />
    </div>
  );
}
