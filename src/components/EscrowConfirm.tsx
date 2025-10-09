/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { ensureBSC } from "../lib/providerBridge";
import { approveIfNeeded, lockFunds } from "../lib/escrowContract";
import { supabase } from "../lib/supabase";

export default function EscrowConfirm() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const sidUrl = sp.get("sid") || "";
  const amtUrl = sp.get("amt") || "";

  const [scenarioId, setScenarioId] = useState("");
  const [amountStr, setAmountStr] = useState("");

  // не губимо sid/amt між переходами
  useEffect(() => {
    const sid = sidUrl || sessionStorage.getItem("bmb.sid") || "";
    const amt = amtUrl || sessionStorage.getItem("bmb.amt") || "";
    if (sid) sessionStorage.setItem("bmb.sid", sid);
    if (amt) sessionStorage.setItem("bmb.amt", amt);
    setScenarioId(sid);
    setAmountStr(amt);
  }, [sidUrl, amtUrl]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amount = useMemo(() => {
    if (!amountStr) return null;
    try { return ethers.utils.parseUnits(amountStr, 6); } catch { return null; }
  }, [amountStr]);

  async function onConfirm() {
    setErr(null);
    setBusy(true);
    try {
      // Якщо відкрито НЕ у MetaMask — відкриємо ту ж сторінку у MetaMask (та сама вкладка)
      if (!(window as any).ethereum) {
        const base = `https://metamask.app.link/dapp/${location.host}/escrow/confirm`;
        const url  = `${base}?sid=${encodeURIComponent(scenarioId)}&amt=${encodeURIComponent(amountStr)}`;
        location.href = url;
        return;
      }

      const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");
      // має викликатися з кліку, інакше MetaMask не покаже модалку
      await provider.send("eth_requestAccounts", []);
      await ensureBSC(provider);

      if (!scenarioId || !amount) throw new Error("Невірні параметри сценарію або суми.");

      await approveIfNeeded(provider, amount);
      await lockFunds(provider, { scenarioId, amount });

      try {
        await supabase.from("escrow_events").insert({ scenario_id: scenarioId, kind: "LOCKED" });
      } catch {}

      // повертаємо на /my-orders
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
      <p className="text-slate-600 mb-4">Після підтвердження в MetaMask повернемось на “Мої замовлення”.</p>

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
        {busy ? "Підтвердження…" : `Підтвердити бронювання • ${amountStr || "—"} USDT`}
      </button>

      {err && <p className="text-red-600 mt-3">{err}</p>}
    </div>
  );
}
