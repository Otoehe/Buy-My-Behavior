# 📡 BMB Realtime Push Notifications System

## 🎯 Огляд системи

Комплексна система push-сповіщень в реальному часі для платформи BuyMyBehavior, яка забезпечує надійну доставку сповіщень про зміни статусів сценаріїв, угод та транзакцій через Web3 escrow.

## 🏗️ Архітектура системи

### Основні компоненти:

1. **RealtimeNotificationManager** - головний клас управління realtime з'єднаннями
2. **Universal Notifications** - кросс-браузерна система сповіщень
3. **Supabase Realtime** - первинний канал для realtime оновлень
4. **Polling Fallback** - резервний механізм при недоступності Realtime
5. **Auto-reconnection** - автоматичне відновлення з'єднання

## 📁 Структура файлів

```
src/lib/
├── realtimeNotifications.ts    # Головний менеджер Realtime системи
├── universalNotifications.ts   # Кросс-браузерні push сповіщення
├── pushNotifications.ts        # Базові push сповіщення
└── supabase.ts                # Конфігурація Supabase

src/components/
├── ReceivedScenarios.tsx       # UI для виконавців (з realtime)
├── MyOrders.tsx               # UI для замовників (з realtime)
└── ...

tests/
├── realtime-demo.html         # Демонстрація realtime системи
├── test-universal-notifications.html  # Тести сповіщень
├── test-reconnection.html     # Тести відновлення з'єднання
└── test-notifications.html    # Базові тести
```

## 🚀 Основні функції

### 1. Realtime з'єднання з автовідновленням

```typescript
// Ініціалізація
const success = await initializeRealtimeNotifications(userId);

// Отримання статусу
const status = realtimeNotificationManager.getConnectionStatus();
// { isListening: true, method: 'realtime', userId: 'user-123', reconnectAttempts: 0 }

// Ручне відновлення
await realtimeNotificationManager.restart();
```

### 2. Universal Push Notifications

```typescript
// Базове сповіщення
await showNotification('Новий сценарій!', {
  body: 'У вас є нове завдання',
  sound: true,
  vibrate: [200, 100, 200],
  timeout: 5000
});

// З onClick обробником
await showNotification('Угода підписана', {
  body: 'Всі сторони підтвердили умови',
  onClick: () => navigateToScenario(scenarioId),
  requireInteraction: true
});
```

### 3. React Hooks інтеграція

```typescript
// У React компоненті
const useRealtimeNotifications = (userId: string) => {
  const [status, setStatus] = React.useState(getRealtimeStatus());
  
  React.useEffect(() => {
    const initRealtime = async () => {
      await initializeRealtimeNotifications(userId);
      setStatus(realtimeNotificationManager.getConnectionStatus());
    };
    
    initRealtime();
    return () => cleanupRealtimeNotifications();
  }, [userId]);
  
  return status;
};
```

## 📋 Типи сповіщень

### Сценарії життєвого циклу:

1. **scenario_created** - новий сценарій створено
2. **status_changed** - зміна статусу (draft → agreed → confirmed → completed)
3. **agreement_signed** - угода підписана обома сторонами
4. **completion_confirmed** - завершення підтверджено

### Типи статусів:

- `draft` - чернетка
- `published` - опубліковано
- `agreed` - погоджено
- `confirmed` - підтверджено
- `completed` - завершено
- `disputed` - спір
- `cancelled` - скасовано

## ⚙️ Конфігурація

### Налаштування Cooldown:

```typescript
private readonly COOLDOWN_MS = 5000; // 5 секунд між сповіщеннями
private pollingIntervalTime = 15000;  // 15 секунд для polling
private maxReconnectAttempts = 5;     // максимум 5 спроб відновлення
private reconnectDelay = 2000;        // початкова затримка 2 секунди
```

### Supabase Realtime Events:

```typescript
// Підписка на зміни в таблиці scenarios
supabase
  .channel('scenarios-changes')
  .on('postgres_changes',
    { 
      event: '*', 
      schema: 'public', 
      table: 'scenarios',
      filter: `creator_id=eq.${userId}` 
    },
    handleScenarioChange
  )
  .subscribe();
```

## 🔄 Алгоритм відновлення з'єднання

1. **Початкове підключення** - спроба Supabase Realtime
2. **Fallback** - перехід на polling при помилці
3. **Автовідновлення** - експоненціальна затримка (2s, 4s, 8s, 16s, 32s)
4. **Максимум спроб** - 5 спроб, потім залишається на polling
5. **Успішне відновлення** - скидання лічильника спроб

## 🧪 Тестування

### Демо-сторінки:

1. **realtime-demo.html** - повна демонстрація системи
   - Симуляція життєвого циклу сценаріїв
   - Тестування помилок та відновлення
   - Реальні push сповіщення

2. **test-reconnection.html** - тести відновлення з'єднання
   - Симуляція втрати з'єднання
   - Стрес-тести (5 циклів)
   - Тести затримки мережі
   - Безперервний тест (30 секунд)

3. **test-universal-notifications.html** - тести сповіщень
   - Базові push сповіщення
   - Кросс-браузерна сумісність
   - Аудіо та вібрація

### Автоматичні тести:

```bash
# Збірка проекту
npm run build

# Запуск dev сервера
npm run dev

# Відкрити демо-сторінки:
# http://localhost:5173/realtime-demo.html
# http://localhost:5173/test-reconnection.html
```

## 📊 Метрики та моніторинг

### Відстеження показників:

- **Загальна кількість сповіщень** - totalNotifications
- **Успішні сповіщення** - successfulNotifications  
- **Спроби відновлення** - reconnectAttempts
- **Метод з'єднання** - 'realtime' | 'polling' | 'none'
- **Час відповіді** - avgReconnectTime

### Логування подій:

```typescript
console.log('🔗 Realtime notifications активовано для:', userId);
console.log('📡 Supabase Realtime підключено успішно');
console.log('🔄 Перехід на polling fallback');
console.log('✅ З\'єднання відновлено автоматично');
```

## 🛡️ Безпека та надійність

### Захист від спаму:

- **Cooldown період** - 5 секунд між повідомленнями одного типу
- **Дедуплікація** - перевірка унікальності за scenarioId + eventType
- **Rate limiting** - обмеження частоти через Map lastNotificationTime

### Fallback механізми:

1. **Supabase недоступний** → Polling кожні 15 секунд
2. **Notification API відсутній** → Консольне логування
3. **Звук недоступний** → Тихе сповіщення  
4. **Вібрація не підтримується** → Пропуск функції

### Обробка помилок:

```typescript
try {
  await showNotification(title, options);
  successfulNotifications++;
} catch (error) {
  console.error('❌ Помилка сповіщення:', error);
  // Graceful degradation
}
```

## 🔧 Конфігурація середовища

### Supabase Setup:

```typescript
// src/lib/supabase.ts
const supabaseUrl = 'your-supabase-url';
const supabaseKey = 'your-supabase-anon-key';

// Увімкнути Realtime в Supabase Dashboard:
// 1. Database → Replication → Включити для таблиці scenarios
// 2. API Settings → Realtime → Включити
```

### Permissions:

```javascript
// Автоматичний запит дозволу для сповіщень
if ('Notification' in window) {
  const permission = await Notification.requestPermission();
  // 'granted', 'denied', або 'default'
}
```

## 📈 Оптимізація продуктивності

### Покращення:

1. **Зменшений cooldown** - з 10 до 5 секунд
2. **Швидший polling** - з 30 до 15 секунд  
3. **Експоненціальна затримка** - розумне відновлення
4. **Дедуплікація** - запобігання дублюванню
5. **Lazy cleanup** - ефективне очищення ресурсів

### Memory Management:

```typescript
// Очищення при розмонтуванні компонента
React.useEffect(() => {
  return () => {
    cleanupRealtimeNotifications();
  };
}, []);
```

## 🎯 Використання в продакшені

### Checklist для deploy:

- [ ] Налаштувати Supabase Realtime
- [ ] Увімкнути Row Level Security (RLS)  
- [ ] Додати service worker для push сповіщень
- [ ] Налаштувати HTTPS (обов'язково для Notification API)
- [ ] Тестувати на різних пристроях та браузерах
- [ ] Налаштувати моніторинг та алерти

### Рекомендації:

1. **Тестування** - використовуйте всі 4 демо-сторінки
2. **Моніторинг** - відстежуйте метрики reconnectAttempts
3. **Fallback** - завжди мати polling як резерв
4. **UX** - показувати користувачам статус з'єднання
5. **Performance** - налаштувати cooldown під ваші потреби

---

## 🤝 Підтримка

Для питань та покращень звертайтесь до команди розробки BMB.

**Версія**: 4.2.0  
**Останнє оновлення**: {{current_date}}  
**Статус**: Production Ready ✅
