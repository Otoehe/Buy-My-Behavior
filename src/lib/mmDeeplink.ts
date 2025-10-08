function buildAbsoluteUrl(pathOrAbs?: string) {
  const base =
    (import.meta.env.VITE_PUBLIC_APP_URL as string) ||
    (typeof window !== "undefined" ? window.location.origin : "https://www.buymybehavior.com");

  const u = new URL(pathOrAbs || "/", base);
  return { abs: u.toString(), host: u.host, path: u.pathname + u.search + u.hash };
}

export function openInMetaMaskDapp(pathOrAbs?: string) {
  const { abs, host, path } = buildAbsoluteUrl(pathOrAbs);
  const mm1 = `https://metamask.app.link/dapp/${host}${path}`;
  const mm2 = `https://metamask.app.link/open_url?url=${encodeURIComponent(abs)}`;
  const mm3 = `metamask://dapp/${host}${path}`;

  try {
    location.href = mm1;
    setTimeout(() => { if (document.visibilityState === "visible") location.href = mm2; }, 1200);
    setTimeout(() => { if (document.visibilityState === "visible") location.href = mm3; }, 2400);
  } catch {
    location.href = abs;
  }
}
