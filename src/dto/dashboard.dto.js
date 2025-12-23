


const formatDashboardOverview = (data) => {
  if (!data) return null;

  return {
    timestamp: new Date().toISOString(),
    search_performance: {
      engine_status: data.search_performance?.engine || 'unknown',
      current_metrics: {
        queries_per_second: parseFloat(data.search_performance?.queries_per_second) || 0,
        avg_response_time: parseFloat(data.search_performance?.avg_response_time) || 0,
        error_rate: parseFloat(data.search_performance?.error_rate) || 0,
        index_size_mb: parseFloat(data.search_performance?.index_size_mb) || 0
      },
      performance_distribution: data.search_performance?.performance_distribution || null
    },
    system_health: {
      rollback_active: Boolean(data.system_health?.rollback_active),
      uptime_seconds: parseInt(data.system_health?.uptime_seconds) || 0,
      consecutive_failures: parseInt(data.system_health?.consecutive_failures) || 0,
      last_successful_check: data.system_health?.last_successful_check || null,
      memory_usage: data.system_health?.memory_usage || null,
      active_connections: parseInt(data.system_health?.connections) || 0,
      health_status: determineHealthStatus(data.system_health)
    },
    recent_activity: {
      queries_last_hour: parseInt(data.recent_activity?.queries_last_hour) || 0,
      queries_last_minute: parseInt(data.recent_activity?.queries_last_minute) || 0,
      recent_queries: (data.recent_activity?.recent_queries || []).slice(0, 10),
      search_analytics: data.recent_activity?.search_analytics || {},
      activity_level: determineActivityLevel(data.recent_activity)
    },
    alerts: formatSystemAlerts(data.alerts || [])
  };
};


const formatPerformanceChart = (chartData) => {
  if (!Array.isArray(chartData)) return [];

  return chartData.map(point => ({
    timestamp: new Date(point.timestamp).toISOString(),
    metrics: {
      query_count: parseInt(point.query_count) || 0,
      avg_response_time: parseFloat(point.avg_response_time) || 0,
      error_count: parseInt(point.error_count) || 0,
      error_rate: parseFloat(point.error_rate) || 0
    },
    health_indicators: {
      performance_score: calculatePerformanceScore(point),
      status: point.avg_response_time > 50 ? 'slow' : point.error_rate > 0.05 ? 'degraded' : 'healthy'
    }
  })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};


const formatSearchTrends = (trendsData) => {
  if (!trendsData) return null;

  return {
    trends: {
      search_volume: formatTrendIndicator(trendsData.trends?.search_volume),
      unique_queries: formatTrendIndicator(trendsData.trends?.unique_queries),
      avg_results: formatTrendIndicator(trendsData.trends?.avg_results)
    },
    popular_terms: (trendsData.popular_terms || []).map(term => ({
      term: term.term || term,
      frequency: parseInt(term.frequency) || parseInt(term.count) || 0,
      trend: term.trend || 'stable'
    })),
    daily_data: (trendsData.trends?.daily_data || []).map(day => ({
      date: day.date,
      total_searches: parseInt(day.total_searches) || 0,
      unique_queries: parseInt(day.unique_queries) || 0,
      avg_results: parseFloat(day.avg_results) || 0,
      top_terms: day.top_terms || []
    })),
    analytics_period: trendsData.analytics_period || '7 days',
    generated_at: new Date().toISOString()
  };
};


const formatSystemAlerts = (alerts) => {
  if (!Array.isArray(alerts)) return [];

  return alerts.map(alert => ({
    type: alert.type || 'unknown',
    severity: alert.severity || 'low',
    message: alert.message || 'No message provided',
    threshold: alert.threshold || null,
    current_value: alert.current_value || null,
    timestamp: alert.timestamp || new Date().toISOString(),
    requires_action: ['high', 'critical'].includes(alert.severity),
    alert_id: alert.alert_id || generateAlertId(alert)
  })).sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return (severityOrder[b.severity] || 1) - (severityOrder[a.severity] || 1);
  });
};


const formatMetricsSummary = (summary) => {
  if (!summary) return null;

  return {
    database_metrics: {
      total_works: parseInt(summary.total_works) || 0,
      total_persons: parseInt(summary.total_persons) || 0,
      total_organizations: parseInt(summary.total_organizations) || 0,
      total_publications: parseInt(summary.total_publications) || 0,
      growth_rate: summary.growth_rate || null
    },
    performance_metrics: {
      avg_query_time: parseFloat(summary.avg_query_time) || 0,
      cache_hit_rate: parseFloat(summary.cache_hit_rate) || 0,
      error_rate: parseFloat(summary.error_rate) || 0,
      uptime_percentage: parseFloat(summary.uptime_percentage) || 0
    },
    usage_metrics: {
      daily_active_queries: parseInt(summary.daily_active_queries) || 0,
      peak_concurrent_users: parseInt(summary.peak_concurrent_users) || 0,
      most_active_endpoint: summary.most_active_endpoint || null
    }
  };
};


const formatActivityFeed = (activities) => {
  if (!Array.isArray(activities)) return [];

  return activities.map(activity => ({
    timestamp: new Date(activity.timestamp).toISOString(),
    type: activity.type || 'unknown',
    description: activity.description || activity.message || 'No description',
    severity: activity.severity || 'info',
    metadata: {
      endpoint: activity.endpoint || null,
      response_time: activity.response_time || null,
      user_agent: activity.user_agent || null,
      ip_address: activity.ip_address || null
    },
    formatted_time: formatRelativeTime(activity.timestamp)
  })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};



const determineHealthStatus = (healthData) => {
  if (!healthData) return 'unknown';
  
  if (healthData.rollback_active) return 'degraded';
  if (healthData.consecutive_failures > 5) return 'unhealthy';
  if (healthData.consecutive_failures > 0) return 'warning';
  return 'healthy';
};

const determineActivityLevel = (activityData) => {
  if (!activityData) return 'unknown';
  
  const queriesLastHour = parseInt(activityData.queries_last_hour) || 0;
  if (queriesLastHour > 1000) return 'very_high';
  if (queriesLastHour > 500) return 'high';
  if (queriesLastHour > 100) return 'moderate';
  if (queriesLastHour > 10) return 'low';
  return 'minimal';
};

const calculatePerformanceScore = (point) => {
  let score = 100;
  
  const responseTime = parseFloat(point.avg_response_time) || 0;
  if (responseTime > 100) score -= 40;
  else if (responseTime > 50) score -= 20;
  else if (responseTime > 25) score -= 10;
  
  const errorRate = parseFloat(point.error_rate) || 0;
  if (errorRate > 0.1) score -= 50;
  else if (errorRate > 0.05) score -= 25;
  else if (errorRate > 0.01) score -= 10;
  
  return Math.max(0, Math.min(100, Math.round(score)));
};

const formatTrendIndicator = (trend) => {
  if (!trend) return { trend: 'unknown', change_percent: 0 };
  
  return {
    trend: trend.trend || 'stable',
    change_percent: parseFloat(trend.change_percent) || 0,
    recent_average: parseFloat(trend.recent_average) || 0,
    historical_average: parseFloat(trend.historical_average) || 0,
    is_significant: Math.abs(parseFloat(trend.change_percent) || 0) > 10
  };
};

const generateAlertId = (alert) => {
  const hash = require('crypto')
    .createHash('md5')
    .update(`${alert.type}-${alert.severity}-${alert.message}`)
    .digest('hex')
    .substring(0, 8);
  return `alert_${hash}`;
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return 'Unknown time';
  
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now - time;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return time.toISOString().split('T')[0];
};

module.exports = {
  formatDashboardOverview,
  formatPerformanceChart,
  formatSearchTrends,
  formatSystemAlerts,
  formatMetricsSummary,
  formatActivityFeed,
  determineHealthStatus,
  determineActivityLevel,
  calculatePerformanceScore,
  formatTrendIndicator,
  formatRelativeTime
};