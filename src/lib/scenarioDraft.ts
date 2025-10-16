// Легкі утиліти для автозбереження чернетки форми сценарію в localStorage

export type ScenarioDraft = Record<string, any>;
const KEY = 'scenario_form_draft';

function key(userId: string) {
  return `${KEY}:${userId || 'anon'}`;
}

export function loadScenarioFormDraft<T = ScenarioDraft>(userId: string): T | null {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveScenarioFormDraft(userId: string, draft: ScenarioDraft): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(draft));
  } catch {}
}

export function clearScenarioFormDraft(userId: string): void {
  try {
    localStorage.removeItem(key(userId));
  } catch {}
}

/**
 * Простий «синк»: під час монтування можна підхопити збережену чернетку,
 * а на unload — зберегти поточний стан.
 * Повертає disposer, який треба викликати при анмаунті.
 */
export function syncScenarioForm<T extends object>(
  userId: string,
  getCurrent: () => T,
  onLoaded?: (loaded: Partial<T>) => void
): () => void {
  const loaded = loadScenarioFormDraft<Partial<T>>(userId);
  if (loaded && onLoaded) onLoaded(loaded);

  const save = () => {
    try {
      saveScenarioFormDraft(userId, getCurrent());
    } catch {}
  };

  window.addEventListener('beforeunload', save);
  return () => window.removeEventListener('beforeunload', save);
}
