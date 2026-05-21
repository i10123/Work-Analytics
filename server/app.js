require('dotenv').config();
const express = require('express');
process.on('uncaughtException', (err) => console.error('[Fatal] Непойманная ошибка:', err));
process.on('unhandledRejection', (err) => console.error('[Fatal] Необработанный промис:', err));
const path = require('path');
const apiRouter = require('./routes/api');
const { requestLogger } = require('./middleware/logger');
const security = require('./middleware/security');
const logger = require('./middleware/logger');
const notFoundHandler = require('./middleware/notFoundHandler');
const { ensureDataDirs } = require('./services/storage');
const fs = require('fs');

const logStream = fs.createWriteStream(path.join(__dirname, '..', 'data', 'server.log'), { flags: 'a' });

function formatLogMessage(level, args) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  let msg = require('util').format(...args);
  msg = msg.replace(/\x1b\[[0-9;]*m/g, ''); // Удаляем ANSI-коды для чистого лога
  return `[${timestamp}] [${level}] ${msg}\n`;
}

// Logging is now handled by Winston (see middleware/logger.js)
// Console overrides removed.

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', false);

app.use(requestLogger);
security(app);
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', apiRouter);
app.use(notFoundHandler);

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

// Graceful shutdown handlers
function shutdown(signal) {
  logger.info(`[Server] ⚡ Received ${signal}. Shutting down...`);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
