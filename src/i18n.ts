// src/i18n.ts
/* Simple, dependency-free i18n with UA/EN and geo-aware default */
import { useEffect, useMemo, useState } from 'react';

type Locale = 'uk' | 'en';
type Dict = Record<string, string>;

const UK: Dict = {
  'app.title': 'Купи мою поведінку',
  'orders.my': 'Мої замовлення',
  'orders.received': 'Отримані сценарії',
  'agree': 'Погодити угоду',
  'lock': 'Забронювати кошти',
  'confirm': 'Підтвердити виконання',
  'dispute': 'Оспорити виконання',
  'rated': '⭐ Оцінено',
  'donation.label': 'Сума добровільного донату на підтримку креативності',
  'description': 'Опис',
  'date': 'Дата',
  'time': 'Час',
  'location.show': 'Показати локацію',
  'notifications.enabled': 'Увімкнено',
  'notifications.denied': 'Не підключено',
  'notifications.notRequested': 'Не запитано',
  // ...додай за потреби інші ключі
};

const EN: Dict = {
  'app.title': 'Buy My Behavior',
  'orders.my': 'My Orders',
  'orders.received': 'Received Scenarios',
  'agree': 'Agree the deal',
  'lock': 'Lock funds',
  'confirm': 'Confirm completion',
  'dispute': 'Open dispute',
  'rated': '⭐ Rated',
  'donation.label': 'Voluntary support donation amount',
  'description': 'Description',
  'date': 'Date',
  'time': 'Time',
  'location.show': 'Show location',
  'notifications.enabled': 'Enabled',
  'notifications.denied': 'Not connected',
  'notifications.notRequested': 'Not requested',
  // ...add more keys as you translate
};

const DICTS: Record<Locale, Dict> = { uk: UK, en: EN };
const LS_KEY = 'bmb:locale';

/** Parse ?lang=uk|en */
function getLangFromQuery(): Locale | null {
  try {
    const sp = new URLSearchParams(window.location.search);
    const l = sp.get('lang')?.toLowerCase();
    return l === 'uk' || l === 'en' ? (l as Locale) : null;
  } catch { return null; }
}

/** Heuristics: if user is in Ukraine → uk, else en */
function detectLocaleByEnv(): Locale {
  // 1) Timezone hint
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.toLowerCase() === 'europe/kyiv') return 'uk';
  } catch {}

  // 2) Navigator languages (region -UA or language uk)
  const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).filter(Boolean) as string[];

  for (const tag of langs) {
    const low = tag.toLowerCase(); // e.g., "uk-ua", "en-ua", "en-us"
    if (low.startsWith('uk')) return 'uk';
    if (/-ua\b/.test(low)) return 'uk';
  }

  // 3) Fallback: English
  return 'en';
}

/** Decide initial locale by priority: query > localStorage > env-detect */
function decideInitialLocale(): Locale {
  const fromQuery = getLangFromQuery();
  if (fromQuery) return fromQuery;

  const ls = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
  if (ls === 'uk' || ls === 'en') return ls as Locale;

  return detectLocaleByEnv();
}

let currentLocale: Locale = decideInitialLocale();

export function setLocale(l: Locale) {
  currentLocale = l;
  try { localStorage.setItem(LS_KEY, l); } catch {}
  // fire a custom event so components can react
  try { window.dispatchEvent(new CustomEvent('i18n:locale', { detail: { locale: l } })); } catch {}
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string): string {
  const dict = DICTS[currentLocale] || EN;
  return dict[key] ?? key;
}

/** React hook to subscribe to locale changes */
export function useI18n() {
  const [loc, setLoc] = useState<Locale>(getLocale());

  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent)?.detail?.locale as Locale | undefined;
      if (d && d !== loc) setLoc(d);
    };
    window.addEventListener('i18n:locale', onChange as any);
    return () => window.removeEventListener('i18n:locale', onChange as any);
  }, [loc]);

  const value = useMemo(() => ({
    locale: loc,
    t: (key: string) => {
      const dict = DICTS[loc] || EN;
      return dict[key] ?? key;
    },
    setLocale: (l: Locale) => setLocale(l),
  }), [loc]);

  return value;
}
