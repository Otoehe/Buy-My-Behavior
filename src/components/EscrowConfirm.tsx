// src/pages/EscrowConfirm.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { ensureBSC } from "../lib/providerBridge";
import { approveIfNeeded, lockFunds } from "../lib/escrowContract";
import { supabase } from "../lib/supabase";

/** Невеличкий лог у консоль й на екран */
function useUILog() {
  const [lines, setLines] = useState<string[]>([]);
  function log(s: string) {
    console.log("[EscrowConfirm]", s);
    setLines((x) => [...x, s]);
  }
  return { lines, log };
}

export default function EscrowConfirm() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { lines, log } = useUILog();

  // 1) Читаємо sid/amt з URL або з sessionStorage (щоб не “губились” між редиректами)
  const urlSid = sp.get("sid") || "";
  const urlAmt = sp.get("amt") || "";

  const [scenarioId, setScenarioId] = useState<string>("");
  const [amountStr, setAmountStr] = useState<string>("");

  useEffect(() => {
    const s0 = urlSid || sessionStorage.getItem("bmb.sid") || "";
    const a0 = urlAmt || sessionStorage.getItem("bmb.amt") || "";
    if (s0) sessionStorage.setItem("bmb.sid", s0);
    if (a0) sessionStorage.setItem("bmb.amt", a0);
    setScenarioId(s0);
    setAmountStr(a0);
  }, [urlSid, urlAmt]);

  // 2) Виявляємо, чи ми у вбудованому браузері MetaMask
  const isMetaMaskMobile = /MetaMaskMobile/i.test(navigator.userAgent);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ethReady, setEthReady] = useState(false);

  // 3) Акуратно чекаємо на window.ethereum (до 5 секунд), але кнопку все одно рендеримо
  useEffect(() => {
    let alive = true;
    let passed = 0;
    const id = setInterval(() => {
      passed += 250;
      if (!alive) return;
      if ((window as any).ethereum) {
        setEthReady(true);
        clearInterval(id);
      } else if (passed >= 5000) {
        // показуємо, що не знайшли — користувач зможе натиснути запасну кнопку
        setEthReady(false);
        clearInterval(id);
      }
    }, 250);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const amount = useMemo(() => {
    if (!amountStr) return null;
    try {
      return ethers.utils.parseUnits(amountStr, 6);
    } catch {
      return null;
    }
  }, [amountStr]);

  async function onConfirm() {
    setErr(null);
    setBusy(true);
    try {
      log("Натиснуто Підтвердити");
      if (!(window as any).ethereum) {
        throw new Error(
          "MetaMask не знайдено у цьому вікні. Відкрий сторінку у MetaMask Browser або натисни нижче «Відкрити в MetaMask»."
        );
      }

      const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");
      // ВАЖЛИВО: цей виклик іде з кліку — MetaMask точно покаже модалку
      await provider.send("eth_requestAccounts", []);
      log("Акаунт отримано");

      await ensureBSC(provider);
      log("Мережа BSC активна");

      if (!amount || !scenarioId) {
        throw new Error("Невірні параметри сценарію або суми.");
      }

      // 1) approve (якщо необхідно)
      await approveIfNeeded(provider, amount);
      log("approve завершено або не потрібен");

      // 2) lockFunds
      await lockFunds(provider, { scenarioId, amount });
      log("lockFunds успішний");

      // 3) лог події (опційно)
      try {
        await supabase.from("escrow_events").insert({
          scenario_id: scenarioId,
          kind: "LOCKED",
        });
      } catch {
        /* no-op */
      }

      // 4) Повертаємось у замовлення
      navigate(`/my-orders?sid=${encodeURIComponent(scenarioId)}&locked=1`, { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      log(`ПОМИЛКА: ${e?.message ?? String(e)}`);
      // залишаємо кнопку активною — юзер зможе спробувати ще раз
    } finally {
      setBusy(false);
    }
  }

  // Запасний шлях: якщо відкрилось не у MetaMask — перекидаємо прямо туди (без _blank)
  function openInMetaMask() {
    const base = `https://metamask.app.link/dapp/${location.host}/escrow/confirm`;
    const url = `${base}?sid=${encodeURIComponent(scenarioId)}&amt=${encodeURIComponent(amountStr)}`;
    location.href = url; // не відкриваємо нову вкладку
  }

  return (
    <div className="max-w-screen-sm mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold mb-2">Вхід через MetaMask</h1>
      <p className="text-slate-600 mb-4">Якщо запит не з'явився — натисни кнопку нижче.</p>

      <div className="rounded-xl border border-slate-200 p-4 mb-4">
        <div className="text-sm text-slate-600">Сценарій</div>
        <div className="font-mono break-all">{scenarioId || "—"}</div>
        <div className="text-sm text-slate-600 mt-2">Сума</div>
        <div className="font-mono">{amountStr || "—"} USDT</div>
      </div>

      <button
        onClick={busy ? undefined : onConfirm}
        disabled={busy}
        className="w-full rounded-2xl px-5 py-4 bg-black text-white text-lg"
      >
        {busy ? "Підтвердження…" : `Підтвердити ескроу • ${amountStr || "—"} USDT`}
      </button>

      {!isMetaMaskMobile && (
        <button
          onClick={openInMetaMask}
          className="mt-3 w-full rounded-2xl px-5 py-3 border border-slate-300 text-slate-800"
        >
          Відкрити цю сторінку у MetaMask
        </button>
      )}

      <div className="mt-4 text-xs text-slate-500 whitespace-pre-wrap">
        <strong>Статус:</strong>{" "}
        {ethReady ? "MetaMask виявлено" : "MetaMask не виявлено (ок, можна натиснути «Відкрити в MetaMask»)"}
        {"\n"}
        {lines.map((l, i) => `• ${l}`).join("\n")}
      </div>

      {err && <p className="text-red-600 mt-3">{err}</p>}
    </div>
  );
}
