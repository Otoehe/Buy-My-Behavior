import React, { useEffect } from "react";

export default function SplashScreen() {
  useEffect(() => {
    // Runtime smoke‑тести
    const logo = document.querySelector('[data-testid="splash-logo"]');
    console.log("[TEST] Logo exists:", !!logo);

    const title = document.querySelector('[data-testid="splash-title"]') as HTMLElement | null;
    const startHidden = !!title && getComputedStyle(title).opacity === "0";
    console.log("[TEST] Title starts hidden (opacity 0):", startHidden);

    setTimeout(() => {
      if (title) {
        const visible = getComputedStyle(title).opacity === "1";
        console.log("[TEST] Title visible after fade-in (opacity 1):", visible);
      }
    }, 2000);
  }, []);

  return (
    <div className="bmb-splash" data-testid="splash-root">
      {/* Лого з public/icon-512x512.png */}
      <img
        src="/icon-512x512.png"
        alt="BMB"
        className="bmb-splash__logo"
        data-testid="splash-logo"
        loading="eager"
        decoding="sync"
      />

      {/* Простий заголовок з плавним проявленням (затримка) */}
      <h1 className="bmb-splash__title animate-fade" data-testid="splash-title">
        Buy My Behavior
      </h1>

      <style>{`
        .bmb-splash {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 18px;
          min-height: 100dvh;
          background: #fff;
          -webkit-tap-highlight-color: transparent;
        }

        .bmb-splash__logo {
          width: 104px;
          height: 104px;
          border-radius: 24%;
          box-shadow: 0 2px 14px rgba(0,0,0,.08);
          image-rendering: -webkit-optimize-contrast;
        }

        .bmb-splash__title {
          margin: 0;
          font-family: inherit;
          font-weight: 700;
          font-size: 22px;
          letter-spacing: -0.01em;
          line-height: 1.1;
          text-align: center;
          color: #000;
          opacity: 0; /* старт прозорий */
        }

        /* Текст проявляється після затримки, іконка одразу */
        .animate-fade { animation: fadeInText 1.5s ease-in-out 0.8s forwards; }

        @keyframes fadeInText {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
