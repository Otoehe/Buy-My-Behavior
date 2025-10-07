// src/lib/mobileEnv.ts
export function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function isMetaMaskInApp(): boolean {
  if (typeof navigator === 'undefined') return false;
  // MetaMask in-app браузер має цей рядок в UA
  return /MetaMaskMobile/i.test(navigator.userAgent);
}
