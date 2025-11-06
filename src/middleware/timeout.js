// Simple request timeout middleware without extra dependencies
// Usage: app.use(requestTimeout({ timeoutMs: 5000 }))

function requestTimeout(opts = {}) {
  const timeoutMs = parseInt(process.env.REQUEST_TIMEOUT_MS || opts.timeoutMs || 5000);

  return function (req, res, next) {
    if (timeoutMs <= 0) return next();

    let timedOut = false;
    const timer = setTimeout(() => {
      if (res.headersSent) return;
      timedOut = true;
      req.timedout = true;
      try {
        res.status(503).json({
          status: 'error',
          code: 'REQUEST_TIMEOUT',
          message: `Request timed out after ${timeoutMs}ms`,
          timestamp: new Date().toISOString(),
        });
      } catch (_) {
        // ignore
      }
    }, timeoutMs);

    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);

    // Prevent handlers from sending a second response after timeout
    const originalJson = res.json.bind(res);
    res.json = function (...args) {
      if (timedOut) return; // drop late responses
      return originalJson(...args);
    };

    next();
  };
}

module.exports = { requestTimeout };

