const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { formatVenueListItem, formatVenueDetails } = require('../dto/venue.dto');
const { withTimeout } = require('../utils/db');

const toInt = (value, fallback = 0) => {
  if (value === null || value === undefined) {
    return fallback;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toNullableFloat = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const toNullableBoolean = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value) === 1;
};

class VenuesService {
  constructor() {
    this._lastEnrichmentWarnings = [];
  }
  async _fetchVenueEnrichment(venueIds = [], options = {}) {
    if (!Array.isArray(venueIds) || venueIds.length === 0) {
      return new Map();
    }

    const uniqueIds = Array.from(new Set(venueIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return new Map();
    }

    // Base venue info (includes precomputed fields from venues table if available)
    const baseQuery = `
      SELECT
        v.id,
        v.name,
        v.type,
        v.issn,
        v.eissn,
        v.scopus_id AS scopus_source_id,
        v.wikidata_id,
        v.openalex_id,
        v.mag_id,
        v.publisher_id,
        v.impact_factor,
        v.created_at,
        v.updated_at,
        v.last_validated_at,
        v.validation_status,
        v.citescore,
        v.sjr,
        v.snip,
        v.open_access,
        v.aggregation_type,
        v.coverage_start_year,
        v.coverage_end_year,
        v.works_count AS works_count_precomputed,
        v.cited_by_count,
        v.h_index,
        v.i10_index,
        v.\`2yr_mean_citedness\` AS two_year_mean_citedness,
        v.homepage_url,
        v.country_code,
        v.is_in_doaj,
        v.is_indexed_in_scopus,
        pub.name AS publisher_name,
        pub.type AS publisher_type,
        pub.country_code AS publisher_country
      FROM venues v
      LEFT JOIN organizations pub ON v.publisher_id = pub.id
      WHERE v.id IN (:venueIds)`;

    // A safer minimal base query for environments missing optional columns or tables
    // IMPORTANT: Do NOT reference optional tables here; keep it strictly to `venues`
    const fallbackBaseQuery = `
      SELECT
        v.id,
        v.name,
        v.type,
        v.issn,
        v.eissn,
        v.scopus_id AS scopus_source_id,
        v.wikidata_id,
        v.openalex_id,
        v.mag_id,
        v.publisher_id,
        v.impact_factor,
        v.created_at,
        v.updated_at,
        v.last_validated_at,
        v.validation_status,
        v.citescore,
        v.sjr,
        v.snip,
        v.open_access,
        v.aggregation_type,
        v.coverage_start_year,
        v.coverage_end_year,
        v.works_count AS works_count_precomputed,
        v.cited_by_count,
        v.h_index,
        v.i10_index,
        v.\`2yr_mean_citedness\` AS two_year_mean_citedness,
        v.homepage_url,
        v.country_code,
        v.is_in_doaj,
        v.is_indexed_in_scopus,
        NULL AS publisher_name,
        NULL AS publisher_type,
        NULL AS publisher_country
      FROM venues v
      WHERE v.id IN (:venueIds)`;

    // Prefer view for aggregated venue metrics; fallback to yearly stats aggregation
    const venueRankingQuery = `
      SELECT 
        venue_id,
        total_works AS publications_count,
        open_access_works AS open_access_publications,
        open_access_percentage,
        first_publication_year,
        latest_publication_year,
        unique_authors
      FROM v_venue_ranking
      WHERE venue_id IN (:venueIds)`;

    const statsFallbackQuery = `
      SELECT venue_id,
             SUM(works_count) AS publications_count,
             SUM(oa_works_count) AS open_access_publications,
             CASE WHEN SUM(works_count) = 0 THEN NULL
                  ELSE ROUND(SUM(oa_works_count) * 100.0 / SUM(works_count), 2)
             END AS open_access_percentage,
             MIN(CASE WHEN works_count > 0 THEN year END) AS first_publication_year,
             MAX(CASE WHEN works_count > 0 THEN year END) AS latest_publication_year
      FROM venue_yearly_stats
      WHERE venue_id IN (:venueIds)
      GROUP BY venue_id`;

    // External identifiers now come directly from venues table columns

    // Unique authors from view when available; fallback uses join later if needed
    const uniqueAuthorsFromView = `
      SELECT venue_id, unique_authors FROM v_venue_ranking WHERE venue_id IN (:venueIds)`;
    const uniqueAuthorsFallbackQuery = `
      SELECT
        pub.venue_id,
        COUNT(DISTINCT a.person_id) AS unique_authors
      FROM publications pub
      JOIN authorships a ON a.work_id = pub.work_id
      WHERE pub.venue_id IN (:venueIds)
      GROUP BY pub.venue_id`;

    // Optional subjects
    const subjectsQuery = `
      SELECT vs.venue_id, vs.subject_id, vs.score, s.term, s.vocabulary, s.lang
      FROM venue_subjects vs
      JOIN subjects s ON s.id = vs.subject_id
      WHERE vs.venue_id IN (:venueIds)
      ORDER BY vs.venue_id, vs.score DESC`;

    const yearlyStatsQuery = `
      SELECT venue_id, year, works_count, oa_works_count, cited_by_count
      FROM venue_yearly_stats
      WHERE venue_id IN (:venueIds)
      ORDER BY venue_id, year DESC`;

    const topAuthorsQuery = `
      SELECT 
        pub.venue_id,
        a.person_id,
        COUNT(*) AS works_count,
        MIN(a.position) AS best_position,
        MAX(CASE WHEN a.is_corresponding = 1 THEN 1 ELSE 0 END) AS is_corresponding,
        COALESCE(p.preferred_name, CONCAT(COALESCE(p.given_names, ''), ' ', COALESCE(p.family_name, ''))) AS name
      FROM publications pub
      JOIN authorships a ON pub.work_id = a.work_id
      LEFT JOIN persons p ON p.id = a.person_id
      WHERE pub.venue_id IN (:venueIds)
      GROUP BY pub.venue_id, a.person_id, name`;

    const warnings = [];
    const addWarn = (msg) => warnings.push(msg);

    const safeQuery = async (label, sql, replacements, fallbackSql = null) => {
      try {
        return await sequelize.query(withTimeout(sql), { replacements, type: sequelize.QueryTypes.SELECT });
      } catch (err) {
        const code = err?.original?.code || err?.parent?.code || err?.code;
        const errno = err?.original?.errno || err?.parent?.errno;
        const message = err?.original?.sqlMessage || err?.parent?.sqlMessage || err?.message || '';
        const isUnknown = code === 'ER_BAD_FIELD_ERROR' || code === '42S22';
        const isMissingTable = code === 'ER_NO_SUCH_TABLE' || code === '42S02';
        const isDefinerMissing = code === 'ER_NO_SUCH_USER' || errno === 1449 || message.includes('definer');
        if ((isUnknown || isMissingTable || isDefinerMissing) && fallbackSql) {
          if (label !== 'base') {
            addWarn(`Partial enrichment: ${label} reduced due to schema differences`);
          }
          try {
            return await sequelize.query(withTimeout(fallbackSql), { replacements, type: sequelize.QueryTypes.SELECT });
          } catch (fallbackErr) {
            addWarn(`Enrichment fallback failed for ${label}`);
            return [];
          }
        }
        if (isUnknown || isMissingTable || isDefinerMissing) {
          addWarn(`Partial enrichment skipped: ${label} unavailable`);
          return [];
        }
        throw err;
      }
    };

    const [baseRows, statsRows, uniqueAuthorsRows, subjectsRows, yearlyRows, topAuthorsRows] = await Promise.all([
      safeQuery('base', baseQuery, { venueIds: uniqueIds }, fallbackBaseQuery),
      safeQuery('stats', venueRankingQuery, { venueIds: uniqueIds }, statsFallbackQuery),
      options.includeUniqueAuthors ? safeQuery('unique_authors', uniqueAuthorsFromView, { venueIds: uniqueIds }, uniqueAuthorsFallbackQuery) : Promise.resolve([]),
      options.includeSubjects ? safeQuery('subjects', subjectsQuery, { venueIds: uniqueIds }) : Promise.resolve([]),
      options.includeYearly ? safeQuery('yearly_stats', yearlyStatsQuery, { venueIds: uniqueIds }) : Promise.resolve([]),
      options.includeTopAuthors ? safeQuery('top_authors', topAuthorsQuery, { venueIds: uniqueIds }) : Promise.resolve([]),
    ]);

    const map = new Map();
    // Index helpers
    const statsMap = new Map(statsRows.map(r => [r.venue_id, r]));
    const uniqueAuthorsMap = new Map(uniqueAuthorsRows.map(r => [r.venue_id, r.unique_authors]));
    // Build identifiers list from venues columns
    const identifiersMap = new Map();
    for (const row of baseRows) {
      const list = [];
      if (row.scopus_source_id) list.push({ type: 'SCOPUS_ID', value: row.scopus_source_id });
      if (row.wikidata_id) list.push({ type: 'WIKIDATA_ID', value: row.wikidata_id });
      if (row.openalex_id) list.push({ type: 'OPENALEX_ID', value: row.openalex_id });
      if (row.mag_id) list.push({ type: 'MAG_ID', value: row.mag_id });
      identifiersMap.set(row.id, list);
    }

    const subjectsMap = new Map();
    for (const s of subjectsRows) {
      const list = subjectsMap.get(s.venue_id) || [];
      list.push({
        subject_id: s.subject_id,
        term: s.term,
        score: toNullableFloat(s.score),
        vocabulary: s.vocabulary || null,
        lang: s.lang || null
      });
      subjectsMap.set(s.venue_id, list);
    }

    // Yearly stats map
    const yearlyMap = new Map();
    for (const y of yearlyRows) {
      const list = yearlyMap.get(y.venue_id) || [];
      list.push({
        year: toInt(y.year, null),
        works_count: toInt(y.works_count, 0),
        oa_works_count: toInt(y.oa_works_count, 0),
        cited_by_count: toInt(y.cited_by_count, 0),
      });
      yearlyMap.set(y.venue_id, list);
    }

    const topAuthorsMap = new Map();
    if (options.includeTopAuthors) {
      const grouped = new Map();
      for (const row of topAuthorsRows) {
        if (!grouped.has(row.venue_id)) {
          grouped.set(row.venue_id, []);
        }
        grouped.get(row.venue_id).push({
          person_id: row.person_id,
          name: row.name ? row.name.trim() : null,
          works_count: toInt(row.works_count, 0),
          best_position: toInt(row.best_position, null),
          is_corresponding: toNullableBoolean(row.is_corresponding)
        });
      }

      for (const [venueId, authors] of grouped.entries()) {
        const sorted = authors
          .sort((a, b) => {
            if (b.works_count !== a.works_count) {
              return b.works_count - a.works_count;
            }
            if (a.best_position !== null && b.best_position !== null && a.best_position !== b.best_position) {
              return a.best_position - b.best_position;
            }
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
          })
          .slice(0, 10);

        topAuthorsMap.set(venueId, sorted);
      }
    }

    for (const row of baseRows) {
      map.set(row.id, {
        base: {
          id: row.id,
          name: row.name,
          type: row.type,
          issn: row.issn,
          eissn: row.eissn,
          scopus_source_id: row.scopus_source_id,
          publisher_id: row.publisher_id,
          impact_factor: toNullableFloat(row.impact_factor),
          created_at: row.created_at,
          updated_at: row.updated_at,
          last_validated_at: row.last_validated_at,
          validation_status: row.validation_status,
          citescore: toNullableFloat(row.citescore),
          sjr: toNullableFloat(row.sjr),
          snip: toNullableFloat(row.snip),
          open_access: toNullableBoolean(row.open_access),
          aggregation_type: row.aggregation_type,
          coverage_start_year: row.coverage_start_year,
          coverage_end_year: row.coverage_end_year,
          publisher_name: row.publisher_name,
          publisher_type: row.publisher_type,
          publisher_country: row.publisher_country,
          homepage_url: row.homepage_url,
          country_code: row.country_code,
          is_in_doaj: toNullableBoolean(row.is_in_doaj),
          is_indexed_in_scopus: toNullableBoolean(row.is_indexed_in_scopus),
          two_year_mean_citedness: toNullableFloat(row.two_year_mean_citedness),
        },
        metrics: {
          publications_count: toInt(statsMap.get(row.id)?.publications_count, 0),
          works_count: toInt(row.works_count_precomputed, 0),
          unique_authors: toInt(uniqueAuthorsMap.get(row.id), 0),
          first_publication_year: statsMap.get(row.id)?.first_publication_year || null,
          latest_publication_year: statsMap.get(row.id)?.latest_publication_year || null,
          open_access_publications: toInt(statsMap.get(row.id)?.open_access_publications, 0),
          open_access_percentage: toNullableFloat(statsMap.get(row.id)?.open_access_percentage),
          cited_by_count: toInt(row.cited_by_count, 0),
          h_index: toInt(row.h_index, 0),
          i10_index: toInt(row.i10_index, 0),
          total_citations: toInt(row.cited_by_count, 0),
          avg_citations: null,
          total_downloads: 0,
        },
        external_identifiers: identifiersMap.get(row.id) || [],
        subjects: subjectsMap.get(row.id) || [],
        yearly_stats: yearlyMap.get(row.id) || [],
        top_authors: topAuthorsMap.get(row.id) || [],
      });
    }

    // expose last enrichment warnings for callers to read
    this._lastEnrichmentWarnings = warnings;
    return map;
  }

  _finalizeVenueStructure(venue) {
    const identifiers = {
      issn: venue.issn ?? null,
      eissn: venue.eissn ?? null,
      scopus_source_id: venue.scopus_source_id ?? null,
    };

    const extList = Array.isArray(venue.external_identifiers) ? venue.external_identifiers : [];
    const external = {};
    extList.forEach(({ type, value }) => {
      if (type && value) external[type] = value;
    });
    venue.identifiers = { ...identifiers, external };

    const publisher = {
      id: venue.publisher_id ?? null,
      name: venue.publisher_name ?? null,
      type: venue.publisher_type ?? null,
      country_code: venue.publisher_country ?? null,
    };

    venue.publisher = publisher;

    if (venue.homepage_url) {
      venue.homepage_url = venue.homepage_url;
    }
    if (venue.country_code) {
      venue.country_code = venue.country_code;
    }
    if (venue.is_in_doaj !== undefined) {
      venue.is_in_doaj = Boolean(venue.is_in_doaj);
    }

    // Publication summary: prefer database yearly_stats when available
    const yearly = Array.isArray(venue.yearly_stats) ? venue.yearly_stats : [];
    const trend = yearly.map(y => ({ year: y.year, works_count: y.works_count, oa_works_count: y.oa_works_count }));
    let firstYear = venue.coverage_start_year || null;
    let latestYear = venue.coverage_end_year || null;
    if (yearly.length) {
      const yearsWithWorks = yearly.filter(y => (y.works_count || 0) > 0).map(y => y.year);
      const yearsAll = yearly.map(y => y.year);
      const minYear = (yearsWithWorks.length ? Math.min(...yearsWithWorks) : Math.min(...yearsAll)) || null;
      const maxYear = (yearsWithWorks.length ? Math.max(...yearsWithWorks) : Math.max(...yearsAll)) || null;
      if (minYear) firstYear = firstYear ?? minYear;
      if (maxYear) latestYear = latestYear ?? maxYear;
    }
    venue.publication_summary = {
      first_publication_year: firstYear,
      latest_publication_year: latestYear,
      publication_trend: trend
    };

    // Top subjects (internal, DB-based)
    if (Array.isArray(venue.subjects)) {
      venue.top_subjects = venue.subjects.slice(0, 10);
    }

    // Maintain existing metrics for compatibility (deprecated; internal only)
    // Normalize works_count field for list and details
    // works_count must reflect total works in database for this venue (precomputed column)
    venue.works_count = toInt(venue.works_count, 0);

    return venue;
  }

  _mergeVenueData(currentVenue, enrichment) {
    const merged = {
      ...currentVenue,
      ...(enrichment?.base || {}),
    };

    const existingMetrics = currentVenue.metrics || {};
    const newMetrics = enrichment?.metrics || {};
    // Normalize works_count for merged structure; drop metrics from final output
    const mergedWorks = newMetrics.works_count ?? existingMetrics.works_count ?? merged.works_count ?? 0;
    merged.works_count = mergedWorks;

    return this._finalizeVenueStructure(merged);
  }

  async _enrichVenues(venues = [], enrichmentOptions = {}) {
    if (!Array.isArray(venues) || venues.length === 0) {
      return venues;
    }

    const venueIds = venues.map(v => v.id).filter(Boolean);
    if (venueIds.length === 0) {
      return venues.map(v => this._finalizeVenueStructure({ ...v }));
    }

    try {
      const enrichmentMap = await this._fetchVenueEnrichment(venueIds, {
        includeUniqueAuthors: Boolean(enrichmentOptions.includeUniqueAuthors),
        includeSubjects: Boolean(enrichmentOptions.includeSubjects),
        includeYearly: Boolean(enrichmentOptions.includeYearly),
        includeTopAuthors: Boolean(enrichmentOptions.includeTopAuthors)
      });

      const enriched = venues.map(venue => {
        const detail = enrichmentMap.get(venue.id);
        if (!detail) {
          return this._finalizeVenueStructure({ ...venue });
        }
        return this._mergeVenueData(venue, detail);
      });
      // attach warnings for caller (array will drop this property on JSON.stringify)
      enriched.warnings = Array.isArray(this._lastEnrichmentWarnings) ? this._lastEnrichmentWarnings.slice(0) : [];
      return enriched;
    } catch (error) {
      logger.warn('Failed to enrich venues with database metrics', { error: error.message });
      const enriched = venues.map(venue => this._finalizeVenueStructure({ ...venue }));
      enriched.warnings = ['Partial data due to enrichment failure'];
      return enriched;
    }
  }

  async searchVenues(query, options = {}) {
    const pagination = normalizePagination(options);
    const normalizedOptions = {
      ...options,
      ...pagination,
      includeLegacyMetrics: Boolean(options.includeLegacyMetrics || options.includeLegacy)
    };

    const { page, limit, offset, type } = normalizedOptions;
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const currentLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
    const currentOffset = Math.max(0, parseInt(offset, 10) || 0);

    const cacheKey = `venues:search:${query}:${JSON.stringify(normalizedOptions)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Venues search "${query}" retrieved from cache`);
        return cached;
      }

      const baseQuery = `
        SELECT 
          v.id,
          v.name,
          v.type,
          v.issn,
          v.eissn,
          v.scopus_id AS scopus_source_id,
          v.publisher_id,
          v.impact_factor,
          v.citescore,
          v.sjr,
          v.snip,
          v.created_at,
          v.updated_at,
          v.open_access,
          v.aggregation_type,
          v.coverage_start_year,
          v.coverage_end_year,
          v.is_indexed_in_scopus,
          v.\`2yr_mean_citedness\` AS two_year_mean_citedness,
          v.homepage_url,
          v.country_code,
          v.is_in_doaj,
          COALESCE(v.works_count, 0) as works_count,
          pub.name as publisher_name,
          pub.type as publisher_type,
          pub.country_code as publisher_country
        FROM venues v
        LEFT JOIN organizations pub ON v.publisher_id = pub.id
        WHERE v.name LIKE ?
        ${type ? 'AND v.type = ?' : ''}
        ORDER BY works_count DESC, v.name ASC
        LIMIT ? OFFSET ?
      `;

      const searchTerm = `%${query}%`;
      const listParams = type
        ? [searchTerm, type, currentLimit, currentOffset]
        : [searchTerm, currentLimit, currentOffset];

      const countQuery = `
        SELECT COUNT(*) as total 
        FROM venues v 
        WHERE v.name LIKE ?
        ${type ? 'AND v.type = ?' : ''}
      `;
      const countParams = type ? [searchTerm, type] : [searchTerm];

      const executeSearchQuery = async () => {
        try {
          return await sequelize.query(baseQuery, {
            replacements: listParams,
            type: sequelize.QueryTypes.SELECT
          });
        } catch (err) {
          const code = err?.original?.code || err?.parent?.code || err?.code;
          if (code === 'ER_BAD_FIELD_ERROR' || code === '42S22') {
            logger.warn('Venues search query falling back to minimal schema', { error: err.message });
            const fallbackQuery = `
              SELECT 
                v.id,
                v.name,
                v.type,
                v.issn,
                v.eissn,
                NULL AS scopus_source_id,
                v.publisher_id,
                v.impact_factor,
                NULL AS citescore,
                NULL AS sjr,
                NULL AS snip,
                v.created_at,
                v.updated_at,
                v.open_access,
                v.aggregation_type,
                v.coverage_start_year,
                v.coverage_end_year,
                v.is_indexed_in_scopus,
                v.\`2yr_mean_citedness\` AS two_year_mean_citedness,
                NULL AS homepage_url,
                NULL AS country_code,
                NULL AS is_in_doaj,
                COALESCE(v.works_count, 0) as works_count,
                NULL as publisher_name,
                NULL as publisher_type,
                NULL as publisher_country
              FROM venues v
              WHERE v.name LIKE ?
              ${type ? 'AND v.type = ?' : ''}
              ORDER BY works_count DESC, v.name ASC
              LIMIT ? OFFSET ?
            `;
            return await sequelize.query(fallbackQuery, {
              replacements: listParams,
              type: sequelize.QueryTypes.SELECT
            });
          }
          throw err;
        }
      };

      const [rawVenues, countResult] = await Promise.all([
        executeSearchQuery(),
        sequelize.query(countQuery, {
          replacements: countParams,
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      const enrichedList = await this._enrichVenues(
        rawVenues.map((row) => ({
          ...row,
          impact_factor: toNullableFloat(row.impact_factor),
          citescore: toNullableFloat(row.citescore),
          sjr: toNullableFloat(row.sjr),
          snip: toNullableFloat(row.snip),
          open_access: toNullableBoolean(row.open_access),
          is_in_doaj: toNullableBoolean(row.is_in_doaj)
        })),
        { includeSubjects: true }
      );

      const warnings = Array.isArray(enrichedList.warnings) ? [...enrichedList.warnings] : [];
      const venues = enrichedList.map((venue) =>
        formatVenueListItem(venue, { includeLegacyMetrics: normalizedOptions.includeLegacyMetrics })
      );

      const total = toInt(countResult?.[0]?.total, 0);
      const paginationData = createPagination(currentPage, currentLimit, total);

      const meta = {
        source: 'mariadb',
        query: query
      };
      if (type) {
        meta.filters = { type };
      }
      if (warnings.length) {
        meta.warnings = Array.from(new Set(warnings));
      }

      const result = {
        data: venues,
        pagination: paginationData,
        meta: Object.keys(meta).length ? meta : undefined
      };

      await cacheService.set(cacheKey, result, 3600);
      logger.info(`Found ${venues.length} venues for search "${query}"`);
      
      return result;
    } catch (error) {
      logger.error(`Error searching venues for "${query}":`, error);
      throw error;
    }
  }

  async getVenues(options = {}) {
    const pagination = normalizePagination(options);
    const minId = options.min_id !== undefined && options.min_id !== null
      ? parseInt(options.min_id, 10)
      : undefined;

    const normalizedOptions = {
      ...options,
      ...pagination,
      includeLegacyMetrics: Boolean(options.includeLegacyMetrics || options.includeLegacy),
      min_id: Number.isInteger(minId) && minId > 0 ? minId : undefined
    };

    const cacheKey = `venues:list:${JSON.stringify(normalizedOptions)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Venues list retrieved from cache');
        return cached;
      }

      const result = await this.getVenuesMariaDB(normalizedOptions);
      await cacheService.set(cacheKey, result, 7200);
      return result;
    } catch (error) {
      logger.error('Error fetching venues:', error);
      throw error;
    }
  }

  /**
   * Phase 2 (Revised): Direct MariaDB venues retrieval for guaranteed consistency
   * Eliminates Sphinx dependency and ensures roundtrip reliability
   */
  async getVenuesMariaDB(options = {}) {
    const {
      page = 1,
      limit = 20,
      offset = 0,
      type,
      search,
      sortBy,
      sortOrder,
      includeLegacyMetrics = false,
      min_id
    } = options;

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const currentLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
    const currentOffset = Math.max(0, parseInt(offset, 10) || 0);

    const filterConditions = [];
    const filterParams = [];

    const normalizedMinId = Number.isInteger(min_id) ? min_id : (Number.isInteger(parseInt(min_id, 10)) ? parseInt(min_id, 10) : undefined);
    if (Number.isInteger(normalizedMinId) && normalizedMinId > 0) {
      filterConditions.push('v.id >= ?');
      filterParams.push(normalizedMinId);
    }

    if (type) {
      filterConditions.push('v.type = ?');
      filterParams.push(type);
    }

    if (search && search.trim().length > 0) {
      const term = `%${search.trim()}%`;
      filterConditions.push('(v.name LIKE ? OR v.issn LIKE ? OR v.eissn LIKE ?)');
      filterParams.push(term, term, term);
    }

    const whereClause = filterConditions.length ? `WHERE ${filterConditions.join(' AND ')}` : '';

    const sortFields = {
      name: 'v.name',
      type: 'v.type',
      impact_factor: 'v.impact_factor',
      works_count: 'COALESCE(v.works_count, 0)',
      id: 'v.id'
    };

    const normalizedSortBy = typeof sortBy === 'string' ? sortBy.toLowerCase() : 'id';
    const finalSortField = sortFields[normalizedSortBy] || sortFields.id;
    const normalizedSortOrder = typeof sortOrder === 'string' ? sortOrder.toUpperCase() : 'ASC';
    const finalSortOrder = normalizedSortOrder === 'DESC' ? 'DESC' : 'ASC';

    const venuesQuery = `
      SELECT 
        v.id,
        v.name,
        v.type,
        v.issn,
        v.eissn,
        v.scopus_id AS scopus_source_id,
        v.publisher_id,
        v.impact_factor,
        v.citescore,
        v.sjr,
        v.snip,
        v.created_at,
        v.updated_at,
        v.open_access,
        v.aggregation_type,
        v.coverage_start_year,
        v.coverage_end_year,
        v.is_indexed_in_scopus,
        v.\`2yr_mean_citedness\` AS two_year_mean_citedness,
        v.homepage_url,
        v.country_code,
        v.is_in_doaj,
        COALESCE(v.works_count, 0) AS works_count,
        pub.name as publisher_name,
        pub.type as publisher_type,
        pub.country_code as publisher_country
      FROM venues v
      LEFT JOIN organizations pub ON v.publisher_id = pub.id
      ${whereClause}
      ORDER BY ${finalSortField} ${finalSortOrder}, v.name ASC
      LIMIT ? OFFSET ?
    `;

    const listParams = [...filterParams, currentLimit, currentOffset];
    const countParams = [...filterParams];

    try {
      const executeVenuesQuery = async () => {
        try {
          return await sequelize.query(venuesQuery, {
            replacements: listParams,
            type: sequelize.QueryTypes.SELECT
          });
        } catch (err) {
          const code = err?.original?.code || err?.parent?.code || err?.code;
          if (code === 'ER_BAD_FIELD_ERROR' || code === '42S22') {
            logger.warn('Venues list query falling back to minimal schema', { error: err.message });
            const fallbackVenuesQuery = `
              SELECT 
                v.id,
                v.name,
                v.type,
                v.issn,
                v.eissn,
                NULL AS scopus_source_id,
                v.publisher_id,
                v.impact_factor,
                NULL AS citescore,
                NULL AS sjr,
                NULL AS snip,
                v.created_at,
                v.updated_at,
                v.open_access,
                v.aggregation_type,
                v.coverage_start_year,
                v.coverage_end_year,
                v.is_indexed_in_scopus,
                v.\`2yr_mean_citedness\` AS two_year_mean_citedness,
                NULL AS homepage_url,
                NULL AS country_code,
                NULL AS is_in_doaj,
                COALESCE(v.works_count, 0) AS works_count,
                NULL as publisher_name,
                NULL as publisher_type,
                NULL as publisher_country
              FROM venues v
              ${whereClause}
              ORDER BY ${finalSortField} ${finalSortOrder}, v.name ASC
              LIMIT ? OFFSET ?
            `;
            return await sequelize.query(fallbackVenuesQuery, {
              replacements: listParams,
              type: sequelize.QueryTypes.SELECT
            });
          }
          throw err;
        }
      };

      const [rawVenues, countResult] = await Promise.all([
        executeVenuesQuery(),
        sequelize.query(`
          SELECT COUNT(*) as total 
          FROM venues v
          ${whereClause}
        `, {
          replacements: countParams,
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      const enrichedList = await this._enrichVenues(
        rawVenues.map((row) => ({
          id: row.id,
          name: row.name,
          type: row.type,
          issn: row.issn,
          eissn: row.eissn,
          scopus_source_id: row.scopus_source_id,
          publisher_id: row.publisher_id,
          impact_factor: toNullableFloat(row.impact_factor),
          citescore: toNullableFloat(row.citescore),
          sjr: toNullableFloat(row.sjr),
          snip: toNullableFloat(row.snip),
          created_at: row.created_at,
          updated_at: row.updated_at,
          open_access: toNullableBoolean(row.open_access),
          aggregation_type: row.aggregation_type,
          coverage_start_year: row.coverage_start_year,
          coverage_end_year: row.coverage_end_year,
          homepage_url: row.homepage_url,
          country_code: row.country_code,
          is_in_doaj: toNullableBoolean(row.is_in_doaj),
          is_indexed_in_scopus: toNullableBoolean(row.is_indexed_in_scopus),
          two_year_mean_citedness: toNullableFloat(row.two_year_mean_citedness),
          works_count: toInt(row.works_count, 0),
          publisher_name: row.publisher_name,
          publisher_type: row.publisher_type,
          publisher_country: row.publisher_country,
        })),
        { includeSubjects: true }
      );

      const warnings = Array.isArray(enrichedList.warnings) ? [...enrichedList.warnings] : [];
      const venues = enrichedList.map((venue) =>
        formatVenueListItem(venue, { includeLegacyMetrics })
      );

      const total = toInt(countResult?.[0]?.total, 0);
      const paginationData = createPagination(currentPage, currentLimit, total);

      const meta = {
        source: 'mariadb',
        sort: {
          by: Object.prototype.hasOwnProperty.call(sortFields, normalizedSortBy) ? normalizedSortBy : 'id',
          order: finalSortOrder
        }
      };

      const filters = {};
      if (type) filters.type = type;
      if (search) filters.search = search;
      if (Number.isInteger(normalizedMinId) && normalizedMinId > 0) filters.min_id = normalizedMinId;
      if (Object.keys(filters).length) {
        meta.filters = filters;
      }

      if (warnings.length) {
        meta.warnings = Array.from(new Set(warnings));
      }

      if (!meta.filters) {
        delete meta.filters;
      }
      if (!warnings.length) {
        delete meta.warnings;
      }

      return {
        data: venues,
        pagination: paginationData,
        meta: Object.keys(meta).length ? meta : undefined
      };
    } catch (error) {
      logger.error('MariaDB venues retrieval failed:', error);
      throw error;
    }
  }

  /**
   * @deprecated - Sphinx method kept for reference but no longer used
   * Phase 2: High-performance venues retrieval using Sphinx venues_metrics_poc index
   * Solves 2.7s -> ~20ms performance improvement (135x faster)
   */
  async getVenuesSphinx(options = {}) {
    const pagination = normalizePagination(options);
    const { page, limit, offset } = pagination;
    const { type, sortBy, sortOrder } = options;
    const cacheKey = `venues:sphinx:${JSON.stringify(options)}`;

    try {
      const sphinxResponse = await sphinxService.getAllVenues({
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        type,
        sortBy,
        sortOrder
      });

      // Reconcile Sphinx IDs against MariaDB to avoid 404 on details
      const sphinxIds = Array.from(new Set((sphinxResponse.venues || []).map(v => v.id).filter(Boolean)));
      let existingIdSet = new Set(sphinxIds);
      let reconciliationWarnings = [];
      if (sphinxIds.length > 0) {
        try {
          const placeholders = sphinxIds.map(() => '?').join(',');
          const rows = await sequelize.query(
            `SELECT id FROM venues WHERE id IN (${placeholders})`,
            { replacements: sphinxIds, type: sequelize.QueryTypes.SELECT }
          );
          const validIds = new Set(rows.map(r => r.id));
          const missing = sphinxIds.filter(id => !validIds.has(id));
          if (missing.length > 0) {
            const rate = (missing.length / sphinxIds.length) * 100;
            const msg = `Reconciliation dropped ${missing.length}/${sphinxIds.length} IDs not found in DB`;
            reconciliationWarnings.push(`Partial data due to reconciliation: ${msg}`);
            if (rate > 5) {
              logger.error(msg, { rate: `${rate.toFixed(2)}%`, missing: missing.slice(0, 10) });
            } else {
              logger.warn(msg, { rate: `${rate.toFixed(2)}%`, missing: missing.slice(0, 10) });
            }
          }
          existingIdSet = validIds;
        } catch (reconErr) {
          logger.warn('Reconciliation step failed; using Sphinx IDs as-is', { error: reconErr.message });
        }
      }

      let venues = sphinxResponse.venues
        .filter(v => existingIdSet.has(v.id))
        .map(venue => ({
        ...venue,
        metrics: {
          works_count: toInt(venue.metrics?.works_count ?? venue.works_count ?? 0),
          publications_count: toInt(venue.metrics?.works_count ?? venue.works_count ?? 0),
          unique_authors: toInt(venue.metrics?.unique_authors ?? 0),
          first_publication_year: venue.metrics?.first_publication_year ?? null,
          latest_publication_year: venue.metrics?.latest_publication_year ?? null,
        },
      }));

      venues = await this._enrichVenues(venues, { includeSubjects: true });

      // Compute total from MariaDB for consistency with statistics
      let totalFromDb = sphinxResponse.total;
      try {
        const [countRow] = await sequelize.query(
          `SELECT COUNT(*) as total FROM venues ${type ? 'WHERE type = ?' : ''}`,
          { replacements: type ? [type] : [], type: sequelize.QueryTypes.SELECT }
        );
        totalFromDb = countRow.total;
      } catch (e) {
        logger.warn('Failed to get total venues from DB; using Sphinx total');
      }

      const meta = {};
      const combinedWarnings = [];
      if (Array.isArray(venues.warnings) && venues.warnings.length) combinedWarnings.push(...venues.warnings);
      if (reconciliationWarnings.length) combinedWarnings.push(...reconciliationWarnings);
      if (combinedWarnings.length) meta.warnings = Array.from(new Set(combinedWarnings));

      const result = {
        venues,
        pagination: createPagination(page, limit, totalFromDb),
        search_engine: 'sphinx',
        performance_note: `Phase 2: Sphinx query completed in ${sphinxResponse.query_time}ms`,
        ...(Object.keys(meta).length ? { meta } : {})
     };

      await cacheService.set(cacheKey, result, 7200);
      logger.info(`Venues Sphinx retrieval: ${sphinxResponse.venues.length} venues in ${sphinxResponse.query_time}ms`);
      
      return result;

    } catch (error) {
      logger.error('Sphinx venues retrieval failed:', error);
      throw error;
    }
  }

  /**
   * Fallback method using original MariaDB approach with ID reconciliation
   */
  async getVenuesFallback(options = {}) {
    const pagination = normalizePagination(options);
    const { page, limit, offset } = pagination;
    const { type, sortBy, sortOrder } = options;
    
    logger.warn('Using MariaDB fallback for venues retrieval');

    let whereClause = '';
    const replacements = [];
    
    if (type) {
      whereClause = 'WHERE v.type = ?';
      replacements.push(type);
    }

    // Original fallback query without expensive subqueries
    const sortFields = {
      name: 'v.name',
      type: 'v.type',
      impact_factor: 'v.impact_factor',
      works_count: 'works_count'
    };

    const normalizedSortBy = typeof sortBy === 'string' ? sortBy.toLowerCase() : 'name';
    const finalSortField = sortFields[normalizedSortBy] || sortFields.name;
    const normalizedSortOrder = typeof sortOrder === 'string' ? sortOrder.toUpperCase() : 'ASC';
    const finalSortOrder = normalizedSortOrder === 'DESC' ? 'DESC' : 'ASC';

    const venuesQuery = `
      SELECT 
        v.id,
        v.name,
        v.type,
        v.issn,
        v.eissn,
        v.publisher_id,
        v.impact_factor,
        v.created_at,
        v.updated_at,
        v.last_validated_at,
        v.validation_status,
        v.citescore,
        v.sjr,
        v.snip,
        v.open_access,
        v.aggregation_type,
        v.coverage_start_year,
        v.coverage_end_year,
        COALESCE(v.works_count, 0) AS works_count,
        pub.name as publisher_name,
        pub.type as publisher_type,
        pub.country_code as publisher_country
      FROM venues v
      LEFT JOIN organizations pub ON v.publisher_id = pub.id
      ${whereClause}
      ORDER BY ${finalSortField} ${finalSortOrder}, v.name ASC
      LIMIT ? OFFSET ?
    `;
    
    replacements.push(parseInt(limit), parseInt(offset));

    const [rawVenues, countResult] = await Promise.all([
      sequelize.query(venuesQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      }),
      sequelize.query(`
        SELECT COUNT(*) as total 
        FROM venues v
        ${whereClause}
      `, {
        replacements: type ? [type] : [],
        type: sequelize.QueryTypes.SELECT
      })
    ]);

    const enrichedList = await this._enrichVenues(
      rawVenues.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        issn: row.issn,
        eissn: row.eissn,
        publisher_id: row.publisher_id,
        impact_factor: toNullableFloat(row.impact_factor),
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_validated_at: row.last_validated_at,
        validation_status: row.validation_status,
        citescore: toNullableFloat(row.citescore),
        sjr: toNullableFloat(row.sjr),
        snip: toNullableFloat(row.snip),
        open_access: toNullableBoolean(row.open_access),
        aggregation_type: row.aggregation_type,
        coverage_start_year: row.coverage_start_year,
        coverage_end_year: row.coverage_end_year,
        works_count: toInt(row.works_count, 0),
        publisher_name: row.publisher_name,
        publisher_type: row.publisher_type,
        publisher_country: row.publisher_country,
      })),
      { includeSubjects: true }
    );
    const venues = enrichedList.map(v => formatVenueListItem(v));

    const total = countResult[0].total;
    const result = {
      venues,
      pagination: createPagination(page, limit, total),
      search_engine: 'mariadb_fallback',
      performance_note: 'Using MariaDB fallback due to Sphinx error'
    };
    if (Array.isArray(venues.warnings) && venues.warnings.length) {
      result.meta = { warnings: Array.from(new Set(venues.warnings)) };
    }
    return result;
  }

  async getVenueById(id, options = {}) {
    const includeSubjects = options.includeSubjects !== undefined ? Boolean(options.includeSubjects) : true;
    const includeYearly = options.includeYearly !== undefined ? Boolean(options.includeYearly) : true;
    const includeTopAuthors = options.includeTopAuthors !== undefined ? Boolean(options.includeTopAuthors) : true;
    const includeLegacyMetrics = Boolean(options.includeLegacyMetrics || options.includeLegacy || true);
    const includeRecentWorks = options.includeRecentWorks !== undefined ? Boolean(options.includeRecentWorks) : true;

    const cacheKey = `venue:${id}:${JSON.stringify({
      includeSubjects,
      includeYearly,
      includeTopAuthors,
      includeLegacyMetrics,
      includeRecentWorks
    })}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Venue ${id} retrieved from cache`);
        return cached;
      }

      const enrichmentMap = await this._fetchVenueEnrichment([id], {
        includeUniqueAuthors: true,
        includeSubjects,
        includeYearly,
        includeTopAuthors
      });
      const enrichment = enrichmentMap.get(id);

      if (!enrichment) {
        return null;
      }

      const venuePayload = this._mergeVenueData({}, enrichment);

      // Optionally load recent works (latest 10 publications)
      let recentWorks = [];
      if (includeRecentWorks) {
        try {
          const works = await sequelize.query(`
            SELECT 
              w.id,
              w.title,
              w.subtitle,
              w.work_type,
              w.language,
              p.year,
              p.volume,
              p.issue,
              p.pages,
              p.doi,
              p.peer_reviewed,
              p.publication_date
            FROM publications p
            JOIN works w ON w.id = p.work_id
            WHERE p.venue_id = ?
            ORDER BY p.year DESC, p.id DESC
            LIMIT 10
          `, {
            replacements: [parseInt(id, 10)],
            type: sequelize.QueryTypes.SELECT
          });

          const workIds = works.map(w => w.id);
          let authorsData = [];
          if (workIds.length > 0) {
            authorsData = await sequelize.query(`
              SELECT 
                a.work_id,
                a.person_id,
                a.position,
                a.is_corresponding,
                COALESCE(p.preferred_name, CONCAT(COALESCE(p.given_names, ''), ' ', COALESCE(p.family_name, ''))) as name
              FROM authorships a
              LEFT JOIN persons p ON a.person_id = p.id
              WHERE a.work_id IN (${workIds.map(() => '?').join(',')})
              ORDER BY a.work_id, a.position
              LIMIT 1000
            `, {
              replacements: workIds,
              type: sequelize.QueryTypes.SELECT
            });
          }
          const authorsByWork = {};
          authorsData.forEach(a => {
            if (!authorsByWork[a.work_id]) authorsByWork[a.work_id] = [];
            authorsByWork[a.work_id].push({
              person_id: a.person_id,
              name: (a.name || '').trim() || 'Unknown Author',
              position: a.position || 0,
              is_corresponding: toNullableBoolean(a.is_corresponding)
            });
          });
          recentWorks = works.map(w => ({
            id: w.id,
            title: w.title,
            subtitle: w.subtitle,
            type: w.work_type,
            language: w.language,
            year: w.year,
            volume: w.volume,
            issue: w.issue,
            pages: w.pages,
            doi: w.doi,
            peer_reviewed: Boolean(w.peer_reviewed),
            publication_date: w.publication_date,
            author_count: (authorsByWork[w.id] || []).length,
            authors: (authorsByWork[w.id] || []).sort((a,b) => a.position - b.position)
          }));
        } catch (e) {
          logger.warn(`Recent works load failed for venue ${id}: ${e.message}`);
        }
      }

      const formatted = formatVenueDetails(venuePayload, {
        includeLegacyMetrics,
        includeSubjects,
        includeYearlyStats: includeYearly,
        includeTopAuthors,
        recentWorks
      });

      let warnings = Array.isArray(this._lastEnrichmentWarnings)
        ? Array.from(new Set(this._lastEnrichmentWarnings))
        : [];
      // Do not expose expected base-schema fallbacks as warnings
      warnings = warnings.filter(w => !/Partial enrichment: base reduced/i.test(w));

      const response = { data: formatted };
      if (warnings.length) response.meta = { warnings };

      await cacheService.set(cacheKey, response, 7200);
      logger.info(`Retrieved venue ${id} with enriched metrics`, {
        includeSubjects,
        includeYearly,
        includeTopAuthors
      });
      
      return response;

    } catch (error) {
      logger.error(`Error fetching venue ${id}:`, error);
      throw error;
    }
  }

  async getVenueWorks(venueId, options = {}) {
    const pagination = normalizePagination(options);
    const { page, limit, offset } = pagination;
    const { year = null } = options;
    const cacheKey = `venue:${venueId}:works:${JSON.stringify(options)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Venue ${venueId} works retrieved from cache`);
        return cached;
      }

      // Build where clause
      let whereClause = 'WHERE p.venue_id = ?';
      const params = [parseInt(venueId)];

      if (year) {
        whereClause += ' AND p.year = ?';
        params.push(parseInt(year));
      }

      // Get works
      const worksQuery = `
        SELECT 
          w.id,
          w.title,
          w.subtitle,
          w.work_type,
          w.language,
          p.year,
          p.volume,
          p.issue,
          p.pages,
          p.doi,
          p.peer_reviewed,
          p.publication_date
        FROM works w
        INNER JOIN publications p ON w.id = p.work_id
        ${whereClause}
        ORDER BY p.year DESC, w.id DESC
        LIMIT ? OFFSET ?
      `;

      params.push(parseInt(limit), parseInt(offset));

      const [works, countResult] = await Promise.all([
        sequelize.query(worksQuery, {
          replacements: params,
          type: sequelize.QueryTypes.SELECT
        }),
        sequelize.query(`
          SELECT COUNT(*) as total
          FROM works w
          INNER JOIN publications p ON w.id = p.work_id
          ${whereClause}
        `, {
          replacements: params.slice(0, -2), // Remove limit and offset for count
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      // Get authors for the returned works (simplified query first)
      const workIds = works.map(w => w.id);
      let authorsData = [];
      
      if (workIds.length > 0) {
        try {
          authorsData = await sequelize.query(`
            SELECT 
              a.work_id,
              a.person_id,
              a.position,
              a.is_corresponding,
              COALESCE(p.preferred_name, CONCAT(COALESCE(p.given_names, ''), ' ', COALESCE(p.family_name, ''))) as name
            FROM authorships a
            LEFT JOIN persons p ON a.person_id = p.id
            WHERE a.work_id IN (${workIds.map(() => '?').join(',')})
            ORDER BY a.work_id, a.position
            LIMIT 1000
          `, {
            replacements: workIds,
            type: sequelize.QueryTypes.SELECT
          });
          
          logger.info(`Found ${authorsData.length} authors for ${workIds.length} works`);
        } catch (authorError) {
          logger.error('Error fetching authors:', authorError);
          authorsData = [];
        }
      }

      // Group authors by work_id (simplified)
      const authorsByWork = {};
      authorsData.forEach(author => {
        if (!authorsByWork[author.work_id]) {
          authorsByWork[author.work_id] = [];
        }
        authorsByWork[author.work_id].push({
          person_id: author.person_id,
          name: (author.name || '').trim() || 'Unknown Author',
          position: author.position || 0,
          is_corresponding: toNullableBoolean(author.is_corresponding)
        });
      });

      // Process works with authors
      const worksWithAuthors = works.map(work => {
        const authors = (authorsByWork[work.id] || []).sort((a, b) => a.position - b.position);
        
        return {
          id: work.id,
          title: work.title,
          subtitle: work.subtitle,
          type: work.work_type,
          language: work.language,
          year: work.year,
          volume: work.volume,
          issue: work.issue,
          pages: work.pages,
          doi: work.doi,
          peer_reviewed: Boolean(work.peer_reviewed),
          publication_date: work.publication_date,
          author_count: authors.length,
          authors: authors
        };
      });

      const total = countResult[0].total;
      const result = {
        data: worksWithAuthors,
        pagination: createPagination(page, limit, total)
      };

      await cacheService.set(cacheKey, result, 3600);
      logger.info(`Retrieved ${works.length} works for venue ${venueId}`);
      
      return result;

    } catch (error) {
      logger.error(`Error fetching works for venue ${venueId}:`, error);
      throw error;
    }
  }

  async getVenueStatistics() {
    const cacheKey = 'venues:statistics';
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Venue statistics retrieved from cache');
        return cached;
      }

      const query = `
        SELECT 
          COUNT(*) as total_venues,
          COUNT(CASE WHEN type = 'JOURNAL' THEN 1 END) as journals,
          COUNT(CASE WHEN type = 'CONFERENCE' THEN 1 END) as conferences,
          COUNT(CASE WHEN type = 'REPOSITORY' THEN 1 END) as repositories,
          COUNT(CASE WHEN type = 'BOOK_SERIES' THEN 1 END) as book_series,
          COUNT(CASE WHEN impact_factor IS NOT NULL THEN 1 END) as with_impact_factor,
          AVG(impact_factor) as avg_impact_factor,
          MAX(impact_factor) as max_impact_factor,
          MIN(impact_factor) as min_impact_factor
        FROM venues v
      `;

      const [stats] = await sequelize.query(query, {
        type: sequelize.QueryTypes.SELECT
      });

      await cacheService.set(cacheKey, stats, 86400); // Cache for 24 hours
      logger.info('Retrieved venue statistics');
      
      return stats;

    } catch (error) {
      logger.error('Error fetching venue statistics:', error);
      throw error;
    }
  }
}

module.exports = new VenuesService();
