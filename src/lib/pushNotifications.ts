// 📄 src/lib/pushNotifications.ts — система push-сповіщень для BuyMyBehavior

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

/* ============ Внутрішні хелпери/дефекти середовищ ============ */

/** Чи ми всередині мобільного MetaMask / вбудованого браузера, де Push API часто недоступний */
function isMetaMaskMobile(): boolean {
  const ua = (navigator?.userAgent || '').toLowerCase();
  // UA MetaMask Mobile різний на iOS/Android, страхуємося по підрядку 'metamask'
  const inApp = ua.includes('metamask');
  // Додатковий маркер — інжектований провайдер
  const hasMM = !!(window as any).ethereum?.isMetaMask;
  // Важливо: навіть якщо є Notification, показ часто валиться — краще no-op
  return inApp || hasMM;
}

/** У деяких вбудованих вебвью Push/Notification або недоступні, або працюють нестабільно */
function shouldNoopPush(): boolean {
  // Якщо зовсім немає Notification API — точно no-op
  if (!('Notification' in window)) return true;
  // Мобільний MetaMask: робимо no-op, щоб уникнути "Failed to publish payload"
  if (isMetaMaskMobile()) return true;
  return false;
}

/* ===================== Менеджер пушів ===================== */

class PushNotificationManager {
  private audio: HTMLAudioElement | null = null;
  private lastNotificationTime = 0;
  private readonly NOTIFICATION_COOLDOWN = 2000; // 2s
  private notificationHistory: Set<string> = new Set();

  constructor() {
    this.initializeAudio();
  }

  /* ---------- Аудіо ---------- */
  private initializeAudio() {
    try {
      // файл лежить у /public
      this.audio = new Audio('/notification.wav');
      this.audio.volume = 0.6;
      this.audio.preload = 'auto';
    } catch (e) {
      // тихо
      console.warn('[push] audio init fail:', e);
    }
  }

  private playNotificationSound(): void {
    if (!this.audio) return;
    try {
      this.audio.currentTime = 0;
      const p = this.audio.play();
      if (p && typeof p.then === 'function') p.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  /* ---------- Базові перевірки ---------- */
  public isSupported(): boolean {
    return 'Notification' in window;
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
    // 0) Не показуємо в середовищах, де це ламає UX (MetaMask mobile тощо)
    if (shouldNoopPush()) return false;

    // 1) Анти-дублі
    if (data.tag && this.notificationHistory.has(data.tag)) return false;

    // 2) Cooldown
    const now = Date.now();
    if (now - this.lastNotificationTime < this.NOTIFICATION_COOLDOWN) return false;

    // 3) Пермішени
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
        try {
          window.focus?.();
          n.close();
        } catch {}
      };

      // авто-закриття через 6с
      setTimeout(() => {
        try { n.close(); } catch {}
      }, 6000);

      if (data.tag) {
        this.notificationHistory.add(data.tag);
        setTimeout(() => this.notificationHistory.delete(data.tag!), 60_000);
      }

      this.lastNotificationTime = now;
      return true;
    } catch {
      // Якщо Notification API є, але показ звалився — не валимо додаток
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
    try { this.audio?.pause(); } catch {}
    this.audio = null;
    this.notificationHistory.clear();
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

/** Універсальна функція — делегує в менеджер. Тримай єдиний шлях показу. */
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
