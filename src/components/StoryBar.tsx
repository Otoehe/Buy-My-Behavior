// Показує прев’ю відео (луп, muted) і ПІДПИС = ім'я профілю автора з profiles.name (ключ profiles.user_id).
// Якщо name порожнє — підпис не рендеримо (не fallback-имо на title/“Video evidence”).
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import UploadBehavior from "./UploadBehavior";
import "./StoryBar.css";

type Nullable<T> = T | null | undefined;

const PROFILE_TABLE = "profiles";
const PROFILE_ID_COL: "user_id" = "user_id";

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
  user_id?: string | null;
  name?: string | null;
}

type CacheShape = {
  t: number; // timestamp
  behaviors: Pick<Behavior, "id" | "user_id" | "thumbnail_url" | "image_url" | "video_url" | "file_url" | "storage_path" | "ipfs_cid" | "created_at">[];
  srcMap: Record<number, string | null>;
  posterMap: Record<number, string | null>;
  nameByUser: Record<string, string>;
};

const CACHE_KEY = "bmb.story.cache.v2";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 хвилин

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
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({});
  const [loadedMap, setLoadedMap] = useState<Record<number, boolean>>({});
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const barRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();

  // ====== 0) Миттєве відмалювання з кешу (якщо є) ======
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CacheShape;
      if (!parsed?.t || Date.now() - parsed.t > CACHE_TTL_MS) return;

      // показуємо моментально
      setSrcMap(parsed.srcMap || {});
      setPosterMap(parsed.posterMap || {});
      setNameByUser(parsed.nameByUser || {});
      setBehaviors((parsed.behaviors || []) as Behavior[]);
      // вважаємо «завантаженими» те, що має постер
      const lm: Record<number, boolean> = {};
      Object.keys(parsed.posterMap || {}).forEach((k) => (lm[Number(k)] = true));
      setLoadedMap(lm);
    } catch {}
  }, []);

  // ====== 1) Свіже завантаження behaviors ======
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

  // ====== 2) Realtime INSERT ======
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
                .select("user_id,name")
                .eq(PROFILE_ID_COL, uid)
                .maybeSingle();
              const key = (data?.user_id || "").trim();
              const n = (data?.name || "").trim();
              if (key && n) setNameByUser(prev => ({ ...prev, [key]: n }));
            } catch {}
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [nameByUser]);

  // ===== helpers для URL =====
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
        if (data?.publicUrl) return data.publicUrl; // синхронно формує URL
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

  // Якщо немає постера — пробуємо витягнути кадр (потім, асинхронно)
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

  // ===== 3) Обчислюємо URL/постери + ОНОВЛЮЄМО КЕШ =====
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

      // асинхронно довантажимо кадри-постери
      for (const b of behaviors) {
        if (!nextPoster[b.id] && nextSrc[b.id]) {
          try {
            const dataUrl = await grabPosterFrame(nextSrc[b.id]!);
            if (dataUrl) setPosterMap(prev => {
              const updated = { ...prev, [b.id]: dataUrl };
              // оновлюємо кеш live
              try {
                const raw = sessionStorage.getItem(CACHE_KEY);
                if (raw) {
                  const parsed = JSON.parse(raw) as CacheShape;
                  parsed.posterMap = updated;
                  parsed.t = Date.now();
                  sessionStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
                }
              } catch {}
              return updated;
            });
          } catch {}
        }
      }

      // кладемо в кеш (мінімальні поля + карти посилань)
      try {
        const cache: CacheShape = {
          t: Date.now(),
          behaviors: behaviors.map(b => ({
            id: b.id,
            user_id: b.user_id,
            thumbnail_url: b.thumbnail_url,
            image_url: b.image_url,
            video_url: b.video_url,
            file_url: b.file_url,
            storage_path: b.storage_path,
            ipfs_cid: b.ipfs_cid,
            created_at: b.created_at,
          })),
          srcMap: nextSrc,
          posterMap: nextPoster,
          nameByUser,
        };
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch {}
    })();
  }, [behaviors, nameByUser]);

  // ===== 4) Підтягнути імена для видимих user_id, яких немає в кеші =====
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
          .select("user_id,name")
          .in(PROFILE_ID_COL, want);
        if (!error && data) {
          const patch: Record<string, string> = {};
          for (const p of data) {
            const key = (p.user_id || "").trim();
            const n = (p.name || "").trim();
            if (key && n) patch[key] = n;
          }
          if (Object.keys(patch).length) setNameByUser(prev => ({ ...prev, ...patch }));
        }
      } catch {}
    })();
  }, [behaviors, nameByUser]);

  // ===== керування відео: грає тільки коли видно =====
  const prefersReduceMotion = useMemo(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
    []
  );
  useEffect(() => {
    if (prefersReduceMotion) return;
    const root = barRef.current;
    if (!root) return;
    const videos = Array.from(root.querySelectorAll<HTMLVideoElement>("video.story-video"));
    if (!videos.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting && e.intersectionRatio >= 0.35) {
            v.play().catch(() => {});
          } else {
            v.pause();
          }
        }
      },
      { root: root.parentElement, threshold: [0, 0.35, 1] }
    );
    videos.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, [srcMap, prefersReduceMotion]);

  // UI callbacks
  const openUpload = useCallback(() => setIsUploadOpen(true), []);
  const closeUpload = useCallback(() => setIsUploadOpen(false), []);
  const goToBehaviors = useCallback(() => navigate("/behaviors"), [navigate]);
  const onMediaLoaded = (id: number) => setLoadedMap((m) => (m[id] ? m : { ...m, [id]: true }));

  // Якщо ще немає behaviors і немає кешу — показати «привидів», щоб виглядало миттєво
  const noDataYet = behaviors.length === 0 && Object.keys(posterMap).length === 0;

  return (
    <>
      <section
        data-bmb-storybar=""
        style={{ ["--nav-h" as any]: "56px" }}
        ref={barRef as any}
      >
        <div className="story-bar story-bar--tall story-bar--sticky" role="list" aria-label="Останні Behaviors">
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

          {/* Привиди для миттєвого вигляду на холодному старті */}
          {noDataYet &&
            Array.from({ length: 12 }).map((_, i) => (
              <div key={`ghost-${i}`} className="story-item is-ghost" role="listitem" aria-hidden="true">
                <div className="story-circle story-circle--loading" />
                <div className="story-label story-label--empty" />
              </div>
            ))}

          {behaviors.map((b) => {
            const media = srcMap[b.id] || null;
            const poster = posterMap[b.id] || "/placeholder.jpg";
            const authorName = b.user_id ? nameByUser[b.user_id] : undefined;
            const isLoaded = !!loadedMap[b.id] || !!posterMap[b.id];

            return (
              <button
                type="button"
                key={b.id}
                className={`story-item${isLoaded ? " is-loaded" : ""}`}
                onClick={goToBehaviors}
                role="listitem"
                aria-label={authorName || "Behavior"}
                title={authorName || ""}
                onKeyDown={(e) => (e.key === "Enter" ? goToBehaviors() : null)}
              >
                <div className={`story-circle${isLoaded ? " story-circle--ready" : " story-circle--loading"}`}>
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
                      onLoadedData={() => onMediaLoaded(b.id)}
                    />
                  ) : (
                    <img
                      className="story-poster"
                      src={poster}
                      alt={authorName || ""}
                      onLoad={() => onMediaLoaded(b.id)}
                    />
                  )}
                </div>
                {authorName ? <div className="story-label">{authorName}</div> : <div className="story-label story-label--empty" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      {isUploadOpen && <UploadBehavior onClose={closeUpload} />}
    </>
  );
}
