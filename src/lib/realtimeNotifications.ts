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

  // 🔒 Тримаємо єдиний канал, замість масиву — щоб не плодити підписок
  private scenariosChannel: ReturnType<typeof supabase.channel> | null = null;

  private lastNotificationTime: Map<string, number> = new Map();
  private readonly COOLDOWN_MS = 5000;

  // Використовуємо ReturnType<typeof setInterval> — коректно для браузера/TS
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPollingData: Record<string, any> | null = null;
  private pollingIntervalTime = 15000;

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // початкова затримка відновлення

  // === Ініціалізація менеджера ===
  public async initialize(userId: string): Promise<boolean> {
    // Якщо вже ініціалізовано для цього ж користувача — нічого не робимо
    if (this.currentUserId === userId && this.isListening) {
      console.log('🔄 Realtime вже ініціалізовано для користувача:', userId);
      return true;
    }

    // Перед повторною ініціалізацією завжди робимо stopListening() — запобігає дублям
    this.stopListening();

    this.currentUserId = userId;
    console.log('🚀 Ініціалізація Realtime Notifications для:', userId);

    try {
      const realtimeSuccess = await this.setupSupabaseRealtime();
      if (realtimeSuccess) {
        console.log('✅ Supabase Realtime підключено');
        return true;
      } else {
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
      // Швидка перевірка з’єднання
      const { error } = await supabase.from('scenarios').select('id').limit(1);
      if (error) {
        console.error('🚫 Помилка підключення до Supabase:', error);
        return false;
      }

      this.reconnectAttempts = 0;

      // Якщо був старий канал — прибираємо (додатковий захист)
      if (this.scenariosChannel) {
        try { supabase.removeChannel(this.scenariosChannel); } catch {}
        this.scenariosChannel = null;
      }

      // ЄДИНИЙ канал на події таблиці scenarios
      const ch = supabase
        .channel('scenarios-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'scenarios',
            // Примітка: filter підтримує прості умови; складні "or" тут не гарантуються,
            // тому додатково фільтруємо в handleStatusUpdate().
          },
          (payload) => this.handleScenarioChange(payload)
        )
        .subscribe((status) => {
          console.log('📡 Realtime статус:', status);
          if (status === 'SUBSCRIBED') {
            this.isListening = true;
            console.log('✅ Підписка на scenarios активна');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error('❌ Помилка каналу або розрив з’єднання, переходимо на polling');
            this.setupPollingFallback();
          }
        });

      this.scenariosChannel = ch;
      return true;
    } catch (error) {
      console.error('❌ Помилка налаштування Supabase Realtime:', error);
      return false;
    }
  }

  // === Fallback через polling ===
  private setupPollingFallback(): void {
    console.log(`🔄 Запуск polling fallback (кожні ${this.pollingIntervalTime / 1000} секунд)`);

    if (this.pollingInterval) clearInterval(this.pollingInterval);

    this.pollingInterval = setInterval(async () => {
      await this.pollForChanges();
    }, this.pollingIntervalTime);

    this.isListening = true;
  }

  // === Polling для змін ===
  private async pollForChanges(): Promise<void> {
    if (!this.currentUserId) return;

    try {
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
        for (const scenario of scenarios) {
          const key = `${scenario.id}-${scenario.status}`;
          const lastTime = this.lastNotificationTime.get(key);
          const now = Date.now();
          if (lastTime && (now - lastTime) < this.COOLDOWN_MS) continue;

          await this.handleScenarioChange({
            eventType: 'UPDATE',
            new: scenario,
            old: this.lastPollingData?.[scenario.id] || { status: 'unknown' }
          });

          this.lastNotificationTime.set(key, now);
        }

        // Зберігаємо останній знімок
        this.lastPollingData = scenarios.reduce((acc, s) => {
          acc[s.id] = s;
          return acc;
        }, {} as Record<string, any>);
      }
    } catch (error) {
      console.error('❌ Помилка в polling:', error);
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
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`🔄 Спроба відновлення ${this.reconnectAttempts}/${this.maxReconnectAttempts} через ${delay}ms`);

    setTimeout(async () => {
      try {
        this.stopListening();
        if (this.currentUserId) {
          const success = await this.setupSupabaseRealtime();
          if (success) {
            console.log('✅ Realtime з\'єднання відновлено успішно');
            this.reconnectAttempts = 0;
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
    // Формат payload Supabase v2: { eventType, new, old, table, schema, ... }
    if (!payload) return;

    if (!this.currentUserId) {
      console.warn('⚠️ Користувач не ідентифікований');
      return;
    }

    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === 'INSERT') {
      await this.handleNewScenario(newRecord);
    } else if (eventType === 'UPDATE') {
      await this.handleStatusUpdate(oldRecord, newRecord);
    }
  }

  // === Обробка нового сценарію ===
  private async handleNewScenario(scenario: any): Promise<void> {
    // Автор не отримує сповіщення про власний сценарій
    if (!scenario || scenario.creator_id === this.currentUserId) return;

    const notificationKey = `new-scenario-${scenario.id}`;
    const lastTime = this.lastNotificationTime.get(notificationKey);
    const now = Date.now();
    if (lastTime && (now - lastTime) < this.COOLDOWN_MS) return;

    await showNotification('🆕 Новий сценарій доступний!', {
      body: `"${scenario.description?.slice(0, 60)}..." • Сума: ${scenario.donation_amount_usdt} USDT`,
      sound: true,
      timeout: 6000,
      onClick: () => {
        console.log('🎯 Клік по сповіщенню нового сценарію');
      }
    });

    this.lastNotificationTime.set(notificationKey, now);
    console.log('✅ Сповіщення про новий сценарій надіслано');
  }

  // === Обробка оновлення статусу ===
  private async handleStatusUpdate(oldRecord: any, newRecord: any): Promise<void> {
    if (!newRecord) return;

    // Сповіщення лише для причетних
    const isInvolved =
      this.currentUserId === newRecord?.creator_id ||
      this.currentUserId === newRecord?.executor_id;

    if (!isInvolved) return;

    const oldStatus = oldRecord?.status;
    const newStatus = newRecord?.status;
    if (!newStatus || oldStatus === newStatus) return;

    console.log(`📊 Зміна статусу сценарію ${newRecord.id}: ${oldStatus} → ${newStatus}`);

    const notificationKey = `status-${newRecord.id}-${newStatus}`;
    const lastTime = this.lastNotificationTime.get(notificationKey);
    const now = Date.now();
    if (lastTime && (now - lastTime) < this.COOLDOWN_MS) return;

    const isExecutor = this.currentUserId === newRecord.executor_id;
    const isCustomer = this.currentUserId === newRecord.creator_id;

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
      method: this.pollingInterval ? 'polling' : (this.scenariosChannel ? 'realtime' : 'none'),
      userId: this.currentUserId,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  // === Зупинка прослуховування ===
  public stopListening(): void {
    console.log('⏸️ Зупинка прослуховування Realtime');

    if (this.scenariosChannel) {
      try { supabase.removeChannel(this.scenariosChannel); } catch {}
      this.scenariosChannel = null;
    }

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
    this.reconnectAttempts = 0;

    console.log('✅ Realtime Notifications очищено');
  }

  // === Перезапуск підключення ===
  public async restart(): Promise<boolean> {
    const userId = this.currentUserId;
    this.cleanup();
    if (userId) return await this.initialize(userId);
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
      if (success) console.log('🔗 Realtime notifications активовано для:', userId);
    };

    initRealtime();

    // Очищення при розмонтуванні/зміні userId
    return () => {
      cleanupRealtimeNotifications();
    };
  }, [userId]);

  // Періодичне оновлення статусу (для UI/діагностики)
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
