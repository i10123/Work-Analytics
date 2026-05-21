module.exports = function notFoundHandler(req, res, next) {
  // If response already sent, skip
  if (res.headersSent) return next();
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    // Serve a simple HTML 404 page (could be a static file later)
    res.status(404).send('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 – Страница не найдена</h1></body></html>');
  } else {
    // JSON response for API clients – no redirect
    res.status(404).json({ success: false, error: 'Ресурс не найден' });
  }
};
