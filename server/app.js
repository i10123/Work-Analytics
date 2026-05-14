require('dotenv').config();
const express = require('express');
process.on('uncaughtException', (err) => console.error('[Fatal] Непойманная ошибка:', err));
process.on('unhandledRejection', (err) => console.error('[Fatal] Необработанный промис:', err));
const path = require('path');
const apiRouter = require('./routes/api');
const requestLogger = require('./middleware/requestLogger');
const { ensureDataDirs } = require('./services/storage');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

app.use(requestLogger);
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', apiRouter);

async function startServer() {
  try {
    await ensureDataDirs();
    app.listen(PORT, () => {
      console.log(`[Server] ✅ Сервер запущен: http://localhost:${PORT}`);
      console.log(`[Server] 📂 Статика: ${path.join(__dirname, '..', 'public')}`);
    });
  } catch (error) {
    console.error('[Server] ❌ Ошибка при запуске сервера:', error.message);
    process.exit(1);
  }
}

startServer();
