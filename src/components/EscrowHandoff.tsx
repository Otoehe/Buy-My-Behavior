// src/components/EscrowHandoff.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function parseSess():
  | { at?: string | null; rt?: string | null; next?: string }
  | null {
  try {
    const m = (location.hash || "").match(/bmbSess=([^&]+)/);
    if (!m) return null;
    const json = atob(decodeURIComponent(m[1]));
    const o = JSON.parse(json);
    return {
      at: o?.at ?? null,
      rt: o?.rt ?? null,
      next: typeof o?.next === "string" ? o.next : "/escrow/confirm",
    };
  } catch { return null; }
}

export default function EscrowHandoff() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const sess = parseSess();
      history.replaceState(null, document.title, location.pathname + location.search);
      try {
        if (sess?.at) {
          await supabase.auth.setSession({ access_token: sess.at!, refresh_token: sess.rt ?? undefined });
        }
      } catch {}
      navigate(sess?.next || "/escrow/confirm", { replace: true });
    })();
  }, [navigate]);

  return null;
}
