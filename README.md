# 📊 Work-Analytics

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Framework: Express](https://img.shields.io/badge/Framework-Express-lightgrey.svg)](https://expressjs.com/)
[![Cloud: Puter](https://img.shields.io/badge/Cloud-Puter-orange.svg)](https://puter.com/)

**Work-Analytics** — это современное веб-приложение для автоматизированного сбора, агрегации и интеллектуального анализа данных об IT-вакансиях. Инструмент помогает отслеживать тренды рынка труда, анализировать требования работодателей и визуализировать статистику по ключевым навыкам.

---

## ✨ Основные возможности

- 🚀 **Мультиплатформенный парсинг**: Сбор данных из ведущих агрегаторов вакансий.
- 🔍 **Умные фильтры**: Поиск и фильтрация вакансий по технологическому стеку, региону и уровню заработной платы.
- 📊 **Аналитическая отчетность**: Генерация детальных отчетов о востребованности технологий.
- ⚡ **Real-time мониторинг**: Отслеживание процесса парсинга в реальном времени с индикацией прогресса.
- ☁️ **Cloud Native**: Полная интеграция с платформой Puter для развертывания и хранения данных.

---

## 🛠 Технологический стек

- **Backend**: [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)
- **Парсинг**: [Axios](https://axios-http.com/) & [Cheerio](https://cheerio.js.org/)
- **Инфраструктура**: [Puter.js](https://docs.puter.com/)
- **Environment**: [Dotenv](https://www.npmjs.com/package/dotenv)
- **Proxy**: [HTTPS Proxy Agent](https://www.npmjs.com/package/https-proxy-agent)

---

## 🌐 Поддерживаемые платформы

| Платформа | Статус | Тип доступа |
| :--- | :---: | :--- |
| **HeadHunter (hh.ru)** | ✅ | API / Web |
| **Habr Career** | ✅ | Web Scraping |
| **Rabota.by** | ✅ | Web Scraping |

---

## 🚀 Быстрый старт

### 1. Клонирование репозитория
```bash
git clone https://github.com/your-username/Work-Analytics.git
cd Work-Analytics
```

### 2. Установка зависимостей
```bash
npm install
```

### 3. Настройка окружения
Создайте файл `.env` в корневой директории и добавьте необходимые ключи:
```env
PORT=3000
HH_CLIENT_ID=your_id
HH_CLIENT_SECRET=your_secret
# Другие настройки прокси и API
```

### 4. Запуск приложения
```bash
# Режим разработки
npm run dev

# Продакшн запуск
npm start
```

---

## 📅 Дорожная карта (Roadmap)

- [ ] **AI Integration**: Использование LLM для автоматического формирования "портрета идеального кандидата".
- [ ] **Advanced Visualization**: Интерактивные дашборды с графиками динамики зарплат.
- [ ] **Notification System**: Уведомления в Telegram о завершении сбора данных.
- [ ] **WebSockets**: Переход на сокеты для более гибкого управления задачами парсинга.

---

## 📄 Лицензия

Распространяется под лицензией [ISC](LICENSE).

---
<p align="center">
  Сделано с ❤️ для IT-сообщества
</p>
