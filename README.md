# 📊 Work-Analytics

**Work-Analytics** — это современное веб-приложение для автоматизированного сбора, агрегации и интеллектуального анализа данных об IT-вакансиях. Инструмент помогает отслеживать тренды рынка труда, анализировать требования работодателей и визуализировать статистику по ключевым навыкам.

---

## 🛠 Технологический стек

- **Backend**: [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)
- **Парсинг**: [Axios](https://axios-http.com/) & [Cheerio](https://cheerio.js.org/)
- **Инфраструктура**: [Puter.js](https://docs.puter.com/)
- **Environment**: [Dotenv](https://www.npmjs.com/package/dotenv)
- **Proxy**: [HTTPS Proxy Agent](https://www.npmjs.com/package/https-proxy-agent)

---

## 🌐 Поддерживаемые платформы

| Платформа | Статус | Метод сбора данных |
| :--- | :---: | :--- |
| **HeadHunter (hh.ru)** | ✅ | **Official API** (OAuth2 / JSON) |
| **Habr Career** | ✅ | **Web Scraping** (HTML / Cheerio) |
| **Rabota.by** | ✅ | **Official API** (HH Network / JSON) |

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
Создайте файл `.env` в корневой директории и настройте следующие параметры:
```env
# Основные настройки
PORT=3000

# HeadHunter API (регистрация на dev.hh.ru)
HH_CLIENT_ID=ваш_client_id
HH_CLIENT_SECRET=ваш_client_secret

# Прокси для обхода блокировок (формат: "IP Port Type" или "http://user:pass@ip:port")
RU_PROXY=x.x.x.x 80 HTTP

# Курсы валют (Exchange Rate API) — для конвертации зарплат
EXCHANGE_RATE_API_KEYS=ваш_ключ_1,ваш_ключ_2

# AI Интеграция (OpenRouter) — для анализа вакансий через LLM
OPENROUTER_API_KEY=ваш_ключ_openrouter

# Облачная платформа Puter (опционально)
PUTER_AUTH_TOKEN=ваш_токен_puter
```

### 4. Запуск приложения
```bash
# Режим разработки
npm run dev

# Продакшн запуск
npm start
```