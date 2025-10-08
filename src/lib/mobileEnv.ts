export function isMobileUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}
export function isMetaMaskInApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return /MetaMaskMobile/i.test(navigator.userAgent);
}
