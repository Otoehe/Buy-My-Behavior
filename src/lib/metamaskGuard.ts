// BMB MetaMask Guard
// Патчить window.ethereum.request, щоб у вкладці був один-єдиний pending
// запит доступу до акаунтів. Працює для Desktop та мобільних інжекторів.
// Ставити ПЕРШИМ імпортом у main.tsx.

declare global {
  interface Window {
    ethereum?: any;
  }
}

(function installGuardBootstrap() {
  if (typeof window === 'undefined') return;

  function install() {
    try {
      const eth = (window as any).ethereum;
      if (!eth || eth.__bmb_guard_installed__) return;

      const origRequest = eth.request.bind(eth);
      let pendingAccPromise: Promise<any> | null = null;

      eth.request = (args: any) => {
        const m = args?.method;
        // Ловимо запити, що відкривають попап доступу
        if (m === 'eth_requestAccounts' || m === 'wallet_requestPermissions') {
          if (pendingAccPromise) {
            console.debug('[BMB Guard] duplicate accounts request suppressed');
            return pendingAccPromise;
          }
          pendingAccPromise = origRequest(args).finally(() => {
            pendingAccPromise = null;
          });
          return pendingAccPromise;
        }
        return origRequest(args);
      };

      eth.__bmb_guard_installed__ = true;
      console.log('[BMB Guard] installed');
    } catch (e) {
      console.warn('[BMB Guard] install failed', e);
    }
  }

  if ((window as any).ethereum) install();
  window.addEventListener('ethereum#initialized', install, { once: true });
  // Резерв: деякі провайдери інжектяться пізніше
  setTimeout(install, 1500);
})();
