/* eslint-disable @typescript-eslint/no-explicit-any */
// BMB MetaMask Guard: reroute legacy `wallet_requestPermissions` -> `eth_requestAccounts`
// і усуває -32002 "already pending" очікуванням на eth_accounts.

declare global {
  interface Window { __bmb_mm_guard_installed?: boolean; }
}

if (typeof window !== 'undefined' && !window.__bmb_mm_guard_installed) {
  window.__bmb_mm_guard_installed = true;

  const getProviders = (): any[] => {
    const eth: any = (window as any).ethereum;
    if (!eth) return [];
    if (Array.isArray(eth.providers) && eth.providers.length) return eth.providers as any[];
    return [eth];
  };

  const pollAccounts = async (provider: any, timeoutMs = 30000, stepMs = 500): Promise<string[]> => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try {
        const accs = await provider.request({ method: 'eth_accounts' });
        if (accs && accs.length) return accs;
      } catch {}
      await new Promise((r) => setTimeout(r, stepMs));
    }
    return [];
  };

  const wrap = (provider: any) => {
    if (!provider || !provider.request || provider.__bmb_patched) return;
    provider.__bmb_patched = true;

    const orig = provider.request.bind(provider);
    let inFlight: Promise<any> | null = null;

    provider.request = async ({ method, params }: { method: string; params?: any }) => {
      // Нормалізація застарілих викликів
      if (method === 'wallet_requestPermissions') {
        method = 'eth_requestAccounts';
        params = [];
      }

      if (method === 'eth_requestAccounts') {
        if (!inFlight) {
          inFlight = (async () => {
            try {
              return await orig({ method, params });
            } catch (err: any) {
              if (err && (err.code === -32002 || String(err.message || '').includes('already pending'))) {
                const accs = await pollAccounts(provider, 30000, 500);
                if (accs.length) return accs;
              }
              throw err;
            } finally {
              setTimeout(() => { inFlight = null; }, 400);
            }
          })();
        }
        return inFlight;
      }

      return orig({ method, params });
    };
  };

  try { getProviders().forEach(wrap); } catch {}
}
