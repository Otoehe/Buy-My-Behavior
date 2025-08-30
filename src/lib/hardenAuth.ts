// Зберігає sb-* токени Supabase навіть якщо десь викличуть localStorage.clear()
export function hardenAuthStorage() {
  const keepPrefix = 'sb-';
  const origClear = localStorage.clear;
  localStorage.clear = function () {
    try {
      const keep: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith(keepPrefix)) keep[k] = localStorage.getItem(k) ?? '';
      }
      origClear.apply(localStorage);
      for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v);
    } catch {}
  };
}
