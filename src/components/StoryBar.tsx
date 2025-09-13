// src/components/StoryBar.tsx
// ✅ КАНОНІЧНИЙ СТОРІСБАР (v2025-08-17)
// - Realtime лише INSERT з таблиці behaviors
// - Кнопка "+" → UploadBehavior
// - Клік по сторіс → /behaviors
// - Без DISPUTE-badge та будь-яких інших експериментів

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import UploadBehavior from "./UploadBehavior";
import "./StoryBar.css";

type Behavior = {
  id: number;
  user_id: string | null;
  title: string | null;
  description: string | null;
  ipfs_cid: string | null;
  file_url?: string | null;
  created_at: string;
};

export default function StoryBar() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const navigate = useNavigate();

  async function fetchBehaviors() {
    const { data, error } = await supabase
      .from("behaviors")
      .select(
        "id,user_id,title,description,ipfs_cid,file_url,created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ fetch behaviors failed:", error);
      return;
    }
    setBehaviors(data ?? []);
  }

  useEffect(() => {
    fetchBehaviors();

    // 🔔 Канон: тільки INSERT
    const ch = supabase
      .channel("realtime:behaviors")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "behaviors" },
        () => fetchBehaviors()
      )
      .subscribe();

    // внутрішні події, які ми вже використовували
    const onUploaded = () => fetchBehaviors();
    const openHandler = () => setIsUploadOpen(true);

    window.addEventListener("behaviorUploaded", onUploaded as EventListener);
    window.addEventListener("openUploadModal", openHandler as EventListener);

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener("behaviorUploaded", onUploaded as EventListener);
      window.removeEventListener("openUploadModal", openHandler as EventListener);
    };
  }, []);

  // IPFS → gateway, або fallback на file_url
  const resolveSrc = (b: Behavior) =>
    b.ipfs_cid
      ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}`
      : b.file_url || "";

  const openFeed = () => navigate("/behaviors");

  return (
    <>
      <div className="story-bar" onClick={(e) => e.stopPropagation()}>
        {/* + Додати */}
        <button
          type="button"
          className="story-item add-button"
          aria-label="Додати Behavior"
          title="Додати Behavior"
          onClick={(e) => {
            e.stopPropagation();
            setIsUploadOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="story-circle">＋</div>
          <div className="story-label">Додати</div>
        </button>

        {/* Items */}
        {behaviors.map((b) => (
          <div
            key={b.id}
            className="story-item"
            title={b.description || undefined}
            onClick={(e) => {
              e.stopPropagation();
              openFeed();
            }}
          >
            <div className="story-circle" aria-label={b.title ?? "Behavior"}>
              <video
                className="story-video"
                src={resolveSrc(b)}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                onEnded={(e) => {
                  const v = e.currentTarget;
                  v.currentTime = 0;
                  v.play().catch(() => {});
                }}
              />
            </div>

            {b.title && <div className="story-label">{b.title}</div>}
          </div>
        ))}
      </div>

      {isUploadOpen && (
        <UploadBehavior onClose={() => setIsUploadOpen(false)}>
          <div className="upload-hint">
            📦 <strong>Увага:</strong> розмір Behavior не повинен перевищувати{" "}
            <strong>30MB</strong>
          </div>
        </UploadBehavior>
      )}
    </>
  );
}
