const { buildSuccessResponse, buildErrorResponse, ERROR_CODES, normalizeData } = require('../utils/responseBuilder');
const { logger } = require('./errorHandler');

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const mergeMeta = (baseMeta, extraMeta) => {
  if (!baseMeta && !extraMeta) {
    return undefined;
  }

  const normalizedBase = normalizeData(baseMeta) || {};
  const normalizedExtra = normalizeData(extraMeta) || {};

  return {
    ...normalizedBase,
    ...normalizedExtra
  };
};

const responseFormatter = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.success = (data = null, options = {}) => {
    const {
      statusCode = 200,
      pagination,
      meta,
      status = 'success',
    } = options;

    const payload = buildSuccessResponse({
      status,
      data,
      pagination,
      meta: mergeMeta(
        meta,
        {
          request: {
            method: req.method,
            path: req.originalUrl
          }
        }
      )
    });

    res.status(statusCode);
    return originalJson(payload);
  };

  res.fail = (message, options = {}) => {
    const {
      statusCode = 400,
      code,
      errors,
      meta,
      status
    } = options;

    const normalizedStatus = status || 'error';
    const payload = buildErrorResponse({
      status: normalizedStatus,
      message,
      code,
      errors,
      meta: mergeMeta(meta, {
        request: {
          method: req.method,
          path: req.originalUrl
        }
      })
    });

    if (statusCode >= 500) {
      logger.error('Request failed', {
        statusCode,
        code,
        message,
        errors,
        path: req.originalUrl
      });
    } else {
      logger.warn('Request failed', {
        statusCode,
        code,
        message,
        errors,
        path: req.originalUrl
      });
    }

    res.status(statusCode);
    return originalJson(payload);
  };

  res.error = (err, options = {}) => {
    if (!err) {
      return res.fail('Unexpected error', {
        statusCode: 500,
        code: ERROR_CODES.INTERNAL,
        meta: options.meta
      });
    }

    const statusCode = err.statusCode || err.status || options.statusCode || 500;
    const code = err.code || options.code || (statusCode === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.INTERNAL);
    const message = err.message || options.message || 'Unexpected error';
    const errors = err.errors || options.errors;

    return res.fail(message, {
      statusCode,
      code,
      errors,
      status: 'error',
      meta: mergeMeta(options.meta, err.meta)
    });
  };

  res.json = (body) => {
    const statusCode = res.statusCode || 200;

    // Allow explicit opt-out for custom handlers
    if (body && body.__skipEnvelope) {
      return originalJson(body.payload);
    }

    // Handle primitives and arrays by wrapping into success envelope
    if (body === null || typeof body !== 'object') {
      if (statusCode >= 400) {
        return res.fail(String(body || 'Request failed'), {
          statusCode,
          code: statusCode === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.INTERNAL
        });
      }
      return res.success(body, { statusCode });
    }

    // Already standardized payload
    if (body.status && (body.status === 'success' || body.status === 'error' || body.status === 'fail')) {
      if (body.status === 'success') {
        const { data, pagination, meta, ...rest } = body;
        const extraMeta = Object.keys(rest || {}).length ? rest : undefined;
        const payload = buildSuccessResponse({
          status: body.status,
          data,
          pagination,
          meta: mergeMeta(meta, extraMeta)
        });
        res.status(statusCode);
        return originalJson(payload);
      }

      const defaultCode = body.code || (
        statusCode === 404 ? ERROR_CODES.NOT_FOUND :
        statusCode === 400 ? ERROR_CODES.VALIDATION :
        statusCode === 429 ? ERROR_CODES.RATE_LIMIT :
        ERROR_CODES.INTERNAL
      );

      const errorPayload = buildErrorResponse({
        status: 'error',
        message: body.message || body.error || 'Request failed',
        code: defaultCode,
        errors: body.errors,
        meta: body.meta
      });
      res.status(statusCode >= 400 ? statusCode : 400);
      return originalJson(errorPayload);
    }

    if (statusCode >= 400) {
      const defaultCode = body.code || (
        statusCode === 404 ? ERROR_CODES.NOT_FOUND :
        statusCode === 400 ? ERROR_CODES.VALIDATION :
        statusCode === 429 ? ERROR_CODES.RATE_LIMIT :
        ERROR_CODES.INTERNAL
      );

      const errorPayload = buildErrorResponse({
        status: 'error',
        message: body.message || body.error || 'Request failed',
        code: defaultCode,
        errors: body.errors,
        meta: body.meta
      });
      res.status(statusCode);
      return originalJson(errorPayload);
    }

    if (isObject(body)) {
      const hasDataProp = Object.prototype.hasOwnProperty.call(body, 'data');
      const pagination = body.pagination;
      const metaFromBody = body.meta;
      const restKeys = Object.keys(body).filter((key) => !['data', 'pagination', 'meta'].includes(key));
      const rest = restKeys.reduce((acc, key) => {
        acc[key] = body[key];
        return acc;
      }, {});

      let payloadData;
      let extraMeta;

      if (hasDataProp) {
        payloadData = body.data;
        extraMeta = Object.keys(rest).length ? rest : undefined;
      } else if (pagination && restKeys.length) {
        const arrayCandidates = restKeys.filter((key) => Array.isArray(body[key]));
        if (arrayCandidates.length === 1) {
          const collectionKey = arrayCandidates[0];
          payloadData = body[collectionKey];
          const metaExtras = { collection_key: collectionKey };
          restKeys.forEach((key) => {
            if (key === collectionKey) {
              return;
            }
            metaExtras[key] = body[key];
          });
          extraMeta = Object.keys(metaExtras).length ? metaExtras : undefined;
        } else {
          payloadData = body;
          extraMeta = undefined;
        }
      } else {
        payloadData = body;
        extraMeta = undefined;
      }

      const payload = buildSuccessResponse({
        status: 'success',
        data: payloadData,
        pagination,
        meta: mergeMeta(metaFromBody, extraMeta)
      });
      res.status(statusCode);
      return originalJson(payload);
    }

    const payload = buildSuccessResponse({
      status: 'success',
      data: body
    });
    res.status(statusCode);
    return originalJson(payload);
  };

  next();
};

module.exports = {
  responseFormatter
};
