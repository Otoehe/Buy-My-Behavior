import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  confirmCompletionOnChain,
  getDealOnChain,
} from "../lib/escrowContract";
import { pushNotificationManager, useNotifications } from "../lib/pushNotifications";
import { useRealtimeNotifications } from "../lib/realtimeNotifications";
import CelebrationToast from "./CelebrationToast";
import "./MyOrders.css";

import type { DisputeRow } from "../lib/tables";
import { initiateDispute, getLatestDisputeByScenario } from "../lib/disputeApi";

import ScenarioCard, { Scenario, Status } from "./ScenarioCard";
import RateModal from "./RateModal";
import { upsertRating } from "../lib/ratings";

import { ensureInMetaMaskDapp, connectWallet, ensureBSC, waitForReturn, isMobileUA, isMetaMaskInApp } from "../lib/providerBridge";
import { lockFundsMobileFlow } from "../lib/escrowMobile";

const SOUND = new Audio("/notification.wav");
SOUND.volume = 0.8;

async function withTimeout<T>(p: Promise<T>, ms = 8000, label = "op"): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout:${label}`)), ms)) as any,
  ]);
}

async function ensureProviderReady() {
  const { provider } = await connectWallet();
  if (!provider || typeof (provider as any).request !== "function") {
    throw new Error("Wallet is not connected. Open MetaMask and confirm connection.");
  }
  await ensureBSC(provider);
  return provider;
}

const isBothAgreed = (s: Scenario) => !!s.is_agreed_by_customer && !!s.is_agreed_by_executor;
const canEditFields = (s: Scenario) => !isBothAgreed(s) && !s.escrow_tx_hash && s.status !== "confirmed";

const getStage = (s: Scenario) => {
  if (s.status === "confirmed") return 3;
  if (s.escrow_tx_hash) return 2;
  if (isBothAgreed(s)) return 1;
  return 0;
};

function StatusStrip({ s }: { s: Scenario }) {
  const stage = getStage(s);
  const Dot = ({ active }: { active: boolean }) => (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: 9999,
        display: "inline-block",
        margin: "0 6px",
        background: active ? "#111" : "#e5e7eb",
      }}
    />
  );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        borderRadius: 10,
        background: "rgba(0,0,0,0.035)",
        margin: "6px 0 10px",
      }}
    >
      <Dot active={stage >= 0} />
      <Dot active={stage >= 1} />
      <Dot active={stage >= 2} />
      <Dot active={stage >= 3} />
      <div style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>
        {stage === 0 && "• Угоду погоджено → далі кошти в Escrow"}
        {stage === 1 && "• Погоджено → кошти ще не заблоковані"}
        {stage === 2 && "• Кошти заблоковано → очікуємо виконання"}
        {stage === 3 && "• Виконання підтверджено"}
      </div>
    </div>
  );
}

export default function MyOrders() {
  const [userId, setUserId] = useState("");
  const [list, setList] = useState<Scenario[]>([]);
  const [agreeBusy, setAgreeBusy] = useState<Record<string, boolean>>({});
  const [confirmBusy, setConfirmBusy] = useState<Record<string, boolean>>({});
  const [lockBusy, setLockBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState(false);
  const [openDisputes, setOpenDisputes] = useState<Record<string, DisputeRow | null>>({});
  const [ratedOrders, setRatedOrders] = useState<Set<string>>(new Set());

  const [rateOpen, setRateOpen] = useState(false);
  const [rateFor, setRateFor] = useState<{ scenarioId: string; counterpartyId: string } | null>(null);
  const [rateScore, setRateScore] = useState(10);
  const [rateComment, setRateComment] = useState("");
  const [rateBusy, setRateBusy] = useState(false);

  const { permissionStatus, requestPermission } = useNotifications();
  const rt = useRealtimeNotifications(userId);

  const setLocal = (id: string, patch: Partial<Scenario>) =>
    setList(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x)));

  const hasCoords = (s: Scenario) =>
    typeof s.latitude === "number" && Number.isFinite(s.latitude) &&
    typeof s.longitude === "number" && Number.isFinite(s.longitude);

  const canAgree = (s: Scenario) => !s.escrow_tx_hash && s.status !== "confirmed" && !s.is_agreed_by_customer;

  const canConfirm = (s: Scenario) => {
    if (!s.escrow_tx_hash) return false;
    if (s.is_completed_by_customer) return false;
    const dt = s.execution_time ? new Date(s.execution_time) : new Date(`${s.date}T${s.time || "00:00"}`);
    return !Number.isNaN(dt.getTime()) && new Date() >= dt;
  };

  const canCustomerRate = (s: Scenario, rated: boolean) => !!(s as any).is_completed_by_executor && !rated;

  const loadOpenDispute = useCallback(async (scenarioId: string) => {
    const d = await getLatestDisputeByScenario(scenarioId);
    setOpenDisputes(prev => ({ ...prev, [scenarioId]: d && d.status === "open" ? d : null }));
  }, []);

  const load = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("scenarios")
      .select("*")
      .eq("creator_id", uid)
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    setList(((data || []) as Scenario[]).filter(s => s.creator_id === uid));
  }, []);

  const refreshRated = useCallback(async (uid: string, items: Scenario[]) => {
    if (!uid || items.length === 0) {
      setRatedOrders(new Set());
      return;
    }
    const ids = items.map(s => s.id);
    const { data } = await supabase.from("ratings").select("order_id").eq("rater_id", uid).in("order_id", ids);
    setRatedOrders(new Set((data || []).map((r: any) => r.order_id)));
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id;
      if (!uid) return;
      setUserId(uid);
      await load(uid);

      const ch = supabase
        .channel("realtime:myorders")
        .on("postgres_changes", { event: "*", schema: "public", table: "scenarios" }, async p => {
          const ev = p.eventType as "INSERT" | "UPDATE" | "DELETE";
          const s = (p as any).new as Scenario | undefined;
          const oldId = (p as any).old?.id as string | undefined;

          setList(prev => {
            if (ev === "DELETE" && oldId) return prev.filter(x => x.id !== oldId);
            if (!s) return prev;

            if (s.creator_id !== uid) return prev.filter(x => x.id !== s.id);

            const i = prev.findIndex(x => x.id === s.id);
            if (ev === "INSERT") {
              if (i === -1) return [s, ...prev];
              const cp = [...prev];
              cp[i] = { ...cp[i], ...s };
              return cp;
            }
            if (ev === "UPDATE") {
              if (i === -1) return prev;
              const before = prev[i];
              const after = { ...before, ...s };

              if (before.status !== "confirmed" && after.status === "confirmed") {
                (async () => {
                  try { SOUND.currentTime = 0; await SOUND.play(); } catch {}
                  await pushNotificationManager.showNotification({
                    title: "🎉 Виконання підтверджено",
                    body: "Escrow розподілив кошти.",
                    tag: `confirm-${after.id}`,
                    requireSound: true,
                  });
                })();
                setToast(true);
              }

              const bothAgreed = !!after.is_agreed_by_customer && !!after.is_agreed_by_executor;
              const needLock = bothAgreed && !after.escrow_tx_hash && after.creator_id === uid;

              const cp = [...prev];
              cp[i] = after;

              if (needLock && !(window as any).__locking) {
                (window as any).__locking = true;
                setTimeout(() => handleLock(after).finally(() => { (window as any).__locking = false; }), 0);
              }

              return cp;
            }
            return prev;
          });

          setTimeout(() => refreshRated(uid, s ? [s] : []), 0);
        })
        .subscribe();

      const chRatings = supabase
        .channel(`ratings:my:${uid}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "ratings", filter: `rater_id=eq.${uid}` }, async () => {
          await refreshRated(uid, list);
        })
        .subscribe();

      return () => {
        try { supabase.removeChannel(ch); } catch {}
        try { supabase.removeChannel(chRatings); } catch {}
      };
    })();
  }, [load, list, refreshRated]);

  useEffect(() => {
    if (!userId) return;
    refreshRated(userId, list);
    list.forEach(s => { if (s?.id) loadOpenDispute(s.id); });
  }, [userId, list, loadOpenDispute, refreshRated]);

  const handleAgree = async (s: Scenario) => {
    if (agreeBusy[s.id] || !canAgree(s)) return;
    setAgreeBusy(p => ({ ...p, [s.id]: true }));
    try {
      const { data: rec, error } = await supabase
        .from("scenarios")
        .update({ is_agreed_by_customer: true, status: (s.is_agreed_by_executor ? "agreed" : "pending") as Status })
        .eq("id", s.id)
        .eq("is_agreed_by_customer", false)
        .select()
        .single();
      if (error && error.code !== "PGRST116") throw error;
      setLocal(s.id, { is_agreed_by_customer: true, status: rec?.status || s.status });
    } catch (e: any) {
      alert(e?.message || "Помилка погодження.");
    } finally {
      setAgreeBusy(p => ({ ...p, [s.id]: false }));
    }
  };

  async function resolveWallets(s: Scenario): Promise<{ executor: string; referrer: string }> {
    const ZERO = "0x0000000000000000000000000000000000000000";

    let executor =
      (s as any).executor_wallet ||
      (s as any).executorAddress ||
      (s as any).executor ||
      null;

    let referrer =
      (s as any).referrer_wallet ||
      (s as any).referrerAddress ||
      (s as any).referrer ||
      null;

    if (!executor && (s as any).executor_id) {
      const { data: prof } = await supabase.from("profiles").select("*").eq("user_id", (s as any).executor_id).single();
      if (prof) {
        executor =
          (prof as any).wallet ||
          (prof as any).wallet_address ||
          (prof as any).metamask_wallet ||
          (prof as any).bsc_wallet ||
          (prof as any).eth_wallet ||
          (prof as any).public_address ||
          (prof as any).address ||
          null;

        if (!referrer) {
          referrer = (prof as any).referrer_wallet || null;
        }
      }
    }

    referrer = (s as any).referrer_wallet ?? referrer ?? null;

    if (!executor) throw new Error("Не знайдено адресу гаманця виконавця для цієї угоди.");

    return { executor, referrer: referrer ?? ZERO };
  }

  function deriveExecutionTimeSec(s: Scenario): number {
    if ((s as any).execution_time) {
      const t = new Date((s as any).execution_time).getTime();
      if (!Number.isNaN(t)) return Math.floor(t / 1000);
    }
    if ((s as any).date) {
      const t = new Date(`${(s as any).date}T${(s as any).time || "00:00"}`).getTime();
      if (!Number.isNaN(t)) return Math.floor(t / 1000);
    }
    return Math.floor(Date.now() / 1000) + 3600;
  }

  const handleLock = async (s: Scenario) => {
    if (lockBusy[s.id]) return;
    if (!s.donation_amount_usdt || s.donation_amount_usdt <= 0) {
      alert("Сума має бути > 0");
      return;
    }
    if (!isBothAgreed(s)) {
      alert("Спершу потрібні дві згоди.");
      return;
    }
    if (s.escrow_tx_hash) return;

    // 🟣 ДОДАНО: якщо мобільний зовнішній браузер — відкриваємо сторінку всередині MetaMask
    if (isMobileUA() && !isMetaMaskInApp()) {
      // плавно переведемо користувача у MetaMask Browser перед початком флоу
      await ensureInMetaMaskDapp();
    }

    setLockBusy(p => ({ ...p, [s.id]: true }));
    try {
      const { executor, referrer } = await resolveWallets(s);
      const execTime = deriveExecutionTimeSec(s);

      const res = await lockFundsMobileFlow({
        scenarioId: s.id,
        executor,
        referrer,
        amount: Number(s.donation_amount_usdt),
        executionTime: execTime,
        onStatus: (st, payload) => {
          if (st === "connecting")         console.log("[BMB] Connecting wallet...");
          if (st === "ensuring_chain")     console.log("[BMB] Ensuring BSC...");
          if (st === "checking_allowance") console.log("[BMB] Checking allowance...");
          if (st === "approving")          console.log("[BMB] Approving USDT...", payload);
          if (st === "locking")            console.log("[BMB] Locking funds...");
          if (st === "done")               console.log("[BMB] Lock done:", payload);
        },
        waitConfirms: 1,
      });

      await supabase
        .from("scenarios")
        .update({ escrow_tx_hash: res.lockTxHash, status: "agreed" })
        .eq("id", s.id);

      setLocal(s.id, { escrow_tx_hash: res.lockTxHash as any, status: "agreed" });
    } catch (e: any) {
      alert(e?.message || "Не вдалося заблокувати кошти.");
    } finally {
      setLockBusy(p => ({ ...p, [s.id]: false }));
    }
  };

  const handleConfirm = async (s: Scenario) => {
    if (confirmBusy[s.id] || !canConfirm(s)) return;
    setConfirmBusy(p => ({ ...p, [s.id]: true }));
    try {
      const eth = await ensureProviderReady();

      try { await withTimeout(eth.request({ method: "eth_chainId" }), 4000, "poke4"); } catch {}
      try { await withTimeout(eth.request({ method: "eth_accounts" }), 4000, "poke5"); } catch {}
      try { await waitForReturn(15000); } catch {}

      await confirmCompletionOnChain({ scenarioId: s.id });
      setLocal(s.id, { is_completed_by_customer: true });

      await supabase.from("scenarios").update({ is_completed_by_customer: true }).eq("id", s.id).eq("is_completed_by_customer", false);

      const deal = await getDealOnChain(s.id);
      if (deal && Number((deal as any).status) === 3) {
        await supabase.from("scenarios").update({ status: "confirmed" }).eq("id", s.id);
        setToast(true);
      }
    } catch (e: any) {
      alert(e?.message || "Помилка підтвердження.");
    } finally {
      setConfirmBusy(p => ({ ...p, [s.id]: false }));
    }
  };

  const handleDispute = async (s: Scenario) => {
    try {
      const d = await initiateDispute(s.id);
      setLocal(s.id, { status: "disputed" } as any);
      setOpenDisputes(prev => ({ ...prev, [s.id]: d }));
    } catch (e: any) {
      alert(e?.message || "Не вдалося створити спір");
    }
  };

  const openRateFor = (s: Scenario) => {
    setRateScore(10);
    setRateComment("");
    setRateFor({ scenarioId: s.id, counterpartyId: s.executor_id });
    setRateOpen(true);
  };

  const saveRating = async () => {
    if (!rateFor) return;
    setRateBusy(true);
    try {
      await upsertRating({
        scenarioId: rateFor.scenarioId,
        rateeId: rateFor.counterpartyId,
        score: rateScore,
        comment: rateComment,
      });
      setRateOpen(false);
      setRatedOrders(prev => new Set([...Array.from(prev), rateFor.scenarioId]));
      window.dispatchEvent(new CustomEvent("ratings:updated", { detail: { userId: rateFor.counterpartyId } }));
      alert("Рейтинг збережено ✅");
    } catch (e: any) {
      alert(e?.message ?? "Помилка під час збереження рейтингу");
    } finally {
      setRateBusy(false);
    }
  };

  const headerRight = useMemo(
    () => (
      <div className="scenario-status-panel">
        <span>
          🔔 {permissionStatus === "granted"
            ? "Увімкнено"
            : permissionStatus === "denied"
              ? "Не підключено"
              : "Не запитано"}
        </span>
        <span>📡 {rt.isListening ? `${rt.method} активний` : "Не підключено"}</span>
        {permissionStatus !== "granted" && (
          <button className="notify-btn" onClick={requestPermission}>
            🔔 Дозволити
          </button>
        )}
      </div>
    ),
    [permissionStatus, requestPermission, rt.isListening, rt.method]
  );

  return (
    <div className="scenario-list">
      <div className="scenario-header">
        <h2>Мої замовлення</h2>
        {headerRight}
      </div>

      {list.length === 0 && <div className="empty-hint">Немає активних замовлень.</div>}

      {list.map(s => {
        const bothAgreed = isBothAgreed(s);
        const fieldsEditable = canEditFields(s);
        const rated = ratedOrders.has(s.id);
        const showBigRate = canCustomerRate(s, rated);

        return (
          <div key={s.id} style={{ marginBottom: 18 }}>
            <StatusStrip s={s} />

            <ScenarioCard
              role="customer"
              s={s}
              onChangeDesc={v => { if (fieldsEditable) setLocal(s.id, { description: v }); }}
              onCommitDesc={async v => {
                if (!fieldsEditable) return;
                await supabase
                  .from("scenarios")
                  .update({ description: v, status: "pending", is_agreed_by_customer: false, is_agreed_by_executor: false })
                  .eq("id", s.id);
              }}
              onChangeAmount={v => { if (fieldsEditable) setLocal(s.id, { donation_amount_usdt: v }); }}
              onCommitAmount={async v => {
                if (!fieldsEditable) return;
                if (v !== null && (!Number.isFinite(v) || v <= 0)) {
                  alert("Сума має бути > 0");
                  setLocal(s.id, { donation_amount_usdt: null });
                  return;
                }
                await supabase
                  .from("scenarios")
                  .update({ donation_amount_usdt: v, status: "pending", is_agreed_by_customer: false, is_agreed_by_executor: false })
                  .eq("id", s.id);
              }}
              onAgree={() => handleAgree(s)}
              onLock={() => handleLock(s)}
              onConfirm={() => handleConfirm(s)}
              onDispute={() => handleDispute(s)}
              onOpenLocation={() => {
                if (hasCoords(s)) {
                  window.open(`https://www.google.com/maps?q=${s.latitude},${s.longitude}`, "_blank");
                } else {
                  alert("Локацію ще не встановлено або її не видно. Додайте/перевірте локацію у формі сценарію.");
                }
              }}
              canAgree={canAgree(s)}
              canLock={bothAgreed && !s.escrow_tx_hash}
              canConfirm={canConfirm(s)}
              canDispute={s.status !== "confirmed" && !!s.escrow_tx_hash && !openDisputes[s.id] && userId === s.creator_id}
              hasCoords={true}
              isRated={rated}
              onOpenRate={() => openRateFor(s)}
            />

            {showBigRate && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={() => openRateFor(s)}
                  style={{
                    width: "100%",
                    maxWidth: 520,
                    marginTop: 10,
                    padding: "12px 18px",
                    borderRadius: 999,
                    background: "#ffd7e0",
                    color: "#111",
                    fontWeight: 800,
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: "#f3c0ca",
                    cursor: "pointer",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.7)",
                  }}
                >
                  ⭐ Оцінити виконавця
                </button>
              </div>
            )}
          </div>
        );
      })}

      <CelebrationToast open={toast} variant="customer" onClose={() => setToast(false)} />

      <RateModal
        open={rateOpen}
        score={rateScore}
        comment={rateComment}
        onChangeScore={setRateScore}
        onChangeComment={setRateComment}
        onCancel={() => setRateOpen(false)}
        onSave={saveRating}
        disabled={rateBusy}
      />
    </div>
  );
}
