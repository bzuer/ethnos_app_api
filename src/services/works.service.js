const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const SphinxService = require('./sphinx.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { formatWorkListItem, formatWorkDetails } = require('../dto/work.dto');
const { withTimeout } = require('../utils/db');

class WorksService {
  /**
   * VITRINE - /works
   * Propósito: Lista paginada com dados essenciais para navegação e decisão
   * Ordenação: Por ano de publicação (2025→2024→...) depois por data de criação
   * Performance: Query otimizada, dados mínimos necessários
   */
  async getWorks(filters = {}) {
    const t0 = Date.now();
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { search, type, year_from, year_to, open_access, language } = filters;
    const effectiveLimit = Math.min(limit, 20);
    const cacheKey = `works:vitrine:p${page}:l${effectiveLimit}:s${search || 'all'}:t${type || 'all'}:y${year_from || 'all'}-${year_to || 'all'}:oa${open_access || 'all'}:lang${language || 'all'}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      if (search && search.trim() !== '') {
        try {
          const result = await this._getWorksFromSphinx(search, filters);
          result.performance = { ...(result.performance || {}), elapsed_ms: Date.now() - t0 };
          return result;
        } catch (sphinxError) {
          logger.warn('Sphinx search unavailable, using MariaDB fallback', { message: sphinxError.message, code: sphinxError.code });
          const result = await this._getWorksSearchFallback(search, filters, effectiveLimit, offset, page);
          result.performance = { ...(result.performance || {}), elapsed_ms: Date.now() - t0 };
          return result;
        }
      }

      const result = await this._getWorksVitrine(filters, effectiveLimit, offset, page);
      result.performance = { ...(result.performance || {}), elapsed_ms: Date.now() - t0 };
      await cacheService.set(cacheKey, result, 1800);
      return result;
    } catch (error) {
      throw new Error(`Works vitrine query failed: ${error.message}`);
    }
  }

  /**
   * COMPLETUDE - /works/:id
   * Propósito: Todos os dados de uma obra específica
   * Inclui: Autores completos, publicações, arquivos, métricas
   * Nota: Citações e referências foram movidas para endpoints próprios
   *       (/works/:id/citations e /works/:id/references) para otimização.
   * Performance: Query complexa justificada pela completude dos dados
   */
  async getWorkById(id, options = {}) {
    const cacheKey = `work:complete:${id}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      // COMPLETUDE Query - All related data for a single work
      const work = await this._getCompleteWorkData(id, options);
      
      if (!work) {
        return null;
      }

      await cacheService.set(cacheKey, work, 7200); // 2h cache for complete data
      return work;

    } catch (error) {
      logger.error(`Error fetching complete work ${id}:`, error.message);
      throw error;
    }
  }

  // (removed duplicate getWorks shim that returned incomplete/null fields)

  /**
   * VITRINE OTIMIZADA - /works/vitrine
   * Usa sphinx_works_summary para máxima performance
   * Query única, sem JOINs, dados pré-compilados
   */
  async getWorksVitrine(filters = {}) {
    const t0 = Date.now();
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { type, year_from, year_to, language } = filters;
    const effectiveLimit = Math.min(limit, 100); // Vitrine permite até 100
    
    const cacheKey = `works:vitrine:p${page}:l${effectiveLimit}:t${type || 'all'}:y${year_from || 'all'}-${year_to || 'all'}:lang${language || 'all'}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Build WHERE conditions
      const whereConditions = ['author_string IS NOT NULL'];
      const queryParams = [];

      if (type) {
        whereConditions.push('work_type = ?');
        queryParams.push(type);
      }

      if (language) {
        whereConditions.push('language = ?');
        queryParams.push(language);
      }

      if (year_from) {
        whereConditions.push('year >= ?');
        queryParams.push(parseInt(year_from));
      }

      if (year_to) {
        whereConditions.push('year <= ?');
        queryParams.push(parseInt(year_to));
      }

      // Efficient count strategy - avoid slow COUNT(*) on large table
      let totalItems = 0;
      
      if (queryParams.length === 0) {
        // No filters - use pre-calculated estimate (2.5M records with authors)
        totalItems = 2499146;
      } else {
        // With filters - fast count with LIMIT to avoid timeout
        const countSql = `
          SELECT COUNT(*) as total
          FROM (
            SELECT 1 FROM sphinx_works_summary
            WHERE ${whereConditions.join(' AND ')}
            LIMIT 100000
          ) as limited_count
        `;
        
        const [countResult] = await sequelize.query(withTimeout(countSql), {
          replacements: queryParams,
          type: sequelize.QueryTypes.SELECT
        });
        
        const limitedCount = parseInt(countResult?.total) || 0;
        // Estimate total based on limited sample
        totalItems = limitedCount === 100000 ? limitedCount * 25 : limitedCount;
      }

      // Main query - single table, no JOINs
      const selectSql = `
        SELECT 
          id,
          title,
          subtitle,
          work_type,
          language,
          FROM_UNIXTIME(created_ts) as created_at,
          author_string,
          (LENGTH(author_string) - LENGTH(REPLACE(author_string, ';', '')) + 1) as author_count,
          venue_name,
          year as publication_year,
          doi,
          open_access,
          peer_reviewed
        FROM sphinx_works_summary
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `;

      const queryParamsWithPagination = [...queryParams, effectiveLimit, offset];
      const primaryQueryStart = process.hrtime.bigint();
      
      const works = await sequelize.query(withTimeout(selectSql), {
        replacements: queryParamsWithPagination,
        type: sequelize.QueryTypes.SELECT
      });
      
      const primaryQueryMs = Number(((process.hrtime.bigint() - primaryQueryStart) / BigInt(1e6)).toString());

      // Format data - apenas campos da tabela sphinx_works_summary
      const formattedWorks = works.map(work => ({
        id: work.id,
        title: work.title,
        type: work.work_type,
        publication_year: work.publication_year,
        language: work.language,
        open_access: Boolean(work.open_access),
        peer_reviewed: Boolean(work.peer_reviewed),
        doi: work.doi,
        venue: work.venue_name ? { name: work.venue_name, type: null } : null,
        authors_preview: work.author_string ? work.author_string.split(';').map(a => a.trim()) : [],
        author_count: work.author_count,
        first_author: work.author_string ? work.author_string.split(';')[0]?.trim() : null
      }));

      const result = {
        data: formattedWorks,
        pagination: createPagination(page, effectiveLimit, totalItems),
        meta: {
          query_source: 'sphinx_works_summary',
          performance: {
            engine: 'MariaDB',
            query_type: 'vitrine_optimized',
            primary_query_ms: primaryQueryMs,
            total_rows_examined: works.length,
            elapsed_ms: Date.now() - t0
          }
        }
      };

      await cacheService.set(cacheKey, result, 1800); // 30min cache
      return result;

    } catch (error) {
      throw new Error(`Works vitrine query failed: ${error.message}`);
    }
  }

  /**
   * VITRINE Query Implementation - Simplified for sphinx_works_summary table only
   * Uses only fields available in the summary table for maximum performance
   */
  async _getWorksVitrine(filters, limit, offset, page) {
    const { type, year_from, year_to, search, open_access, language } = filters;
    
    // Build WHERE conditions using only sphinx_works_summary fields
    let whereConditions = ['author_string IS NOT NULL'];
    const filterParams = [];

    if (search) {
      whereConditions.push('title LIKE ?');
      filterParams.push(`%${search}%`);
    }

    if (type) {
      whereConditions.push('work_type = ?');
      filterParams.push(type);
    }

    if (language) {
      whereConditions.push('language = ?');
      filterParams.push(language);
    }

    if (year_from) {
      whereConditions.push('year >= ?');
      filterParams.push(parseInt(year_from));
    }

    if (year_to) {
      whereConditions.push('year <= ?');
      filterParams.push(parseInt(year_to));
    }

    if (open_access !== undefined) {
      whereConditions.push('open_access = ?');
      filterParams.push(open_access === 'true' || open_access === true ? 1 : 0);
    }

    // Enforce a DB query timeout
    const dbTimeoutMs = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '8000');

    // Count total items
    const countSql = `
      SELECT COUNT(*) as total
      FROM sphinx_works_summary
      WHERE ${whereConditions.join(' AND ')}
    `;
    
    const [countRow] = await Promise.race([
      sequelize.query(countSql, {
        replacements: filterParams,
        type: sequelize.QueryTypes.SELECT
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Operation timeout')), dbTimeoutMs))
    ]);
    const totalItems = parseInt(countRow?.total) || 0;

    // Main query - only fields from sphinx_works_summary
    const queryParams = [...filterParams, limit, offset];
    const selectSql = `
      SELECT 
        id,
        title,
        subtitle,
        abstract,
        author_string,
        venue_name,
        doi,
        year,
        work_type,
        language,
        open_access,
        peer_reviewed,
        FROM_UNIXTIME(created_ts) AS created_at
      FROM sphinx_works_summary
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;

    const primaryQueryStart = process.hrtime.bigint();
    const works = await Promise.race([
      sequelize.query(selectSql, {
        replacements: queryParams,
        type: sequelize.QueryTypes.SELECT
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Operation timeout')), dbTimeoutMs))
    ]);
    const primaryQueryMs = Number(((process.hrtime.bigint() - primaryQueryStart) / BigInt(1e6)).toString());

    // Process works data - base from sphinx_works_summary
    const processedWorks = works.map(work => {
      const authors = work.author_string ? work.author_string.split(';').map(a => a.trim()) : [];
      
      return {
        id: work.id,
        title: work.title,
        subtitle: work.subtitle,
        abstract: work.abstract,
        type: work.work_type,
        language: work.language,
        publication_year: work.year,
        doi: work.doi,
        peer_reviewed: work.peer_reviewed === 1,
        open_access: work.open_access === 1,
        venue: work.venue_name ? { name: work.venue_name } : null,
        author_count: authors.length,
        first_author: authors.length > 0 ? authors[0] : null,
        authors_preview: authors.slice(0, 3),
        added_to_database: work.created_at,
        created_at: work.created_at,
        data_source: 'full_api',
        search_engine: null
      };
    });

    // Hydrate publication snapshot (latest per work) and venue details
    let publicationsQueryMs = null;
    let authorsQueryMs = null;
    if (processedWorks.length > 0) {
      const ids = processedWorks.map(w => w.id);
      const placeholders = ids.map(() => '?').join(',');

      // Publications + venues
      const pubsSql = `
        SELECT p1.work_id,
               p1.year AS publication_year,
               p1.peer_reviewed,
               p1.open_access,
               p1.doi,
               v.id AS venue_id,
               v.name AS venue_name,
               v.type AS venue_type,
               v.issn,
               v.eissn
        FROM publications p1
        INNER JOIN (
          SELECT work_id, MAX(year) AS max_year
          FROM publications
          WHERE work_id IN (${placeholders})
          GROUP BY work_id
        ) latest ON latest.work_id = p1.work_id AND latest.max_year = p1.year
        LEFT JOIN venues v ON p1.venue_id = v.id
        WHERE p1.work_id IN (${placeholders})
      `;
      const pubsStart = process.hrtime.bigint();
      const pubsRows = await sequelize.query(pubsSql, {
        replacements: [...ids, ...ids],
        type: sequelize.QueryTypes.SELECT
      });
      publicationsQueryMs = Number(((process.hrtime.bigint() - pubsStart) / BigInt(1e6)).toString());
      const pubMap = Object.create(null);
      for (const row of pubsRows) pubMap[row.work_id] = row;

      for (const item of processedWorks) {
        const pub = pubMap[item.id];
        if (pub) {
          item.publication_year = item.publication_year || pub.publication_year || null;
          item.doi = item.doi || pub.doi || null;
          item.peer_reviewed = pub.peer_reviewed === 1 || pub.peer_reviewed === true ? true : item.peer_reviewed;
          item.open_access = pub.open_access === 1 || pub.open_access === true ? true : item.open_access;
          if (pub.venue_name) {
            item.venue = {
              id: pub.venue_id || null,
              name: pub.venue_name,
              type: pub.venue_type || null,
              issn: pub.issn || null,
              eissn: pub.eissn || null
            };
          }
        }
      }

      // First author identifiers
      const authorSql = `
        SELECT a.work_id,
               a.person_id AS first_author_id,
               p.orcid,
               p.scopus_id,
               p.lattes_id
        FROM authorships a
        LEFT JOIN persons p ON p.id = a.person_id
        WHERE a.work_id IN (${placeholders}) AND a.position = 1
      `;
      const authStart = process.hrtime.bigint();
      const authorRows = await sequelize.query(authorSql, {
        replacements: ids,
        type: sequelize.QueryTypes.SELECT
      });
      authorsQueryMs = Number(((process.hrtime.bigint() - authStart) / BigInt(1e6)).toString());
      const authorMap = Object.create(null);
      for (const row of authorRows) authorMap[row.work_id] = row;

      for (const item of processedWorks) {
        const a = authorMap[item.id];
        if (a) {
          item.first_author_id = a.first_author_id || null;
          item.first_author_identifiers = {
            orcid: a.orcid || null,
            scopus_id: a.scopus_id || null,
            lattes_id: a.lattes_id || null
          };
        } else {
          item.first_author_id = item.first_author_id || null;
          item.first_author_identifiers = item.first_author_identifiers || null;
        }
      }
    }

    const items = processedWorks.map(formatWorkListItem);
    return {
      data: items,
      pagination: createPagination(page, limit, totalItems),
      performance: {
        engine: 'MariaDB',
        query_type: 'vitrine_enriched',
        primary_query_ms: primaryQueryMs,
        publications_query_ms: publicationsQueryMs,
        authors_query_ms: authorsQueryMs,
        total_rows_examined: works.length
      }
    };
  }

  /**
   * COMPLETUDE Query Implementation - Complete work data for /works/:id
   * Fetches ALL available data for a comprehensive work view
   */
  async _getCompleteWorkData(id, options = {}) {
    const includeCitations = options.includeCitations !== false;
    const includeReferences = options.includeReferences !== false;
    const startTime = process.hrtime.bigint();
    
    // 1. Main work data with latest publication info and canonical identifiers (from main publication row)
    const [workData] = await sequelize.query(`
      SELECT 
        w.id,
        w.title,
        w.subtitle,
        w.work_type,
        w.language,
        w.abstract,
        w.reference_count,
        w.created_at,
        w.updated_at,
        
        -- Latest publication data
        pub_latest.id as publication_id,
        pub_latest.year as publication_year,
        pub_latest.volume,
        pub_latest.issue,
        pub_latest.pages,
        pub_latest.doi as publication_doi,
        pub_latest.peer_reviewed,
        pub_latest.publication_date,
        pub_latest.open_access,
        pub_latest.source,
        pub_latest.source_indexed_at,

        -- Canonical identifiers from main publication row (min(id) per work), fallback to latest
        COALESCE(pub_main.pmid, pub_latest.pmid)            AS pmid,
        COALESCE(pub_main.pmcid, pub_latest.pmcid)          AS pmcid,
        COALESCE(pub_main.arxiv, pub_latest.arxiv)          AS arxiv,
        COALESCE(pub_main.wos_id, pub_latest.wos_id)        AS wos_id,
        COALESCE(pub_main.handle, pub_latest.handle)        AS handle,
        COALESCE(pub_main.wikidata_id, pub_latest.wikidata_id) AS wikidata_id,
        COALESCE(pub_main.openalex_id, pub_latest.openalex_id) AS openalex_id,
        COALESCE(pub_main.mag_id, pub_latest.mag_id)        AS mag_id,
        
        -- Venue data
        v.id as venue_id,
        v.name as venue_name,
        v.type as venue_type,
        v.issn,
        v.eissn,
        
        -- Publisher data
        publisher.id as publisher_id,
        publisher.name as publisher_name,
        publisher.type as publisher_type,
        publisher.country_code as publisher_country
        
      FROM works w
      LEFT JOIN publications pub_latest ON pub_latest.id = (
        SELECT p1.id
        FROM publications p1
        WHERE p1.work_id = w.id
        ORDER BY p1.year DESC, p1.id DESC
        LIMIT 1
      )
      LEFT JOIN publications pub_main ON pub_main.id = (
        SELECT MIN(p3.id) FROM publications p3 WHERE p3.work_id = w.id
      )
      LEFT JOIN venues v ON pub_latest.venue_id = v.id
      LEFT JOIN organizations publisher ON v.publisher_id = publisher.id
      WHERE w.id = ?
    `, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT
    });

    if (!workData) {
      return null;
    }

    // 2. Complete authorship with affiliations and identifiers (parallelized)
    const authorsPromise = sequelize.query(`
      SELECT 
        a.person_id,
        a.role,
        a.position,
        a.is_corresponding,
        p.preferred_name,
        p.given_names,
        p.family_name,
        p.orcid,
        p.scopus_id,
        p.lattes_id,
        o.id as affiliation_id,
        o.name as affiliation_name,
        o.type as affiliation_type,
        o.country_code as affiliation_country
      FROM authorships a
      LEFT JOIN persons p ON a.person_id = p.id
      LEFT JOIN organizations o ON a.affiliation_id = o.id
      WHERE a.work_id = ?
      ORDER BY a.position ASC
    `, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT
    });

    // 3. Subjects and keywords (parallelized)
    const subjectsPromise = sequelize.query(`
      SELECT 
        s.id as subject_id,
        s.term,
        s.vocabulary,
        s.lang,
        ws.relevance_score,
        ws.assigned_by
      FROM work_subjects ws
      JOIN subjects s ON ws.subject_id = s.id
      WHERE ws.work_id = ?
      ORDER BY ws.relevance_score DESC, s.vocabulary, s.term
    `, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT
    });

    // 4. Funding (parallelized)
    const fundingPromise = sequelize.query(`
      SELECT 
        f.funder_id,
        o.name AS funder_name,
        f.grant_number,
        f.program_name,
        f.amount,
        f.currency
      FROM funding f
      JOIN organizations o ON o.id = f.funder_id
      WHERE f.work_id = ?
      ORDER BY o.name ASC, f.grant_number ASC
    `, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT
    });

    // 5-7. Citações e referências foram extraídas para serviços próprios
    // (/works/:id/citations, /works/:id/references). Nada a carregar aqui.

    // 8. Files and documents (parallelized)
    const filesPromise = sequelize.query(`
      SELECT 
        f.id as file_id,
        f.md5,
        f.sha1,
        f.sha256,
        f.crc32,
        f.edonkey,
        f.aich,
        f.tth,
        f.btih,
        f.ipfs_cid,
        f.libgen_id,
        f.scimag_id,
        f.openacess_id,
        f.best_oa_url,
        f.download_urls,
        f.torrent_info,
        f.upload_date,
        f.download_count,
        f.last_verified,
        f.verification_status,
        f.version,
        f.file_format as format,
        f.file_size as size,
        f.pages,
        f.language,
        pf.file_role as role,
        pf.quality,
        pf.access_count,
        pf.last_accessed
      FROM publication_files pf
      JOIN files f ON pf.file_id = f.id
      WHERE pf.publication_id = ?
      ORDER BY pf.file_role, pf.quality DESC
    `, {
      replacements: [workData.publication_id || 0],
      type: sequelize.QueryTypes.SELECT
    });

    // 9. Licenses (parallelized)
    const licensesPromise = sequelize.query(`
      SELECT 
        license_url,
        content_version,
        start_date,
        created_at
      FROM work_licenses
      WHERE work_id = ?
      ORDER BY created_at DESC
    `, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT
    });

    // 10. Metrics (parallelized with fallback)
    const metricsPromise = (async () => {
      try {
        const [mrow] = await sequelize.query(`
          SELECT citation_count, altmetric_score, download_count, view_count, 
                 social_media_mentions, news_mentions
          FROM metrics WHERE work_id = ?
        `, { replacements: [id], type: sequelize.QueryTypes.SELECT });
        if (mrow) return mrow;
      } catch (_) {}
      const [fallback] = await sequelize.query(`
        SELECT 
          (SELECT COUNT(*) FROM citations WHERE cited_work_id = ?) as citation_count,
          ? as reference_count
      `, { replacements: [id, workData.reference_count || 0], type: sequelize.QueryTypes.SELECT });
      return fallback || { citation_count: 0, reference_count: workData.reference_count || 0 };
    })();

    // 11. Aggregate identifiers across ALL publications for this work (parallelized)
    const identifiersPromise = sequelize.query(`
      SELECT DISTINCT 
        doi, pmid, pmcid, arxiv, wos_id, handle, wikidata_id, openalex_id, mag_id
      FROM publications
      WHERE work_id = ?
    `, { replacements: [id], type: sequelize.QueryTypes.SELECT });

    let [
      authorsData,
      subjectsData,
      fundingData,
      filesData,
      licensesData,
      metricsData,
      allIdentifiersRows
    ] = await Promise.all([
      authorsPromise,
      subjectsPromise,
      fundingPromise,
      filesPromise,
      licensesPromise,
      metricsPromise,
      identifiersPromise
    ]);

    // Fallback: if no subjects are stored, enrich from Sphinx summary keywords when available
    if (!subjectsData || subjectsData.length === 0) {
      try {
        const [spxRow] = await sequelize.query(
          `SELECT subjects_string FROM sphinx_works_summary WHERE id = ? LIMIT 1`,
          { replacements: [id], type: sequelize.QueryTypes.SELECT }
        );
        const subjStr = spxRow && spxRow.subjects_string ? String(spxRow.subjects_string).trim() : '';
        if (subjStr) {
          const parsed = subjStr
            .split(';')
            .map(s => s.trim())
            .filter(Boolean)
            .map(term => ({ subject_id: null, term, vocabulary: 'KEYWORD', lang: null, relevance_score: 1.0, assigned_by: 'SYSTEM' }));
          subjectsData = parsed;
        }
      } catch (_) {}
    }

    const identifiersAgg = {
      doi: new Set(), pmid: new Set(), pmcid: new Set(), arxiv: new Set(), wos_id: new Set(), handle: new Set(), wikidata_id: new Set(), openalex_id: new Set(), mag_id: new Set()
    };
    for (const row of allIdentifiersRows) {
      for (const key of Object.keys(identifiersAgg)) {
        const val = row[key];
        if (val && String(val).trim()) identifiersAgg[key].add(String(val).trim());
      }
    }
    const identifiersAggPlain = Object.fromEntries(
      Object.entries(identifiersAgg).map(([k, set]) => [k, Array.from(set)])
    );

    const queryTime = Number(((process.hrtime.bigint() - startTime) / BigInt(1e6)).toString());

    let citedBy = [];
    let references = [];
    try {
      const incomingRows = await sequelize.query(
        `SELECT c.citing_work_id, MIN(c.citation_type) AS citation_type, MIN(c.citation_context) AS citation_context
         FROM citations c
         WHERE c.cited_work_id = ?
         GROUP BY c.citing_work_id
         ORDER BY c.citing_work_id DESC
         LIMIT 100`,
        { replacements: [id], type: sequelize.QueryTypes.SELECT }
      );
      const outgoingRows = await sequelize.query(
        `SELECT c.cited_work_id, MIN(c.citation_type) AS citation_type, MIN(c.citation_context) AS citation_context
         FROM citations c
         WHERE c.citing_work_id = ?
         GROUP BY c.cited_work_id
         ORDER BY c.cited_work_id DESC
         LIMIT 100`,
        { replacements: [id], type: sequelize.QueryTypes.SELECT }
      );

      const inIds = incomingRows.map(r => r.citing_work_id);
      const outIds = outgoingRows.map(r => r.cited_work_id);
      const allIds = Array.from(new Set([...inIds, ...outIds]));
      let sphinxMap = {};
      if (allIds.length) {
        const placeholders = allIds.map(() => '?').join(',');
        const sphinxRows = await sequelize.query(
          `SELECT id, title, year, author_string, venue_name, doi FROM sphinx_works_summary WHERE id IN (${placeholders})`,
          { replacements: allIds, type: sequelize.QueryTypes.SELECT }
        );
        sphinxMap = sphinxRows.reduce((acc, row) => { acc[row.id] = row; return acc; }, {});
      }

      citedBy = includeCitations ? incomingRows.map(row => {
        const sw = sphinxMap[row.citing_work_id] || {};
        return {
          work_id: row.citing_work_id,
          title: sw.title || null,
          authors: sw.author_string || null,
          publication_year: sw.year || null,
          venue_name: sw.venue_name || null,
          citation_type: row.citation_type || 'NEUTRAL',
          citation_context: row.citation_context || null
        };
      }) : [];

      references = includeReferences ? outgoingRows.map(row => {
        const sw = sphinxMap[row.cited_work_id] || {};
        return {
          work_id: row.cited_work_id,
          title: sw.title || null,
          authors: sw.author_string || null,
          publication_year: sw.year || null,
          venue_name: sw.venue_name || null,
          doi: sw.doi || null,
          citation_type: row.citation_type || 'NEUTRAL',
          citation_context: row.citation_context || null
        };
      }) : [];
    } catch (_) {}

    // Assemble complete work object
    const completeWork = {
      id: workData.id,
      title: workData.title,
      subtitle: workData.subtitle,
      abstract: workData.abstract,
      type: workData.work_type,
      language: workData.language,
      doi: workData.publication_doi || (identifiersAggPlain.doi[0] || null),
      pmid: workData.pmid || null,
      pmcid: workData.pmcid || null,
      arxiv: workData.arxiv || null,
      wos_id: workData.wos_id || null,
      handle: workData.handle || null,
      wikidata_id: workData.wikidata_id || null,
      openalex_id: workData.openalex_id || null,
      mag_id: workData.mag_id || null,
      created_at: workData.created_at,
      updated_at: workData.updated_at,

      publication: {
        id: workData.publication_id,
        year: workData.publication_year,
        volume: workData.volume,
        issue: workData.issue,
        pages: workData.pages,
        publication_date: workData.publication_date,
        peer_reviewed: workData.peer_reviewed,
        open_access: workData.open_access,
        doi: workData.publication_doi,
        source: workData.source,
        source_indexed_at: workData.source_indexed_at
      },

      venue: workData.venue_name ? {
        id: workData.venue_id,
        name: workData.venue_name,
        type: workData.venue_type,
        issn: workData.issn,
        eissn: workData.eissn
      } : null,

      publisher: workData.publisher_name ? {
        id: workData.publisher_id,
        name: workData.publisher_name,
        type: workData.publisher_type,
        country: workData.publisher_country
      } : null,

      authors: authorsData.map(author => ({
        person_id: author.person_id,
        preferred_name: author.preferred_name,
        given_names: author.given_names,
        family_name: author.family_name,
        identifiers: {
          orcid: author.orcid,
          scopus_id: author.scopus_id,
          lattes_id: author.lattes_id
        },
        role: author.role,
        position: author.position,
        is_corresponding: author.is_corresponding,
        affiliation: author.affiliation_name ? {
          id: author.affiliation_id,
          name: author.affiliation_name,
          type: author.affiliation_type,
          country: author.affiliation_country
        } : null
      })),

      subjects: subjectsData,

      citations: {
        cited_by: citedBy,
        references: references,
        unresolved_references: []
      },

      files: filesData,
      
      licenses: licensesData,

      metrics: metricsData,

      identifiers: identifiersAggPlain,

      funding: fundingData
    };

    return formatWorkDetails(completeWork);
  }

  /**
   * Fast MariaDB fallback for /works?search= when Sphinx is unavailable.
   * Strategy: quick ID search (LIKE) -> batch hydrate details and publications for those IDs.
   * Avoids COUNT(*) for speed; returns approximate total (page-local) to satisfy API contract.
   */
  async _getWorksSearchFallback(search, filters, limit, offset, page) {
    const { type, language, year_from, year_to } = filters || {};
    const trimmed = (search || '').trim();
    if (!trimmed) {
      return { data: [], pagination: createPagination(page, limit, 0) };
    }

    const { pool } = require('../config/database');
    const dbTimeoutMs = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '4000');

    // Step 1: fetch candidate IDs quickly
    const where = ['w.title LIKE ?'];
    const params = [`%${trimmed}%`];
    if (type) { where.push('w.work_type = ?'); params.push(type); }
    if (language) { where.push('w.language = ?'); params.push(language); }

    const idSql = `
      SELECT w.id
      FROM works w
      WHERE ${where.join(' AND ')}
      ORDER BY w.id DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const [idRows] = await pool.execute({ sql: idSql, timeout: dbTimeoutMs }, params);
    const workIds = idRows.map(r => r.id);
    if (workIds.length === 0) {
      return {
        data: [],
        pagination: createPagination(page, limit, 0),
        performance: { engine: 'MariaDB', query_type: 'search_fallback', primary_query_ms: 0, publications_query_ms: 0 }
      };
    }

    // Step 2: hydrate essential work data for those IDs
    const placeholders = workIds.map(() => '?').join(',');
    const [works] = await pool.execute({
      sql: `
        SELECT 
          w.id,
          w.title,
          w.subtitle,
          w.abstract,
          w.work_type,
          w.language,
          w.created_at,
          was.author_string
        FROM works w
        INNER JOIN work_author_summary was ON was.work_id = w.id
        WHERE w.id IN (${placeholders})
      `,
      timeout: dbTimeoutMs
    }, workIds);

    // Step 3: publication snapshot for those IDs (latest per work)
    let publicationsData = [];
    {
      const [pubs] = await pool.execute({
        sql: `
          SELECT p1.work_id,
                 p1.year AS publication_year,
                 p1.peer_reviewed,
                 p1.open_access,
                 p1.doi,
                 v.name AS venue_name,
                 v.type AS venue_type
          FROM publications p1
          INNER JOIN (
            SELECT work_id, MAX(year) AS max_year
            FROM publications
            WHERE work_id IN (${placeholders})
            GROUP BY work_id
          ) latest ON latest.work_id = p1.work_id AND latest.max_year = p1.year
          LEFT JOIN venues v ON p1.venue_id = v.id
        `,
        timeout: dbTimeoutMs
      }, workIds);
      publicationsData = pubs;
    }

    const pubMap = Object.create(null);
    for (const pub of publicationsData) pubMap[pub.work_id] = pub;

    const processed = works.map(work => {
      const authors = work.author_string ? work.author_string.split(';').map(a => a.trim()) : [];
      const pub = pubMap[work.id];
      return {
        id: work.id,
        title: work.title,
        subtitle: work.subtitle,
        abstract: work.abstract || null,
        type: work.work_type,
        work_type: work.work_type,
        language: work.language,
        publication_year: pub?.publication_year,
        doi: pub?.doi,
        peer_reviewed: pub ? pub.peer_reviewed === 1 : null,
        open_access: pub ? pub.open_access === 1 : null,
        venue: pub?.venue_name ? { name: pub.venue_name, type: pub.venue_type } : null,
        author_count: authors.length,
        first_author: authors[0] || null,
        authors_preview: authors.slice(0, 3),
        added_to_database: work.created_at,
        data_source: 'vitrine',
        search_engine: 'MariaDB'
      };
    });

    // Approximate total: page-local to avoid COUNT(*)
    const approxTotal = offset + processed.length;
    const items = processed.map(formatWorkListItem);
    return {
      data: items,
      pagination: createPagination(page, limit, approxTotal),
      performance: { engine: 'MariaDB', query_type: 'search_fallback' }
    };
  }

  /**
   * Sphinx search implementation - maintains existing search functionality
   */
  async _getWorksFromSphinx(search, filters) {
    const pagination = normalizePagination(filters);
    const { limit, offset } = pagination;

    try {
      // 1) Query Sphinx for IDs only
      const spx = await SphinxService.searchWorkIds(search, {
        work_type: filters?.type,
        language: filters?.language,
        year_from: filters?.year_from,
        year_to: filters?.year_to
      }, { limit, offset });

      const ids = Array.isArray(spx?.ids) ? spx.ids : [];
      const total = parseInt(spx?.total || 0, 10) || 0;
      if (ids.length === 0) {
        return {
          data: [],
          pagination: createPagination(pagination.page, limit, total),
          performance: { engine: 'Sphinx+MariaDB', query_type: 'search_hydrate', sphinx_query_ms: spx?.query_time || null }
        };
      }

      // 2) Hydrate from MariaDB, preserving Sphinx order
      const { pool } = require('../config/database');
      const orderField = `FIELD(w.id, ${ids.map(() => '?').join(',')})`;

      const [works] = await pool.execute({
        sql: `
          SELECT 
            w.id,
            w.title,
            w.subtitle,
            w.abstract,
            w.work_type,
            w.language,
            w.created_at,
            was.author_string
          FROM works w
          INNER JOIN work_author_summary was ON was.work_id = w.id
          WHERE w.id IN (${ids.map(() => '?').join(',')})
          ORDER BY ${orderField}
        `,
        timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '6000')
      }, [...ids, ...ids]);

      // Publications snapshot (latest year per work)
      let publicationsData = [];
      const placeholders = ids.map(() => '?').join(',');
      const [pubs] = await pool.execute({
        sql: `
          SELECT p1.work_id,
                 p1.year AS publication_year,
                 p1.peer_reviewed,
                 p1.open_access,
                 p1.doi,
                 v.name AS venue_name,
                 v.type AS venue_type
          FROM publications p1
          INNER JOIN (
            SELECT work_id, MAX(year) AS max_year
            FROM publications
            WHERE work_id IN (${placeholders})
            GROUP BY work_id
          ) latest ON latest.work_id = p1.work_id AND latest.max_year = p1.year
          LEFT JOIN venues v ON p1.venue_id = v.id
        `,
        timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '6000')
      }, ids);
      publicationsData = pubs || [];

      const pubMap = Object.create(null);
      for (const pub of publicationsData) pubMap[pub.work_id] = pub;

      const processedWorks = (works || []).map(work => {
        const authors = work.author_string ? work.author_string.split(';').map(a => a.trim()) : [];
        const pub = pubMap[work.id];
        return {
          id: work.id,
          title: work.title,
          subtitle: work.subtitle || null,
          abstract: work.abstract || null,
          type: work.work_type || 'ARTICLE',
          work_type: work.work_type || 'ARTICLE',
          language: work.language || null,
          publication_year: pub?.publication_year || null,
          doi: pub?.doi || null,
          open_access: pub ? pub.open_access === 1 : null,
          venue: pub?.venue_name ? { name: pub.venue_name, type: pub.venue_type } : null,
          peer_reviewed: pub ? pub.peer_reviewed === 1 : null,
          author_count: authors.length,
          first_author: authors[0] || null,
          authors_preview: authors.slice(0, 3),
          added_to_database: work.created_at,
          data_source: 'vitrine',
          search_engine: 'Sphinx'
        };
      });

      const items = processedWorks;

      return {
        data: items,
        pagination: createPagination(pagination.page, limit, total),
        performance: {
          engine: 'Sphinx+MariaDB',
          query_type: 'search_hydrate',
          sphinx_query_ms: spx?.query_time || null
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // Bibliography method with normalized pagination
  async getWorkBibliography(workId, filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { reading_type, year_from, year_to } = filters;
    const cacheKey = `work:${workId}:bibliography:v2:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      let baseQuery = `
        SELECT 
          c.id as course_id,
          c.code as course_code,
          c.name as course_name,
          c.year as course_year,
          c.program_id,
          cb.reading_type,
          COUNT(DISTINCT ci.canonical_person_id) as instructor_count,
          GROUP_CONCAT(DISTINCT p.preferred_name ORDER BY p.preferred_name SEPARATOR '; ') as instructors
        FROM course_bibliography cb
        JOIN courses c ON cb.course_id = c.id
        LEFT JOIN course_instructors ci ON c.id = ci.course_id
        LEFT JOIN persons p ON ci.canonical_person_id = p.id
        WHERE cb.work_id = ?
      `;

      const whereParams = [workId];

      if (reading_type) {
        baseQuery += ' AND cb.reading_type = ?';
        whereParams.push(reading_type);
      }

      if (year_from) {
        baseQuery += ' AND c.year >= ?';
        whereParams.push(year_from);
      }

      if (year_to) {
        baseQuery += ' AND c.year <= ?';
        whereParams.push(year_to);
      }

      const groupOrderClause = `
        GROUP BY c.id, c.code, c.name, c.year, c.program_id, cb.reading_type
        ORDER BY c.year DESC, c.name ASC
      `;

      const paginatedQuery = `${baseQuery} ${groupOrderClause} LIMIT ? OFFSET ?`;
      const params = [...whereParams, limit, offset];

      const { pool } = require('../config/database');
      const [bibliography] = await pool.execute({ sql: paginatedQuery, timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '3000') }, params);

      // Total count (count number of grouped rows without LIMIT)
      const countQuery = `SELECT COUNT(*) as total FROM ( ${baseQuery} ${groupOrderClause} ) t`;
      const [countRows] = await pool.execute({ sql: countQuery, timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '3000') }, whereParams);
      const total = parseInt(countRows?.[0]?.total) || 0;

      // Return with pagination metadata
      const result = {
        data: bibliography,
        pagination: createPagination(page, limit, total)
      };

      await cacheService.set(cacheKey, result, 1800);
      return result;
    } catch (error) {
      logger.error('Error retrieving work bibliography:', error);
      throw error;
    }
  }
}

module.exports = new WorksService();
