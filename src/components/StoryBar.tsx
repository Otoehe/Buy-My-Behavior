// src/components/StoryBar.tsx
// ADD-ONLY: більше відступів, robust media resolver (Supabase Storage/IPFS), hover-play
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import UploadBehavior from "./UploadBehavior";
import "./StoryBar.css";

type Nullable<T> = T | null | undefined;

interface Behavior {
  id: number;
  user_id: string | null;
  title: string | null;
  description: string | null;

  // можливі поля медіа з різних ітерацій схеми
  file_url?: Nullable<string>;
  video_url?: Nullable<string>;
  image_url?: Nullable<string>;
  thumbnail_url?: Nullable<string>;
  storage_path?: Nullable<string>; // типу: "behaviors/xyz.mp4" або "evidence/abc.mp4"
  ipfs_cid?: Nullable<string>;

  created_at: string;
  is_dispute_evidence?: boolean | null;
  dispute_id?: string | null;
}

const gateways = [
  (cid: string) => `https://gateway.lighthouse.storage/ipfs/${cid}`,
  (cid: string) => `https://ipfs.io/ipfs/${cid}`,
];

const looksLikeHttp = (s?: string | null) => !!s && /^https?:\/\//i.test(s);
const looksLikeIPFS = (s?: string | null) => !!s && /^[a-z0-9]{46,}$/i.test(s);

function firstNonEmpty(...vals: Array<Nullable<string>>): string | null {
  for (const v of vals) if (v && String(v).trim()) return String(v);
  return null;
}

function naiveJoin(a: string, b: string) {
  return a.replace(/\/+$/, "") + "/" + b.replace(/^\/+/, "");
}

export default function StoryBar() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [srcMap, setSrcMap] = useState<Record<number, string | null>>({});
  const [posterMap, setPosterMap] = useState<Record<number, string | null>>({});
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const navigate = useNavigate();

  // --- Initial fetch (останнє зверху)
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
    return () => { alive = false; };
  }, []);

  // --- Realtime INSERT-only
  useEffect(() => {
    const ch = supabase
      .channel("realtime:behaviors")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "behaviors" },
        (payload) => {
          const b = payload.new as Behavior;
          setBehaviors(prev => (prev.some(x => x.id === b.id) ? prev : [b, ...prev]));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // --- Resolve media (HTTP / IPFS / Supabase Storage)
  const tryResolveDirect = useCallback((b: Behavior) => {
    // прямі http(s) або IPFS-cid
    const direct = firstNonEmpty(b.file_url, b.video_url, b.image_url);
    if (looksLikeHttp(direct)) return direct!;
    if (looksLikeIPFS(b.ipfs_cid)) return gateways[0](b.ipfs_cid!);
    return null;
  }, []);

  const tryResolveStorage = useCallback((b: Behavior) => {
    // якщо шлях без протоколу — спробуємо різні бакети
    const rel = firstNonEmpty(b.storage_path, b.file_url, b.video_url, b.image_url);
    if (!rel || looksLikeHttp(rel)) return null;

    // якщо вказано "bucket/path"
    const bucketMatch = rel.match(/^([a-z0-9_-]+)\/(.+)$/i);
    const candidates: Array<{ bucket: string; path: string }> = [];
    if (bucketMatch) {
      candidates.push({ bucket: bucketMatch[1], path: bucketMatch[2] });
    } else {
      // пробуємо стандартні бакети
      const guessBuckets = ["behaviors", "evidence", "uploads", "public", "videos"];
      for (const bkt of guessBuckets) candidates.push({ bucket: bkt, path: rel });
    }

    for (const c of candidates) {
      try {
        const { data } = supabase.storage.from(c.bucket).getPublicUrl(c.path);
        if (data?.publicUrl) return data.publicUrl;
      } catch { /* ignore */ }
    }
    return null;
  }, []);

  const computePoster = useCallback((b: Behavior) => {
    const poster = firstNonEmpty(b.thumbnail_url, b.image_url);
    if (looksLikeHttp(poster)) return poster!;
    if (looksLikeIPFS(poster)) return gateways[0](poster!);
    // якщо постера немає — залишимо null (використаємо /placeholder.jpg)
    return null;
  }, []);

  useEffect(() => {
    (async () => {
      const nextSrc: Record<number, string | null> = {};
      const nextPoster: Record<number, string | null> = {};
      for (const b of behaviors) {
        let src = tryResolveDirect(b);
        if (!src) src = tryResolveStorage(b);
        // останній шанс — CID у полі ipfs_cid
        if (!src && looksLikeIPFS(b.ipfs_cid)) src = gateways[0](b.ipfs_cid!);

        nextSrc[b.id] = src;
        nextPoster[b.id] = computePoster(b);
      }
      setSrcMap(nextSrc);
      setPosterMap(nextPoster);
    })();
  }, [behaviors, tryResolveDirect, tryResolveStorage, computePoster]);

  const openUpload = useCallback(() => setIsUploadOpen(true), []);
  const closeUpload = useCallback(() => setIsUploadOpen(false), []);
  const goToBehaviors = useCallback(() => navigate("/behaviors"), [navigate]);

  // helper: play on hover (desktop), pause on leave
  const onHoverPlay = useCallback((e: React.MouseEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    try { v.play().catch(() => {}); } catch {}
  }, []);
  const onHoverStop = useCallback((e: React.MouseEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    try { v.pause(); v.currentTime = 0; } catch {}
  }, []);

  return (
    <>
      {/* збільшена “рейка” сторісбару, щоб нічого не перекривалось */}
      <div className="story-bar story-bar--tall" role="list" aria-label="Останні Behaviors">
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
          const media = srcMap[b.id] || null;
          const poster = posterMap[b.id] || "/placeholder.jpg";
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
                    loop
                    poster={poster}
                    onMouseEnter={onHoverPlay}
                    onMouseLeave={onHoverStop}
                  />
                ) : (
                  <img className="story-video" src={poster} alt={label} />
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
