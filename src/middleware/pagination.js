

const { normalizePagination } = require('../utils/pagination');
const { ERROR_CODES } = require('../utils/responseBuilder');


function paginationMiddleware(req, res, next) {
  try {
    const normalized = normalizePagination(req.query);
    
    req.pagination = normalized;
    
    req.query.page = normalized.page;
    req.query.limit = normalized.limit;
    req.query.offset = normalized.offset;
    
    next();
  } catch (error) {
    res.fail('Invalid pagination parameters', {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION,
      meta: { details: error.message }
    });
  }
}

module.exports = {
  paginationMiddleware
};
