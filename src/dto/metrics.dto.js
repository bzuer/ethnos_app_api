/**
 * Metrics DTOs - Standardized data transfer objects for metrics and analytics resources
 * Following API v2 conventions: snake_case, consistent structure, stable shapes for charts
 */

/**
 * Format annual statistics item
 */
const formatAnnualStats = (stats) => {
  if (!stats) return null;

  return {
    year: parseInt(stats.year),
    metrics: {
      total_publications: parseInt(stats.total_publications) || 0,
      unique_works: parseInt(stats.unique_works) || 0,
      open_access_count: parseInt(stats.open_access_count) || 0,
      open_access_percentage: parseFloat(stats.open_access_percentage) || 0,
      articles: parseInt(stats.articles) || 0,
      books: parseInt(stats.books) || 0,
      theses: parseInt(stats.theses) || 0,
      conference_papers: parseInt(stats.conference_papers) || 0,
      unique_venues: parseInt(stats.unique_venues) || 0,
      unique_authors: parseInt(stats.unique_authors) || 0,
      unique_organizations: parseInt(stats.unique_organizations) || 0,
      avg_citations: parseFloat(stats.avg_citations) || 0,
      total_downloads: parseInt(stats.total_downloads) || 0
    },
    growth: {
      publications_vs_previous: stats.publications_vs_previous || null,
      authors_vs_previous: stats.authors_vs_previous || null
    }
  };
};

/**
 * Format venue ranking item
 */
const formatVenueRanking = (venue, rank = null) => {
  if (!venue) return null;

  return {
    venue_id: parseInt(venue.venue_id),
    ranking: rank || parseInt(venue.ranking) || null,
    name: venue.venue_name || null,
    type: venue.venue_type || null,
    metrics: {
      total_works: parseInt(venue.total_works) || 0,
      unique_authors: parseInt(venue.unique_authors) || 0,
      open_access_works: parseInt(venue.open_access_works) || 0,
      open_access_percentage: parseFloat(venue.open_access_percentage) || 0
    },
    timespan: {
      first_publication_year: parseInt(venue.first_publication_year) || null,
      latest_publication_year: parseInt(venue.latest_publication_year) || null,
      years_active: venue.latest_publication_year && venue.first_publication_year ?
        parseInt(venue.latest_publication_year) - parseInt(venue.first_publication_year) + 1 : 0
    }
  };
};

/**
 * Format institution productivity item
 */
const formatInstitutionProductivity = (institution, rank = null) => {
  if (!institution) return null;

  return {
    organization_id: parseInt(institution.organization_id),
    ranking: rank || parseInt(institution.ranking) || null,
    name: institution.organization_name || null,
    country_code: institution.country_code || null,
    metrics: {
      total_works: parseInt(institution.total_works) || 0,
      total_citations: parseInt(institution.total_citations) || 0,
      avg_citations: parseFloat(institution.avg_citations) || 0,
      h_index: parseInt(institution.h_index) || 0,
      total_authors: parseInt(institution.total_authors) || 0,
      open_access_works: parseInt(institution.open_access_works) || 0,
      open_access_percentage: parseFloat(institution.open_access_percentage) || 0
    },
    timespan: {
      first_publication_year: parseInt(institution.first_publication_year) || null,
      latest_publication_year: parseInt(institution.latest_publication_year) || null,
      years_active: institution.latest_publication_year && institution.first_publication_year ?
        parseInt(institution.latest_publication_year) - parseInt(institution.first_publication_year) + 1 : 0
    },
    productivity_score: institution.productivity_score ? parseFloat(institution.productivity_score) : null
  };
};

/**
 * Format person production item
 */
const formatPersonProduction = (person, rank = null) => {
  if (!person) return null;

  return {
    person_id: parseInt(person.person_id),
    ranking: rank || parseInt(person.ranking) || null,
    name: person.person_name || null,
    identifiers: {
      orcid: person.orcid || null
    },
    primary_affiliation: {
      name: person.primary_affiliation_name || null,
      id: person.primary_affiliation_id || null
    },
    metrics: {
      total_works: parseInt(person.total_works) || 0,
      total_citations: parseInt(person.total_citations) || 0,
      avg_citations: parseFloat(person.avg_citations) || 0,
      h_index: parseInt(person.h_index) || 0,
      as_first_author: parseInt(person.as_first_author) || 0,
      as_corresponding_author: parseInt(person.as_corresponding_author) || 0,
      open_access_works: parseInt(person.open_access_works) || 0,
      open_access_percentage: parseFloat(person.open_access_percentage) || 0,
      collaboration_count: parseInt(person.collaboration_count) || 0
    },
    timespan: {
      first_publication_year: parseInt(person.first_publication_year) || null,
      latest_publication_year: parseInt(person.latest_publication_year) || null,
      years_active: person.latest_publication_year && person.first_publication_year ?
        parseInt(person.latest_publication_year) - parseInt(person.first_publication_year) + 1 : 0
    },
    productivity_score: person.productivity_score ? parseFloat(person.productivity_score) : null
  };
};

/**
 * Format collaboration item
 */
const formatCollaboration = (collaboration, rank = null) => {
  if (!collaboration) return null;

  const collaborationStrength = (shared_works) => {
    if (shared_works >= 10) return 'very_strong';
    if (shared_works >= 5) return 'strong';
    if (shared_works >= 3) return 'moderate';
    return 'weak';
  };

  return {
    ranking: rank || null,
    collaborators: {
      person_1: {
        id: parseInt(collaboration.person1_id),
        name: collaboration.person1_name || null
      },
      person_2: {
        id: parseInt(collaboration.person2_id),
        name: collaboration.person2_name || null
      }
    },
    metrics: {
      shared_works: parseInt(collaboration.shared_works) || 0,
      shared_citations: parseInt(collaboration.shared_citations) || 0,
      avg_shared_citations: parseFloat(collaboration.avg_shared_citations) || 0,
      collaboration_strength: collaborationStrength(parseInt(collaboration.shared_works) || 0)
    },
    timespan: {
      first_collaboration_year: parseInt(collaboration.first_collaboration_year) || null,
      latest_collaboration_year: parseInt(collaboration.latest_collaboration_year) || null,
      collaboration_years: parseInt(collaboration.collaboration_years) || 0
    }
  };
};

/**
 * Format dashboard summary
 */
const formatDashboardSummary = (totals, recentTrends = []) => {
  return {
    totals: {
      total_works: parseInt(totals.total_works) || 0,
      total_persons: parseInt(totals.total_persons) || 0,
      total_organizations: parseInt(totals.total_organizations) || 0,
      total_publications: parseInt(totals.total_publications) || 0,
      total_venues: parseInt(totals.total_venues) || 0
    },
    recent_trends: recentTrends.map(trend => ({
      year: parseInt(trend.year),
      total_publications: parseInt(trend.total_publications) || 0,
      open_access_count: parseInt(trend.open_access_count) || 0,
      unique_authors: parseInt(trend.unique_authors) || 0,
      open_access_percentage: trend.total_publications > 0 ? 
        Math.round((trend.open_access_count / trend.total_publications) * 100 * 10) / 10 : 0
    })),
    growth_indicators: recentTrends.length >= 2 ? {
      publications_trend: calculateTrendDirection(recentTrends.map(t => t.total_publications)),
      authors_trend: calculateTrendDirection(recentTrends.map(t => t.unique_authors)),
      open_access_trend: calculateTrendDirection(recentTrends.map(t => t.open_access_count))
    } : null,
    last_updated: new Date().toISOString()
  };
};

/**
 * Calculate trend direction from array of values
 */
const calculateTrendDirection = (values) => {
  if (values.length < 2) return 'insufficient_data';
  
  const recent = values.slice(-2);
  const change = ((recent[0] - recent[1]) / recent[1]) * 100;
  
  if (change > 5) return 'increasing';
  if (change < -5) return 'decreasing';
  return 'stable';
};

/**
 * Format Sphinx metrics for dashboard
 */
const formatSphinxMetrics = (metrics) => {
  if (!metrics) return null;

  return {
    performance: {
      queries_per_second: parseFloat(metrics.queries_per_second) || 0,
      avg_response_time: parseFloat(metrics.avg_response_time) || 0,
      error_rate: parseFloat(metrics.error_rate) || 0,
      p95_response_time: parseFloat(metrics.p95_response_time) || 0
    },
    system: {
      index_size_mb: parseFloat(metrics.index_size_mb) || 0,
      uptime_seconds: parseInt(metrics.uptime_seconds) || 0,
      connections: parseInt(metrics.connections) || 0,
      memory_usage_mb: parseFloat(metrics.memory_usage_mb) || 0
    },
    activity: {
      queries_last_hour: parseInt(metrics.queries_last_hour) || 0,
      queries_last_minute: parseInt(metrics.queries_last_minute) || 0,
      total_queries: parseInt(metrics.total_queries) || 0
    },
    health_score: calculateHealthScore(metrics)
  };
};

/**
 * Calculate overall health score from metrics
 */
const calculateHealthScore = (metrics) => {
  let score = 100;
  
  // Deduct for high error rate
  if (metrics.error_rate > 0.1) score -= 30;
  else if (metrics.error_rate > 0.05) score -= 15;
  
  // Deduct for slow response times
  if (metrics.avg_response_time > 100) score -= 20;
  else if (metrics.avg_response_time > 50) score -= 10;
  
  // Deduct for very high load
  if (metrics.queries_per_second > 1000) score -= 10;
  
  return Math.max(0, Math.min(100, score));
};

/**
 * Format time-series data for charts
 */
const formatTimeSeriesData = (data, valueField, timeField = 'timestamp') => {
  return data.map(item => ({
    timestamp: new Date(item[timeField]).toISOString(),
    value: parseFloat(item[valueField]) || 0,
    label: item.label || null
  })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

/**
 * Format distribution data for charts
 */
const formatDistributionData = (data, labelField, valueField) => {
  return data.map(item => ({
    label: item[labelField] || 'Unknown',
    value: parseInt(item[valueField]) || 0,
    percentage: item.percentage ? parseFloat(item.percentage) : null
  })).sort((a, b) => b.value - a.value);
};

module.exports = {
  formatAnnualStats,
  formatVenueRanking,
  formatInstitutionProductivity,
  formatPersonProduction,
  formatCollaboration,
  formatDashboardSummary,
  formatSphinxMetrics,
  formatTimeSeriesData,
  formatDistributionData,
  calculateTrendDirection,
  calculateHealthScore
};