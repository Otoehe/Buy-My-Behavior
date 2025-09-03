import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  saveScenarioFormDraft,
  loadScenarioFormDraft,
  syncScenarioForm,
  clearScenarioFormDraft,
} from "../lib/scenarioFormDraft"; // ✅ важливо: робота з чернеткою
import "./ScenarioForm.css";

const VISITED_MAP_KEY = "scenario_visited_map";

export default function ScenarioForm() {
  const navigate = useNavigate();
  const location = useLocation();

  // executor_id із query або з локального кешу
  const searchParams = new URLSearchParams(location.search);
  const urlExecutorId = searchParams.get("executor_id") || "";
  const storedExecutorId = localStorage.getItem("scenario_receiverId") || "";
  const [executorId, setExecutorId] = useState<string>(urlExecutorId || storedExecutorId);

  const [description, setDescription] = useState("");
  const [donationAmount, setDonationAmount] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [locationSet, setLocationSet] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Відновлюємо чернетку
  useEffect(() => {
    const draft = loadScenarioFormDraft();
    if (draft) {
      setDescription(draft.description || "");
      setDonationAmount(draft.price != null ? String(draft.price) : "");
      setDate(draft.date || "");
      setTime(draft.time || "");
    }
  }, []);

  // Якщо executor_id прийшов у URL — синхронізуємо з localStorage
  useEffect(() => {
    if (urlExecutorId && urlExecutorId !== storedExecutorId) {
      localStorage.setItem("scenario_receiverId", urlExecutorId);
      setExecutorId(urlExecutorId);
    }
  }, [urlExecutorId, storedExecutorId]);

  // Перевірка координат тільки якщо в цій вкладці переходили на мапу
  const refreshLocationSet = () => {
    const lat = Number(localStorage.getItem("latitude"));
    const lng = Number(localStorage.getItem("longitude"));
    const visitedThisTab = sessionStorage.getItem(VISITED_MAP_KEY) === "1";
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    setLocationSet(visitedThisTab && hasCoords);
  };

  useEffect(() => {
    refreshLocationSet();
  }, [location.state]);

  // При поверненні фокусом на сторінку теж перевіряємо (після вибору точки)
  useEffect(() => {
    const onFocus = () => refreshLocationSet();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Перехід на карту ВИБОРУ місця (зберігаємо чернетку)
  const handleGoToMap = () => {
    saveScenarioFormDraft({ description, price: donationAmount, date, time });

    const id = executorId || localStorage.getItem("scenario_receiverId") || urlExecutorId;
    if (id) {
      localStorage.setItem("scenario_receiverId", id);
      // позначаємо, що з цієї вкладки перейшли на мапу
      sessionStorage.setItem(VISITED_MAP_KEY, "1");
      // ✅ відкриваємо існуючий маршрут карти у РЕЖИМІ ВИБОРУ
      navigate(`/map?pick=1&executor_id=${encodeURIComponent(id)}`);
    } else {
      setError("Виконавець не визначений.");
    }
  };

  const handleSubmit = async () => {
    setError("");

    const { data: userResp, error: userError } = await supabase.auth.getUser();
    const user = userResp?.user;
    if (userError || !user) {
      alert("Потрібно увійти в систему.");
      return;
    }

    // executor_id беремо лише із URL або localStorage
    const currentExecutorId =
      new URLSearchParams(window.location.search).get("executor_id") ||
      localStorage.getItem("scenario_receiverId") ||
      executorId ||
      "";

    if (!currentExecutorId) {
      setError("Виконавець не визначений.");
      return;
    }
    if (currentExecutorId === user.id) {
      setError("Виконавець не може співпадати із замовником.");
      return;
    }

    const lat = Number(localStorage.getItem("latitude"));
    const lng = Number(localStorage.getItem("longitude"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError("Будь ласка, оберіть місце виконання на мапі.");
      return;
    }

    if (!date || !time) {
      setError("Дата та час є обов’язковими.");
      return;
    }

    const amount = Number(donationAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Сума має бути додатнім числом.");
      return;
    }

    if (submitting) return;
    setSubmitting(true);

    try {
      const { error } = await supabase.from("scenarios").insert({
        sender_id: user.id,
        creator_id: user.id,
        receiver_id: currentExecutorId,
        executor_id: currentExecutorId,
        description: description.trim(),
        donation_amount_usdt: amount,
        date,
        time,
        status: "pending",
        latitude: lat,
        longitude: lng,
      });
      if (error) throw error;

      clearScenarioFormDraft();
      // залишаємо scenario_receiverId — може знадобитись для наступного сценарію
      localStorage.removeItem("latitude");
      localStorage.removeItem("longitude");
      sessionStorage.removeItem(VISITED_MAP_KEY);

      alert("Сценарій збережено!");
      navigate("/my-orders");
    } catch (err: any) {
      alert("Помилка: " + (err?.message || "невідома"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="scenario-page">
      <div className="scenario-shell">
        <h1 className="page-title">Новий сценарій</h1>

        <form className="scenario-form" onSubmit={(e) => e.preventDefault()}>
          <label>
            Опис
            <textarea
              placeholder="Опишіть, що саме має зробити виконавець..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                syncScenarioForm({ description: e.target.value }); // ✅ об’єкт-патч
              }}
            />
          </label>

          <label>
            Сума (USDT)
            <input
              type="number"
              step="0.000001"
              min="0"
              placeholder="100"
              value={donationAmount}
              onChange={(e) => {
                setDonationAmount(e.target.value);
                syncScenarioForm({ price: e.target.value }); // ✅ об’єкт-патч
              }}
            />
          </label>

          <label>
            Дата
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                syncScenarioForm({ date: e.target.value }); // ✅
              }}
            />
          </label>

          <label>
            Час
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                syncScenarioForm({ time: e.target.value }); // ✅
              }}
            />
          </label>

          <button
            type="button"
            onClick={handleGoToMap}
            className={locationSet ? "selected-location-button" : ""}
            disabled={submitting}
            aria-live="polite"
          >
            {locationSet ? "✅ Місце обрано!!!" : "📍 Обери місце виконання"}
          </button>

          {error && <p style={{ color: "red", textAlign: "center" }}>{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            className="submit-button"
            disabled={submitting}
          >
            {submitting ? "⏳ Надсилаю…" : "✅ Надіслати сценарій"}
          </button>
        </form>
      </div>
    </div>
  );
}
