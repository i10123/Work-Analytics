const helmet = require('helmet');
const cors = require('cors');
const csurf = require('csurf');

module.exports = function securityMiddleware(app) {
  // Helmet adds various HTTP headers for security
  app.use(helmet());

  // CORS – allow only trusted origin (adjust as needed)
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*', // change to specific origin in production
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  }));

  // CSRF protection – requires cookie-parser (assume it's installed)
  // Skip CSRF for API routes that are stateless (e.g., JSON APIs) if desired
  // Here we apply globally; adjust as needed.
  app.use(csurf({ cookie: true }));

  // Error handler for CSRF token errors
  app.use((err, req, res, next) => {
    if (err.code !== 'EBADCSRFTOKEN') return next(err);
    res.status(403).json({ success: false, error: 'Invalid CSRF token' });
  });
};
