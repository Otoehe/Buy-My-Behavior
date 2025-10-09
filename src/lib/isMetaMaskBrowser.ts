export function isMetaMaskInApp(): boolean {
  const w = window as any;
  const ua = navigator.userAgent || "";
  const hasMM =
    !!w.ethereum?.isMetaMask ||
    Array.isArray(w.ethereum?.providers) &&
    w.ethereum.providers.some((p: any) => p?.isMetaMask);
  const mmUA = /MetaMaskMobile|MetaMask/i.test(ua);
  return hasMM || mmUA;
}

export function openInMetaMaskDeepLink(path = "/escrow/approve?next=/my-orders") {
  const host = window.location.host;
  const https = `https://metamask.app.link/dapp/${host}${path}`;
  const native = `metamask://dapp/${host}${path}`;
  // пробуємо спершу https-лінк (MetaMask Mobile його перехоплює)
  window.location.href = https;
  // підстраховка
  setTimeout(() => { window.location.href = native; }, 300);
}
