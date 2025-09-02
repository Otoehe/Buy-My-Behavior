// src/lib/scenarioFormDraft.ts
// -----------------------------------------------------------------------------
// BMB — утиліти для чернетки форми сценарію (локальне сховище + м'яка синхронізація)
// -----------------------------------------------------------------------------
// ❗ Принципи:
// - ЖОДНОЇ логіки, яка може завалити білд. Усе, що торкається window/Supabase — в try/catch.
// - Локальне збереження працює завжди; синхронізація у БД — "best effort", без помилок нагору.
// - Нічого не змінюємо у вашій існуючій логіці компонентів — лише надаємо відсутні експорти.
// -----------------------------------------------------------------------------

export type ScenarioFormDraft = {
  title?: string;
  description?: string;
  donation_amount_usdt?: number | string;
  // хтось з учасників (виконавець)
  executor_id?: string | null;
  // ініціатор (замовник)
  user_id?: string | null;
  // координати
  lat?: number | null;
  lng?: number | null;
  // службові
  client_draft_id?: string;
  // інші майбутні поля теж допустимі
  [k: string]: any;
};

// Основний ключ і декілька легасі-варіантів для зворотної сумісності
const PRIMARY_KEY = 'bmb.scenario_form_draft';
const LEGACY_KEYS = [
  'scenario_form_draft',
  'bmb.scenarioDraft',
  'scenarioDraft',
] as const;

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function getLS(): Storage | null {
  try {
    if (!hasWindow()) return null;
    if (!('localStorage' in window)) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeParse<T = unknown>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function genId(): string {
  // Легка генерація ID (уникаємо важких залежностей)
  return 'bmb_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Завантаження чернетки з localStorage (підтримка кількох ключів).
 * Повертає об’єкт або null, якщо нічого не знайдено.
 */
export function loadScenarioFormDraft(): Partial<ScenarioFormDraft> | null {
  try {
    const ls = getLS();
    if (!ls) return null;

    // 1) Пробуємо основний ключ
    const primary = safeParse<Partial<ScenarioFormDraft>>(ls.getItem(PRIMARY_KEY));
    if (primary && typeof primary === 'object') return primary;

    // 2) Пробуємо легасі-ключі
    for (const key of LEGACY_KEYS) {
      const parsed = safeParse<Partial<ScenarioFormDraft>>(ls.getItem(key));
      if (parsed && typeof parsed === 'object') return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Збереження (merge patch) у localStorage.
 * Ніколи не кидає помилки нагору.
 */
export function saveScenarioFormDraft(
  patch: Partial<ScenarioFormDraft>
): void {
  try {
    const ls = getLS();
    if (!ls) return;

    const existing = loadScenarioFormDraft() || {};
    const merged: Partial<ScenarioFormDraft> = {
      ...existing,
      ...patch,
    };

    // гарантуємо client_draft_id
    if (!merged.client_draft_id) {
      merged.client_draft_id = existing.client_draft_id || genId();
    }

    ls.setItem(PRIMARY_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
}

/**
 * Очищення чернетки (включно з легасі-ключами).
 */
export function clearScenarioFormDraft(): void {
  try {
    const ls = getLS();
    if (!ls) return;
    ls.removeItem(PRIMARY_KEY);
    for (const key of LEGACY_KEYS) ls.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * М'яка синхронізація чернетки у БД (опціонально).
 * - Завжди оновлює localStorage (truth source для клієнта).
 * - Після — пробує зробити upsert у таблицю drafts (якщо є Supabase і таблиця).
 * - Ніяких викидів помилок: будь-який фейл тихо ігнорується, щоб не ламати UX.
 */
export async function syncScenarioForm(
  draft: Partial<ScenarioFormDraft>
): Promise<void> {
  // 1) локально зберігаємо завжди
  saveScenarioFormDraft(draft);

  // 2) Паралельно (best effort) пробуємо синхронізувати у Supabase
  try {
    // Динамічний імпорт, щоб не чіпати білд-пайплайн
    const mod = await import('./supabase');
    const supabase = (mod as any).supabase as {
      from(table: string): {
        upsert(values: any, options?: any): Promise<{ error: any }>;
      };
    };

    const current = loadScenarioFormDraft() || {};
    const payload = {
      client_draft_id: current.client_draft_id || genId(),
      title: current.title ?? null,
      description: current.description ?? null,
      donation_amount_usdt:
        current.donation_amount_usdt === '' || current.donation_amount_usdt == null
          ? null
          : Number(current.donation_amount_usdt),
      executor_id: current.executor_id ?? null,
      user_id: current.user_id ?? null,
      lat: current.lat ?? null,
      lng: current.lng ?? null,
      // зберігаємо увесь снапшот на випадок майбутніх полів
      snapshot: current,
      updated_at: new Date().toISOString()
    };

    // ⚠️ Назва таблиці: спершу намагаємось `scenario_drafts`, якщо її нема — це тихо впаде і ми просто ігноруємо.
    const { error } = await supabase.from('scenario_drafts').upsert(payload, {
      onConflict: 'client_draft_id'
    });

    // Якщо таблиці нема або нема прав — мовчки ігноруємо.
    if (error) {
      // console.debug('[syncScenarioForm] supabase upsert error (ignored):', error?.message);
    }
  } catch {
    // Нема supabase або інша дрібниця — ігноруємо
  }
}
