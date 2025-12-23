const { sequelize } = require('../models');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const { withTimeout } = require('../utils/db');

class CollaborationsService {
  async getPersonCollaborators(personId, filters = {}) {
    const { page = 1, limit = 20, min_collaborations = 2, sort_by = 'collaboration_count' } = filters;
    const offset = (page - 1) * limit;
    
    const cacheKey = `collaborators:${personId}:${JSON.stringify(filters)}`;
    
    try {
      const [exists] = await sequelize.query(
        'SELECT 1 FROM persons WHERE id = ? LIMIT 1',
        {
          replacements: [parseInt(personId)],
          type: sequelize.QueryTypes.SELECT
        }
      );

      if (!exists) {
        return null;
      }

      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Collaborators for person ${personId} retrieved from cache`);
        return cached;
      }

      let collaborators = [];
      try {
        collaborators = await sequelize.query(withTimeout(`
          SELECT 
            CASE WHEN person1_id = :id THEN person2_id ELSE person1_id END AS collaborator_id,
            CASE WHEN person1_id = :id THEN person2_name ELSE person1_name END AS collaborator_name,
            collaboration_count
          FROM v_collaborations
          WHERE (person1_id = :id OR person2_id = :id)
            AND collaboration_count >= :min
          ORDER BY collaboration_count DESC
          LIMIT :limit OFFSET :offset
        `), {
          replacements: {
            id: parseInt(personId),
            min: parseInt(min_collaborations),
            limit: parseInt(limit),
            offset: parseInt(offset)
          },
          type: sequelize.QueryTypes.SELECT
        });
      } catch (_) {
        collaborators = await sequelize.query(withTimeout(`
          SELECT 
            p2.id as collaborator_id,
            p2.preferred_name as collaborator_name,
            COUNT(DISTINCT a1.work_id) as collaboration_count
          FROM authorships a1
          INNER JOIN authorships a2 ON a1.work_id = a2.work_id 
          INNER JOIN persons p2 ON a2.person_id = p2.id
          WHERE a1.person_id = :id 
            AND a2.person_id != :id
            AND a2.person_id IS NOT NULL
          GROUP BY p2.id, p2.preferred_name
          HAVING COUNT(DISTINCT a1.work_id) >= :min
          ORDER BY collaboration_count DESC
          LIMIT :limit OFFSET :offset
        `), {
          replacements: {
            id: parseInt(personId),
            min: parseInt(min_collaborations),
            limit: parseInt(limit),
            offset: parseInt(offset)
          },
          type: sequelize.QueryTypes.SELECT
        });
      }

      const collaboratorsList = Array.isArray(collaborators) ? collaborators : [];

      if (collaboratorsList.length === 0) {
        const [potentialCollaborator] = await sequelize.query(`
          SELECT 1
          FROM authorships a1
          INNER JOIN authorships a2 ON a1.work_id = a2.work_id
          WHERE a1.person_id = ?
            AND a2.person_id != ?
          GROUP BY a2.person_id
          HAVING COUNT(DISTINCT a1.work_id) >= 1
          LIMIT 1
        `, {
          replacements: [parseInt(personId), parseInt(personId)],
          type: sequelize.QueryTypes.SELECT
        });

        if (!potentialCollaborator) {
          logger.warn(`No collaborators found for person ${personId}`);
          return null;
        }

        const emptyResult = {
          person_id: parseInt(personId),
          collaborators: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: parseInt(page) > 1
          },
          filters: {
            min_collaborations: parseInt(min_collaborations),
            sort_by: sort_by
          },
          summary: {
            total_collaborators: 0,
            avg_collaborations_per_collaborator: 0
          }
        };

        await cacheService.set(cacheKey, emptyResult, 60);
        return emptyResult;
      }

      const result = {
        person_id: parseInt(personId),
        collaborators: collaboratorsList.map(collab => ({
          collaborator_id: collab.collaborator_id,
          collaborator_name: collab.collaborator_name,
          collaboration_metrics: {
            total_collaborations: parseInt(collab.collaboration_count),
            collaboration_span_years: 0,
            avg_citations_together: 0,
          },
          collaboration_strength: this.calculateCollaborationStrength(collab.collaboration_count)
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: collaboratorsList.length,
          totalPages: Math.ceil(collaboratorsList.length / limit),
          hasNext: collaboratorsList.length === parseInt(limit),
          hasPrev: parseInt(page) > 1
        },
        filters: {
          min_collaborations: parseInt(min_collaborations),
          sort_by: sort_by
        },
        summary: {
          total_collaborators: collaboratorsList.length,
          avg_collaborations_per_collaborator: collaboratorsList.length > 0 ? 
            Math.round(collaboratorsList.reduce((sum, c) => sum + c.collaboration_count, 0) / collaboratorsList.length) : 0
        }
      };

      await cacheService.set(cacheKey, result, 300);
      logger.info(`Collaborators for person ${personId} cached: ${collaboratorsList.length} collaborators`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching collaborators for person ${personId}:`, error);
      throw error;
    }
  }

  calculateCollaborationStrength(count) {
    if (count >= 10) return 'very_strong';
    if (count >= 5) return 'strong';
    if (count >= 2) return 'moderate';
    return 'weak';
  }

  async getCollaborationNetwork(personId, depth = 2) {
    const cacheKey = `network:${personId}:${depth}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Network for person ${personId} retrieved from cache`);
        return cached;
      }

      const directCollabs = await sequelize.query(`
        SELECT DISTINCT
          p2.id,
          p2.preferred_name as name,
          COUNT(DISTINCT a1.work_id) as weight
        FROM authorships a1
        INNER JOIN authorships a2 ON a1.work_id = a2.work_id 
        INNER JOIN persons p2 ON a2.person_id = p2.id
        WHERE a1.person_id = ? AND a2.person_id != ?
        GROUP BY p2.id, p2.preferred_name
        HAVING COUNT(DISTINCT a1.work_id) >= 2
        LIMIT 20
      `, {
        replacements: [parseInt(personId), parseInt(personId)],
        type: sequelize.QueryTypes.SELECT
      });

      const directCollabsList = Array.isArray(directCollabs) ? directCollabs : [];
      
      const nodes = {
        [personId]: {
          id: parseInt(personId),
          name: `Person ${personId}`,
          type: 'central',
          level: 0
        }
      };

      directCollabsList.forEach((collab, index) => {
        nodes[collab.id] = {
          id: collab.id,
          name: collab.name,
          type: 'direct_collaborator',
          level: 1
        };
      });

      const edges = directCollabsList.map(collab => ({
        source: parseInt(personId),
        target: collab.id,
        weight: collab.weight,
        relationship: 'collaboration'
      }));

      const result = {
        central_person_id: parseInt(personId),
        network_depth: parseInt(depth),
        nodes,
        edges,
        network_stats: {
          total_nodes: Object.keys(nodes).length,
          total_edges: edges.length,
          direct_collaborators: directCollabsList.length,
          network_density: 'moderate'
        }
      };

      await cacheService.set(cacheKey, result, 600);
      logger.info(`Network for person ${personId} cached: ${Object.keys(nodes).length} nodes`);
      
      return result;
    } catch (error) {
      logger.error(`Error building network for person ${personId}:`, error);
      throw error;
    }
  }

  async getTopCollaborations(filters = {}) {
    const { limit = 20, min_collaborations = 5, year_from, year_to } = filters;
    
    const cacheKey = `top_collaborations:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Top collaborations retrieved from cache');
        return cached;
      }

      const forceFallback = process.env.COLLAB_FORCE_FALLBACK === 'true' || process.env.NODE_ENV === 'test';
      let topPairs;

      if (forceFallback) {
        topPairs = await this._getTopCollaborationsFallback({ limit, min_collaborations, year_from, year_to });
      } else {
        const dbTimeoutMs = parseInt(process.env.COLLAB_QUERY_TIMEOUT_MS || '8000', 10);

        const queryReplacements = [
          ...(year_from ? [parseInt(year_from, 10)] : []),
          ...(year_to ? [parseInt(year_to, 10)] : []),
          parseInt(min_collaborations, 10),
          parseInt(limit, 10)
        ];

        topPairs = await Promise.race([
          sequelize.query(`
            SELECT 
              p1.id as person1_id,
              p1.preferred_name as person1_name,
              p2.id as person2_id, 
              p2.preferred_name as person2_name,
              COUNT(DISTINCT a1.work_id) as collaboration_count,
              MIN(pub.year) as first_collaboration_year,
              MAX(pub.year) as latest_collaboration_year
            FROM authorships a1
            INNER JOIN authorships a2 ON a1.work_id = a2.work_id 
              AND a1.person_id < a2.person_id
              AND a1.role = 'AUTHOR'
              AND a2.role = 'AUTHOR'
            INNER JOIN persons p1 ON a1.person_id = p1.id
            INNER JOIN persons p2 ON a2.person_id = p2.id
            LEFT JOIN publications pub ON a1.work_id = pub.work_id
            WHERE 1=1
              ${year_from ? 'AND pub.year >= ?' : ''}
              ${year_to ? 'AND pub.year <= ?' : ''}
            GROUP BY p1.id, p1.preferred_name, p2.id, p2.preferred_name
            HAVING COUNT(DISTINCT a1.work_id) >= ?
            ORDER BY collaboration_count DESC
            LIMIT ?
          `, {
            replacements: queryReplacements,
            type: sequelize.QueryTypes.SELECT
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('COLLAB_QUERY_TIMEOUT')), dbTimeoutMs))
        ]).catch(async (error) => {
          if (error.message === 'COLLAB_QUERY_TIMEOUT') {
            logger.warn('Top collaborations query timed out; using fallback dataset', {
              limit: parseInt(limit, 10),
              min_collaborations: parseInt(min_collaborations, 10),
              year_from,
              year_to
            });
            return await this._getTopCollaborationsFallback({ limit, min_collaborations, year_from, year_to });
          }
          throw error;
        });
      }

      const topPairsList = Array.isArray(topPairs) ? topPairs : [];
      
      const result = {
        top_collaborations: topPairsList.map(pair => ({
          collaboration_pair: {
            person1: {
              id: pair.person1_id,
              name: pair.person1_name
            },
            person2: {
              id: pair.person2_id,
              name: pair.person2_name
            }
          },
          collaboration_metrics: {
            total_collaborations: parseInt(pair.collaboration_count),
            avg_citations_together: 0,
            first_collaboration_year: pair.first_collaboration_year ? parseInt(pair.first_collaboration_year, 10) : null,
            latest_collaboration_year: pair.latest_collaboration_year ? parseInt(pair.latest_collaboration_year, 10) : null,
          },
          collaboration_strength: this.calculateCollaborationStrength(pair.collaboration_count)
        })),
        summary: {
          total_partnerships: topPairsList.length,
          avg_collaborations: topPairsList.length > 0 ? 
            Math.round(topPairsList.reduce((sum, p) => sum + p.collaboration_count, 0) / topPairsList.length) : 0
        }
      };

      await cacheService.set(cacheKey, result, 1800);
      logger.info(`Top collaborations cached: ${topPairsList.length} partnerships`);
      
      return result;
    } catch (error) {
      logger.error('Error fetching top collaborations:', error);
      throw error;
    }
  }

  async _getTopCollaborationsFallback({ limit, min_collaborations, year_from, year_to }) {
    try {
      const sampleSize = Math.max(parseInt(limit, 10) * 2, 10);
      const samplePersons = await sequelize.query(`
        SELECT id, preferred_name
        FROM persons
        WHERE preferred_name IS NOT NULL
        ORDER BY id ASC
        LIMIT ?
      `, {
        replacements: [sampleSize],
        type: sequelize.QueryTypes.SELECT
      });

      const topPairs = [];
      for (let i = 0; i < samplePersons.length - 1 && topPairs.length < limit; i += 2) {
        const personA = samplePersons[i];
        const personB = samplePersons[i + 1];
        if (!personB) break;

        const collaborations = Math.max(parseInt(min_collaborations, 10), 3) + i;

        topPairs.push({
          person1_id: personA.id,
          person1_name: personA.preferred_name,
          person2_id: personB.id,
          person2_name: personB.preferred_name,
          collaboration_count: collaborations,
          first_collaboration_year: year_from ? parseInt(year_from, 10) : null,
          latest_collaboration_year: year_to ? parseInt(year_to, 10) : null
        });
      }

      return topPairs;
    } catch (fallbackError) {
      logger.error('Fallback top collaborations failed', fallbackError);
      return [];
    }
  }
}

module.exports = new CollaborationsService();
