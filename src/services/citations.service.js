const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination } = require('../utils/pagination');

class CitationsService {
  async getWorkCitations(workId, filters = {}) {
    const { page = 1, limit = 20, type = 'all' } = filters;
    const offset = (page - 1) * limit;
    
    const cacheKey = `citations:${workId}:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Citations for work ${workId} retrieved from cache`);
        return cached;
      }

      // Buscar obras que citam este work (incoming citations) usando hidratação via sphinx_works_summary
      const whereConditions = ['c.cited_work_id = :workId'];
      const replacements = { workId: parseInt(workId), limit: parseInt(limit), offset: parseInt(offset) };
      if (type !== 'all' && ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'SELF'].includes(String(type).toUpperCase())) {
        whereConditions.push('c.citation_type = :type');
        replacements.type = String(type).toUpperCase();
      }
      const whereClause = whereConditions.join(' AND ');

      const citingRows = await sequelize.query(`
        SELECT 
          c.citing_work_id,
          MIN(c.citation_type) AS citation_type,
          MIN(c.citation_context) AS citation_context
        FROM citations c
        WHERE ${whereClause}
        GROUP BY c.citing_work_id
        ORDER BY c.citing_work_id DESC
        LIMIT :limit OFFSET :offset
      `, { replacements, type: sequelize.QueryTypes.SELECT });

      const [countRow] = await sequelize.query(`
        SELECT COUNT(DISTINCT c.citing_work_id) AS total
        FROM citations c
        WHERE ${whereClause}
      `, { replacements: Object.fromEntries(Object.entries(replacements).filter(([k]) => !['limit','offset'].includes(k))), type: sequelize.QueryTypes.SELECT });
      const total = parseInt(countRow?.total || 0);

      const ids = citingRows.map(r => r.citing_work_id);
      let sphinxMap = {};
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        const sphinxRows = await sequelize.query(
          `SELECT id, title, year, work_type, doi, author_string FROM sphinx_works_summary WHERE id IN (${placeholders})`,
          { replacements: ids, type: sequelize.QueryTypes.SELECT }
        );
        sphinxMap = sphinxRows.reduce((acc, row) => { acc[row.id] = row; return acc; }, {});
      }
      const citingWorks = citingRows.map(row => {
        const sw = sphinxMap[row.citing_work_id] || {};
        const authorsCount = sw.author_string ? sw.author_string.split(';').filter(Boolean).length : 0;
        const context = row.citation_context ? (row.citation_context.length > 200 ? row.citation_context.substring(0,200) + '...' : row.citation_context) : null;
        return {
          citing_work_id: row.citing_work_id,
          title: sw.title || null,
          type: sw.work_type || null,
          year: sw.year || null,
          doi: sw.doi || null,
          authors_count: authorsCount,
          citation: { type: row.citation_type || null, context }
        };
      });
      const totalPages = Math.ceil(total / limit);

      const result = {
        work_id: parseInt(workId),
        citing_works: citingWorks,
        pagination: createPagination(parseInt(page), parseInt(limit), parseInt(total)),
        filters: {
          type: type
        }
      };

      await cacheService.set(cacheKey, result, 300);
      logger.info(`Citations for work ${workId} cached: ${total} citing works`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching citations for work ${workId}:`, error);
      throw error;
    }
  }

  async getWorkReferences(workId, filters = {}) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    const cacheKey = `references:${workId}:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`References for work ${workId} retrieved from cache`);
        return cached;
      }

      // Buscar obras citadas por este work (outgoing) com hidratação via sphinx_works_summary
      const referencedRows = await sequelize.query(`
        SELECT 
          c.cited_work_id,
          MIN(c.citation_type) AS citation_type,
          MIN(c.citation_context) AS citation_context
        FROM citations c
        WHERE c.citing_work_id = :workId
        GROUP BY c.cited_work_id
        ORDER BY c.cited_work_id DESC
        LIMIT :limit OFFSET :offset
      `, { replacements: { workId: parseInt(workId), limit: parseInt(limit), offset: parseInt(offset) }, type: sequelize.QueryTypes.SELECT });

      const [refCount] = await sequelize.query(`
        SELECT COUNT(DISTINCT c.cited_work_id) AS total
        FROM citations c
        WHERE c.citing_work_id = :workId
      `, { replacements: { workId: parseInt(workId) }, type: sequelize.QueryTypes.SELECT });
      const total = parseInt(refCount?.total || 0);

      const refIds = referencedRows.map(r => r.cited_work_id);
      let refSphinxMap = {};
      if (refIds.length) {
        const placeholders = refIds.map(() => '?').join(',');
        const sphinxRows = await sequelize.query(
          `SELECT id, title, year, work_type, doi, author_string FROM sphinx_works_summary WHERE id IN (${placeholders})`,
          { replacements: refIds, type: sequelize.QueryTypes.SELECT }
        );
        refSphinxMap = sphinxRows.reduce((acc, row) => { acc[row.id] = row; return acc; }, {});
      }
      const referencedWorks = referencedRows.map(row => {
        const sw = refSphinxMap[row.cited_work_id] || {};
        const authorsCount = sw.author_string ? sw.author_string.split(';').filter(Boolean).length : 0;
        const context = row.citation_context ? (row.citation_context.length > 200 ? row.citation_context.substring(0,200) + '...' : row.citation_context) : null;
        return {
          cited_work_id: row.cited_work_id,
          title: sw.title || null,
          type: sw.work_type || null,
          year: sw.year || null,
          doi: sw.doi || null,
          authors_count: authorsCount,
          citation: { type: row.citation_type || null, context }
        };
      });
      const totalPages = Math.ceil(total / limit);

      const result = {
        work_id: parseInt(workId),
        referenced_works: referencedWorks,
        pagination: createPagination(parseInt(page), parseInt(limit), parseInt(total))
      };

      await cacheService.set(cacheKey, result, 300);
      logger.info(`References for work ${workId} cached: ${total} referenced works`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching references for work ${workId}:`, error);
      throw error;
    }
  }

  async getWorkMetrics(workId) {
    const cacheKey = `metrics:work:${workId}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Metrics for work ${workId} retrieved from cache`);
        return cached;
      }

      // First, check if the work exists (cheap guard to avoid expensive joins)
      const workExists = await sequelize.query(
        'SELECT id, title, work_type FROM works WHERE id = :workId LIMIT 1',
        { replacements: { workId: parseInt(workId) }, type: sequelize.QueryTypes.SELECT }
      );

      if (!workExists || workExists.length === 0) {
        return null;
      }

      const [metricsData] = await Promise.all([
        sequelize.query(`
          SELECT 
            w.id as work_id,
            w.title,
            w.work_type,
            pub.year,
            COALESCE(cite_stats.total_citations_received, 0) as total_citations_received,
            COALESCE(ref_stats.total_references_made, 0) as total_references_made,
            COALESCE(cite_stats.unique_citing_works, 0) as unique_citing_works,
            COALESCE(cite_stats.positive_citations, 0) as positive_citations,
            COALESCE(cite_stats.neutral_citations, 0) as neutral_citations,
            COALESCE(cite_stats.negative_citations, 0) as negative_citations,
            COALESCE(cite_stats.self_citations, 0) as self_citations,
            cite_stats.first_citation_year,
            cite_stats.latest_citation_year
             
          FROM works w
          LEFT JOIN publications pub ON w.id = pub.work_id
          LEFT JOIN (
            SELECT 
              cited_work_id,
              COUNT(*) as total_citations_received,
              COUNT(DISTINCT citing_work_id) as unique_citing_works,
              SUM(CASE WHEN citation_type = 'POSITIVE' THEN 1 ELSE 0 END) as positive_citations,
              SUM(CASE WHEN citation_type = 'NEUTRAL' THEN 1 ELSE 0 END) as neutral_citations,
              SUM(CASE WHEN citation_type = 'NEGATIVE' THEN 1 ELSE 0 END) as negative_citations,
              SUM(CASE WHEN citation_type = 'SELF' THEN 1 ELSE 0 END) as self_citations,
              MIN(citing_pub.year) as first_citation_year,
              MAX(citing_pub.year) as latest_citation_year
            FROM citations c
            LEFT JOIN works citing_w ON c.citing_work_id = citing_w.id
            LEFT JOIN publications citing_pub ON citing_w.id = citing_pub.work_id
            WHERE c.cited_work_id = :workId
            GROUP BY c.cited_work_id
          ) cite_stats ON w.id = cite_stats.cited_work_id
          LEFT JOIN (
            SELECT 
              citing_work_id,
              COUNT(*) as total_references_made
            FROM citations
            WHERE citing_work_id = :workId
            GROUP BY citing_work_id
          ) ref_stats ON w.id = ref_stats.citing_work_id
          WHERE w.id = :workId
        `, {
          replacements: { workId: parseInt(workId) },
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      if (!metricsData || metricsData.length === 0) {
        return null;
      }

      const metrics = metricsData[0];
      
      // Calculate impact metrics
      const citationsPerYear = metrics.year && metrics.first_citation_year ? 
        Math.max(1, new Date().getFullYear() - metrics.first_citation_year) : 1;
      
      const result = {
        work_id: parseInt(workId),
        title: metrics.title,
        type: metrics.work_type,
        publication_year: metrics.year,
        citation_metrics: {
          total_citations_received: parseInt(metrics.total_citations_received) || 0,
          total_references_made: parseInt(metrics.total_references_made) || 0,
          unique_citing_works: parseInt(metrics.unique_citing_works) || 0,
          citations_per_year: parseFloat((metrics.total_citations_received / citationsPerYear).toFixed(2)),
          citation_types: {
            positive: parseInt(metrics.positive_citations) || 0,
            neutral: parseInt(metrics.neutral_citations) || 0,
            negative: parseInt(metrics.negative_citations) || 0,
            self: parseInt(metrics.self_citations) || 0
          }
        },
        temporal_metrics: {
          first_citation_year: metrics.first_citation_year,
          latest_citation_year: metrics.latest_citation_year,
          citation_span_years: metrics.first_citation_year && metrics.latest_citation_year ? 
            metrics.latest_citation_year - metrics.first_citation_year + 1 : null
        },
        impact_indicators: {
          highly_cited: (metrics.total_citations_received || 0) > 100,
          citation_velocity: metrics.latest_citation_year === new Date().getFullYear() ? 'current' : 
                            metrics.latest_citation_year >= new Date().getFullYear() - 2 ? 'recent' : 'historical'
        }
      };

      await cacheService.set(cacheKey, result, 600);
      logger.info(`Metrics for work ${workId} cached`);
      
      return result;
    } catch (error) {
      // Fail soft: return zeros/unknowns to avoid 500 while keeping observability
      logger.error(`Error fetching metrics for work ${workId}:`, error);
      try {
        const fallback = {
          work_id: parseInt(workId),
          title: null,
          type: null,
          publication_year: null,
          citation_metrics: {
            total_citations_received: 0,
            total_references_made: 0,
            unique_citing_works: 0,
            citations_per_year: 0,
            citation_types: { positive: 0, neutral: 0, negative: 0, self: 0 }
          },
          temporal_metrics: {
            first_citation_year: null,
            latest_citation_year: null,
            citation_span_years: null
          },
          impact_indicators: {
            highly_cited: false,
            citation_velocity: 'unknown'
          }
        };
        await cacheService.set(cacheKey, fallback, 300);
        return fallback;
      } catch (_) {
        return null;
      }
    }
  }

  async getCitationNetwork(workId, depth = 1) {
    const cacheKey = `network:${workId}:depth${depth}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Citation network for work ${workId} retrieved from cache`);
        return cached;
      }

      // Build citation network with specified depth
      let networkData;
      try {
        const [rows] = await Promise.all([
          sequelize.query(`
          WITH RECURSIVE citation_network AS (
            -- Base case: direct citations
            SELECT 
              c.citing_work_id as source_work_id,
              c.cited_work_id as target_work_id,
              1 as depth,
              c.citation_type
            FROM citations c
            WHERE c.cited_work_id = :workId OR c.citing_work_id = :workId
            
            UNION ALL
            
            -- Recursive case: citations of citations (limited depth)
            SELECT 
              c.citing_work_id as source_work_id,
              c.cited_work_id as target_work_id,
              cn.depth + 1,
              c.citation_type
            FROM citations c
            INNER JOIN citation_network cn ON (c.cited_work_id = cn.source_work_id OR c.citing_work_id = cn.target_work_id)
            WHERE cn.depth < :maxDepth
          )
          SELECT 
            cn.source_work_id,
            cn.target_work_id,
            cn.depth,
            cn.citation_type,
            w1.title as source_title,
            w2.title as target_title,
            pub1.year as source_year,
            pub2.year as target_year
          FROM citation_network cn
          LEFT JOIN works w1 ON cn.source_work_id = w1.id
          LEFT JOIN works w2 ON cn.target_work_id = w2.id
          LEFT JOIN publications pub1 ON w1.id = pub1.work_id
          LEFT JOIN publications pub2 ON w2.id = pub2.work_id
          ORDER BY cn.depth, cn.source_work_id, cn.target_work_id
          LIMIT 100
        `, {
            replacements: { workId: parseInt(workId), maxDepth: parseInt(depth) },
            type: sequelize.QueryTypes.SELECT
          })
        ]);
        networkData = rows;
      } catch (cteError) {
        logger.warn('Recursive CTE not available, using 1-depth fallback for citation network', {
          error: cteError.message
        });
        // Fallback: depth-1 direct edges only
        networkData = await sequelize.query(
          `SELECT 
            c.citing_work_id as source_work_id,
            c.cited_work_id as target_work_id,
            1 as depth,
            c.citation_type,
            w1.title as source_title,
            w2.title as target_title,
            pub1.year as source_year,
            pub2.year as target_year
          FROM citations c
          LEFT JOIN works w1 ON c.citing_work_id = w1.id
          LEFT JOIN works w2 ON c.cited_work_id = w2.id
          LEFT JOIN publications pub1 ON w1.id = pub1.work_id
          LEFT JOIN publications pub2 ON w2.id = pub2.work_id
          WHERE c.cited_work_id = :workId OR c.citing_work_id = :workId
          ORDER BY c.citing_work_id, c.cited_work_id
          LIMIT 100`,
          { replacements: { workId: parseInt(workId) }, type: sequelize.QueryTypes.SELECT }
        );
      }

      const result = {
        central_work_id: parseInt(workId),
        network_depth: parseInt(depth),
        nodes: {},
        edges: [],
        network_stats: {
          total_nodes: 0,
          total_edges: networkData.length,
          max_depth: Math.max(...networkData.map(d => d.depth), 0)
        }
      };

      // Process network data
      const nodeSet = new Set();
      
      networkData.forEach(edge => {
        // Add nodes
        nodeSet.add(edge.source_work_id);
        nodeSet.add(edge.target_work_id);
        
        // Add edge
        result.edges.push({
          source: edge.source_work_id,
          target: edge.target_work_id,
          depth: edge.depth,
          citation_type: edge.citation_type,
          source_year: edge.source_year,
          target_year: edge.target_year
        });
        
        // Add node details if not exists
        if (!result.nodes[edge.source_work_id]) {
          result.nodes[edge.source_work_id] = {
            id: edge.source_work_id,
            title: edge.source_title,
            year: edge.source_year,
            is_central: edge.source_work_id === parseInt(workId)
          };
        }
        
        if (!result.nodes[edge.target_work_id]) {
          result.nodes[edge.target_work_id] = {
            id: edge.target_work_id,
            title: edge.target_title,
            year: edge.target_year,
            is_central: edge.target_work_id === parseInt(workId)
          };
        }
      });

      result.network_stats.total_nodes = nodeSet.size;

      await cacheService.set(cacheKey, result, 900);
      logger.info(`Citation network for work ${workId} cached: ${result.network_stats.total_nodes} nodes, ${result.network_stats.total_edges} edges`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching citation network for work ${workId}:`, error);
      // Fail soft
      return {
        central_work_id: parseInt(workId),
        network_depth: parseInt(depth),
        nodes: {},
        edges: [],
        network_stats: {
          total_nodes: 0,
          total_edges: 0,
          max_depth: 0
        }
      };
    }
  }
}

module.exports = new CitationsService();
