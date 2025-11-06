const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');
const { logger } = require('./errorHandler');

// XSS sanitization middleware
const xssSanitizer = (req, res, next) => {
  const sanitizeObject = (obj) => {
    if (typeof obj === 'string') {
      return xss(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  };

  // Track if any sanitization occurred
  let sanitized = false;
  const originalBody = JSON.stringify(req.body);
  const originalQuery = JSON.stringify(req.query);

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
    if (JSON.stringify(req.body) !== originalBody) {
      sanitized = true;
    }
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
    if (JSON.stringify(req.query) !== originalQuery) {
      sanitized = true;
    }
  }

  // Log potential XSS attempts
  if (sanitized) {
    logger.warn('XSS attempt detected and sanitized', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  }

  next();
};

// Combined sanitization middleware
const sanitizationMiddleware = [
  // MongoDB injection protection
  mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
      logger.warn('MongoDB injection attempt detected', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        sanitizedKey: key,
        timestamp: new Date().toISOString()
      });
    }
  }),
  
  // XSS protection
  xssSanitizer
];

module.exports = {
  sanitizationMiddleware,
  xssSanitizer
};