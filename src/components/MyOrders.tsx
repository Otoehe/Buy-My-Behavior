/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import EscrowButton from "./EscrowButton";

import { confirmCompletionOnChain, getDealOnChain } from "../lib/escrowContract";
import {
  pushNotificationManager as pushNotificationManager,
  useNotifications,
} from "../lib/pushNotifications";
import { useRealtimeNotifications } from "../lib/realtimeNotifications";
import CelebrationToast from "./CelebrationToast";
import "./MyOrders.css";

import type { DisputeRow } from "../lib/tables";
import { initiateDispute, getLatestDisputeByScenario } from "../lib/disputeApi";

import ScenarioCard, { Scenario, Status } from "./ScenarioCard";
import RateModal from "./RateModal";
import { upsertRating } from "../lib/ratings";

import { connectWallet, ensureBSC, waitForReturn } from "../lib/providerBridge";
import { lockFundsMobileFlow } from "../lib/escrowMobile";

// ⬇ якщо цього немає у проєкті — ок, воно опційне
import { writeSupabaseSessionCookie } from "../lib/supabaseSessionBridge";

// i18n
import { useTranslation } from "react-i18next";

/* -----------------------------------------
 * ЛОКАЛЬНІ невеличкі утиліти, щоб не падали імпорти
 * ----------------------------------------- */
const isMobileUA = (): boolean =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

const isMetaMaskInApp = (): boolean =>
  /MetaMaskMobile/i.test(navigator.userAgent || "");

function openInMetaMaskDapp(
  nextPath: string,
  handoff?: { at?: string | null; rt?: string | null; next?: string }
) {
  // домен беремо з ENV або з поточного location
  const publicUrl =
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || window.location.origin;
  const host = publicUrl.replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
  const base = `https://metamask.app.link/dapp/${host}`;

  let url = `${base}${nextPath.startsWith("/") ? nextPath : `/${nextPath}`}`;

  if (handoff && (handoff.at || handoff.rt || handoff.next)) {
    const payload = encodeURIComponent(btoa(JSON.stringify(handoff)));
    url += `#bmbSess=${payload}`;
  }
  window.location.href = url;
}

/* ----------------------------------------- */

const SOUND = new Audio("/notification.wav");
SOUND.volume = 0.8;

async function withTimeout<T>(p: Promise<T>, ms = 8000, label = "op"): Promise<T> {
  return (await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout:${label}`)), ms)) as any,
  ])) as T;
}

async function ensureProviderReady() {
  const { provider } = await connectWallet();
  await ensureBSC(provider);
  return provider;
}

const isBothAgreed = (s: Scenario) => !!s.is_agreed_by_customer && !!s.is_agreed_by_executor;
const canEditFields = (s: Scenario) =>
  !isBothAgreed(s) && !s.escrow_tx_hash && s.status !== "confirmed";

/** 0:None/Init, 1:Agreed, 2:Locked, 3:Confirmed — як у контракті */
function asStatusNum(x: any): number {
  const n = Number((x ?? {}).status);
  return Number.isFinite(n) ? n : -1;
}

/** Очікуємо поки угода стане в потрібний статус на ланцюгу (polling) */
async function waitDealStatus(
  scenarioId: string,
  target: number,
  timeoutMs = 120_000,
  stepMs = 3_000
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const deal = await getDealOnChain(scenarioId);
      if (asStatusNum(deal) === target) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return false;
}

function StatusStrip({ s }: { s: Scenario }) {
  const stage = s.status === "confirmed" ? 3 : s.escrow_tx_hash ? 2 : isBothAgreed(s) ? 1 : 0;
  const { t } = useTranslation();

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
        {stage === 0 && t("status.init")}
        {stage === 1 && t("status.agreed")}
        {stage === 2 && t("status.locked")}
        {stage === 3 && t("status.confirmed")}
      </div>
    </div>
  );
}

export default function MyOrders() {
  const location = useLocation();
  const { t } = useTranslation();

  const [userId, setUserId] = useState("");
  const [list, setList] = useState<Scenario[]>([]);
  const [agreeBusy, setAgreeBusy] = useState<Record<string, boolean>>({});
  const [confirmBusy, setConfirmBusy] = useState<Record<string, boolean>>({});
  const [lockBusy, setLockBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState(false);
  const [openDisputes, setOpenDisputes] = useState<Record<string, DisputeRow | null>>({});
  const [ratedOrders, setRatedOrders] = useState<Set<string>>(new Set());
  const [lockedOnChain, setLockedOnChain] = useState<Record<string, boolean>>({});

  const [rateOpen, setRateOpen] = useState(false);
  const [rateFor, setRateFor] = useState<{ scenarioId: string; counterpartyId: string } | null>(
    null
  );
  const [rateScore, setRateScore] = useState(10);
  const [rateComment, setRateComment] = useState("");
  const [rateBusy, setRateBusy] = useState(false);

  const { permissionStatus, requestPermission } = useNotifications();
  const rt = useRealtimeNotifications(userId);

  const setLocal = (id: string, patch: Partial<Scenario>) =>
    setList((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const hasCoords = (s: Scenario) =>
    typeof s.latitude === "number" &&
    Number.isFinite(s.latitude) &&
    typeof s.longitude === "number" &&
    Number.isFinite(s.longitude);

  const canAgree = (s: Scenario) =>
    !s.escrow_tx_hash && s.status !== "confirmed" && !s.is_agreed_by_customer;

  const canConfirm = (s: Scenario) => {
    if (!s.escrow_tx_hash) return false;
    if (!lockedOnChain[s.id]) return false;
    if (s.is_completed_by_customer) return false;
    const dt = s.execution_time
      ? new Date(s.execution_time)
      : new Date(`${s.date}T${s.time || "00:00"}`);
    return !Number.isNaN(dt.getTime()) && new Date() >= dt;
  };

  const canCustomerRate = (s: Scenario, rated: boolean) =>
    !!(s as any).is_completed_by_executor && !rated;

  const markLockedLocal = (id: string, v: boolean) =>
    setLockedOnChain((prev) => ({ ...prev, [id]: v }));

  const refreshLocked = useCallback(async (id: string) => {
    try {
      const deal = await getDealOnChain(id);
      markLockedLocal(id, asStatusNum(deal) === 2);
    } catch {
      markLockedLocal(id, false);
    }
  }, []);

  const loadOpenDispute = useCallback(async (scenarioId: string) => {
    const d = await getLatestDisputeByScenario(scenarioId);
    setOpenDisputes((prev) => ({ ...prev, [scenarioId]: d && d.status === "open" ? d : null }));
  }, []);

  const load = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
        .from("scenarios")
        .select("*")
        .eq("creator_id", uid)
        .order("created_at", { ascending: false });
      if (error) console.error(error);
      const items = ((data || []) as Scenario[]).filter((s) => s.creator_id === uid);
      setList(items);
      items.forEach((s) => {
        if (s.escrow_tx_hash) refreshLocked(s.id);
      });
    },
    [refreshLocked]
  );

  const refreshRated = useCallback(async (uid: string, items: Scenario[]) => {
    if (!uid || items.length === 0) {
      setRatedOrders(new Set());
      return;
    }
    const ids = items.map((s) => s.id);
    const { data } = await supabase
      .from("ratings")
      .select("order_id")
      .eq("rater_id", uid)
      .in("order_id", ids);
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
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "scenarios" },
          async (p) => {
            const ev = p.eventType as "INSERT" | "UPDATE" | "DELETE";
            const s = (p as any).new as Scenario | undefined;
            const oldId = (p as any).old?.id as string | undefined;

            setList((prev) => {
              if (ev === "DELETE" && oldId) return prev.filter((x) => x !== undefined && x.id !== oldId);
              if (!s) return prev;

              if (s.creator_id !== uid) return prev.filter((x) => x.id !== s.id);

              const i = prev.findIndex((x) => x.id === s.id);
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
                    try {
                      SOUND.currentTime = 0;
                      await SOUND.play();
                    } catch {}
                    await pushNotificationManager.showNotification({
                      title: t("notify.confirm_title"),
                      body: t("notify.confirm_body"),
                      tag: `confirm-${after.id}`,
                      requireSound: true,
                    });
                  })();
                  setToast(true);
                }

                const bothAgreed = !!after.is_agreed_by_customer && !!after.is_agreed_by_executor;
                const needLock =
                  bothAgreed && !after.escrow_tx_hash && after.creator_id === uid;

                const cp = [...prev];
                cp[i] = after;

                if (after.escrow_tx_hash) refreshLocked(after.id);

                if (needLock && !(window as any).__locking) {
                  (window as any).__locking = true;
                  setTimeout(
                    () => handleLock(after).finally(() => ((window as any).__locking = false)),
                    0
                  );
                }

                return cp;
              }
              return prev;
            });

            setTimeout(() => refreshRated(uid, s ? [s] : []), 0);
          }
        )
        .subscribe();

      const chRatings = supabase
        .channel(`ratings:my:${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "ratings", filter: `rater_id=eq.${uid}` },
          async () => {
            await refreshRated(uid, list);
          }
        )
        .subscribe();

      return () => {
        try {
          supabase.removeChannel(ch);
        } catch {}
        try {
          supabase.removeChannel(chRatings);
        } catch {}
      };
    })();
  }, [load, list, refreshRated, refreshLocked, t]);

  useEffect(() => {
    if (!userId) return;
    refreshRated(userId, list);
    list.forEach((s) => {
      if (s?.id) loadOpenDispute(s.id);
    });
  }, [userId, list, loadOpenDispute, refreshRated]);

  const handleAgree = async (s: Scenario) => {
    if (agreeBusy[s.id] || !canAgree(s)) return;
    setAgreeBusy((p) => ({ ...p, [s.id]: true }));
    try {
      const { data: rec, error } = await supabase
        .from("scenarios")
        .update({
          is_agreed_by_customer: true,
          status: (s.is_agreed_by_executor ? "agreed" : "pending") as Status,
        })
        .eq("id", s.id)
        .eq("is_agreed_by_customer", false)
        .select()
        .single();
      if (error && error.code !== "PGRST116") throw error;
      setLocal(s.id, { is_agreed_by_customer: true, status: rec?.status || s.status });
    } catch (e: any) {
      alert(e?.message || t("errors.agree_failed"));
    } finally {
      setAgreeBusy((p) => ({ ...p, [s.id]: false }));
    }
  };

  /** Резолвер гаманця виконавця */
  async function resolveWallets(s: Scenario): Promise<{ executor: string; referrer: string }> {
    const ZERO = "0x0000000000000000000000000000000000000000";

    let executor =
      (s as any).executor_wallet || (s as any).executorAddress || (s as any).executor || null;

    if (!executor && (s as any).executor_id) {
      const execId = (s as any).executor_id as string;
      const { data: prof } = await supabase
        .from("profiles")
        .select("wallet")
        .eq("user_id", execId)
        .single();
      executor = prof?.wallet ?? null;
    }

    if (!executor || typeof executor !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(executor)) {
      throw new Error(t("errors.executor_wallet_missing"));
    }

    const referrer = (s as any).referrer_wallet ?? ZERO;
    return { executor, referrer };
  }

  const handleLock = async (s: Scenario) => {
    if (lockBusy[s.id]) return;
    if (!s.donation_amount_usdt || s.donation_amount_usdt <= 0) {
      alert(t("errors.amount_positive"));
      return;
    }
    if (!isBothAgreed(s)) {
      alert(t("errors.need_two_agrees"));
      return;
    }
    if (s.escrow_tx_hash) {
      refreshLocked(s.id);
      return;
    }

    setLockBusy((p) => ({ ...p, [s.id]: true }));
    try {
      const { executor, referrer } = await resolveWallets(s);

      const txHash = await lockFundsMobileFlow({
        scenarioId: s.id,
        executor,
        referrer,
        amount: Number(s.donation_amount_usdt),
        onStatus: () => {},
      });

      const ok = await waitDealStatus(s.id, 2, 120_000, 3_000);
      if (!ok) {
        alert(t("errors.not_yet_locked"));
        return;
      }

      await supabase
        .from("scenarios")
        .update({ escrow_tx_hash: txHash, status: "agreed" as Status })
        .eq("id", s.id);

      setLocal(s.id, { escrow_tx_hash: txHash as any, status: "agreed" });
      markLockedLocal(s.id, true);
    } catch (e: any) {
      alert(e?.message || t("errors.lock_failed"));
    } finally {
      setLockBusy((p) => ({ ...p, [s.id]: false }));
    }
  };

  // Вхід у MetaMask-браузер через deeplink із handoff сесії
  const handleLockEntry = async (s: Scenario) => {
    if (isMobileUA() && !isMetaMaskInApp()) {
      const { data } = await supabase.auth.getSession();
      const at = data?.session?.access_token ?? null;
      const rt = data?.session?.refresh_token ?? null;

      try {
        writeSupabaseSessionCookie?.(data?.session ?? null, 300);
      } catch {}

      const next = `/my-orders?scenario=${encodeURIComponent(s.id)}`;
      openInMetaMaskDapp(next, { at, rt, next });
      return;
    }
    // вже в MetaMask або десктоп: одразу ончейн-флоу
    void handleLock(s);
  };

  const handleConfirm = async (s: Scenario) => {
    if (confirmBusy[s.id]) return;
    try {
      const deal = await getDealOnChain(s.id);
      if (asStatusNum(deal) !== 2) {
        alert(t("errors.escrow_not_locked"));
        await refreshLocked(s.id);
        return;
      }
    } catch {
      alert(t("errors.read_escrow_failed"));
      return;
    }

    if (!canConfirm(s)) return;

    setConfirmBusy((p) => ({ ...p, [s.id]: true }));
    try {
      const eth = await ensureProviderReady();

      try {
        await withTimeout(eth.request({ method: "eth_chainId" }), 4000, "poke4");
      } catch {}
      try {
        await withTimeout(eth.request({ method: "eth_accounts" }), 4000, "poke5");
      } catch {}
      try {
        await waitForReturn(15000);
      } catch {}

      await confirmCompletionOnChain({ scenarioId: s.id });
      setLocal(s.id, { is_completed_by_customer: true });

      await supabase
        .from("scenarios")
        .update({ is_completed_by_customer: true })
        .eq("id", s.id)
        .eq("is_completed_by_customer", false);

      const deal2 = await getDealOnChain(s.id);
      if (asStatusNum(deal2) === 3) {
        await supabase.from("scenarios").update({ status: "confirmed" }).eq("id", s.id);
        setToast(true);
      }
    } catch (e: any) {
      alert(e?.message || t("errors.confirm_failed"));
    } finally {
      setConfirmBusy((p) => ({ ...p, [s.id]: false }));
    }
  };

  const handleDispute = async (s: Scenario) => {
    try {
      const d = await initiateDispute(s.id);
      setLocal(s.id, { status: "disputed" } as any);
      setOpenDisputes((prev) => ({ ...prev, [s.id]: d }));
    } catch (e: any) {
      alert(e?.message || t("errors.dispute_failed"));
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
      setRatedOrders((prev) => new Set([...Array.from(prev), rateFor.scenarioId]));
      window.dispatchEvent(
        new CustomEvent("ratings:updated", { detail: { userId: rateFor.counterpartyId } })
      );
      alert(t("rating.saved"));
    } catch (e: any) {
      alert(e?.message ?? t("rating.save_failed"));
    } finally {
      setRateBusy(false);
    }
  };

  const headerRight = useMemo(
    () => (
      <div className="scenario-status-panel">
        <span>
          🔔{" "}
          {permissionStatus === "granted"
            ? t("notify.enabled")
            : permissionStatus === "denied"
            ? t("notify.denied")
            : t("notify.not_requested")}
        </span>
        <span>📡 {rt.isListening ? t("notify.channel_on", { method: rt.method }) : t("notify.channel_off")}</span>
        {permissionStatus !== "granted" && (
          <button className="notify-btn" onClick={requestPermission}>
            🔔 {t("notify.allow")}
          </button>
        )}
      </div>
    ),
    [permissionStatus, requestPermission, rt.isListening, rt.method, t]
  );

  // Авто-ран у MetaMask-браузері, якщо прийшли через deeplink із ?scenario=...
  const autoRunOnceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isMetaMaskInApp()) return;
    const sp = new URLSearchParams(location.search);
    const scenarioId = sp.get("scenario");
    if (!scenarioId) return;
    if (autoRunOnceRef.current === scenarioId) return;

    const s = list.find((x) => x.id === scenarioId);
    if (s) {
      autoRunOnceRef.current = scenarioId;
      setTimeout(() => {
        void handleLock(s);
      }, 450);
    }
  }, [location.search, list]);

  return (
    <div className="scenario-list">
      <div className="scenario-header">
        <h2>{t("my_orders.title")}</h2>
        {headerRight}
      </div>

      {list.length === 0 && <div className="empty-hint">{t("my_orders.empty")}</div>}

      {list.map((s) => {
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
              onChangeDesc={(v) => {
                if (fieldsEditable) setLocal(s.id, { description: v });
              }}
              onCommitDesc={async (v) => {
                if (!fieldsEditable) return;
                await supabase
                  .from("scenarios")
                  .update({
                    description: v,
                    status: "pending",
                    is_agreed_by_customer: false,
                    is_agreed_by_executor: false,
                  })
                  .eq("id", s.id);
              }}
              onChangeAmount={(v) => {
                if (fieldsEditable) setLocal(s.id, { donation_amount_usdt: v });
              }}
              onCommitAmount={async (v) => {
                if (!fieldsEditable) return;
                if (v !== null && (!Number.isFinite(v) || v <= 0)) {
                  alert(t("errors.amount_positive"));
                  setLocal(s.id, { donation_amount_usdt: null });
                  return;
                }
                await supabase
                  .from("scenarios")
                  .update({
                    donation_amount_usdt: v,
                    status: "pending",
                    is_agreed_by_customer: false,
                    is_agreed_by_executor: false,
                  })
                  .eq("id", s.id);
              }}
              onAgree={() => handleAgree(s)}
              onLock={() => handleLockEntry(s)}
              onConfirm={() => handleConfirm(s)}
              onDispute={() => handleDispute(s)}
              onOpenLocation={() => {
                if (hasCoords(s)) {
                  window.open(
                    `https://www.google.com/maps?q=${s.latitude},${s.longitude}`,
                    "_blank"
                  );
                } else {
                  alert(t("errors.location_missing"));
                }
              }}
              canAgree={canAgree(s)}
              canLock={bothAgreed && !s.escrow_tx_hash}
              canConfirm={canConfirm(s)}
              canDispute={
                s.status !== "confirmed" && !!s.escrow_tx_hash && !openDisputes[s.id] && userId === s.creator_id
              }
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
                    border: "1px solid #f3c0ca",
                    cursor: "pointer",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.7)",
                  }}
                >
                  ⭐ {t("rating.rate_executor")}
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
