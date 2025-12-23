const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
};

const BOOLEAN_KEY_PATTERNS = [
  /(^is[_A-Z])/i,
  /(^has[_A-Z])/i,
  /(_flag$)/i,
  /(_enabled$)/i,
  /(_available$)/i,
  /(_visible$)/i,
  /(^include[_A-Z])/i,
  /(^allow[_A-Z])/i,
  /(_present$)/i,
  /^open_access$/i,
  /^peer_reviewed$/i,
  /^is_in_doaj$/i,
  /^active$/i,
  /^enabled$/i,
  /^deprecated$/i,
  /^private$/i
];

const BOOLEAN_EXCEPTIONS = new Set([
  'count',
  'total',
  'total_count',
  'works_count',
  'citations_count',
  'publications_count',
  'year',
  'publication_year',
  'start_year',
  'end_year',
  'limit',
  'offset'
]);

const ERROR_CODES = {
  VALIDATION: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMIT: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL_ERROR',
  CONFLICT: 'CONFLICT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TIMEOUT: 'TIMEOUT',
  
  COURSES_LIST_FAILED: 'COURSES_LIST_FAILED',
  COURSE_NOT_FOUND: 'COURSE_NOT_FOUND',
  COURSE_DETAILS_FAILED: 'COURSE_DETAILS_FAILED',
  COURSE_INSTRUCTORS_FAILED: 'COURSE_INSTRUCTORS_FAILED',
  COURSE_BIBLIOGRAPHY_FAILED: 'COURSE_BIBLIOGRAPHY_FAILED',
  COURSE_SUBJECTS_FAILED: 'COURSE_SUBJECTS_FAILED',
  COURSES_STATISTICS_FAILED: 'COURSES_STATISTICS_FAILED',
  
  INSTRUCTORS_LIST_FAILED: 'INSTRUCTORS_LIST_FAILED',
  INSTRUCTOR_NOT_FOUND: 'INSTRUCTOR_NOT_FOUND',
  INSTRUCTOR_DETAILS_FAILED: 'INSTRUCTOR_DETAILS_FAILED',
  INSTRUCTOR_COURSES_FAILED: 'INSTRUCTOR_COURSES_FAILED',
  INSTRUCTOR_SUBJECTS_FAILED: 'INSTRUCTOR_SUBJECTS_FAILED',
  INSTRUCTOR_BIBLIOGRAPHY_FAILED: 'INSTRUCTOR_BIBLIOGRAPHY_FAILED',
  INSTRUCTOR_STATISTICS_FAILED: 'INSTRUCTOR_STATISTICS_FAILED',
  INSTRUCTORS_STATISTICS_FAILED: 'INSTRUCTORS_STATISTICS_FAILED',
  
  METRICS_ANNUAL_FAILED: 'METRICS_ANNUAL_FAILED',
  METRICS_VENUES_FAILED: 'METRICS_VENUES_FAILED',
  METRICS_INSTITUTIONS_FAILED: 'METRICS_INSTITUTIONS_FAILED',
  METRICS_PERSONS_FAILED: 'METRICS_PERSONS_FAILED',
  METRICS_COLLABORATIONS_FAILED: 'METRICS_COLLABORATIONS_FAILED',
  DASHBOARD_SUMMARY_FAILED: 'DASHBOARD_SUMMARY_FAILED',
  
  DASHBOARD_OVERVIEW_FAILED: 'DASHBOARD_OVERVIEW_FAILED',
  DASHBOARD_PERFORMANCE_FAILED: 'DASHBOARD_PERFORMANCE_FAILED',
  DASHBOARD_TRENDS_FAILED: 'DASHBOARD_TRENDS_FAILED',
  DASHBOARD_ALERTS_FAILED: 'DASHBOARD_ALERTS_FAILED'
};

const normalizeBoolean = (key, value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedKey = (key || '').replace(/\[\d+\]/g, '').toLowerCase();
  if (!normalizedKey || BOOLEAN_EXCEPTIONS.has(normalizedKey)) {
    return value;
  }

  const matchesPattern = BOOLEAN_KEY_PATTERNS.some((pattern) => pattern.test(normalizedKey));
  if (!matchesPattern) {
    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 0) {
      return false;
    }
    if (value === 1) {
      return true;
    }
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === '1' || trimmed === 'true') {
      return true;
    }
    if (trimmed === '0' || trimmed === 'false') {
      return false;
    }
  }

  return value;
};

const DATE_KEY_PATTERNS = [
  /(^|_)date$/i,
  /(^|_)datetime$/i,
  /(^|_)timestamp$/i,
  /(^|_)at$/i,
  /^created_at$/i,
  /^updated_at$/i,
  /^last_validated_at$/i,
  /^publication_date$/i
];

const isDateLikeKey = (key) => {
  if (!key) return false;
  const normalizedKey = String(key).replace(/\[\d+\]/g, '');
  return DATE_KEY_PATTERNS.some((re) => re.test(normalizedKey));
};

const normalizeDate = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(trimmed)) {
      return trimmed;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return `${trimmed}T00:00:00.000Z`;
    }

  }

  return value;
};

const normalizeValue = (key, value) => {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeValue(`${key || ''}[${index}]`, item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isPlainObject(value)) {
    const normalized = {};
    for (const [innerKey, innerValue] of Object.entries(value)) {
      normalized[innerKey] = normalizeValue(innerKey, innerValue);
    }
    return normalized;
  }

  if (typeof value === 'string' || value instanceof String) {
    const stringValue = value.toString();
    if (isDateLikeKey(key)) {
      const normalizedDate = normalizeDate(stringValue);
      if (normalizedDate !== stringValue) {
        return normalizedDate;
      }
    }

    const trimmedLower = stringValue.trim().toLowerCase();
    if (trimmedLower === 'null') {
      return null;
    }
    if (trimmedLower === 'undefined') {
      return null;
    }
  }

  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return normalizeBoolean(key, value);
  }

  return value;
};

const normalizeData = (data) => {
  if (data === undefined) {
    return null;
  }

  if (data === null) {
    return null;
  }

  if (Array.isArray(data)) {
    return data.map((item, index) => normalizeValue(String(index), item));
  }

  if (isPlainObject(data)) {
    const normalized = {};
    for (const [key, value] of Object.entries(data)) {
      normalized[key] = normalizeValue(key, value);
    }
    return normalized;
  }

  return normalizeValue(null, data);
};

const sanitizePagination = (pagination) => {
  if (!pagination || typeof pagination !== 'object') {
    return {
      sanitized: undefined,
      extras: {}
    };
  }

  const rawPage = pagination.page ?? pagination.currentPage;
  const rawLimit = pagination.limit ?? pagination.pageSize ?? pagination.perPage;
  const rawTotal = pagination.total ?? pagination.totalItems ?? pagination.count ?? pagination.total_count ?? 0;
  const computedLimit = Math.max(1, parseInt(rawLimit, 10) || 10);
  let page = parseInt(rawPage, 10);
  if (!page && pagination.offset !== undefined) {
    const inferred = Math.floor((parseInt(pagination.offset, 10) || 0) / computedLimit) + 1;
    page = inferred;
  }
  page = Math.max(1, page || 1);
  const limit = Math.max(1, parseInt(rawLimit, 10) || 10);
  const total = Math.max(0, parseInt(rawTotal, 10) || 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  const rawHasNext = pagination.hasNext ?? pagination.has_next ?? pagination.has_more;
  const rawHasPrev = pagination.hasPrev ?? pagination.has_prev ?? pagination.has_previous ?? pagination.previous;

  const hasNext = typeof rawHasNext === 'boolean'
    ? rawHasNext
    : totalPages > 0 ? page < totalPages : false;

  const hasPrev = typeof rawHasPrev === 'boolean'
    ? rawHasPrev
    : totalPages > 0 ? page > 1 : false;

  const sanitized = {
    page,
    limit,
    total,
    totalPages,
    hasNext,
    hasPrev
  };

  const extras = {};
  if (pagination.offset !== undefined) {
    extras.offset = Number(pagination.offset) || 0;
  }
  if (pagination.cursor !== undefined) {
    extras.cursor = pagination.cursor;
  }
  if (pagination.pages !== undefined && pagination.pages !== totalPages) {
    extras.pages = pagination.pages;
  }
  if (pagination.total_pages !== undefined && pagination.total_pages !== totalPages) {
    extras.total_pages_raw = pagination.total_pages;
  }
  if (pagination.remaining !== undefined) {
    extras.remaining = pagination.remaining;
  }
  if (pagination.returned !== undefined) {
    extras.returned = pagination.returned;
  }

  return {
    sanitized,
    extras
  };
};

const buildSuccessResponse = ({ status = 'success', data = null, pagination, meta } = {}) => {
  const normalizedData = normalizeData(data);
  const response = {
    status,
    data: normalizedData,
  };

  let normalizedMeta = normalizeData(meta);

  if (pagination) {
    const { sanitized, extras } = sanitizePagination(pagination);
    if (sanitized) {
      response.pagination = sanitized;
    }
    if (extras && Object.keys(extras).length > 0) {
      normalizedMeta = {
        ...(normalizedMeta || {}),
        pagination_extras: normalizeData(extras)
      };
    }
  }

  if (normalizedMeta && Object.keys(normalizedMeta).length > 0) {
    response.meta = normalizedMeta;
  }

  return response;
};

const buildErrorResponse = ({ status = 'error', message = 'Unexpected error', code, errors, meta } = {}) => {
  const response = {
    status,
    message,
    timestamp: new Date().toISOString()
  };

  if (code) {
    response.code = code;
  }

  if (errors) {
    response.errors = normalizeData(errors);
  }

  const normalizedMeta = normalizeData(meta);
  if (normalizedMeta && Object.keys(normalizedMeta).length > 0) {
    response.meta = normalizedMeta;
  }

  return response;
};

module.exports = {
  buildSuccessResponse,
  buildErrorResponse,
  normalizeData,
  sanitizePagination,
  ERROR_CODES
};
