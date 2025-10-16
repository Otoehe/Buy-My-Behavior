// 📄 src/lib/realtimeNotifications.ts — Realtime Push Notifications для BMB через Supabase

import React from 'react';
import { supabase } from './supabase';
import { showNotification } from './universalNotifications';

// === Типи для realtime сповіщень ===
export interface ScenarioStatusChange {
  scenario_id: string;
  old_status: string;
  new_status: string;
  creator_id: string;
  executor_id: string;
  description: string;
  donation_amount_usdt: number;
  created_at: string;
}

export interface NotificationEvent {
  type: 'scenario_created' | 'status_changed' | 'agreement_signed' | 'completion_confirmed';
  data: any;
  recipient_ids: string[];
  timestamp: number;
}

// === Клас для управління realtime сповіщеннями ===
class RealtimeNotificationManager {
  private currentUserId: string | null = null;
  private isListening: boolean = false;
  private channels: any[] = [];
  private lastNotificationTime: Map<string, number> = new Map();
  private readonly COOLDOWN_MS = 5000; // 5 секунд cooldown (оптимізовано)
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastPollingData: any = null;
  private pollingIntervalTime = 15000; // 15 секунд для polling (швидше)
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // початкова затримка відновлення

  // === Ініціалізація менеджера ===
  public async initialize(userId: string): Promise<boolean> {
    if (this.currentUserId === userId && this.isListening) {
      console.log('🔄 Realtime вже ініціалізовано для користувача:', userId);
      return true;
    }

    this.currentUserId = userId;
    console.log('🚀 Ініціалізація Realtime Notifications для:', userId);

    try {
      // Спочатку пробуємо Supabase Realtime
      const realtimeSuccess = await this.setupSupabaseRealtime();
      
      if (realtimeSuccess) {
        console.log('✅ Supabase Realtime підключено');
        return true;
      } else {
        // Fallback на polling
        console.warn('⚠️ Supabase Realtime недоступний, використовуємо polling');
        this.setupPollingFallback();
        return true;
      }
    } catch (error) {
      console.error('❌ Помилка ініціалізації realtime:', error);
      this.setupPollingFallback();
      return false;
    }
  }

  // === Налаштування Supabase Realtime ===
  private async setupSupabaseRealtime(): Promise<boolean> {
    try {
      // Перевіряємо підключення до Supabase
      const { data, error } = await supabase.from('scenarios').select('id').limit(1);
      if (error) {
        console.error('🚫 Помилка підключення до Supabase:', error);
        return false;
      }

      // Скидаємо лічильник спроб при успішному підключенні
      this.reconnectAttempts = 0;

      // Створюємо канал для scenarios таблиці
      const scenariosChannel = supabase
        .channel('scenarios-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'scenarios'
          },
          (payload) => this.handleScenarioChange(payload)
        )
        .subscribe((status) => {
          console.log('📡 Realtime статус:', status);
          if (status === 'SUBSCRIBED') {
            this.isListening = true;
            console.log('✅ Підписка на scenarios активна');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Помилка каналу, переходимо на polling');
            this.setupPollingFallback();
          }
        });

      this.channels.push(scenariosChannel);
      return true;
    } catch (error) {
      console.error('❌ Помилка налаштування Supabase Realtime:', error);
      return false;
    }
  }

  // === Fallback через polling ===
  private setupPollingFallback(): void {
    console.log(`🔄 Запуск polling fallback (кожні ${this.pollingIntervalTime / 1000} секунд)`);
    
    // Очищаємо попередній interval якщо є
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(async () => {
      await this.pollForChanges();
    }, this.pollingIntervalTime); // використовуємо змінну для гнучкості

    this.isListening = true;
  }

  // === Polling для змін ===
  private async pollForChanges(): Promise<void> {
    if (!this.currentUserId) return;

    try {
      // Отримуємо сценарії користувача, оновлені за останні 20 секунд (оптимізовано)
      const timeWindow = new Date(Date.now() - (this.pollingIntervalTime + 5000)).toISOString();
      
      const { data: scenarios, error } = await supabase
        .from('scenarios')
        .select('*')
        .or(`creator_id.eq.${this.currentUserId},executor_id.eq.${this.currentUserId}`)
        .gte('updated_at', timeWindow)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('❌ Помилка polling:', error);
        return;
      }

      if (scenarios && scenarios.length > 0) {
        // Порівнюємо з попередніми даними
        for (const scenario of scenarios) {
          const key = `${scenario.id}-${scenario.status}`;
          const lastTime = this.lastNotificationTime.get(key);
          const now = Date.now();

          // Перевіряємо cooldown
          if (lastTime && (now - lastTime) < this.COOLDOWN_MS) {
            continue;
          }

          // Симулюємо payload для обробки
          await this.handleScenarioChange({
            eventType: 'UPDATE',
            new: scenario,
            old: this.lastPollingData?.[scenario.id] || { status: 'unknown' }
          });

          this.lastNotificationTime.set(key, now);
        }

        // Зберігаємо поточні дані для наступного порівняння
        this.lastPollingData = scenarios.reduce((acc, s) => {
          acc[s.id] = s;
          return acc;
        }, {} as any);
      }
    } catch (error) {
      console.error('❌ Помилка в polling:', error);
      
      // Спробуємо відновити Realtime з'єднання при помилці polling
      this.attemptReconnect();
    }
  }

  // === Автоматичне відновлення з'єднання ===
  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`🛑 Досягнуто максимум спроб відновлення (${this.maxReconnectAttempts})`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // експоненційна затримка
    
    console.log(`🔄 Спроба відновлення ${this.reconnectAttempts}/${this.maxReconnectAttempts} через ${delay}ms`);
    
    setTimeout(async () => {
      try {
        // Зупиняємо поточні підключення
        this.stopListening();
        
        // Пробуємо відновити Realtime
        if (this.currentUserId) {
          const success = await this.setupSupabaseRealtime();
          if (success) {
            console.log('✅ Realtime з\'єднання відновлено успішно');
            this.reconnectAttempts = 0; // скидаємо лічильник
          } else {
            console.log('⚠️ Realtime не вдалося відновити, продовжуємо з polling');
          }
        }
      } catch (error) {
        console.error('❌ Помилка під час відновлення:', error);
      }
    }, delay);
  }

  // === Обробка змін в сценаріях ===
  private async handleScenarioChange(payload: any): Promise<void> {
    console.log('📥 Отримано зміну в scenarios:', payload);

    if (!this.currentUserId) {
      console.warn('⚠️ Користувач не ідентифікований');
      return;
    }

    const { eventType, new: newRecord, old: oldRecord } = payload;

    // Обробляємо різні типи подій
    if (eventType === 'INSERT') {
      await this.handleNewScenario(newRecord);
    } else if (eventType === 'UPDATE') {
      await this.handleStatusUpdate(oldRecord, newRecord);
    }
  }

  // === Обробка нового сценарію ===
  private async handleNewScenario(scenario: any): Promise<void> {
    // Сповіщаємо тільки потенційних виконавців (поки що всіх окрім автора)
    if (scenario.creator_id === this.currentUserId) {
      return; // Автор не отримує сповіщення про власний сценарій
    }

    const notificationKey = `new-scenario-${scenario.id}`;
    const lastTime = this.lastNotificationTime.get(notificationKey);
    const now = Date.now();

    if (lastTime && (now - lastTime) < this.COOLDOWN_MS) {
      console.log('⏳ Cooldown: пропуск сповіщення про новий сценарій');
      return;
    }

    await showNotification('🆕 Новий сценарій доступний!', {
      body: `"${scenario.description?.slice(0, 60)}..." • Сума: ${scenario.donation_amount_usdt} USDT`,
      sound: true,
      timeout: 6000,
      onClick: () => {
        console.log('🎯 Клік по сповіщенню нового сценарію');
        // Можна додати навігацію до списку сценаріїв
      }
    });

    this.lastNotificationTime.set(notificationKey, now);
    console.log('✅ Сповіщення про новий сценарій надіслано');
  }

  // === Обробка оновлення статусу ===
  private async handleStatusUpdate(oldRecord: any, newRecord: any): Promise<void> {
    // Перевіряємо чи користувач причетний до сценарію
    const isInvolved = this.currentUserId === newRecord.creator_id || 
                      this.currentUserId === newRecord.executor_id;
    
    if (!isInvolved) {
      return;
    }

    const oldStatus = oldRecord.status;
    const newStatus = newRecord.status;

    if (oldStatus === newStatus) {
      return; // Статус не змінився
    }

    console.log(`📊 Зміна статусу сценарію ${newRecord.id}: ${oldStatus} → ${newStatus}`);

    const notificationKey = `status-${newRecord.id}-${newStatus}`;
    const lastTime = this.lastNotificationTime.get(notificationKey);
    const now = Date.now();

    if (lastTime && (now - lastTime) < this.COOLDOWN_MS) {
      console.log('⏳ Cooldown: пропуск сповіщення про зміну статусу');
      return;
    }

    // Визначаємо роль користувача
    const isExecutor = this.currentUserId === newRecord.executor_id;
    const isCustomer = this.currentUserId === newRecord.creator_id;

    // Логіка сповіщень залежно від зміни статусу
    await this.sendStatusNotification(oldStatus, newStatus, newRecord, isExecutor, isCustomer);

    this.lastNotificationTime.set(notificationKey, now);
  }

  // === Надсилання сповіщень про статус ===
  private async sendStatusNotification(
    oldStatus: string,
    newStatus: string,
    scenario: any,
    isExecutor: boolean,
    isCustomer: boolean
  ): Promise<void> {
    let title = '';
    let body = '';
    let sound = true;
    let timeout = 5000;

    switch (newStatus) {
      case 'agreed':
        if (oldStatus !== 'agreed') {
          title = '🤝 Угоду погоджено!';
          body = `Сценарій "${scenario.description?.slice(0, 50)}..." підтверджено обома сторонами. Сума: ${scenario.donation_amount_usdt} USDT`;
          timeout = 7000;
        }
        break;

      case 'confirmed':
        title = '✅ Підтвердження отримано';
        body = isExecutor 
          ? 'Замовник підтвердив початок роботи. Можете приступати до виконання.'
          : 'Виконавець підтвердив отримання завдання та розпочав роботу.';
        break;

      case 'completed':
        if (oldStatus !== 'completed') {
          title = '🎉 Сценарій завершено!';
          body = isExecutor
            ? `Кошти розподілено через escrow. Ви отримали ${(scenario.donation_amount_usdt * 0.9).toFixed(2)} USDT (90% від суми угоди).`
            : 'Сценарій виконано та кошти розподілено. Перевірте результат виконання.';
          sound = true;
          timeout = 8000;
        }
        break;

      case 'cancelled':
        title = '❌ Сценарій скасовано';
        body = 'Угода була скасована. Кошти повернуто замовнику.';
        break;

      case 'dispute':
        title = '⚠️ Відкрито спір';
        body = 'По сценарію відкрито спір. Очікуйте розгляду адміністрацією.';
        timeout = 10000;
        break;

      default:
        // Для інших статусів не показуємо сповіщення
        return;
    }

    if (title && body) {
      await showNotification(title, {
        body,
        sound,
        timeout,
        vibrate: sound ? [200, 100, 200] : false,
        onClick: () => {
          console.log(`🎯 Клік по сповіщенню статусу: ${newStatus}`);
          // Можна додати навігацію до конкретного сценарію
        }
      });

      console.log(`✅ Сповіщення про статус "${newStatus}" надіслано`);
    }
  }

  // === Тестове сповіщення ===
  public async sendTestNotification(): Promise<void> {
    await showNotification('🧪 Тест Realtime', {
      body: 'Система realtime сповіщень працює коректно!',
      sound: true,
      timeout: 4000,
      onClick: () => console.log('🎯 Тест realtime пройдено!')
    });
  }

  // === Симуляція події для тестування ===
  public async simulateScenarioEvent(eventType: 'new' | 'agreed' | 'completed'): Promise<void> {
    const mockScenario = {
      id: `test-${Date.now()}`,
      description: 'Тестовий сценарій для демонстрації realtime сповіщень',
      donation_amount_usdt: 100,
      creator_id: 'test-creator',
      executor_id: this.currentUserId,
      status: eventType === 'new' ? 'draft' : eventType,
      created_at: new Date().toISOString()
    };

    switch (eventType) {
      case 'new':
        await this.handleNewScenario(mockScenario);
        break;
      case 'agreed':
        await this.handleStatusUpdate(
          { status: 'draft' },
          { ...mockScenario, status: 'agreed' }
        );
        break;
      case 'completed':
        await this.handleStatusUpdate(
          { status: 'agreed' },
          { ...mockScenario, status: 'completed' }
        );
        break;
    }
  }

  // === Отримання статусу з'єднання ===
  public getConnectionStatus(): {
    isListening: boolean;
    method: 'realtime' | 'polling' | 'none';
    userId: string | null;
    reconnectAttempts: number;
  } {
    return {
      isListening: this.isListening,
      method: this.pollingInterval ? 'polling' : (this.channels.length > 0 ? 'realtime' : 'none'),
      userId: this.currentUserId,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  // === Зупинка прослуховування ===
  public stopListening(): void {
    console.log('⏸️ Зупинка прослуховування Realtime');

    // Відписуємося від каналів Supabase
    this.channels.forEach(channel => {
      supabase.removeChannel(channel);
    });
    this.channels = [];

    // Очищаємо polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.isListening = false;
  }

  // === Очищення ресурсів ===
  public cleanup(): void {
    console.log('🧹 Очищення Realtime Notifications');

    this.stopListening();

    // Скидаємо стан
    this.currentUserId = null;
    this.lastNotificationTime.clear();
    this.lastPollingData = null;
    this.reconnectAttempts = 0; // скидаємо лічильник спроб

    console.log('✅ Realtime Notifications очищено');
  }

  // === Перезапуск підключення ===
  public async restart(): Promise<boolean> {
    const userId = this.currentUserId;
    this.cleanup();
    
    if (userId) {
      return await this.initialize(userId);
    }
    
    return false;
  }
}

// === Експорт singleton instance ===
export const realtimeNotificationManager = new RealtimeNotificationManager();

// === Утилітарні функції ===
export const initializeRealtimeNotifications = (userId: string): Promise<boolean> => {
  return realtimeNotificationManager.initialize(userId);
};

export const cleanupRealtimeNotifications = (): void => {
  realtimeNotificationManager.cleanup();
};

export const getRealtimeStatus = () => {
  return realtimeNotificationManager.getConnectionStatus();
};

export const testRealtimeNotification = (): Promise<void> => {
  return realtimeNotificationManager.sendTestNotification();
};

export const simulateRealtimeEvent = (eventType: 'new' | 'agreed' | 'completed'): Promise<void> => {
  return realtimeNotificationManager.simulateScenarioEvent(eventType);
};

// === React Hook для зручності ===
export const useRealtimeNotifications = (userId: string | null) => {
  const [status, setStatus] = React.useState(() => realtimeNotificationManager.getConnectionStatus());

  React.useEffect(() => {
    if (!userId) return;

    const initRealtime = async () => {
      const success = await initializeRealtimeNotifications(userId);
      setStatus(realtimeNotificationManager.getConnectionStatus());
      
      if (success) {
        console.log('🔗 Realtime notifications активовано для:', userId);
      }
    };

    initRealtime();

    // Очищення при розмонтуванні
    return () => {
      cleanupRealtimeNotifications();
    };
  }, [userId]);

  // Періодично оновлюємо статус
  React.useEffect(() => {
    const interval = setInterval(() => {
      setStatus(realtimeNotificationManager.getConnectionStatus());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return {
    ...status,
    testNotification: testRealtimeNotification,
    simulateEvent: simulateRealtimeEvent,
    restart: () => realtimeNotificationManager.restart()
  };
};
