const { sequelize } = require('../config/database');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const {
  formatAnnualStats,
  formatVenueRanking,
  formatInstitutionProductivity,
  formatPersonProduction,
  formatCollaboration,
  formatDashboardSummary
} = require('../dto/metrics.dto');

class MetricsService {
  async getAnnualStats(filters = {}) {
    const { year_from, year_to, limit = 20 } = filters;
    const cacheKey = `metrics:annual:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Annual stats retrieved from cache');
        return cached;
      }

      const whereConditions = [];
      const replacements = { limit: parseInt(limit) };

      if (year_from) {
        whereConditions.push('year >= :year_from');
        replacements.year_from = parseInt(year_from);
      }

      if (year_to) {
        whereConditions.push('year <= :year_to');
        replacements.year_to = parseInt(year_to);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const stats = await sequelize.query(`
        SELECT 
          year,
          total_publications,
          unique_works,
          open_access_count,
          ROUND(open_access_percentage, 2) as open_access_percentage,
          articles,
          books,
          theses,
          conference_papers,
          unique_venues,
          unique_authors,
          ROUND(avg_citations, 2) as avg_citations,
          ROUND(total_downloads, 0) as total_downloads,
          unique_organizations
        FROM v_annual_stats
        ${whereClause}
        ORDER BY year DESC
        LIMIT :limit
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      });

      // Apply DTOs to format annual statistics
      const formattedStats = stats.map(formatAnnualStats);

      const result = {
        data: formattedStats,
        summary: {
          total_years: stats.length,
          date_range: stats.length > 0 ? 
            `${stats[stats.length - 1].year}-${stats[0].year}` : null,
          total_works_all_years: formattedStats.reduce((sum, s) => sum + s.metrics.total_publications, 0),
          avg_works_per_year: stats.length > 0 ? 
            Math.round(formattedStats.reduce((sum, s) => sum + s.metrics.total_publications, 0) / stats.length) : 0,
          growth_trend: stats.length >= 2 ? 
            calculateGrowthTrend(formattedStats.map(s => s.metrics.total_publications)) : null
        }
      };

      await cacheService.set(cacheKey, result, 86400);
      logger.info(`Annual stats cached: ${stats.length} years`);
      
      return result;
    } catch (error) {
      logger.error('Error fetching annual stats:', error);
      throw error;
    }
  }

  async getTopVenues(filters = {}) {
    const { limit = 20 } = filters;
    const cacheKey = `metrics:venues:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Venue ranking retrieved from cache');
        return cached;
      }

      const venues = await sequelize.query(`
        SELECT 
          venue_id,
          venue_name,
          venue_type,
          total_works,
          unique_authors,
          first_publication_year,
          latest_publication_year,
          open_access_percentage,
          open_access_works
        FROM v_venue_ranking
        ORDER BY total_works DESC
        LIMIT :limit
      `, {
        replacements: { limit: parseInt(limit) },
        type: sequelize.QueryTypes.SELECT
      });

      // Apply DTOs to format venue data
      const formattedVenues = venues.map((venue, index) => formatVenueRanking(venue, index + 1));

      const result = {
        data: formattedVenues,
        summary: {
          total_venues_ranked: formattedVenues.length,
          top_venue_publications: formattedVenues.length > 0 ? formattedVenues[0].metrics.total_works : 0,
          total_unique_authors: formattedVenues.reduce((sum, v) => sum + v.metrics.unique_authors, 0),
          avg_open_access_percentage: formattedVenues.length > 0 ? 
            Math.round(formattedVenues.reduce((sum, v) => sum + v.metrics.open_access_percentage, 0) / formattedVenues.length * 10) / 10 : 0,
          venue_types: [...new Set(formattedVenues.map(v => v.type))].filter(Boolean)
        }
      };

      await cacheService.set(cacheKey, result, 86400);
      logger.info(`Venue ranking cached: ${venues.length} venues`);
      
      return result;
    } catch (error) {
      logger.error('Error fetching venue ranking:', error);
      throw error;
    }
  }

  async getInstitutionProductivity(filters = {}) {
    const { limit = 20, country_code } = filters;
    const cacheKey = `metrics:institutions:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Institution productivity retrieved from cache');
        return cached;
      }

      const whereConditions = [];
      const replacements = { limit: parseInt(limit) };

      if (country_code) {
        whereConditions.push('country_code = :country_code');
        replacements.country_code = country_code;
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const institutions = await sequelize.query(`
        SELECT 
          organization_id,
          organization_name,
          country_code,
          total_works,
          total_citations,
          ROUND(avg_citations, 2) as avg_citations,
          h_index,
          total_authors,
          open_access_works,
          ROUND(open_access_percentage, 2) as open_access_percentage,
          first_publication_year,
          latest_publication_year
        FROM v_institution_productivity
        ${whereClause}
        ORDER BY total_works DESC, total_citations DESC
        LIMIT :limit
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      });

      // Apply DTOs to format institution data
      const formattedInstitutions = institutions.map((inst, index) => formatInstitutionProductivity(inst, index + 1));

      const result = {
        data: formattedInstitutions,
        summary: {
          total_institutions_ranked: formattedInstitutions.length,
          countries_represented: [...new Set(formattedInstitutions.map(i => i.country_code))].filter(Boolean),
          top_institution_works: formattedInstitutions.length > 0 ? formattedInstitutions[0].metrics.total_works : 0,
          avg_h_index: formattedInstitutions.length > 0 ?
            Math.round(formattedInstitutions.reduce((sum, i) => sum + i.metrics.h_index, 0) / formattedInstitutions.length) : 0,
          total_citations: formattedInstitutions.reduce((sum, i) => sum + i.metrics.total_citations, 0)
        }
      };

      await cacheService.set(cacheKey, result, 86400);
      logger.info(`Institution productivity cached: ${institutions.length} institutions`);
      
      return result;
    } catch (error) {
      logger.error('Error fetching institution productivity:', error);
      throw error;
    }
  }

  async getPersonProduction(filters = {}) {
    const { limit = 20, organization_id } = filters;
    const cacheKey = `metrics:persons:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Person production retrieved from cache');
        return cached;
      }

      const whereConditions = [];
      const replacements = { limit: parseInt(limit) };

      if (organization_id) {
        whereConditions.push('primary_affiliation_id = :organization_id');
        replacements.organization_id = parseInt(organization_id);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const persons = await sequelize.query(`
        SELECT 
          person_id,
          person_name,
          orcid,
          primary_affiliation_name,
          total_works,
          total_citations,
          ROUND(avg_citations, 2) as avg_citations,
          h_index,
          as_first_author,
          as_corresponding_author,
          open_access_works,
          ROUND(open_access_percentage, 2) as open_access_percentage,
          first_publication_year,
          latest_publication_year,
          collaboration_count
        FROM v_person_production
        ${whereClause}
        ORDER BY total_works DESC, total_citations DESC
        LIMIT :limit
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      });

      // Apply DTOs to format person data
      const formattedPersons = persons.map((person, index) => formatPersonProduction(person, index + 1));

      const result = {
        data: formattedPersons,
        summary: {
          total_persons_ranked: formattedPersons.length,
          top_person_works: formattedPersons.length > 0 ? formattedPersons[0].metrics.total_works : 0,
          top_h_index: formattedPersons.length > 0 ? Math.max(...formattedPersons.map(p => p.metrics.h_index)) : 0,
          avg_collaboration_count: formattedPersons.length > 0 ? 
            Math.round(formattedPersons.reduce((sum, p) => sum + p.metrics.collaboration_count, 0) / formattedPersons.length) : 0,
          total_citations: formattedPersons.reduce((sum, p) => sum + p.metrics.total_citations, 0),
          organizations_represented: [...new Set(formattedPersons.map(p => p.primary_affiliation.name))].filter(Boolean).length
        }
      };

      await cacheService.set(cacheKey, result, 86400);
      logger.info(`Person production cached: ${persons.length} persons`);
      
      return result;
    } catch (error) {
      logger.error('Error fetching person production:', error);
      throw error;
    }
  }

  async getCollaborations(filters = {}) {
    const { limit = 20, min_collaborations = 2 } = filters;
    const cacheKey = `metrics:collaborations:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Collaborations retrieved from cache');
        return cached;
      }

      const collaborations = await sequelize.query(`
        SELECT 
          person1_id,
          person1_name,
          person2_id,
          person2_name,
          shared_works,
          shared_citations,
          ROUND(avg_shared_citations, 2) as avg_shared_citations,
          first_collaboration_year,
          latest_collaboration_year,
          collaboration_years
        FROM v_collaborations
        WHERE shared_works >= :min_collaborations
        ORDER BY shared_works DESC, shared_citations DESC
        LIMIT :limit
      `, {
        replacements: { 
          limit: parseInt(limit), 
          min_collaborations: parseInt(min_collaborations) 
        },
        type: sequelize.QueryTypes.SELECT
      });

      // Apply DTOs to format collaboration data
      const formattedCollaborations = collaborations.map((collab, index) => formatCollaboration(collab, index + 1));

      const result = {
        data: formattedCollaborations,
        summary: {
          total_collaboration_pairs: formattedCollaborations.length,
          strongest_collaboration_count: formattedCollaborations.length > 0 ? formattedCollaborations[0].metrics.shared_works : 0,
          avg_collaboration_years: formattedCollaborations.length > 0 ?
            Math.round(formattedCollaborations.reduce((sum, c) => sum + c.timespan.collaboration_years, 0) / formattedCollaborations.length) : 0,
          collaboration_strength_distribution: calculateCollaborationStrengthDistribution(formattedCollaborations)
        },
        filters: {
          min_collaborations: parseInt(min_collaborations)
        }
      };

      await cacheService.set(cacheKey, result, 86400);
      logger.info(`Collaborations cached: ${collaborations.length} pairs`);
      
      return result;
    } catch (error) {
      logger.error('Error fetching collaborations:', error);
      throw error;
    }
  }

  async getDashboardSummary() {
    const cacheKey = 'metrics:dashboard:summary';
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Dashboard summary retrieved from cache');
        return cached;
      }

      const [totalCounts, recentStats] = await Promise.all([
        sequelize.query(`
          SELECT 
            (SELECT COUNT(*) FROM works) as total_works,
            (SELECT COUNT(*) FROM persons) as total_persons,
            (SELECT COUNT(*) FROM organizations) as total_organizations,
            (SELECT COUNT(*) FROM publications) as total_publications,
            (SELECT COUNT(DISTINCT venue_id) FROM publications WHERE venue_id IS NOT NULL) as total_venues
        `, { type: sequelize.QueryTypes.SELECT }),
        
        sequelize.query(`
          SELECT 
            year,
            total_publications,
            open_access_count,
            unique_authors
          FROM v_annual_stats 
          ORDER BY year DESC 
          LIMIT 5
        `, { type: sequelize.QueryTypes.SELECT })
      ]);

      // Apply DTOs to format dashboard summary
      const result = formatDashboardSummary(totalCounts[0], recentStats);

      await cacheService.set(cacheKey, result, 86400);
      logger.info('Dashboard summary cached');
      
      return result;
    } catch (error) {
      logger.error('Error fetching dashboard summary:', error);
      throw error;
    }
  }
}

// Helper functions
const calculateGrowthTrend = (values) => {
  if (values.length < 2) return 'insufficient_data';
  
  const recent = values.slice(0, 3).reduce((sum, v) => sum + v, 0) / Math.min(3, values.length);
  const older = values.slice(-3).reduce((sum, v) => sum + v, 0) / Math.min(3, values.slice(-3).length);
  
  const change = ((recent - older) / older) * 100;
  
  if (change > 10) return 'increasing';
  if (change < -10) return 'decreasing';
  return 'stable';
};

const calculateCollaborationStrengthDistribution = (collaborations) => {
  const distribution = { very_strong: 0, strong: 0, moderate: 0, weak: 0 };
  
  collaborations.forEach(collab => {
    const strength = collab.metrics.collaboration_strength;
    if (distribution.hasOwnProperty(strength)) {
      distribution[strength]++;
    }
  });
  
  return distribution;
};

module.exports = new MetricsService();