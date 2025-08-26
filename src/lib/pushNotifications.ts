// 📄 src/lib/pushNotifications.ts — система push-сповіщень для BuyMyBehavior

import React from 'react';

// === Типи для сповіщень ===
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

// === Статус дозволу на сповіщення ===
export type NotificationPermission = 'granted' | 'denied' | 'default';

// === Клас для управління push-сповіщеннями ===
class PushNotificationManager {
  private audio: HTMLAudioElement | null = null;
  private lastNotificationTime: number = 0;
  private readonly NOTIFICATION_COOLDOWN = 2000; // 2 секунди між сповіщеннями
  private notificationHistory: Set<string> = new Set(); // Запобігання дублюванню

  constructor() {
    this.initializeAudio();
  }

  // === Ініціалізація звукового сигналу ===
  private initializeAudio() {
    try {
      // Використовуємо файл з public папки
      this.audio = new Audio('/notification.mp3');
      this.audio.volume = 0.5;
      this.audio.preload = 'auto';
    } catch (error) {
      console.warn('🔇 Не вдалося завантажити звуковий файл:', error);
    }
  }

  // === Перевірка підтримки Notification API ===
  public isSupported(): boolean {
    return 'Notification' in window;
  }

  // === Отримання поточного статусу дозволу ===
  public getPermissionStatus(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission as NotificationPermission;
  }

  // === Запит дозволу на сповіщення ===
  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      console.warn('🚫 Браузер не підтримує Notification API');
      return 'denied';
    }

    if (this.getPermissionStatus() === 'granted') {
      return 'granted';
    }

    try {
      const permission = await Notification.requestPermission();
      console.log('🔔 Статус дозволу на сповіщення:', permission);
      return permission as NotificationPermission;
    } catch (error) {
      console.error('❌ Помилка при запиті дозволу на сповіщення:', error);
      return 'denied';
    }
  }

  // === Відтворення звукового сигналу ===
  private playNotificationSound(): void {
    if (!this.audio) return;

    try {
      // Перезапускаємо звук з початку
      this.audio.currentTime = 0;
      const playPromise = this.audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn('🔇 Не вдалося відтворити звук сповіщення:', error);
        });
      }
    } catch (error) {
      console.warn('🔇 Помилка відтворення звуку:', error);
    }
  }

  // === Показ нативного сповіщення ===
  public async showNotification(data: NotificationData): Promise<boolean> {
    // Перевірка на дублювання
    const notificationKey = `${data.tag}-${Date.now()}`;
    if (data.tag && this.notificationHistory.has(data.tag)) {
      console.log('⏳ Сповіщення пропущено через дублювання:', data.tag);
      return false;
    }

    // Перевірка cooldown
    const now = Date.now();
    if (now - this.lastNotificationTime < this.NOTIFICATION_COOLDOWN) {
      console.log('⏳ Сповіщення пропущено через cooldown');
      return false;
    }

    // Перевірка дозволу
    const permission = this.getPermissionStatus();
    if (permission !== 'granted') {
      console.warn('🚫 Немає дозволу на показ сповіщень');
      return false;
    }

    try {
      // Відтворюємо звук перед показом сповіщення
      if (data.requireSound) {
        this.playNotificationSound();
      }

      // Створюємо нативне сповіщення
      const notification = new Notification(data.title, {
        body: data.body,
        icon: data.icon || '/favicon.ico',
        tag: data.tag || 'bmb-notification',
        badge: '/favicon.ico',
        requireInteraction: true, // Не зникає автоматично
        silent: false // Дозволяємо системний звук
      });

      // Обробляємо клік по сповіщенню
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Автоматично закриваємо через 8 секунд
      setTimeout(() => {
        notification.close();
      }, 8000);

      // Записуємо в історію
      if (data.tag) {
        this.notificationHistory.add(data.tag);
        // Очищаємо історію через 1 хвилину
        setTimeout(() => {
          this.notificationHistory.delete(data.tag!);
        }, 60000);
      }

      this.lastNotificationTime = now;
      console.log('✅ Сповіщення показано:', data.title);
      return true;

    } catch (error) {
      console.error('❌ Помилка при показі сповіщення:', error);
      return false;
    }
  }

  // === Обробка змін статусу сценарію ===
  public async handleScenarioStatusChange(
    oldStatus: string, 
    newStatus: string, 
    scenario: any, 
    currentUserId: string
  ): Promise<void> {
    // Перевіряємо, чи користувач причетний до сценарію
    const isInvolved = currentUserId === scenario.creator_id || currentUserId === scenario.executor_id;
    if (!isInvolved) return;

    // Визначаємо тип користувача
    const isExecutor = currentUserId === scenario.executor_id;
    const isCustomer = currentUserId === scenario.creator_id;

    let notificationData: NotificationData | null = null;

    // Логіка сповіщень залежно від зміни статусу
    if (oldStatus !== 'agreed' && newStatus === 'agreed') {
      // Угоду погоджено
      notificationData = {
        title: '🤝 Угоду погоджено!',
        body: `Сценарій "${scenario.description?.slice(0, 50)}..." підтверджено обома сторонами. Сума: ${scenario.donation_amount_usdt} USDT`,
        tag: `agreement-${scenario.id}`,
        requireSound: true
      };
    } else if (oldStatus !== 'completed' && newStatus === 'completed') {
      // Сценарій завершено
      notificationData = {
        title: '✅ Сценарій завершено!',
        body: `Кошти розподілено через escrow. ${isExecutor ? 'Ви отримали 90% від суми угоди.' : 'Перевірте результат виконання.'}`,
        tag: `completion-${scenario.id}`,
        requireSound: true
      };
    }

    // Показуємо сповіщення якщо є дані
    if (notificationData) {
      await this.showNotification(notificationData);
    }
  }

  // === Сповіщення про новий сценарій (для виконавця) ===
  public async notifyNewScenario(scenario: any, currentUserId: string): Promise<void> {
    // Показуємо тільки якщо користувач - потенційний виконавець
    // (це логіка буде залежати від того, як визначаються доступні сценарії)
    
    const notificationData: NotificationData = {
      title: '🆕 Новий сценарій доступний!',
      body: `"${scenario.description?.slice(0, 60)}..." • Сума: ${scenario.donation_amount_usdt} USDT`,
      tag: `new-scenario-${scenario.id}`,
      requireSound: true
    };

    await this.showNotification(notificationData);
  }

  // === Тестове сповіщення ===
  public async sendTestNotification(): Promise<boolean> {
    const testData: NotificationData = {
      title: '🔔 Тестове сповіщення BMB',
      body: 'Система push-сповіщень працює коректно! 🎉',
      tag: 'test-notification',
      requireSound: true
    };

    return await this.showNotification(testData);
  }

  // === Очищення ресурсів ===
  public cleanup(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    this.notificationHistory.clear();
  }
}

// === Експорт singleton instance ===
export const pushNotificationManager = new PushNotificationManager();

// === Утилітарні функції ===
export const checkNotificationSupport = (): boolean => {
  return pushNotificationManager.isSupported();
};

export const requestNotificationPermission = (): Promise<NotificationPermission> => {
  return pushNotificationManager.requestPermission();
};

export const getNotificationPermissionStatus = (): NotificationPermission => {
  return pushNotificationManager.getPermissionStatus();
};

export const sendTestNotification = (): Promise<boolean> => {
  return pushNotificationManager.sendTestNotification();
};

// === React Hook для компонентів ===
export const useNotifications = () => {
  const [permissionStatus, setPermissionStatus] = React.useState<NotificationPermission>(
    getNotificationPermissionStatus()
  );

  const requestPermission = async () => {
    const status = await requestNotificationPermission();
    setPermissionStatus(status);
    return status;
  };

  const sendTest = () => {
    return sendTestNotification();
  };

  return {
    permissionStatus,
    isSupported: checkNotificationSupport(),
    requestPermission,
    sendTest
  };
};

// === Універсальна функція showNotification ===
export interface NotificationOptions {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  vibrate?: number[];
  data?: any;
  dir?: 'auto' | 'ltr' | 'rtl';
  lang?: string;
  renotify?: boolean;
  timestamp?: number;
  image?: string;
  sound?: boolean;
  soundUrl?: string;
  autoClose?: number; // автоматичне закриття через N мілісекунд
}

export const showNotification = async (
  title: string, 
  options: NotificationOptions = {}
): Promise<boolean> => {
  // 🔍 1. Перевірка підтримки Notification API
  if (!('Notification' in window)) {
    console.warn('🚫 Браузер не підтримує Notification API');
    console.warn(`📢 Fallback: ${title} - ${options.body || ''}`);
    return false;
  }

  // 🔑 2. Запит дозволу, якщо не наданий
  let permission = Notification.permission;
  
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch (error) {
      console.warn('❌ Помилка при запиті дозволу на сповіщення:', error);
      console.warn(`📢 Fallback: ${title} - ${options.body || ''}`);
      return false;
    }
  }

  if (permission !== 'granted') {
    console.warn('🚫 Дозвіл на сповіщення не наданий');
    console.warn(`📢 Fallback: ${title} - ${options.body || ''}`);
    return false;
  }

  try {
    // 🔊 3. Обробка кастомного звуку перед показом сповіщення
    if (options.sound !== false) {
      const soundUrl = options.soundUrl || '/notification.wav';
      
      try {
        const audio = new Audio(soundUrl);
        audio.volume = 0.6; // Оптимальна гучність
        audio.preload = 'auto';
        
        // Обробка помилок завантаження звуку
        audio.onerror = () => {
          console.warn(`🔇 Не вдалося завантажити звуковий файл: ${soundUrl}`);
        };
        
        // Відтворення з обробкою помилок
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.warn('🔇 Помилка відтворення звуку:', error);
          });
        }
      } catch (soundError) {
        console.warn('🔇 Помилка створення аудіо елемента:', soundError);
      }
    }

    // 📱 Створення сповіщення з налаштуваннями
    const notificationOptions: NotificationOptions = {
      body: options.body || '',
      icon: options.icon || '/favicon.ico',
      badge: options.badge || '/favicon.ico',
      tag: options.tag || `notification-${Date.now()}`,
      requireInteraction: options.requireInteraction || false,
      silent: options.silent || false,
      vibrate: options.vibrate || [200, 100, 200],
      dir: options.dir || 'auto',
      lang: options.lang || 'uk',
      renotify: options.renotify || false,
      timestamp: options.timestamp || Date.now(),
      data: options.data || {},
      ...options
    };

    const notification = new Notification(title, notificationOptions);

    // 🎯 5. Подія onclick для фокусування на вкладці
    notification.onclick = (event) => {
      event.preventDefault();
      
      // Фокусуємо вкладку браузера
      if (window.focus) {
        window.focus();
      }
      
      // Переводимо фокус на поточне вікно (кросбраузерність)
      if (window.parent && window.parent.focus) {
        window.parent.focus();
      }
      
      // Закриваємо сповіщення
      notification.close();
      
      // Додаткова обробка, якщо передана в options.data
      if (options.data && options.data.onClick) {
        try {
          options.data.onClick(event);
        } catch (error) {
          console.warn('❌ Помилка в обробнику onClick:', error);
        }
      }
    };

    // Обробка помилок сповіщення
    notification.onerror = (error) => {
      console.warn('❌ Помилка показу сповіщення:', error);
    };

    // 🕐 4. Автоматичне закриття через 5 секунд (або кастомний час)
    const autoCloseTime = options.autoClose || 5000;
    
    setTimeout(() => {
      try {
        notification.close();
      } catch (error) {
        console.warn('⚠️ Помилка закриття сповіщення:', error);
      }
    }, autoCloseTime);

    console.log(`✅ Сповіщення показано: "${title}"`);
    return true;

  } catch (error) {
    // 🛡️ 6. Кросбраузерність та fallback
    console.warn('❌ Критична помилка при створенні сповіщення:', error);
    console.warn(`📢 Fallback: ${title} - ${options.body || ''}`);
    
    // Fallback через alert (тільки для критичних повідомлень)
    if (options.data && options.data.critical) {
      alert(`${title}\n${options.body || ''}`);
    }
    
    return false;
  }
};

// === Легаси функція для зворотної сумісності ===
export const notifyUser = async (
  title: string,
  body: string,
  iconUrl: string = '/favicon.ico',
  soundUrl: string = '/notification.wav'
) => {
  return await showNotification(title, {
    body,
    icon: iconUrl,
    sound: true,
    soundUrl,
    autoClose: 5000
  });
};
