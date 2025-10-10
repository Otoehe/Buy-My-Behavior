/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { ensureBSC } from "../lib/providerBridge";
import { quickOneClickSetup, lockFunds } from "../lib/escrowContract";
import { supabase } from "../lib/supabase";

export default function EscrowConfirm() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const sidUrl = sp.get("sid") || "";
  const amtUrl = sp.get("amt") || "";

  const [scenarioId, setScenarioId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Маркер наміру: поки активний — RouterGuard не дасть злетіти з цієї сторінки
  useEffect(() => {
    sessionStorage.setItem("bmb.lockIntent", "1");
  }, []);

  // Не губимо sid/amt
  useEffect(() => {
    const sid = sidUrl || sessionStorage.getItem("bmb.sid") || "";
    const amt = amtUrl || sessionStorage.getItem("bmb.amt") || "";
    if (sid) sessionStorage.setItem("bmb.sid", sid);
    if (amt) sessionStorage.setItem("bmb.amt", amt);
    setScenarioId(sid);
    setAmountStr(amt);
  }, [sidUrl, amtUrl]);

  const amount = useMemo(() => {
    if (!amountStr) return null;
    try { return ethers.utils.parseUnits(amountStr, 6); } catch { return null; }
  }, [amountStr]);

  async function onConfirm() {
    setErr(null);
    setBusy(true);
    try {
      // Якщо не в MetaMask — відкрити цей самий шлях у MetaMask (той самий таб)
      if (!(window as any).ethereum) {
        const host = location.host;
        const url  = `https://metamask.app.link/dapp/${host}/escrow/confirm?sid=${encodeURIComponent(scenarioId)}&amt=${encodeURIComponent(amountStr)}`;
        location.href = url;
        return;
      }

      // 1) Підключення та мережа BSC
      const eip1193 = (window as any).ethereum;
      const web3 = new ethers.providers.Web3Provider(eip1193, "any");
      await web3.send("eth_requestAccounts", []);
      await ensureBSC(eip1193);

      // 2) Перевірка параметрів
      if (!scenarioId || !amount) throw new Error("Невірні параметри сценарію або суми.");

      // 3) Забезпечити allowance (unlimited approve якщо потрібно)
      await quickOneClickSetup();

      // 4) Бронювання коштів (он-чейн)
      await lockFunds({ amount: amountStr, scenarioId });

      // 5) Необов'язковий бекенд-лог
      try {
        await supabase.from("escrow_events").insert({ scenario_id: scenarioId, kind: "LOCKED" });
      } catch {}

      // 6) Успіх → очистка наміру → повернення на сайт
      sessionStorage.removeItem("bmb.lockIntent");
      navigate(`/my-orders?sid=${encodeURIComponent(scenarioId)}&locked=1`, { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-screen-sm mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold mb-2">Підтвердження ескроу</h1>
      <p className="text-slate-600 mb-4">
        Натисніть кнопку нижче, підтвердіть транзакцію у MetaMask — і ми повернемось на “Мої замовлення”.
      </p>

      <div className="rounded-xl border border-slate-200 p-4 mb-4">
        <div className="text-sm text-slate-500">Сценарій</div>
        <div className="font-mono break-all">{scenarioId || "—"}</div>
        <div className="text-sm text-slate-500 mt-2">Сума</div>
        <div className="font-mono">{amountStr || "—"} USDT</div>
      </div>

      <button
        onClick={busy ? undefined : onConfirm}
        disabled={busy}
        className="w-full rounded-2xl px-5 py-4 bg-black text-white text-lg"
      >
        {busy ? "Підтвердження…" : `Підтвердити ескроу • ${amountStr || "—"} USDT`}
      </button>

      {err && <p className="text-red-600 mt-3">{err}</p>}
    </div>
  );
}
