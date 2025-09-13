// src/components/StoryBar.tsx
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

  file_url?: Nullable<string>;
  video_url?: Nullable<string>;
  image_url?: Nullable<string>;
  thumbnail_url?: Nullable<string>;
  storage_path?: Nullable<string>;
  ipfs_cid?: Nullable<string>;

  created_at: string;
  is_dispute_evidence?: boolean | null;
  dispute_id?: string | null;
}

const gateways = [
  (cid: string) => `https://gateway.lighthouse.storage/ipfs/${cid}`,
  (cid: string) => `https://ipfs.io/ipfs/${cid}`,
];

const isHttp = (s?: string | null) => !!s && /^https?:\/\//i.test(s);
const isCid  = (s?: string | null) => !!s && /^[a-z0-9]{46,}$/i.test(s);
const firstNonEmpty = (...vals: Array<Nullable<string>>) => {
  for (const v of vals) { if (v && String(v).trim()) return String(v); }
  return null;
};

export default function StoryBar() {
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [srcMap, setSrcMap] = useState<Record<number, string | null>>({});
  const [posterMap, setPosterMap] = useState<Record<number, string | null>>({});
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const navigate = useNavigate();

  // initial fetch
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

  // realtime INSERT-only
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

  // ---- resolvers ----
  const resolveDirect = (b: Behavior) => {
    const direct = firstNonEmpty(b.file_url, b.video_url, b.image_url);
    if (isHttp(direct)) return direct!;
    if (isCid(b.ipfs_cid)) return gateways[0](b.ipfs_cid!);
    return null;
  };

  const resolveStorage = (b: Behavior) => {
    const rel = firstNonEmpty(b.storage_path, b.file_url, b.video_url, b.image_url);
    if (!rel || isHttp(rel)) return null;
    const m = rel.match(/^([a-z0-9_-]+)\/(.+)$/i);
    const candidates: Array<{ bucket: string; path: string }> = [];
    if (m) candidates.push({ bucket: m[1], path: m[2] });
    else {
      for (const bucket of ["behaviors", "evidence", "uploads", "public", "videos"]) {
        candidates.push({ bucket, path: rel });
      }
    }
    for (const c of candidates) {
      try {
        const { data } = supabase.storage.from(c.bucket).getPublicUrl(c.path);
        if (data?.publicUrl) return data.publicUrl;
      } catch { /* ignore */ }
    }
    return null;
  };

  const computePosterUrl = (b: Behavior) => {
    const poster = firstNonEmpty(b.thumbnail_url, b.image_url);
    if (isHttp(poster)) return poster!;
    if (isCid(poster)) return gateways[0](poster!);
    return null;
  };

  // зняти кадр з відео для постера (якщо CORS дозволяє)
  const grabPosterFrame = (url: string): Promise<string | null> => new Promise((resolve) => {
    try {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = url;

      const clean = () => { video.src = ""; };

      const onError = () => { clean(); resolve(null); };
      video.onerror = onError;

      video.onloadedmetadata = () => {
        try {
          // невеликий зсув від 0, щоб не ловити чорний кадр
          video.currentTime = Math.min(0.25, (video.duration || 1) / 10);
        } catch { onError(); }
      };
      video.onseeked = () => {
        try {
          const size = 144; // більше, щоб чіткіше в ретині
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) return onError();
          ctx.drawImage(video, 0, 0, size, size);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.76);
          clean();
          resolve(dataUrl);
        } catch { onError(); }
      };
    } catch { resolve(null); }
  });

  // resolve media & posters
  useEffect(() => {
    (async () => {
      const nextSrc: Record<number, string | null> = {};
      const nextPoster: Record<number, string | null> = {};
      for (const b of behaviors) {
        let src = resolveDirect(b);
        if (!src) src = resolveStorage(b);
        if (!src && isCid(b.ipfs_cid)) src = gateways[0](b.ipfs_cid!);

        let poster = computePosterUrl(b);

        nextSrc[b.id] = src;
        nextPoster[b.id] = poster ?? null;
      }
      setSrcMap(nextSrc);
      setPosterMap(nextPoster);

      // автогенерація постерів, якщо їх нема, але є src
      const prefersReduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      for (const b of behaviors) {
        if (!nextPoster[b.id] && nextSrc[b.id]) {
          try {
            const dataUrl = await grabPosterFrame(nextSrc[b.id]!);
            if (dataUrl) {
              setPosterMap(prev => ({ ...prev, [b.id]: dataUrl }));
            }
          } catch { /* ignore */ }
        }
      }
    })();
  }, [behaviors]);

  const openUpload = useCallback(() => setIsUploadOpen(true), []);
  const closeUpload = useCallback(() => setIsUploadOpen(false), []);
  const goToBehaviors = useCallback(() => navigate("/behaviors"), [navigate]);

  const prefersReduceMotion = useMemo(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
    []
  );

  return (
    <>
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
                    poster={poster}
                    muted
                    playsInline
                    loop
                    preload="metadata"
                    autoPlay={!prefersReduceMotion} /* маленьке луп-прев’ю */
                    aria-hidden="true"
                  />
                ) : (
                  <img className="story-poster" src={poster} alt={label} />
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
