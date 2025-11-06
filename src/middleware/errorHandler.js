const path = require('path');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const { buildErrorResponse, ERROR_CODES } = require('../utils/responseBuilder');

const escapeRegExp = (str) => str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const NORMALIZED_ROOTS = Array.from(new Set([
  PROJECT_ROOT,
  PROJECT_ROOT.replace(/\\/g, '/'),
  PROJECT_ROOT.replace(/\\/g, '/').replace(/^\//, ''),
  PROJECT_ROOT.replace(/^\//, '')
])).filter(Boolean);

const sanitizePathString = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  return NORMALIZED_ROOTS.reduce((acc, root) => {
    const normalized = root.replace(/\\/g, '/');
    if (!normalized) {
      return acc;
    }

    const variants = [normalized, normalized.replace(/^\//, ''), normalized.replace(/\//g, path.sep)];

    return variants.reduce((innerAcc, variant) => {
      if (!variant) {
        return innerAcc;
      }

      const pattern = new RegExp(escapeRegExp(variant), 'gi');
      return innerAcc.replace(pattern, '[APP_ROOT]');
    }, acc);
  }, value);
};

const sanitizePaths = (input) => {
  if (!input) {
    return input;
  }

  if (typeof input === 'string') {
    return sanitizePathString(input);
  }

  if (Array.isArray(input)) {
    return input.map(sanitizePaths);
  }

  if (input instanceof Error) {
    return {
      message: sanitizePaths(input.message),
      stack: sanitizePaths(input.stack),
      code: input.code,
      name: input.name,
    };
  }

  if (typeof input === 'object') {
    return Object.entries(input).reduce((acc, [key, value]) => {
      acc[key] = sanitizePaths(value);
      return acc;
    }, {});
  }

  return input;
};

// Sensitive data patterns to mask in logs
const SENSITIVE_PATTERNS = [
  /password[^a-zA-Z0-9]*[:=][^,}\s]*/gi,
  /token[^a-zA-Z0-9]*[:=][^,}\s]*/gi,
  /secret[^a-zA-Z0-9]*[:=][^,}\s]*/gi,
  /key[^a-zA-Z0-9]*[:=][^,}\s]*/gi,
  /authorization[^a-zA-Z0-9]*[:=][^,}\s]*/gi,
  /bearer\s+[a-zA-Z0-9.\-_]+/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, // Credit card patterns
];

// Function to sanitize sensitive data from logs
const sanitizeLogData = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'string') {
      return maskSensitiveString(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeLogData);
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Completely remove sensitive keys
    if (['password', 'token', 'secret', 'key', 'authorization', 'refreshtoken'].includes(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      sanitized[key] = maskSensitiveString(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeLogData(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

// Function to mask sensitive strings
const maskSensitiveString = (str) => {
  let masked = str;
  for (const pattern of SENSITIVE_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      const parts = match.split(/[:=]/);
      if (parts.length > 1) {
        return `${parts[0]}:***`;
      }
      return '***';
    });
  }
  return masked;
};

// Custom format for production (sanitized)
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // Sanitize all metadata
    const sanitizedMeta = sanitizeLogData(meta);
    
    // In production, limit stack traces
    if (sanitizedMeta.stack && process.env.NODE_ENV === 'production') {
      const stackLines = sanitizedMeta.stack.split('\n');
      sanitizedMeta.stack = stackLines.slice(0, 3).join('\n') + '\n... [truncated for security]';
    }
    
    const metaString = Object.keys(sanitizedMeta).length ? JSON.stringify(sanitizedMeta) : '';
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  })
);

// Development format (more verbose but still sanitized)
const developmentFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const sanitizedMeta = sanitizeLogData(meta);
    const metaString = Object.keys(sanitizedMeta).length ? JSON.stringify(sanitizedMeta, null, 2) : '';
    return `${timestamp} [${level}]: ${message}\n${metaString}`;
  })
);

const configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const logger = winston.createLogger({
  level: configuredLevel,
  format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { service: 'ethnos.app' },
  transports: [
    // Error logs com rotação diária
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    }),
    // Logs combinados com rotação
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '7d',
      zippedArchive: true
    }),
    // Logs de performance
    new DailyRotateFile({
      filename: 'logs/performance-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      maxSize: '10m',
      maxFiles: '3d',
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          if (meta.query_time_ms || meta.response_time) {
            return `${timestamp} [${level}] ${message} ${JSON.stringify(meta)}`;
          }
          return null;
        }),
        winston.format.splat()
      )
    })
  ],
});

// Disable console transport when in silent mode
if (process.env.NODE_ENV !== 'production' && configuredLevel !== 'silent') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Global silent mode (no logs, no open handles) for tests
if (configuredLevel === 'silent') {
  try {
    // Remove all transports to avoid file handles in CI/tests
    for (const t of [...logger.transports]) {
      logger.remove(t);
    }
  } catch (_) {}
  logger.silent = true;
}

class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

const handleDatabaseError = (err) => {
  if (err.name === 'SequelizeValidationError') {
    const errors = err.errors.map(e => ({
      field: e.path,
      message: e.message,
      value: e.value
    }));
    return new AppError('Validation failed', 400, ERROR_CODES.VALIDATION);
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return new AppError('Resource already exists', 409, ERROR_CODES.CONFLICT);
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return new AppError('Referenced resource not found', 400, ERROR_CODES.NOT_FOUND);
  }

  if (err.name === 'SequelizeDatabaseError') {
    return new AppError('Database operation failed', 500, ERROR_CODES.INTERNAL);
  }

  return err;
};

const sendErrorDev = (err, res) => {
  const statusCode = err.statusCode || 500;
  const meta = {};

  if (err.details) {
    meta.details = sanitizePaths(err.details);
  }

  if (err.stack) {
    meta.stack = sanitizePathString(err.stack);
  }

  const payload = buildErrorResponse({
    status: err.status || 'error',
    message: sanitizePathString(err.message || 'Unexpected error'),
    code: err.code,
    errors: err.errors ? sanitizePaths(err.errors) : undefined,
    meta
  });

  res.status(statusCode).json(payload);
};

const sendErrorProd = (err, res) => {
  const statusCode = err.statusCode || 500;
  if (err.isOperational) {
    const payload = buildErrorResponse({
      status: err.status || 'error',
      message: sanitizePathString(err.message),
      code: err.code
    });
    res.status(statusCode).json(payload);
  } else {
    logger.error('Programming Error:', err);
    
    const payload = buildErrorResponse({
      status: 'error',
      message: 'Something went wrong!',
      code: ERROR_CODES.INTERNAL
    });
    res.status(500).json(payload);
  }
};

const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  logger.error({
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  let error = { ...err };
  error.message = err.message;

  error = handleDatabaseError(error);

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

const notFoundHandler = (req, res, next) => {
  const err = new AppError(`Can't find ${req.originalUrl} on this server!`, 404, 'NOT_FOUND');
  next(err);
};

const handleError = (res, error) => {
  logger.error('Controller Error:', {
    message: error.message,
    stack: error.stack,
    name: error.name
  });

  if (res && typeof res.fail === 'function') {
    if (error.name === 'ValidationError') {
      return res.fail('Validation failed', {
        statusCode: 400,
        code: ERROR_CODES.VALIDATION,
        meta: { details: sanitizePathString(error.message || 'Validation failed') }
      });
    }

    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_TABLE_ERROR') {
      return res.fail('Database schema issue', {
        statusCode: 500,
        code: ERROR_CODES.INTERNAL,
        meta: { reason: 'Table not found or database schema issue' }
      });
    }

    return res.fail(
      process.env.NODE_ENV === 'development'
        ? sanitizePathString(error.message || 'Unexpected error')
        : 'Something went wrong',
      {
        statusCode: 500,
        code: ERROR_CODES.INTERNAL
      }
    );
  }

  const fallbackPayload = buildErrorResponse({
    status: 'error',
    message: process.env.NODE_ENV === 'development'
      ? sanitizePathString(error.message || 'Unexpected error')
      : 'Something went wrong',
    code: ERROR_CODES.INTERNAL
  });

  return res.status(500).json(fallbackPayload);
};

module.exports = {
  AppError,
  globalErrorHandler,
  catchAsync,
  notFoundHandler,
  logger,
  handleError,
};
