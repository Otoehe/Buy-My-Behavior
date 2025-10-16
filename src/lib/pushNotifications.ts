// 📄 src/lib/pushNotifications.ts — безпечні push-сповіщення (lazy init, без крашів у мобільних WebView)

import React from 'react';

/* ===================== Типи ===================== */

export interface NotificationData {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireSound?: boolean;
}

export interface ScenarioNotificationEvent {
  scenario_id: string;
  user_id: string;
  status: string;
  type: 'status_change' | 'new_scenario' | 'agreement' | 'completion';
  title: string;
  description: string;
  amount?: number;
}

export type NotificationPermission = 'granted' | 'denied' | 'default';

/* ============ Хелпери середовищ ============ */

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isMetaMaskMobile(): boolean {
  if (!isBrowser()) return false;
  const ua = (navigator.userAgent || '').toLowerCase();
  const inApp = ua.includes('metamask');
  const hasMM = !!(window as any).ethereum?.isMetaMask;
  return inApp || hasMM;
}

/** У мобільних WebView (MetaMask тощо) пуші часто недоступні/ламають UX — тихо no-op */
function shouldNoopPush(): boolean {
  if (!isBrowser()) return true;
  if (!('Notification' in window)) return true;
  if (isMetaMaskMobile()) return true;
  return false;
}

/* ===================== Менеджер пушів ===================== */

class PushNotificationManager {
  private audio: HTMLAudioElement | null = null;           // lazy
  private audioReady = false;
  private lastNotificationTime = 0;
  private readonly NOTIFICATION_COOLDOWN = 2000; // 2s
  private notificationHistory: Set<string> = new Set();

  /* ---------- Ледача ініціалізація аудіо ---------- */
  private ensureAudio() {
    if (!isBrowser()) return; // SSR / build
    if (this.audioReady) return;

    try {
      // створюємо лише в реальному браузері
      if (typeof (window as any).Audio !== 'undefined') {
        const a = new Audio('/notification.wav');
        a.volume = 0.6;
        a.preload = 'auto';
        this.audio = a;
        this.audioReady = true;
      }
    } catch {
      // ігноруємо — звук не критичний
    }
  }

  private playNotificationSound(): void {
    if (!isBrowser()) return;
    this.ensureAudio();
    if (!this.audio) return;

    try {
      this.audio.currentTime = 0;
      const p = this.audio.play();
      if (p && typeof p.then === 'function') p.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  /* ---------- Перевірки ---------- */
  public isSupported(): boolean {
    return isBrowser() && 'Notification' in window;
  }

  public getPermissionStatus(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission as NotificationPermission;
  }

  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    const cur = this.getPermissionStatus();
    if (cur !== 'default') return cur;
    try {
      const p = await Notification.requestPermission();
      return p as NotificationPermission;
    } catch {
      return 'denied';
    }
  }

  /* ---------- Показ сповіщення ---------- */
  public async showNotification(data: NotificationData): Promise<boolean> {
    if (shouldNoopPush()) return false; // без падінь у MetaMask Mobile

    // Анти-дублі
    if (data.tag && this.notificationHistory.has(data.tag)) return false;

    // Cooldown
    const now = Date.now();
    if (now - this.lastNotificationTime < this.NOTIFICATION_COOLDOWN) return false;

    // Дозвіл
    if (this.getPermissionStatus() !== 'granted') return false;

    try {
      if (data.requireSound) this.playNotificationSound();

      const n = new Notification(data.title, {
        body: data.body,
        icon: data.icon || '/favicon.ico',
        tag: data.tag || `bmb-${Date.now()}`,
        badge: '/favicon.ico',
        requireInteraction: false,
        silent: false,
        vibrate: [200, 100, 200],
      });

      n.onclick = () => {
        try { window.focus?.(); } catch {}
        try { n.close(); } catch {}
      };

      setTimeout(() => { try { n.close(); } catch {} }, 6000);

      if (data.tag) {
        this.notificationHistory.add(data.tag);
        setTimeout(() => this.notificationHistory.delete(data.tag!), 60_000);
      }

      this.lastNotificationTime = now;
      return true;
    } catch {
      return false;
    }
  }

  /* ---------- Подієві утиліти ---------- */
  public async handleScenarioStatusChange(
    oldStatus: string,
    newStatus: string,
    scenario: any,
    currentUserId: string
  ): Promise<void> {
    const isInvolved =
      currentUserId && (currentUserId === scenario?.creator_id || currentUserId === scenario?.executor_id);
    if (!isInvolved) return;

    const isExecutor = currentUserId === scenario?.executor_id;

    let payload: NotificationData | null = null;

    if (oldStatus !== 'agreed' && newStatus === 'agreed') {
      payload = {
        title: '🤝 Угоду погоджено',
        body: `Сума: ${scenario?.donation_amount_usdt} USDT`,
        tag: `agreement-${scenario?.id}`,
        requireSound: true,
      };
    } else if (oldStatus !== 'completed' && newStatus === 'completed') {
      payload = {
        title: '✅ Сценарій завершено',
        body: isExecutor
          ? 'Ви отримали виплату з escrow.'
          : 'Escrow розподілив кошти. Перевірте результат.',
        tag: `completion-${scenario?.id}`,
        requireSound: true,
      };
    }

    if (payload) await this.showNotification(payload);
  }

  public async notifyNewScenario(scenario: any, _currentUserId: string): Promise<void> {
    await this.showNotification({
      title: '🆕 Новий сценарій',
      body: `"${(scenario?.description || '').slice(0, 60)}..." • ${scenario?.donation_amount_usdt} USDT`,
      tag: `new-scenario-${scenario?.id}`,
      requireSound: true,
    });
  }

  public async sendTestNotification(): Promise<boolean> {
    return this.showNotification({
      title: '🔔 Тестове сповіщення',
      body: 'Система push працює 🎉',
      tag: 'bmb-test',
      requireSound: true,
    });
  }

  public cleanup(): void {
    if (this.audio) {
      try { this.audio.pause(); } catch {}
      this.audio = null;
    }
    this.notificationHistory.clear();
    this.audioReady = false;
  }
}

/* ===================== Експорти API ===================== */

export const pushNotificationManager = new PushNotificationManager();

export const checkNotificationSupport = (): boolean => pushNotificationManager.isSupported();

export const requestNotificationPermission = (): Promise<NotificationPermission> =>
  pushNotificationManager.requestPermission();

export const getNotificationPermissionStatus = (): NotificationPermission =>
  pushNotificationManager.getPermissionStatus();

export const sendTestNotification = (): Promise<boolean> =>
  pushNotificationManager.sendTestNotification();

/** Універсальна функція — делегує в менеджер */
export interface NotificationOptions {
  body?: string;
  icon?: string;
  tag?: string;
  requireSound?: boolean;
}
export const showNotification = async (title: string, options: NotificationOptions = {}): Promise<boolean> => {
  return pushNotificationManager.showNotification({
    title,
    body: options.body || '',
    icon: options.icon,
    tag: options.tag,
    requireSound: options.requireSound,
  });
};

/* ===================== React Hook ===================== */

export const useNotifications = () => {
  const [permissionStatus, setPermissionStatus] = React.useState<NotificationPermission>(
    getNotificationPermissionStatus()
  );

  const requestPermission = React.useCallback(async () => {
    const s = await requestNotificationPermission();
    setPermissionStatus(s);
    return s;
  }, []);

  const sendTest = React.useCallback(() => sendTestNotification(), []);

  return {
    permissionStatus,
    isSupported: checkNotificationSupport(),
    requestPermission,
    sendTest,
  };
};
