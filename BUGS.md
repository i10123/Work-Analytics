## 🟡 БАГ #11 — `console.log` перехват: `require('util')` внутри горячего пути

**Файл:** `server/app.js`, строка 15

**Что не так:**
Функция `formatLogMessage` вызывает `require('util')` при каждом вызове `console.log/warn/error`. Хотя Node.js кеширует модули, это лишний lookup в кеше на каждый лог-вызов. При интенсивном парсинге — десятки вызовов в секунду.

```javascript
// Текущий код:
function formatLogMessage(level, args) {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    let msg = require('util').format(...args); // require на каждый вызов!
    msg = msg.replace(/\\x1b\\[[0-9;]*m/g, '');
    return `[${timestamp}] [${level}] ${msg}\n`;
}
```

**Как решить:**
Вынести `require('util')` на верхний уровень модуля:

```javascript
const util = require('util'); // Один раз при загрузке модуля

function formatLogMessage(level, args) {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    let msg = util.format(...args);
    msg = msg.replace(/\\x1b\\[[0-9;]*m/g, '');
    return `[${timestamp}] [${level}] ${msg}\n`;
}
```

---

## 🟡 БАГ #12 — Storage: компактизация index при каждом запуске

**Файл:** `server/services/storage.js`, строки 112–114

**Что не так:**
При первой загрузке списка отчётов всегда вызывается `_compactIndex()`, которая перезаписывает весь файл `index.jsonl`. Если отчётов много — это замедляет первый запрос после старта сервера без реальной необходимости.

```javascript
// Текущий код:
reportsCache = Array.from(reportsMap.values()).sort(...);
await _compactIndex(); // Всегда перезаписывает файл
return reportsCache;
```

**Как решить:**
Компактизировать только если есть "мусор" (удалённые записи или дубликаты):

```javascript
// Считаем строки в файле vs уникальные записи
let totalLines = 0;
for await (const line of rl) {
    if (!line.trim()) continue;
    totalLines++;
    // ... парсинг
}

reportsCache = Array.from(reportsMap.values()).sort(...);

// Компактизация нужна только если файл "раздут"
if (totalLines > reportsCache.length * 1.5) {
    await _compactIndex();
}
```

---

## 🟡 БАГ #13 — Однопоточная очередь: 1 задача за раз

**Файл:** `server/services/queue.js`, строки 70–81

**Что не так:**
Очередь задач строго последовательная — `isProcessing` блокирует запуск второй задачи, даже если ресурсы позволяют. Если один пользователь запустил парсинг 200 вакансий с deep scrape + AI, все остальные ждут до 15 минут.

```javascript
let isProcessing = false;

function processNext() {
    if (isProcessing) return; // Полная блокировка
    // ...
}
```

**Как решить (для будущего масштабирования):**
Ввести конфигурируемый concurrency limit:

```javascript
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_TASKS, 10) || 1;
let activeTasksCount = 0;

function processNext() {
    if (activeTasksCount >= MAX_CONCURRENT) return;

    const taskIndex = taskQueue.findIndex(t => t.status === 'pending');
    if (taskIndex === -1) return;

    activeTasksCount++;
    const task = taskQueue[taskIndex];
    _processTask(task).finally(() => {
        activeTasksCount--;
        processNext();
    });
}
```

---

## 🟡 БАГ #14 — DOM-элементы кешируются один раз и не обновляются

**Файл:** `public/js/dom.js`

**Что не так:**
Все `document.getElementById()` вызываются при импорте модуля (один раз при загрузке страницы). Объект `DOM` — это "снимок" DOM на момент загрузки. Если какие-то элементы рендерятся позже (динамически) — их значения будут `null`.

Сейчас это не баг, т.к. весь HTML в одном файле. Но это станет проблемой при:
- Переходе на ленивую загрузку экранов
- Рендеринге через `<template>`
- Любой динамической генерации DOM

**Как решить (превентивно):**
Использовать lazy-getter паттерн:

```javascript
function lazyElement(id) {
    let cached = null;
    return {
        get el() {
            if (!cached) cached = document.getElementById(id);
            return cached;
        },
        invalidate() { cached = null; }
    };
}

// Или проще — функция вместо свойства:
export const DOM = {
    get sidebar() { return document.getElementById('sidebar'); },
    get sidebarToggle() { return document.getElementById('sidebarToggle'); },
    // ...
};
```

---

## 🟡 БАГ #15 — Монолитный index.html: 57KB парсится целиком

**Файл:** `public/index.html` — 57,803 байт

**Что не так:**
Один HTML-файл содержит ВСЕ экраны приложения: welcome, progress, dashboard, settings, modal, sidebar. Браузер парсит и строит DOM для всех элементов при первой загрузке, хотя пользователь видит только один экран (welcome).

Это увеличивает:
- Time to First Paint
- Потребление памяти (DOM-дерево для невидимых экранов)
- Время работы `document.getElementById()` для `dom.js`

**Как решить:**
- **Минимальное решение:** обернуть скрытые экраны в `<template>`, чтобы браузер не создавал DOM до активации
- **Оптимальное решение:** вынести экраны в отдельные HTML-фрагменты и загружать через `fetch()` при навигации
- **Production:** минифицировать HTML (удалить пробелы, комментарии)

---
