// 📄 src/lib/universalNotifications.ts — Універсальна кросбраузерна функція showNotification

/**
 * 🎯 Універсальна, кросбраузерна функція showNotification
 * для React/TS-проєктів з повною підтримкою кастомізації
 */

// === Типи для універсальної функції ===
export interface NotificationOptions {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  lang?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  vibrate?: number[] | false; // дозволяємо false для вимкнення
  data?: any;
  dir?: 'auto' | 'ltr' | 'rtl';
  renotify?: boolean;
  timestamp?: number;
  image?: string;
  // Кастомні опції
  onClick?: () => void;
  timeout?: number; // автоматичне закриття в мілісекундах
  sound?: boolean;
  soundUrl?: string;
  volume?: number; // 0.0 - 1.0
  fallbackAlert?: boolean; // показати alert як fallback
}

// === Статуси підтримки ===
export type NotificationSupport = {
  isSupported: boolean;
  permission: NotificationPermission;
  audioSupported: boolean;
  vibrationSupported: boolean;
  userAgent: string;
};

/**
 * 🔍 Перевірка підтримки браузером
 */
export const checkBrowserSupport = (): NotificationSupport => {
  return {
    isSupported: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : 'denied',
    audioSupported: 'Audio' in window,
    vibrationSupported: 'vibrate' in navigator,
    userAgent: navigator.userAgent
  };
};

/**
 * 🎵 Відтворення звукового сигналу
 */
const playNotificationSound = async (
  soundUrl: string = '/notification.wav',
  volume: number = 0.6
): Promise<boolean> => {
  try {
    const audio = new Audio(soundUrl);
    audio.volume = Math.max(0, Math.min(1, volume)); // обмежуємо 0-1
    audio.preload = 'auto';

    // Обробка помилок завантаження
    return new Promise((resolve) => {
      audio.oncanplaythrough = async () => {
        try {
          await audio.play();
          console.log(`🎵 Звук відтворено: ${soundUrl}`);
          resolve(true);
        } catch (playError) {
          console.warn('🔇 Помилка відтворення звуку:', playError);
          resolve(false);
        }
      };

      audio.onerror = (error) => {
        console.warn(`🔇 Помилка завантаження звуку ${soundUrl}:`, error);
        resolve(false);
      };

      // Timeout для завантаження
      setTimeout(() => {
        console.warn('🔇 Timeout завантаження звуку');
        resolve(false);
      }, 3000);
    });
  } catch (error) {
    console.warn('🔇 Критична помилка аудіо:', error);
    return false;
  }
};

/**
 * 📱 Вібрація для мобільних пристроїв
 */
const triggerVibration = (pattern: number[] = [100, 50, 100]): boolean => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
      console.log(`📳 Вібрація активована: ${pattern}`);
      return true;
    }
    return false;
  } catch (error) {
    console.warn('📳 Помилка вібрації:', error);
    return false;
  }
};

/**
 * 🔑 Запит дозволу на сповіщення
 */
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) {
    console.warn('🚫 Notification API не підтримується браузером');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  try {
    const permission = await Notification.requestPermission();
    console.log(`🔑 Дозвіл на сповіщення: ${permission}`);
    return permission;
  } catch (error) {
    console.warn('❌ Помилка запиту дозволу:', error);
    return 'denied';
  }
};

/**
 * 🚀 Універсальна функція showNotification
 * 
 * @param title - Заголовок сповіщення
 * @param options - Опції налаштування сповіщення
 * @returns Promise<boolean> - true якщо сповіщення показано успішно
 */
export const showNotification = async (
  title: string,
  options: NotificationOptions = {}
): Promise<boolean> => {
  const support = checkBrowserSupport();
  
  // Логування спроби
  console.log(`🔔 Спроба показати сповіщення: "${title}"`);

  // 1. Перевірка підтримки Notification API
  if (!support.isSupported) {
    console.warn('🚫 Браузер не підтримує Notification API');
    
    // 10. Fallback через alert та console.warn
    if (options.fallbackAlert) {
      alert(`${title}\n${options.body || ''}`);
    }
    console.warn(`📢 Fallback повідомлення: ${title} - ${options.body || ''}`);
    return false;
  }

  // 2. Запит дозволу автоматично, якщо не наданий
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    console.warn('🚫 Дозвіл на сповіщення не наданий');
    
    if (options.fallbackAlert) {
      alert(`${title}\n${options.body || ''}`);
    }
    console.warn(`📢 Fallback повідомлення: ${title} - ${options.body || ''}`);
    return false;
  }

  try {
    // 3. Відтворення звуку notification.wav з /public
    if (options.sound !== false && support.audioSupported) {
      const soundUrl = options.soundUrl || '/notification.wav';
      const volume = options.volume || 0.6; // 7. Гучність 60%
      
      // Не чекаємо на звук, щоб не блокувати сповіщення
      playNotificationSound(soundUrl, volume).catch(error => {
        console.warn('🔇 Не вдалося відтворити звук:', error);
      });
    }

    // 8. Вібрація для мобільних
    if (options.vibrate !== false && support.vibrationSupported) {
      const vibratePattern = Array.isArray(options.vibrate) ? options.vibrate : [100, 50, 100];
      triggerVibration(vibratePattern);
    }

    // Підготовка опцій сповіщення
    const notificationData: NotificationOptions = {
      body: options.body || '',
      icon: options.icon || '/favicon.ico',
      badge: options.badge || '/favicon.ico', // 9. Підтримка badge
      tag: options.tag || `notification-${Date.now()}`, // 9. Підтримка tag
      lang: options.lang || 'uk', // 9. Підтримка lang
      requireInteraction: options.requireInteraction || false,
      silent: options.silent || false,
      dir: options.dir || 'auto',
      renotify: options.renotify || false,
      timestamp: options.timestamp || Date.now(),
      data: options.data || {},
      image: options.image
    };

    // Створення нативного сповіщення
    const notification = new Notification(title, notificationData);

    // 6. Подія onClick → фокусує вкладку або викликає data.onClick()
    notification.onclick = (event) => {
      event.preventDefault();
      
      // Фокусування вкладки браузера
      if (window.focus) {
        window.focus();
      }
      
      // Додаткове фокусування для різних браузерів
      if (window.parent && window.parent.focus) {
        window.parent.focus();
      }
      
      // Виклик кастомного обробника
      if (options.onClick && typeof options.onClick === 'function') {
        try {
          options.onClick();
          console.log('✅ Виконано кастомний onClick обробник');
        } catch (error) {
          console.warn('❌ Помилка в onClick обробнику:', error);
        }
      }
      
      // Закриття сповіщення
      notification.close();
    };

    // Обробка помилок сповіщення
    notification.onerror = (error) => {
      console.warn('❌ Помилка показу сповіщення:', error);
    };

    notification.onshow = () => {
      console.log(`✅ Сповіщення показано: "${title}"`);
    };

    notification.onclose = () => {
      console.log(`🔒 Сповіщення закрито: "${title}"`);
    };

    // 5. Автоматичне закриття через 5 секунд (або з параметра)
    const autoCloseTimeout = options.timeout || 5000;
    
    setTimeout(() => {
      try {
        notification.close();
        console.log(`⏰ Сповіщення автоматично закрито через ${autoCloseTimeout}мс`);
      } catch (error) {
        console.warn('⚠️ Помилка автоматичного закриття:', error);
      }
    }, autoCloseTimeout);

    return true;

  } catch (error) {
    // 4. Обробка помилок (graceful fallback)
    console.warn('❌ Критична помилка створення сповіщення:', error);
    
    // Fallback через alert якщо критично
    if (options.fallbackAlert) {
      alert(`${title}\n${options.body || ''}`);
    }
    
    console.warn(`📢 Fallback повідомлення: ${title} - ${options.body || ''}`);
    return false;
  }
};

/**
 * 🧪 Тестові функції
 */
export const testNotifications = {
  basic: () => showNotification('🔔 Базове сповіщення', {
    body: 'Простий тест без додаткових налаштувань'
  }),
  
  withSound: () => showNotification('🎵 Сповіщення зі звуком', {
    body: 'Тест з кастомним звуком та вібрацією',
    sound: true,
    vibrate: [200, 100, 200, 100, 200]
  }),
  
  customTimeout: () => showNotification('⏰ Швидке закриття', {
    body: 'Це сповіщення закриється через 2 секунди',
    timeout: 2000
  }),
  
  interactive: () => showNotification('🎯 Інтерактивне сповіщення', {
    body: 'Клікніть для виклику кастомної функції',
    requireInteraction: true,
    onClick: () => {
      console.log('🎉 Клік по інтерактивному сповіщенню!');
      alert('Кастомний обробник викликано!');
    }
  }),
  
  withFallback: () => showNotification('🚨 З fallback', {
    body: 'Це сповіщення має fallback через alert',
    fallbackAlert: true,
    onClick: () => console.log('Fallback тест')
  }),

  silent: () => showNotification('🔇 Беззвучне сповіщення', {
    body: 'Без звуку та вібрації',
    sound: false,
    vibrate: false,
    silent: true
  })
};

/**
 * 📊 Отримання статусу підтримки
 */
export const getNotificationStatus = (): NotificationSupport & {
  permissionGranted: boolean;
  canShowNotifications: boolean;
} => {
  const support = checkBrowserSupport();
  return {
    ...support,
    permissionGranted: support.permission === 'granted',
    canShowNotifications: support.isSupported && support.permission === 'granted'
  };
};

/**
 * 🎮 Швидкі функції для типових сповіщень
 */
export const quickNotifications = {
  success: (message: string) => showNotification('✅ Успіх', {
    body: message,
    icon: '/favicon.ico',
    sound: true
  }),
  
  error: (message: string) => showNotification('❌ Помилка', {
    body: message,
    icon: '/favicon.ico',
    sound: true,
    vibrate: [300, 100, 300],
    fallbackAlert: true
  }),
  
  warning: (message: string) => showNotification('⚠️ Попередження', {
    body: message,
    icon: '/favicon.ico',
    sound: true,
    vibrate: [150, 100, 150]
  }),
  
  info: (message: string) => showNotification('ℹ️ Інформація', {
    body: message,
    icon: '/favicon.ico',
    sound: false
  })
};
