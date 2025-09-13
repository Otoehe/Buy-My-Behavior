// src/components/StoryBar.tsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import UploadBehavior from "./UploadBehavior";
import "./StoryBar.css";

interface Behavior {
  id: number;
  user_id: string | null;
  title: string | null;
  description: string | null;
  ipfs_cid: string | null;
  file_url?: string | null;
  created_at: string;
  is_dispute_evidence?: boolean | null;
  dispute_id?: string | null;
}

const toMediaSrc = (b: Behavior): string | null => {
  if (b?.file_url) return b.file_url;
  if (b?.ipfs_cid) return `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}`;
  return null;
};

export default function StoryBar() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const navigate = useNavigate();

  // initial fetch (останнє зверху)
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from<Behavior>("behaviors")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(24);
      if (!alive) return;
      if (!error && data) setBehaviors(data);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // realtime INSERT-only
  useEffect(() => {
    const channel = supabase
      .channel("realtime:behaviors")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "behaviors" },
        (payload) => {
          const b = payload.new as Behavior;
          setBehaviors((prev) => {
            if (prev.some((x) => x.id === b.id)) return prev;
            return [b, ...prev];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const openUpload = useCallback(() => setIsUploadOpen(true), []);
  const closeUpload = useCallback(() => setIsUploadOpen(false), []);
  const goToBehaviors = useCallback(() => navigate("/behaviors"), [navigate]);

  return (
    <>
      <div className="story-bar" role="list" aria-label="Останні Behaviors">
        <button
          type="button"
          className="story-item add-button"
          onClick={openUpload}
          aria-label="Додати Behavior"
          role="listitem"
        >
          <div className="story-circle">+</div>
          <div className="story-label">Додати</div>
        </button>

        {behaviors.map((b) => {
          const media = toMediaSrc(b);
          const label = b.title ?? "Behavior";
          return (
            <button
              type="button"
              key={b.id}
              className="story-item"
              onClick={goToBehaviors}
              role="listitem"
              aria-label={label}
              onKeyDown={(e) => (e.key === "Enter" ? goToBehaviors() : null)}
            >
              <div className="story-circle">
                {media ? (
                  <video
                    className="story-video"
                    src={media}
                    preload="metadata"
                    muted
                    playsInline
                    /* постер на випадок, якщо перший кадр чорний */
                    poster="/placeholder.jpg"
                  />
                ) : (
                  <span className="story-initial">•</span>
                )}
              </div>
              <div className="story-label">{label}</div>
            </button>
          );
        })}
      </div>

      {isUploadOpen && <UploadBehavior onClose={closeUpload} />}
    </>
  );
}
