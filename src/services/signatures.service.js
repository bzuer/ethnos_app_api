const { sequelize } = require('../models');
const { Op } = require('sequelize');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const sphinxService = require('./sphinx.service');

class SignaturesService {
  async getAllSignatures(options = {}) {
    const { 
      limit = 20, 
      offset = 0, 
      search = null,
      sortBy = 'signature',
      sortOrder = 'ASC',
      includeCounts = true
    } = options;

    const cacheKey = `signatures:v2:${JSON.stringify(options)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Signatures list retrieved from cache');
        return cached;
      }

      // Phase 2: Use Sphinx for search optimization (Author disambiguation performance)
      if (search) {
        return await this.searchSignaturesSphinx(search, { limit, offset, sortBy, sortOrder });
      }

      // For non-search requests, use original MariaDB approach (supports light mode)
      return await this.getSignaturesFallback({ limit, offset, search, sortBy, sortOrder, includeCounts });

    } catch (error) {
      logger.error('Error fetching signatures:', error);
      throw error;
    }
  }

  /**
   * Phase 2: High-performance signatures search using Sphinx signatures_poc index
   * Improves author disambiguation and signature matching performance
   */
  async searchSignaturesSphinx(searchTerm, options = {}) {
    const { limit = 20, offset = 0, sortBy = 'signature', sortOrder = 'ASC' } = options;
    const cacheKey = `signatures:sphinx:${searchTerm}:${JSON.stringify(options)}`;

    try {
      // IDs from Sphinx
      const spx = await sphinxService.searchSignatureIds(searchTerm, { limit, offset });
      const ids = Array.isArray(spx?.ids) ? spx.ids : [];
      const total = parseInt(spx?.total || 0, 10) || 0;

      if (ids.length === 0) {
        const empty = {
          signatures: [],
          pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            pages: Math.max(1, Math.ceil(total / Math.max(1, parseInt(limit))))
          },
          search_engine: 'sphinx',
          performance_note: 'Sphinx returned no results; hydrated 0 via MariaDB'
        };
        await cacheService.set(cacheKey, empty, 900);
        return empty;
      }

      // Hydrate via MariaDB preserving order
      const orderField = `FIELD(s.id, ${ids.map(() => '?').join(',')})`;
      const [rows] = await sequelize.query(`
        SELECT s.id, s.signature, s.created_at
        FROM signatures s
        WHERE s.id IN (${ids.map(() => '?').join(',')})
        ORDER BY ${orderField}
      `, { replacements: [...ids, ...ids], type: sequelize.QueryTypes.SELECT });

      const result = {
        signatures: Array.isArray(rows) ? rows : [],
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.max(1, Math.ceil(total / Math.max(1, parseInt(limit))))
        },
        search_engine: 'sphinx',
        performance_note: `IDs from Sphinx in ${spx?.query_time || 0}ms; hydrated via MariaDB`
      };

      await cacheService.set(cacheKey, result, 1800);
      logger.info(`Signatures Sphinx search (IDs) cached: "${searchTerm}" - ${result.signatures.length} results`);
      return result;

    } catch (error) {
      logger.error(`Sphinx signatures search failed for term "${searchTerm}":`, error);
      return await this.searchSignaturesFallback(searchTerm, options);
    }
  }

  /**
   * Fallback method using MariaDB for signatures search
   */
  async searchSignaturesFallback(searchTerm, options = {}) {
    const { limit = 20, offset = 0, sortBy = 'signature', sortOrder = 'ASC' } = options;
    
    logger.warn('Using MariaDB fallback for signatures search');

    const validSortFields = ['signature', 'created_at', 'id'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'signature';
    const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const query = `
      SELECT 
        s.id,
        s.signature,
        s.created_at,
        (SELECT COUNT(*) FROM persons_signatures ps WHERE ps.signature_id = s.id) as persons_count
      FROM signatures s
      WHERE s.signature LIKE ?
      ORDER BY ${sortField} ${order}
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM signatures s
      WHERE s.signature LIKE ?
    `;

    const [signatures, countResult] = await Promise.all([
      sequelize.query(query, {
        replacements: [`%${searchTerm}%`, parseInt(limit), parseInt(offset)],
        type: sequelize.QueryTypes.SELECT
      }),
      sequelize.query(countQuery, {
        replacements: [`%${searchTerm}%`],
        type: sequelize.QueryTypes.SELECT
      })
    ]);

    return {
      signatures: Array.isArray(signatures) ? signatures : [signatures],
      pagination: {
        total: countResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(countResult[0].total / limit)
      },
      search_engine: 'mariadb_fallback',
      performance_note: 'Using MariaDB fallback due to Sphinx error'
    };
  }

  /**
   * Non-search signatures retrieval using original MariaDB approach
   */
  async getSignaturesFallback(options = {}) {
    const { 
      limit = 20, 
      offset = 0, 
      search = null,
      sortBy = 'signature',
      sortOrder = 'ASC',
      includeCounts = true
    } = options;

    let whereClause = '';
    const params = [];
    let paramIndex = 0;

    if (search) {
      whereClause = 'WHERE s.signature LIKE ?';
      params.push(`%${search}%`);
      paramIndex++;
    }

    const validSortFields = ['signature', 'created_at', 'id'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'signature';
    const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const query = includeCounts ? `
      SELECT 
        s.id,
        s.signature,
        s.created_at,
        (SELECT COUNT(*) FROM persons_signatures ps WHERE ps.signature_id = s.id) as persons_count
      FROM signatures s
      ${whereClause}
      ORDER BY ${sortField} ${order}
      LIMIT ? OFFSET ?
    ` : `
      SELECT 
        s.id,
        s.signature,
        s.created_at,
        NULL as persons_count
      FROM signatures s
      ${whereClause}
      ORDER BY ${sortField} ${order}
      LIMIT ? OFFSET ?
    `;

    params.push(parseInt(limit), parseInt(offset));

    const [signatures] = await sequelize.query(query, {
      replacements: params,
      type: sequelize.QueryTypes.SELECT
    });

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM signatures s
      ${whereClause}
    `;

    const [countResult] = await sequelize.query(countQuery, {
      replacements: params.slice(0, paramIndex),
      type: sequelize.QueryTypes.SELECT
    });

    const result = {
      signatures: Array.isArray(signatures) ? signatures : [signatures],
      pagination: {
        total: countResult.total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(countResult.total / limit)
      }
    };

    await cacheService.set(`signatures:v2:${JSON.stringify(options)}`, result, 3600);
    logger.info(`Retrieved ${result.signatures.length} signatures`);
    
    return result;
  }

  async getSignatureById(id) {
    const cacheKey = `signature:${id}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Signature ${id} retrieved from cache`);
        return cached;
      }

      const query = `
        SELECT 
          s.id,
          s.signature,
          s.created_at,
          COUNT(ps.person_id) as persons_count
        FROM signatures s
        LEFT JOIN persons_signatures ps ON s.id = ps.signature_id
        WHERE s.id = ?
        GROUP BY s.id, s.signature, s.created_at
      `;

      const [signature] = await sequelize.query(query, {
        replacements: [id],
        type: sequelize.QueryTypes.SELECT
      });

      if (!signature) {
        return null;
      }

      await cacheService.set(cacheKey, signature, 3600); // 1 hour
      logger.info(`Retrieved signature ${id}`);
      
      return signature;

    } catch (error) {
      logger.error(`Error fetching signature ${id}:`, error);
      throw error;
    }
  }

  async getSignaturePersons(signatureId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const cacheKey = `signature:${signatureId}:persons:${JSON.stringify(options)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Signature ${signatureId} persons retrieved from cache`);
        return cached;
      }

      const query = `
        SELECT 
          p.id,
          p.preferred_name,
          p.given_names,
          p.family_name,
          p.orcid,
          p.is_verified
        FROM signatures s
        JOIN persons_signatures ps ON s.id = ps.signature_id
        JOIN persons p ON ps.person_id = p.id
        WHERE s.id = ?
        ORDER BY p.preferred_name ASC
        LIMIT ? OFFSET ?
      `;

      const persons = await sequelize.query(query, {
        replacements: [signatureId, parseInt(limit), parseInt(offset)],
        type: sequelize.QueryTypes.SELECT
      });

      const countQuery = `
        SELECT COUNT(*) as total
        FROM signatures s
        JOIN persons_signatures ps ON s.id = ps.signature_id
        WHERE s.id = ?
      `;

      const [countResult] = await sequelize.query(countQuery, {
        replacements: [signatureId],
        type: sequelize.QueryTypes.SELECT
      });

      // Check if signature exists when no persons found
      if (countResult.total === 0) {
        const signatureExists = await sequelize.query(`
          SELECT 1 FROM signatures WHERE id = ? LIMIT 1
        `, {
          replacements: [signatureId],
          type: sequelize.QueryTypes.SELECT
        });
        
        if (signatureExists.length === 0) {
          return null; // Signature doesn't exist
        }
      }

      const result = {
        persons,
        pagination: {
          total: countResult.total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(countResult.total / limit)
        }
      };

      await cacheService.set(cacheKey, result, 1800); // 30 minutes
      logger.info(`Retrieved ${persons.length} persons for signature ${signatureId}`);
      
      return result;

    } catch (error) {
      logger.error(`Error fetching persons for signature ${signatureId}:`, error);
      throw error;
    }
  }

  async getSignatureStatistics() {
    const cacheKey = 'signatures:statistics';
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Signature statistics retrieved from cache');
        return cached;
      }

      // Optimized: Use separate simpler queries instead of complex JOINs
      const [signatureStats, linkStats] = await Promise.all([
        sequelize.query(`
          SELECT 
            COUNT(*) as total_signatures,
            COUNT(CASE WHEN LENGTH(signature) <= 10 THEN 1 END) as short_signatures,
            COUNT(CASE WHEN LENGTH(signature) > 10 AND LENGTH(signature) <= 20 THEN 1 END) as medium_signatures,
            COUNT(CASE WHEN LENGTH(signature) > 20 THEN 1 END) as long_signatures,
            AVG(LENGTH(signature)) as avg_signature_length
          FROM signatures
        `, {
          type: sequelize.QueryTypes.SELECT
        }),
        
        sequelize.query(`
          SELECT 
            COUNT(DISTINCT signature_id) as linked_signatures
          FROM persons_signatures
        `, {
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      const stats = {
        ...signatureStats[0],
        linked_signatures: linkStats[0].linked_signatures,
        unlinked_signatures: signatureStats[0].total_signatures - linkStats[0].linked_signatures
      };

      await cacheService.set(cacheKey, stats, 172800); // 48 hours for signatures stats
      logger.info('Retrieved signature statistics');
      
      return stats;

    } catch (error) {
      logger.error('Error fetching signature statistics:', error);
      throw error;
    }
  }

  async getSignatureWorks(signatureId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;
    
    const cacheKey = `signature:${signatureId}:works:${JSON.stringify(options)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Signature ${signatureId} works retrieved from cache`);
        return cached;
      }

      const [works, countResult] = await Promise.all([
        sequelize.query(`
          SELECT 
            vws.work_id as id,
            vws.title as title,
            vws.person_id,
            vws.person_name,
            w.work_type,
            w.language,
            w.subtitle,
            w.created_at,
            pub.year,
            pub.doi,
            v.name as journal,
            pub.volume,
            pub.issue,
            pub.pages,
            a.role,
            a.position,
            a.is_corresponding,
            was.author_string,
            CASE 
              WHEN was.author_string IS NOT NULL THEN 
                (LENGTH(was.author_string) - LENGTH(REPLACE(was.author_string, ';', '')) + 1)
              ELSE 0 
            END as total_authors
          FROM v_works_by_signature vws
          INNER JOIN works w ON vws.work_id = w.id
          LEFT JOIN publications pub ON w.id = pub.work_id
          LEFT JOIN venues v ON pub.venue_id = v.id
          LEFT JOIN authorships a ON vws.work_id = a.work_id AND vws.person_id = a.person_id
          LEFT JOIN work_author_summary was ON w.id = was.work_id
          WHERE vws.signature_id = ?
          ORDER BY COALESCE(pub.year, 2024) DESC, vws.work_id DESC
          LIMIT ? OFFSET ?
        `, {
          replacements: [signatureId, parseInt(limit), parseInt(offset)],
          type: sequelize.QueryTypes.SELECT
        }),
        
        sequelize.query(`
          SELECT COUNT(DISTINCT work_id) as total
          FROM v_works_by_signature
          WHERE signature_id = ?
        `, {
          replacements: [signatureId],
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      if (countResult[0].total === 0) {
        const signatureExists = await sequelize.query(`
          SELECT 1 FROM signatures WHERE id = ? LIMIT 1
        `, {
          replacements: [signatureId],
          type: sequelize.QueryTypes.SELECT
        });
        
        if (signatureExists.length === 0) {
          return null;
        }
      }

      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);

      const result = {
        data: works.map(work => ({
          id: work.id,
          title: work.title,
          subtitle: work.subtitle,
          type: work.work_type,
          language: work.language,
          doi: work.doi,
          authorship: {
            role: work.role,
            position: work.position,
            is_corresponding: work.is_corresponding === 1,
            person_id: work.person_id,
            person_name: work.person_name
          },
          publication: {
            year: work.year,
            journal: work.journal,
            volume: work.volume,
            issue: work.issue,
            pages: work.pages
          },
          authors: {
            total_count: work.total_authors || 0,
            author_string: work.author_string
          },
          created_at: work.created_at
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total),
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };

      await cacheService.set(cacheKey, result, 3600); // 1 hour for relationships
      logger.info(`Signature ${signatureId} works cached for 1 hour`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching works for signature ${signatureId}:`, error);
      throw error;
    }
  }

  async searchSignatures(searchTerm, options = {}) {
    const { limit = 20, offset = 0, exact = false } = options;
    const cacheKey = `signatures:search:${searchTerm}:${JSON.stringify(options)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Signature search results retrieved from cache');
        return cached;
      }

      const searchPattern = exact ? searchTerm : `%${searchTerm}%`;
      const searchOperator = exact ? '=' : 'LIKE';

      const query = `
        SELECT 
          s.id,
          s.signature,
          s.created_at,
          COUNT(ps.person_id) as persons_count
        FROM signatures s
        LEFT JOIN persons_signatures ps ON s.id = ps.signature_id
        WHERE s.signature ${searchOperator} ?
        GROUP BY s.id, s.signature, s.created_at
        ORDER BY 
          CASE WHEN s.signature = ? THEN 1 ELSE 2 END,
          persons_count DESC,
          s.signature ASC
        LIMIT ? OFFSET ?
      `;

      const signatures = await sequelize.query(query, {
        replacements: [searchPattern, searchTerm, parseInt(limit), parseInt(offset)],
        type: sequelize.QueryTypes.SELECT
      });

      const countQuery = `
        SELECT COUNT(DISTINCT s.id) as total
        FROM signatures s
        WHERE s.signature ${searchOperator} ?
      `;

      const [countResult] = await sequelize.query(countQuery, {
        replacements: [searchPattern],
        type: sequelize.QueryTypes.SELECT
      });

      const result = {
        signatures,
        pagination: {
          total: countResult.total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(countResult.total / limit)
        },
        searchTerm,
        exact
      };

      await cacheService.set(cacheKey, result, 1800); // 30 minutes
      logger.info(`Found ${signatures.length} signatures matching search: ${searchTerm}`);
      
      return result;

    } catch (error) {
      logger.error(`Error searching signatures for: ${searchTerm}`, error);
      throw error;
    }
  }
}

module.exports = new SignaturesService();
