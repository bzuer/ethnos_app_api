/**
 * Pagination middleware for consistent parameter handling across all endpoints
 */

const { normalizePagination } = require('../utils/pagination');
const { ERROR_CODES } = require('../utils/responseBuilder');

/**
 * Middleware to normalize pagination parameters in request query
 * Converts offset/limit to page/limit for consistency
 * Adds normalized pagination to req.pagination
 */
function paginationMiddleware(req, res, next) {
  try {
    const normalized = normalizePagination(req.query);
    
    // Add normalized pagination to request object
    req.pagination = normalized;
    
    // Also update query params for backward compatibility
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
