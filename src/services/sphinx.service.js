const mysql = require('mysql2');
const { logger } = require('../middleware/errorHandler');

class SphinxService {
    constructor() {
        this.connection = null;
        this.isConnected = false;
        this.connectTimeoutMs = parseInt(process.env.SPHINX_CONNECT_TIMEOUT_MS || '750', 10);
        this.queryTimeoutMs = parseInt(process.env.SPHINX_QUERY_TIMEOUT_MS || '1500', 10);
        this.retryBackoffMs = parseInt(process.env.SPHINX_RETRY_BACKOFF_MS || '30000', 10);
        this.disabledUntil = 0;
        this.enabled = String(process.env.SPHINX_ENABLED || 'true').toLowerCase() !== 'false';
        this.connectionConfig = {
            host: process.env.SPHINX_HOST || 'localhost',
            port: parseInt(process.env.SPHINX_PORT || '9306', 10),
            user: process.env.SPHINX_USER || '',
            password: process.env.SPHINX_PASSWORD || '',
            multipleStatements: false,
            connectTimeout: this.connectTimeoutMs,
            enableKeepAlive: true
        };
    }

    /**
     * Search work IDs only using Sphinx (for hydration via MariaDB)
     */
    async searchWorkIds(query, filters = {}, options = {}) {
        await this.ensureConnection();

        const trimmedQuery = (query || '').trim();
        const hasSearchTerm = trimmedQuery.length > 0 && trimmedQuery !== '*';
        const limit = this._sanitizeLimit(options.limit ?? filters.limit);
        const offset = this._sanitizeOffset(options.offset ?? filters.offset);
        const MAX_SPHINX_MATCHES = 10000;
        const DEFAULT_MAX_MATCHES = 1000;
        const maxMatches = Math.min(
            MAX_SPHINX_MATCHES,
            Math.max(DEFAULT_MAX_MATCHES, offset + limit)
        );

        try {
            let sql = hasSearchTerm
                ? `SELECT id, WEIGHT() as weight, year
                   FROM works_poc
                   WHERE MATCH(${this._formatMatchExpression(trimmedQuery)})`
                : `SELECT id, 1 as weight, year
                   FROM works_poc
                   WHERE id > 0`;

            const params = [];

            if (filters.year) {
                sql += ' AND year = ?';
                params.push(parseInt(filters.year, 10));
            }

            if (filters.work_type) {
                sql += ' AND work_type = ?';
                params.push(filters.work_type);
            }

            if (filters.language && filters.language !== 'unknown') {
                sql += ' AND language = ?';
                params.push(filters.language);
            }

            if (filters.peer_reviewed !== undefined) {
                sql += ' AND peer_reviewed = ?';
                params.push(filters.peer_reviewed ? 1 : 0);
            }

            if (filters.year_from) {
                sql += ' AND year >= ?';
                params.push(parseInt(filters.year_from, 10));
            }

            if (filters.year_to) {
                sql += ' AND year <= ?';
                params.push(parseInt(filters.year_to, 10));
            }

            if (filters.venue_name) {
                sql += ' AND venue_name LIKE ?';
                params.push(`%${filters.venue_name}%`);
            }

            sql += ` ORDER BY weight DESC, year DESC, id DESC LIMIT ?, ? OPTION max_matches=${maxMatches}`;
            params.push(offset, limit);

            const startTime = Date.now();

            return new Promise((resolve, reject) => {
                const qopts = { sql, timeout: this.queryTimeoutMs };
                this.connection.query(qopts, params, (error, results = []) => {
                    const queryTime = Date.now() - startTime;
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }

                    this.connection.query('SHOW META', (metaError, metaRows = []) => {
                        if (metaError) {
                            this._handleQueryError(metaError);
                            // Still return IDs even if SHOW META fails
                            resolve({
                                ids: results.map(r => r.id),
                                total: results.length,
                                query_time: queryTime,
                                meta: {}
                            });
                            return;
                        }

                        const meta = {};
                        metaRows.forEach(row => {
                            const key = row.Variable_name || row.Var_name;
                            meta[key] = row.Value;
                        });

                        resolve({
                            ids: results.map(r => r.id),
                            total: parseInt(meta.total_found || meta.total || results.length, 10),
                            query_time: queryTime,
                            meta
                        });
                    });
                });
            });
        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('Sphinx work ID search failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }

    /**
     * Search organization IDs only using Sphinx (for hydration via MariaDB)
     */
    async searchOrganizationIds(searchTerm, options = {}) {
        await this.ensureConnection();

        const { limit = 20, offset = 0, country_code, type } = options;
        const sanitizedLimit = this._sanitizeLimit(limit, 20, 100);
        const sanitizedOffset = this._sanitizeOffset(offset);
        const matchExpression = this.formatMatchQuery(searchTerm || '');

        const filters = [];
        if (country_code) filters.push(`country_code = ${this.connection.escape(country_code)}`);
        if (type) filters.push(`type = ${this.connection.escape(type)}`);

        const whereClause = [`MATCH(${matchExpression})`, ...filters].join(' AND ');

        const sql = `
            SELECT id, WEIGHT() as weight
            FROM organizations_poc
            WHERE ${whereClause}
            ORDER BY weight DESC, id ASC
            LIMIT ?, ?
        `;

        const startTime = Date.now();
        return new Promise((resolve, reject) => {
            this.connection.query({ sql, timeout: this.queryTimeoutMs }, [sanitizedOffset, sanitizedLimit], (error, rows = []) => {
                const queryTime = Date.now() - startTime;
                if (error) {
                    this._handleQueryError(error);
                    reject(error);
                    return;
                }
                this.connection.query('SHOW META', (metaError, metaRows = []) => {
                    if (metaError) {
                        this._handleQueryError(metaError);
                        resolve({ ids: rows.map(r => r.id), total: rows.length, query_time: queryTime, meta: {} });
                        return;
                    }
                    const meta = {};
                    metaRows.forEach(row => {
                        const key = row.Variable_name || row.Var_name;
                        meta[key] = row.Value;
                    });
                    resolve({
                        ids: rows.map(r => r.id),
                        total: parseInt(meta.total_found || meta.total || rows.length, 10),
                        query_time: queryTime,
                        meta
                    });
                });
            });
        });
    }

    /**
     * Search person IDs only using Sphinx (for hydration via MariaDB)
     */
    async searchPersonIds(searchTerm, options = {}) {
        await this.ensureConnection();

        const { limit = 20, offset = 0, verified } = options;
        const sanitizedLimit = this._sanitizeLimit(limit, 20, 100);
        const sanitizedOffset = this._sanitizeOffset(offset);
        const safeTerm = (searchTerm || '').replace(/'/g, "\\'");

        let whereClause = `WHERE MATCH('${safeTerm}')`;
        if (verified !== undefined) {
            whereClause += ` AND is_verified = ${verified === 'true' || verified === true ? 1 : 0}`;
        }

        const sql = `
            SELECT id, WEIGHT() as weight
            FROM persons_poc
            ${whereClause}
            ORDER BY weight DESC, id ASC
            LIMIT ${parseInt(sanitizedOffset)}, ${parseInt(sanitizedLimit)}
        `;

        const startTime = Date.now();
        return new Promise((resolve, reject) => {
            this.connection.query({ sql, timeout: this.queryTimeoutMs }, (error, rows = []) => {
                const queryTime = Date.now() - startTime;
                if (error) {
                    this._handleQueryError(error);
                    reject(error);
                    return;
                }
                const countSql = `SELECT COUNT(*) as total FROM persons_poc ${whereClause}`;
                this.connection.query({ sql: countSql, timeout: this.queryTimeoutMs }, (countError, countRows = []) => {
                    if (countError) {
                        this._handleQueryError(countError);
                        resolve({ ids: rows.map(r => r.id), total: rows.length, query_time: queryTime, meta: {} });
                        return;
                    }
                    resolve({ ids: rows.map(r => r.id), total: parseInt(countRows[0]?.total || rows.length, 10), query_time: queryTime });
                });
            });
        });
    }

    /**
     * Search signature IDs only using Sphinx (for hydration via MariaDB)
     */
    async searchSignatureIds(searchTerm, options = {}) {
        await this.ensureConnection();

        const { limit = 20, offset = 0 } = options;
        const sanitizedLimit = this._sanitizeLimit(limit, 20, 100);
        const sanitizedOffset = this._sanitizeOffset(offset);
        const matchExpression = this.formatMatchQuery(searchTerm || '');

        const sql = `
            SELECT id, WEIGHT() as weight, is_verified
            FROM signatures_poc
            WHERE MATCH(${matchExpression})
            ORDER BY is_verified DESC, weight DESC, id ASC
            LIMIT ?, ?
        `;

        const startTime = Date.now();
        return new Promise((resolve, reject) => {
            this.connection.query({ sql, timeout: this.queryTimeoutMs }, [sanitizedOffset, sanitizedLimit], (error, rows = []) => {
                const queryTime = Date.now() - startTime;
                if (error) {
                    this._handleQueryError(error);
                    reject(error);
                    return;
                }
                this.connection.query('SHOW META', (metaError, metaRows = []) => {
                    if (metaError) {
                        this._handleQueryError(metaError);
                        resolve({ ids: rows.map(r => r.id), total: rows.length, query_time: queryTime, meta: {} });
                        return;
                    }
                    const meta = {};
                    metaRows.forEach(row => {
                        const key = row.Variable_name || row.Var_name;
                        meta[key] = row.Value;
                    });
                    resolve({
                        ids: rows.map(r => r.id),
                        total: parseInt(meta.total_found || meta.total || rows.length, 10),
                        query_time: queryTime,
                        meta
                    });
                });
            });
        });
    }

    _ensureEnabled() {
        if (!this.enabled) {
            const error = new Error('Sphinx disabled by configuration');
            error.code = 'SPHINX_UNAVAILABLE';
            throw error;
        }
    }

    _isTemporarilyDisabled() {
        return Date.now() < this.disabledUntil;
    }

    _markUnavailable(error) {
        this.isConnected = false;

        if (this.connection) {
            try {
                this.connection.destroy();
            } catch (destroyError) {
                if (logger.debug) {
                    logger.debug('Sphinx connection destroy failed', { message: destroyError.message });
                }
            }
            this.connection = null;
        }

        this.disabledUntil = Date.now() + this.retryBackoffMs;

        if (error && error.code !== 'SPHINX_UNAVAILABLE') {
            logger.warn('Sphinx temporarily disabled', {
                message: error.message,
                code: error.code,
                retry_in_ms: this.retryBackoffMs
            });
        }
    }

    _handleQueryError(error) {
        if (!error) {
            return;
        }

        if (error.fatal || ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST'].includes(error.code)) {
            this._markUnavailable(error);
        }
    }

    /**
     * Initialize connection to Sphinx Search via SphinxQL
     */
    async connect() {
        // Fast-fail when disabled (e.g., in tests)
        this._ensureEnabled();
        if (this._isTemporarilyDisabled()) {
            const retryInMs = this.disabledUntil - Date.now();
            const error = new Error('Sphinx temporarily unavailable');
            error.code = 'SPHINX_UNAVAILABLE';
            error.retry_in_ms = Math.max(0, retryInMs);
            throw error;
        }

        try {
            if (this.connection) {
                try {
                    this.connection.destroy();
                } catch (destroyError) {
                    if (logger.debug) {
                        logger.debug('Sphinx connection destroy before reconnect failed', { message: destroyError.message });
                    }
                }
                this.connection = null;
            }

            this.connection = mysql.createConnection(this.connectionConfig);

            this.connection.on('error', (connError) => {
                logger.error('Sphinx connection error', {
                    message: connError.message,
                    code: connError.code
                });
                this._handleQueryError(connError);
            });

            this.connection.on('end', () => {
                this._markUnavailable(new Error('Sphinx connection ended'));
            });

            return new Promise((resolve, reject) => {
                this.connection.connect((error) => {
                    if (error) {
                        this._markUnavailable(error);
                        logger.error('Failed to connect to Sphinx', {
                            message: error.message,
                            code: error.code
                        });
                        reject(error);
                        return;
                    }

                    this.connection.query('SHOW TABLES', (validationError, results = []) => {
                        if (validationError) {
                            this._handleQueryError(validationError);
                            logger.error('Sphinx connection test failed', {
                                message: validationError.message,
                                code: validationError.code
                            });
                            reject(validationError);
                            return;
                        }

                        this.isConnected = true;
                        this.disabledUntil = 0;

                        logger.info('Sphinx connection established', {
                            indexes: results.length,
                            tables: results.map(r => r.Index || r.Table).filter(Boolean)
                        });
                        resolve(true);
                    });
                });
            });
        } catch (error) {
            this._handleQueryError(error);
            throw error;
        }
    }

    /**
     * Ensure connection is active
     */
    async ensureConnection() {
        // Fast-fail when disabled (e.g., in tests)
        if (!this.enabled) {
            const error = new Error('Sphinx disabled by configuration');
            error.code = 'SPHINX_UNAVAILABLE';
            throw error;
        }
        if (this._isTemporarilyDisabled()) {
            const error = new Error('Sphinx temporarily unavailable');
            error.code = 'SPHINX_UNAVAILABLE';
            error.retry_in_ms = Math.max(0, this.disabledUntil - Date.now());
            throw error;
        }

        if (!this.isConnected || !this.connection) {
            await this.connect();
        }
    }

    _sanitizeLimit(value, defaultValue = 50, maxValue = 100) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed <= 0) {
            return defaultValue;
        }
        return Math.min(parsed, maxValue);
    }

    _sanitizeOffset(value) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed < 0) {
            return 0;
        }
        return parsed;
    }

    _sanitizeOrderClause(requested, allowed, fallbackKey) {
        if (!requested || typeof requested !== 'string') {
            return allowed[fallbackKey];
        }

        const normalized = requested.toLowerCase();
        return allowed[normalized] || allowed[fallbackKey];
    }

    _escapeMatchTerm(term) {
        if (typeof term !== 'string') {
            return '';
        }

        return term
            .replace(/\\/g, '\\')
            .replace(/([()|\-!@~&\/?^$=])/g, '\\$1')
            .trim();
    }

    _formatMatchExpression(term) {
        const sanitized = this._escapeMatchTerm(term);
        return this.connection.escape(sanitized);
    }

    formatMatchQuery(term) {
        return this._formatMatchExpression(term);
    }

    _workOrderClause(orderBy) {
        const allowed = {
            default: 'relevance DESC, year DESC, id DESC',
            year_desc: 'year DESC, id DESC',
            year_asc: 'year ASC, id ASC',
            created_desc: 'created_ts DESC, id DESC',
            created_asc: 'created_ts ASC, id ASC'
        };

        return this._sanitizeOrderClause(orderBy, allowed, 'default');
    }

    _venueOrderClause(sortBy, sortOrder) {
        const fieldMap = {
            name: 'name',
            type: 'type',
            impact_factor: 'impact_factor',
            works_count: 'works_count'
        };

        const normalizedSort = typeof sortBy === 'string' ? sortBy.toLowerCase() : 'works_count';
        const field = fieldMap[normalizedSort] || fieldMap.works_count;
        const direction = typeof sortOrder === 'string' && sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        return `${field} ${direction}, id ASC`;
    }

    /**
     * Search works using Sphinx with bibliographic field weighting
     * @param {string} query - Search query
     * @param {object} filters - Filters for year, work_type, language, etc.
     * @param {object} options - Pagination and sorting options
     * @returns {Promise<object>} Search results with relevance scores
     */
    async searchWorks(query, filters = {}, options = {}) {
        await this.ensureConnection();

        const trimmedQuery = (query || '').trim();
        const hasSearchTerm = trimmedQuery.length > 0 && trimmedQuery !== '*';
        const limit = this._sanitizeLimit(options.limit ?? filters.limit);
        const offset = this._sanitizeOffset(options.offset ?? filters.offset);
        const MAX_SPHINX_MATCHES = 10000;
        const DEFAULT_MAX_MATCHES = 1000;
        const maxMatches = Math.min(
            MAX_SPHINX_MATCHES,
            Math.max(DEFAULT_MAX_MATCHES, offset + limit)
        );

        try {
            let sql = hasSearchTerm
                ? `SELECT *, WEIGHT() as relevance,
                           year,
                           work_type,
                           language,
                           peer_reviewed
                   FROM works_poc 
                   WHERE MATCH(${this._formatMatchExpression(trimmedQuery)})`
                : `SELECT *, 1 as relevance,
                           year,
                           work_type,
                           language,
                           peer_reviewed
                   FROM works_poc 
                   WHERE id > 0`;

            const params = [];

            if (filters.year) {
                sql += ' AND year = ?';
                params.push(parseInt(filters.year, 10));
            }

            if (filters.work_type) {
                sql += ' AND work_type = ?';
                params.push(filters.work_type);
            }

            if (filters.language && filters.language !== 'unknown') {
                sql += ' AND language = ?';
                params.push(filters.language);
            }

            if (filters.peer_reviewed !== undefined) {
                sql += ' AND peer_reviewed = ?';
                params.push(filters.peer_reviewed ? 1 : 0);
            }

            if (filters.year_from) {
                sql += ' AND year >= ?';
                params.push(parseInt(filters.year_from, 10));
            }

            if (filters.year_to) {
                sql += ' AND year <= ?';
                params.push(parseInt(filters.year_to, 10));
            }

            if (filters.venue_name) {
                sql += ' AND venue_name LIKE ?';
                params.push(`%${filters.venue_name}%`);
            }

            const orderClause = this._workOrderClause(options.orderBy);
            sql += ` ORDER BY ${orderClause} LIMIT ?, ? OPTION max_matches=${maxMatches}`;
            params.push(offset, limit);

            const startTime = Date.now();

            return new Promise((resolve, reject) => {
                const qopts = { sql, timeout: this.queryTimeoutMs };
                this.connection.query(qopts, params, (error, results = []) => {
                    const queryTime = Date.now() - startTime;

                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }

                    this.connection.query('SHOW META', (metaError, metaRows = []) => {
                        if (metaError) {
                            this._handleQueryError(metaError);
                            reject(metaError);
                            return;
                        }

                        const meta = {};
                        metaRows.forEach(row => {
                            const key = row.Variable_name || row.Var_name;
                            meta[key] = row.Value;
                        });

                        const totalFound = parseInt(meta.total_found || meta.total, 10);
                        const totalReturned = results.length;

                        logger.info('Sphinx search completed', {
                            query,
                            results: totalReturned,
                            totalFound: Number.isNaN(totalFound) ? totalReturned : totalFound,
                            queryTime: `${queryTime}ms`,
                            filters: Object.keys(filters).length
                        });

                        const formattedResults = results.map(row => ({
                            id: row.id,
                            title: row.title,
                            subtitle: row.subtitle,
                            abstract: row.abstract,
                            author_string: row.author_string,
                            venue_name: row.venue_name,
                            doi: row.doi,
                            year: row.year,
                            work_type: row.work_type,
                            language: row.language,
                            peer_reviewed: Boolean(row.peer_reviewed),
                            relevance_score: row.relevance || row.weight,
                            created_ts: row.created_ts
                        }));

                        resolve({
                            results: formattedResults,
                            total: Number.isNaN(totalFound) ? totalReturned : totalFound,
                            returned: totalReturned,
                            query_time: queryTime,
                            query,
                            filters,
                            meta: {
                                total: parseInt(meta.total, 10) || totalReturned,
                                total_found: Number.isNaN(totalFound) ? totalReturned : totalFound,
                                time: meta.time_ms ? parseFloat(meta.time_ms) : queryTime,
                                limit,
                                offset
                            }
                        });
                    });
                });
            });
            
        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('Sphinx search failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }

    /**
     * Get all works from Sphinx index without search term
     * @param {Object} options - Query options
     * @returns {Promise} Query results
     */
    async getAllWorks(options = {}) {
        await this.ensureConnection();

        const limit = this._sanitizeLimit(options.limit, 50, 200);
        const offset = this._sanitizeOffset(options.offset);
        const orderClause = this._workOrderClause(options.orderBy);

        try {
            const sql = `
                SELECT *, 
                       1 as relevance,
                       year,
                       work_type,
                       language,
                       peer_reviewed
                FROM works_poc 
                WHERE id > 0
                ORDER BY ${orderClause}
                LIMIT ${offset}, ${limit}
            `;

            const startTime = Date.now();

            return new Promise((resolve, reject) => {
                const qopts = { sql, timeout: this.queryTimeoutMs };
                this.connection.query(qopts, [], (error, results = []) => {
                    const queryTime = Date.now() - startTime;
                    
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    
                    logger.info('Sphinx getAllWorks completed', {
                        results: results.length,
                        queryTime: `${queryTime}ms`
                    });
                    
                    const formattedResults = results.map(row => ({
                        id: row.id,
                        title: row.title,
                        subtitle: row.subtitle,
                        abstract: row.abstract,
                        author_string: row.author_string,
                        venue_name: row.venue_name,
                        doi: row.doi,
                        year: row.year,
                        work_type: row.work_type,
                        language: row.language,
                        peer_reviewed: Boolean(row.peer_reviewed),
                        relevance_score: 1,
                        created_ts: row.created_ts
                    }));
                    
                    resolve({
                        results: formattedResults,
                        total: results.length,
                        query_time: queryTime,
                        query: 'all',
                        filters: {}
                    });
                });
            });
        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('Sphinx getAllWorks error', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }

    /**
     * Get faceted search results for bibliographic filtering
     * @param {string} query - Search query
     * @returns {Promise<object>} Faceted results
     */
    async getFacets(query) {
        await this.ensureConnection();
        
        try {
            const trimmedQuery = (query || '').trim();
            if (!trimmedQuery) {
                return { years: [], work_types: [], languages: [], venues: [], authors: [] };
            }

            const matchExpression = `MATCH(${this.connection.escape(trimmedQuery)})`;
            
            // Get facets using promises for parallel execution
            const yearPromise = new Promise((resolve, reject) => {
                this.connection.query(`
                    SELECT year, COUNT(*) as count 
                    FROM works_poc 
                    WHERE ${matchExpression}
                    GROUP BY year 
                    ORDER BY count DESC, year DESC 
                    LIMIT 20
                `, (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results.map(f => ({ value: f.year, count: f.count })));
                });
            });

            const typePromise = new Promise((resolve, reject) => {
                this.connection.query(`
                    SELECT work_type, COUNT(*) as count 
                    FROM works_poc 
                    WHERE ${matchExpression} 
                    GROUP BY work_type 
                    ORDER BY count DESC 
                    LIMIT 10
                `, (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results.map(f => ({ value: f.work_type, count: f.count })));
                });
            });

            const languagePromise = new Promise((resolve, reject) => {
                this.connection.query(`
                    SELECT language, COUNT(*) as count 
                    FROM works_poc 
                    WHERE ${matchExpression} AND language != 'unknown'
                    GROUP BY language 
                    ORDER BY count DESC 
                    LIMIT 10
                `, (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results.map(f => ({ value: f.language, count: f.count })));
                });
            });

            // Get top venues and authors for this query
            const venuesPromise = new Promise((resolve, reject) => {
                this.connection.query(`
                    SELECT venue_name, COUNT(*) as count 
                    FROM works_poc 
                    WHERE ${matchExpression} AND venue_name != ''
                    GROUP BY venue_name 
                    ORDER BY count DESC 
                    LIMIT 15
                `, (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results.map(f => ({ value: f.venue_name, count: f.count })));
                });
            });

            const authorsPromise = new Promise((resolve, reject) => {
                this.connection.query(`
                    SELECT author_string, COUNT(*) as count 
                    FROM works_poc 
                    WHERE ${matchExpression} AND author_string != ''
                    GROUP BY author_string 
                    ORDER BY count DESC 
                    LIMIT 10
                `, (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results.map(f => ({ 
                        value: f.author_string.split(';')[0].trim(), // First author
                        count: f.count 
                    })));
                });
            });

            const [years, work_types, languages, venues, authors] = await Promise.all([
                yearPromise, typePromise, languagePromise, venuesPromise, authorsPromise
            ]);
            
            return { years, work_types, languages, venues, authors };
            
        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('Sphinx facets failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }

    /**
     * Real-Time indexing: Insert new work into RT index
     * @param {object} workData - Work data to index
     */
    async indexWork(workData) {
        await this.ensureConnection();
        
        try {
            const sql = `
                INSERT INTO works_rt 
                (id, title, subtitle, abstract, author_string, venue_name, doi,
                 year, created_ts, work_type, language, open_access, peer_reviewed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const params = [
                workData.id,
                workData.title || '',
                workData.subtitle || '',
                workData.abstract || '',
                workData.author_string || '',
                workData.venue_name || '',
                workData.doi || '',
                workData.year || 0,
                Math.floor(Date.now() / 1000), // Unix timestamp
                workData.work_type || 'ARTICLE',
                workData.language || 'unknown',
                0, // open_access removed
                workData.peer_reviewed ? 1 : 0
            ];
            
            const result = await new Promise((resolve, reject) => {
                this.connection.query(sql, params, (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results);
                });
            });

            logger.info('Work indexed in RT index', {
                work_id: workData.id,
                title: workData.title ? `${workData.title.substring(0, 50)}...` : null
            });

            return result;
            
        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('RT indexing failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }

    /**
     * Real-Time indexing: Update existing work in RT index
     * @param {number} workId - Work ID to update
     * @param {object} updates - Fields to update
     */
    async updateWork(workId, updates) {
        await this.ensureConnection();
        
        try {
            const setParts = [];
            const params = [];
            
            // Build SET clause dynamically
            Object.entries(updates).forEach(([field, value]) => {
                setParts.push(`${field} = ?`);
                params.push(value);
            });
            
            params.push(workId);
            
            const sql = `UPDATE works_rt SET ${setParts.join(', ')} WHERE id = ?`;
            
            return new Promise((resolve, reject) => {
                this.connection.query(sql, params, (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results);
                });
            }).then((results) => {
                logger.info('Work updated in RT index', { work_id: workId, fields: Object.keys(updates) });
                return results;
            });
            
        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('RT update failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }

    /**
     * Get Sphinx status and performance metrics
     */
    async getStatus() {
        await this.ensureConnection();
        
        try {
            const statusPromise = new Promise((resolve, reject) => {
                this.connection.query('SHOW STATUS', (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results);
                });
            });

            const variablesPromise = new Promise((resolve, reject) => {
                this.connection.query('SHOW VARIABLES', (error, results) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }
                    resolve(results);
                });
            });

            const [status, variables] = await Promise.all([statusPromise, variablesPromise]);
            
            // Convert to object format
            const statusObj = {};
            status.forEach(row => {
                statusObj[row.Counter || row.Variable_name] = row.Value;
            });
            
            const variablesObj = {};
            variables.forEach(row => {
                variablesObj[row.Variable_name] = row.Value;
            });
            
            return {
                connected: this.isConnected,
                uptime: parseInt(statusObj.uptime) || 0,
                queries: parseInt(statusObj.queries) || 0,
                avg_query_time: parseFloat(statusObj.avg_query_wall) || 0,
                connections: parseInt(statusObj.connections) || 0,
                indexes_loaded: Object.keys(variablesObj).length,
                performance: {
                    query_wall: parseFloat(statusObj.query_wall) || 0,
                    queries_per_second: statusObj.uptime ? (statusObj.queries / statusObj.uptime).toFixed(2) : 0
                }
            };
            
        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('Sphinx status failed', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            return {
                connected: false,
                error: error.message
            };
        }
    }

    /**
     * Advanced search with faceted results
     * @param {string} query - Search query
     * @param {object} filters - Search filters
     * @param {object} options - Search options
     * @returns {Promise<object>} Search results with facets
     */
    async searchWithFacets(query, filters = {}, options = {}) {
        const [searchResults, facets] = await Promise.all([
            this.searchWorks(query, filters, options),
            this.getFacets(query)
        ]);
        
        return {
            ...searchResults,
            facets,
            meta: {
                ...searchResults.meta,
                faceted_search: true,
                total_facets: Object.keys(facets).length
            }
        };
    }

    /**
     * Close connection
     */
    async close() {
        if (this.connection) {
            try {
                this.connection.end();
            } catch (error) {
                this.connection.destroy();
            }
            this.connection = null;
            this.isConnected = false;
        }
    }

    /**
     * Get all venues from Sphinx venues_metrics_poc index
     * @param {Object} options - Query options
     * @returns {Promise} Query results
     */
    async getAllVenues(options = {}) {
        await this.ensureConnection();
        
        const { 
            limit = 20, 
            offset = 0,
            type = null,
            sortBy = 'works_count',
            sortOrder = 'DESC'
        } = options;

        const sanitizedLimit = this._sanitizeLimit(limit, 20, 200);
        const sanitizedOffset = this._sanitizeOffset(offset);
        const MAX_SPHINX_MATCHES = 10000;
        const DEFAULT_MAX_MATCHES = 1000;
        // Keep Sphinx's max_matches ahead of the requested window to prevent offset errors
        const maxMatches = Math.min(
            MAX_SPHINX_MATCHES,
            Math.max(DEFAULT_MAX_MATCHES, sanitizedOffset + sanitizedLimit)
        );
        const sortClause = this._venueOrderClause(sortBy, sortOrder);

        const params = [];
        const countParams = [];

        try {
            let sql = `
                SELECT id, name, type, issn, eissn, scopus_source_id, 
                       publisher_id, impact_factor, works_count, unique_authors,
                       first_publication_year, latest_publication_year, publisher_name
                FROM venues_metrics_poc 
                WHERE id > 0
            `;

            if (type) {
                sql += ' AND type = ?';
                params.push(type);
                countParams.push(type);
            }

            sql += ` ORDER BY ${sortClause} LIMIT ${sanitizedOffset}, ${sanitizedLimit} OPTION max_matches=${maxMatches}`;

            const countSql = `
                SELECT COUNT(*) as total
                FROM venues_metrics_poc 
                WHERE id > 0
                ${type ? ' AND type = ?' : ''}
            `;

            const startTime = Date.now();

            return new Promise((resolve, reject) => {
                // Execute both queries
                this.connection.query({ sql, timeout: this.queryTimeoutMs }, params, (error, venueResults = []) => {
                    if (error) {
                        this._handleQueryError(error);
                        reject(error);
                        return;
                    }

                    this.connection.query({ sql: countSql, timeout: this.queryTimeoutMs }, countParams, (countError, countResults = []) => {
                        if (countError) {
                            this._handleQueryError(countError);
                            reject(countError);
                            return;
                        }
                        
                        const queryTime = Date.now() - startTime;
                        const total = countResults[0]?.total || venueResults.length;
                        
                        logger.info('Sphinx getAllVenues completed', {
                            results: venueResults.length,
                            total: total,
                            queryTime: `${queryTime}ms`
                        });
                        
                        const formattedVenues = venueResults.map(venue => ({
                            id: venue.id,
                            name: venue.name,
                            type: venue.type,
                            issn: venue.issn || null,
                            eissn: venue.eissn || null,
                            scopus_source_id: venue.scopus_source_id || null,
                            publisher_id: venue.publisher_id,
                            impact_factor: venue.impact_factor || null,
                            works_count: venue.works_count || 0,
                            publisher_name: venue.publisher_name || null,
                            metrics: {
                                unique_authors: venue.unique_authors || 0,
                                first_publication_year: venue.first_publication_year,
                                latest_publication_year: venue.latest_publication_year
                            }
                        }));
                        
                        resolve({
                            venues: formattedVenues,
                            total: total,
                            query_time: queryTime
                        });
                    });
                });
            });
        } catch (error) {
            if (error.code !== 'SPHINX_UNAVAILABLE') {
                logger.error('Sphinx getAllVenues error', {
                    message: error.message,
                    code: error.code
                });
            }
            this._handleQueryError(error);
            throw error;
        }
    }
}

module.exports = new SphinxService();
