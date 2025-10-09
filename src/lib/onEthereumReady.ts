// src/lib/onEthereumReady.ts
/**
 * Викликає колбек, щойно MetaMask інжектує window.ethereum.
 * Без зайвих таймерів і setInterval.
 */
export function onEthereumReady(cb: (eth: any) => void) {
  const w = window as any;

  if (w.ethereum) {
    cb(w.ethereum);
    return;
  }

  // офіційна подія MetaMask
  window.addEventListener(
    "ethereum#initialized",
    () => cb((window as any).ethereum),
    { once: true }
  );

  // страховка на випадок, якщо подія не прилетіла
  setTimeout(() => {
    if ((window as any).ethereum) cb((window as any).ethereum);
  }, 600);
}
