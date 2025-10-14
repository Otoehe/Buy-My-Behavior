// Визначаємо ТІЛЬКИ мобільний in-app MetaMask браузер.
// Розширення MetaMask на десктопі НЕ повинно вважатися in-app.

export function isMetaMaskInApp(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;

  const ua = navigator.userAgent || "";

  // Ознаки мобільного середовища
  const isMobile =
    /Android|iPhone|iPad|iPod|Windows Phone/i.test(ua) ||
    // iPadOS у десктопному UA
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);

  // Ознаки саме in-app MetaMask Mobile
  const isMetaMaskUA =
    /MetaMaskMobile/i.test(ua) || /metamask/i.test((navigator as any).standalone ? "" : ua);

  // window.ethereum може бути і в мобільному in-app, і в десктопному розширенні.
  const hasEthereum = typeof (window as any).ethereum !== "undefined";
  const isMMFlag = !!(hasEthereum && (window as any).ethereum.isMetaMask);

  // Повертаємо true лише коли:
  //   мобільний пристрій + є ethereum + явні ознаки MetaMask Mobile у UA
  return isMobile && isMMFlag && isMetaMaskUA;
}
