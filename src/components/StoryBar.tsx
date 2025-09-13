// src/components/StoryBar.tsx
// Показує прев’ю відео і ПІДПИС = ім'я профілю автора (profiles.user_id).
// Якщо профіль без імені — підпис не рендеримо.
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import UploadBehavior from "./UploadBehavior";
import "./StoryBar.css";

type Nullable<T> = T | null | undefined;

// 👇 назва таблиці профілів
const PROFILE_TABLE = "profiles";
// 👇 у твоїй схемі ключ — user_id (а не id)
const PROFILE_ID_COL: "user_id" | "id" = "user_id";

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

interface ProfileRow {
  id?: string | null;
  user_id?: string | null;
  name?: string | null;
  display_name?: string | null;
  username?: string | null;
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
  // 🆕 імена авторів за user_id
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({});
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const navigate = useNavigate();

  // 1) стартове завантаження behaviors
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

  // 2) realtime INSERT — додаємо зверху і довантажуємо ім’я автора
  useEffect(() => {
    const ch = supabase
      .channel("realtime:behaviors")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "behaviors" },
        async (payload) => {
          const b = payload.new as Behavior;
          setBehaviors(prev => (prev.some(x => x.id === b.id) ? prev : [b, ...prev]));

          const uid = (b.user_id || "").trim();
          if (uid && !nameByUser[uid]) {
            try {
              const { data } = await supabase
                .from<ProfileRow>(PROFILE_TABLE)
                .select("id,user_id,name,display_name,username")
                .eq(PROFILE_ID_COL, uid) // 👈 пошук по user_id
                .maybeSingle();
              if (data) {
                const key = (data[PROFILE_ID_COL] as string) || data.id || "";
                const n = data.name?.trim() || data.display_name?.trim() || data.username?.trim() || "";
                if (key && n) setNameByUser(prev => ({ ...prev, [key]: n }));
              }
            } catch {}
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [nameByUser]);

  // --- helpers для URL ---
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
      } catch {}
    }
    return null;
  };
  const computePosterUrl = (b: Behavior) => {
    const poster = firstNonEmpty(b.thumbnail_url, b.image_url);
    if (isHttp(poster)) return poster!;
    if (isCid(poster)) return gateways[0](poster!);
    return null;
  };

  // робимо постер зі стартового кадру (за CORS дозволу)
  const grabPosterFrame = (url: string): Promise<string | null> => new Promise((resolve) => {
    try {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = url;

      const clean = () => { try { video.src = ""; } catch {} };
      const onError = () => { clean(); resolve(null); };
      video.onerror = onError;

      video.onloadedmetadata = () => {
        try { video.currentTime = Math.min(0.25, (video.duration || 1) / 10); } catch { onError(); }
      };
      video.onseeked = () => {
        try {
          const size = 144;
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) return onError();
          ctx.drawImage(video, 0, 0, size, size);
          resolve(canvas.toDataURL("image/jpeg", 0.76));
          clean();
        } catch { onError(); }
      };
    } catch { resolve(null); }
  });

  // 3) обчислюємо медіа/постери
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

      // автогенерація постерів, якщо нема
      for (const b of behaviors) {
        if (!nextPoster[b.id] && nextSrc[b.id]) {
          try {
            const dataUrl = await grabPosterFrame(nextSrc[b.id]!);
            if (dataUrl) setPosterMap(prev => ({ ...prev, [b.id]: dataUrl }));
          } catch {}
        }
      }
    })();
  }, [behaviors]);

  // 4) підтягуємо імена для всіх видимих user_id (за profiles.user_id)
  useEffect(() => {
    (async () => {
      const want = Array.from(
        new Set(
          behaviors
            .map(b => (b.user_id || "").trim())
            .filter(uid => uid && !nameByUser[uid])
        )
      );
      if (want.length === 0) return;

      try {
        const { data, error } = await supabase
          .from<ProfileRow>(PROFILE_TABLE)
          .select("id,user_id,name,display_name,username")
          .in(PROFILE_ID_COL, want); // 👈 шукаємо по user_id
        if (!error && data) {
          const patch: Record<string, string> = {};
          for (const p of data) {
            const key = (p[PROFILE_ID_COL] as string) || p.id || "";
            const n = p.name?.trim() || p.display_name?.trim() || p.username?.trim();
            if (key && n) patch[key] = n;
          }
          if (Object.keys(patch).length) setNameByUser(prev => ({ ...prev, ...patch }));
        }
      } catch {}
    })();
  }, [behaviors, nameByUser]);

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
          const authorName = b.user_id ? nameByUser[b.user_id] : undefined; // 👈 мапимо за user_id

          return (
            <button
              type="button"
              key={b.id}
              className="story-item"
              onClick={goToBehaviors}
              role="listitem"
              aria-label={authorName || "Behavior"}
              title={authorName || ""}
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
                    autoPlay={!prefersReduceMotion}
                    aria-hidden="true"
                  />
                ) : (
                  <img className="story-poster" src={poster} alt={authorName || ""} />
                )}
              </div>

              {/* ПІДПИС — тільки ім'я; якщо немає — не показуємо */}
              {authorName ? <div className="story-label">{authorName}</div> : null}
            </button>
          );
        })}
      </div>

      {isUploadOpen && <UploadBehavior onClose={closeUpload} />}
    </>
  );
}
