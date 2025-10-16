/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isMetaMaskInApp } from "../lib/isMetaMaskBrowser";

/**
 * Екран-вхід у MetaMask. Тут ми:
 *  - відновлюємо сесію (якщо треба),
 *  - і ГОЛОВНЕ: якщо є намір забронювати (bmb.lockIntent) або sid/amt у URL —
 *    миттєво переадресовуємо на /escrow/confirm (кнопка бронювання).
 */
export default function EscrowHandoff() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      // 1) Спробуємо відновити сесію Supabase (щоб сторінка /escrow/confirm була вже авторизована)
      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session && isMetaMaskInApp()) {
          // якщо потрібно — тут можна вставити ваш cookie-брідж
        }
      } catch {}

      // 2) Прочитати намір/параметри
      const lockIntent = sessionStorage.getItem("bmb.lockIntent") === "1";
      const sid = sp.get("sid") || sessionStorage.getItem("bmb.sid") || "";
      const amt = sp.get("amt") || sessionStorage.getItem("bmb.amt") || "";

      // 3) Якщо є намір або параметри — одразу ведемо на сторінку з кнопкою
      if ((lockIntent || (sid && amt)) && sid && amt) {
        // збережемо для надійності
        try {
          sessionStorage.setItem("bmb.lockIntent", "1");
          sessionStorage.setItem("bmb.sid", sid);
          sessionStorage.setItem("bmb.amt", amt);
        } catch {}

        navigate(`/escrow/confirm?sid=${encodeURIComponent(sid)}&amt=${encodeURIComponent(amt)}`, {
          replace: true,
        });
        return;
      }

      // 4) Фолбек — якщо нічого не відомо, відправляємо на /my-orders (як раніше)
      navigate("/my-orders", { replace: true });
    })();
  }, [navigate, sp]);

  return null;
}
