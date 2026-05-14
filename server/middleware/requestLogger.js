function requestLogger(req, res, next) {
  const start = process.hrtime();
  const { method, originalUrl, ip } = req;

  const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    gray: '\x1b[90m'
  };

  res.on('finish', () => {
    const duration = process.hrtime(start);
    const durationMs = (duration[0] * 1000 + duration[1] / 1e6).toFixed(1);
    const statusCode = res.statusCode;

    let statusColor = colors.green;
    if (statusCode >= 500) {
      statusColor = colors.red;
    } else if (statusCode >= 400) {
      statusColor = colors.yellow;
    } else if (statusCode >= 300) {
      statusColor = colors.cyan;
    }

    let methodColor = colors.cyan;
    if (method === 'POST') {
      methodColor = colors.magenta;
    } else if (method === 'DELETE') {
      methodColor = colors.red;
    } else if (method === 'PUT' || method === 'PATCH') {
      methodColor = colors.yellow;
    }

    const timestamp = new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const logMsg = [
      `${colors.gray}[${timestamp}]${colors.reset}`,
      `${colors.bold}[HTTP]${colors.reset}`,
      `${methodColor}${method.padEnd(6)}${colors.reset}`,
      `${colors.bold}${originalUrl}${colors.reset}`,
      `—`,
      `${statusColor}${statusCode} ${res.statusMessage || ''}${colors.reset}`,
      `${colors.gray}(${durationMs} ms)${colors.reset}`,
      `${colors.gray}[IP: ${ip}]${colors.reset}`
    ].join(' ');

    console.log(logMsg);
  });

  next();
}

module.exports = requestLogger;