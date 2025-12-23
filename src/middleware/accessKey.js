const { logger } = require('./errorHandler');

const DEFAULT_HEADER_NAMES = ['x-access-key', 'x-internal-key', 'x-api-key'];
const DEFAULT_QUERY_KEYS = ['access_key', 'accessKey', 'api_key'];

const resolveAccessKey = (envVars = []) => {
  for (const envVar of envVars) {
    if (process.env[envVar]) {
      return { value: process.env[envVar], source: envVar };
    }
  }
  return { value: null, source: envVars[0] };
};

const createAccessKeyGuard = (options = {}) => {
  const {
    envVars = ['INTERNAL_ACCESS_KEY'],
    context = 'internal endpoint',
    headerNames = DEFAULT_HEADER_NAMES,
    queryParamNames = DEFAULT_QUERY_KEYS,
  } = options;

  if (!Array.isArray(envVars) || envVars.length === 0) {
    throw new Error('createAccessKeyGuard requires at least one env var name');
  }

  return (req, res, next) => {
    const { value: accessKey, source } = resolveAccessKey(envVars);

    if (!accessKey) {
      logger.error(`${context} access denied: missing configuration (${source})`);
      return res.status(503).json({
        status: 'error',
        message: 'Access key not configured',
        code: 'ACCESS_KEY_MISSING',
        context,
      });
    }

    const providedKey = headerNames.reduce((found, header) => (
      found || req.get(header)
    ), null) || queryParamNames.reduce((found, queryKey) => (
      found || req.query?.[queryKey]
    ), null);

    if (!providedKey || providedKey !== accessKey) {
      logger.warn(`${context} access denied: invalid or missing key`, {
        ip: req.ip,
        path: req.originalUrl,
        method: req.method,
      });

      return res.status(401).json({
        status: 'error',
        message: 'Invalid or missing access key',
        code: 'UNAUTHORIZED',
        context,
      });
    }

    return next();
  };
};

const requireInternalAccessKey = createAccessKeyGuard({
  envVars: [
    'API_KEY',
    'INTERNAL_ACCESS_KEY',
    'SECURITY_ACCESS_KEY',
    'API_ACCESS_KEY',
    'ETHNOS_API_KEY',
    'ETHNOS_API_ACCESS_KEY',
    'API_SECRET_KEY',
  ],
  context: 'internal API',
});

module.exports = {
  createAccessKeyGuard,
  requireInternalAccessKey,
};
