import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import UploadBehavior from "./UploadBehavior";
import "./StoryBar.css";
import DisputeBadge from "./DisputeBadge";

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

export default function StoryBar() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const navigate = useNavigate();

  const fetchBehaviors = async () => {
    const { data, error } = await supabase
      .from("behaviors")
      .select(
        "id,user_id,title,description,ipfs_cid,file_url,created_at,is_dispute_evidence,dispute_id"
      )
      .order("created_at", { ascending: false });

    if (!error) {
      setBehaviors((data || []).map((b: any) => ({
        ...b,
        is_dispute_evidence: !!b.is_dispute_evidence,
      })));
    } else {
      console.error("❌ Failed to fetch behaviors:", error);
    }
  };

  useEffect(() => {
    fetchBehaviors();

    const subscription = supabase
      .channel("realtime:behaviors")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "behaviors" },
        () => fetchBehaviors()
      )
      .subscribe();

    const openHandler = () => setIsUploadOpen(true);
    window.addEventListener("behaviorUploaded", fetchBehaviors);
    window.addEventListener("openUploadModal", openHandler);

    return () => {
      supabase.removeChannel(subscription);
      window.removeEventListener("behaviorUploaded", fetchBehaviors);
      window.removeEventListener("openUploadModal", openHandler);
    };
  }, []);

  const openFeed = () => navigate("/behaviors");

  const resolveSrc = (b: Behavior) =>
    b.ipfs_cid
      ? `https://gateway.lighthouse.storage/ipfs/${b.ipfs_cid}`
      : b.file_url || "";

  return (
    <>
      <div className="story-bar" onClick={(e) => e.stopPropagation()}>
        {/* ПЛЮС */}
        <button
          type="button"
          className="story-item add-button"
          aria-label="Додати Behavior"
          title="Додати Behavior"
          onClick={(e) => {
            e.stopPropagation();
            setIsUploadOpen(true);
          }}
        >
          <div className="story-circle">＋</div>
          <div className="story-label">Додати</div>
        </button>

        {/* КРУЖЕЧКИ */}
        {behaviors.map((b) => (
          <div
            key={b.id}
            className="story-item"
            title={b.description || undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (b.is_dispute_evidence && b.dispute_id) {
                navigate(`/behaviors?dispute=${b.dispute_id}`);
              } else {
                openFeed();
              }
            }}
          >
            <div className="story-circle" aria-label={b.title ?? "Behavior"}>
              <video
                src={resolveSrc(b)}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                onEnded={(e) => {
                  const v = e.currentTarget;
                  v.currentTime = 0;
                  v.play();
                }}
                className="story-video"
              />
              <DisputeBadge show={b.is_dispute_evidence} />
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
