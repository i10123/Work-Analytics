const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');

// Define transport for daily rotation
const transport = new winston.transports.DailyRotateFile({
  filename: path.join(__dirname, '..', '..', 'data', 'server-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] [${level.toUpperCase()}] ${message}`)
  ),
  transports: [transport, new winston.transports.Console()],
});

// Export both logger instance and a simple request logging middleware
function requestLogger(req, res, next) {
  const { method, url, ip } = req;
  logger.info(`${ip} ${method} ${url}`);
  next();
}

module.exports = { logger, requestLogger };
