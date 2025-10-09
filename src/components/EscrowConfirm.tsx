// src/pages/EscrowConfirm.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { ensureBSC } from "../lib/providerBridge";
import { approveIfNeeded, lockFunds } from "../lib/escrowContract";
import { supabase } from "../lib/supabase";

export default function EscrowConfirm() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  // очікуємо, що ми передаємо ?sid=<scenarioId>&amt=<usdtAmount>
  const scenarioId = sp.get("sid") || "";
  const amountStr  = sp.get("amt") || "";

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amount = useMemo(() => {
    if (!amountStr) return null;
    try { return ethers.utils.parseUnits(amountStr, 6); } catch { return null; }
  }, [amountStr]);

  async function onConfirm() {
    setErr(null);
    try {
      if (!(window as any).ethereum) {
        setErr("MetaMask не знайдено. Відкрий цю сторінку у MetaMask Browser.");
        return;
      }

      setBusy(true);

      // 1) ініціалізація провайдера та акаунта — ЦЕЙ виклик має бути з кліку
      const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");
      await provider.send("eth_requestAccounts", []);

      // 2) перемикаємо мережу, НЕ робимо редиректи/нові вкладки
      await ensureBSC(provider);

      if (!amount) throw new Error("Невірна сума USDT");

      // 3) approve (якщо потрібно)
      await approveIfNeeded(provider, amount);

      // 4) lockFunds
      await lockFunds(provider, { scenarioId, amount });

      // 5) лог події (аддитивно; якщо таблиці нема — просто ігноруємо)
      try {
        await supabase.from("escrow_events").insert({
          scenario_id: scenarioId,
          kind: "LOCKED",
        });
      } catch { /* no-op */ }

      // 6) повертаємо користувача до замовлень
      navigate(`/my-orders?sid=${scenarioId}&locked=1`, { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-screen-sm mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold mb-4">Вхід через MetaMask</h1>
      <p className="text-slate-600 mb-6">
        Якщо запит не з'явився — натисни кнопку нижче.
      </p>

      <button
        onClick={busy ? undefined : onConfirm}
        disabled={busy}
        className="w-full rounded-2xl px-5 py-4 bg-black text-white text-lg"
      >
        {busy ? "Підтвердження…" : `Підтвердити ескроу • ${amountStr || "—"} USDT`}
      </button>

      {err && <p className="text-red-600 mt-4">{err}</p>}
    </div>
  );
}
