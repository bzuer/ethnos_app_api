const { logger } = require('./errorHandler');
const os = require('os');

// Métricas em memória (em produção usar Redis ou sistema externo)
const metrics = {
  requests: {
    total: 0,
    by_endpoint: {},
    by_status: {},
    response_times: []
  },
  performance: {
    by_endpoint_type: {
      listings: { count: 0, total_time: 0, avg_time: 0, slow_count: 0 },
      details: { count: 0, total_time: 0, avg_time: 0, slow_count: 0 },
      relationships: { count: 0, total_time: 0, avg_time: 0, slow_count: 0 },
      search: { count: 0, total_time: 0, avg_time: 0, slow_count: 0 }
    },
    query_alerts: [] // Track queries >500ms
  },
  system: {
    start_time: Date.now(),
    memory_usage: [],
    cpu_usage: [],
    memory_alerts: {
      total_warnings: 0,
      total_critical: 0,
      last_warning: null,
      last_critical: null
    }
  },
  errors: {
    total: 0,
    by_type: {},
    recent: []
  },
  security: {
    suspicious_patterns: [],
    sequential_scans: new Map(), // Track sequential ID scanning
    rapid_requests: new Map(), // Track rapid fire requests
    blocked_attempts: 0,
    last_cleanup: Date.now()
  }
};

// Detect suspicious patterns
const detectSuspiciousPatterns = (req) => {
  const ip = req.ip;
  const path = req.path;
  const userAgent = req.get('User-Agent') || '';
  const now = Date.now();
  
  // Detect sequential ID scanning (e.g., /works/1, /works/2, /works/3...)
  const idPattern = /\/(\d+)(?:\/|$)/;
  const idMatch = path.match(idPattern);
  
  if (idMatch) {
    const resourceId = parseInt(idMatch[1]);
    const baseEndpoint = path.replace(idPattern, '/:id');
    
    if (!metrics.security.sequential_scans.has(ip)) {
      metrics.security.sequential_scans.set(ip, {});
    }
    
    const ipScans = metrics.security.sequential_scans.get(ip);
    if (!ipScans[baseEndpoint]) {
      ipScans[baseEndpoint] = [];
    }
    
    ipScans[baseEndpoint].push({ id: resourceId, timestamp: now });
    
    // Keep only recent requests (last 5 minutes)
    ipScans[baseEndpoint] = ipScans[baseEndpoint].filter(scan => now - scan.timestamp < 5 * 60 * 1000);
    
    // Check for sequential pattern
    if (ipScans[baseEndpoint].length >= 10) {
      const ids = ipScans[baseEndpoint].map(s => s.id).sort((a, b) => a - b);
      let sequential = 0;
      for (let i = 1; i < ids.length; i++) {
        if (ids[i] === ids[i-1] + 1) sequential++;
      }
      
      if (sequential >= 5) {
        logger.warn('Sequential ID scanning detected', {
          ip,
          endpoint: baseEndpoint,
          userAgent,
          sequential_count: sequential,
          total_requests: ipScans[baseEndpoint].length
        });
        
        metrics.security.suspicious_patterns.push({
          type: 'sequential_scanning',
          ip,
          endpoint: baseEndpoint,
          timestamp: now,
          details: { sequential_count: sequential }
        });
      }
    }
  }
  
  // Detect rapid fire requests (many requests in short time)
  if (!metrics.security.rapid_requests.has(ip)) {
    metrics.security.rapid_requests.set(ip, []);
  }
  
  const ipRequests = metrics.security.rapid_requests.get(ip);
  ipRequests.push(now);
  
  // Keep only requests from last minute
  const recentRequests = ipRequests.filter(timestamp => now - timestamp < 60 * 1000);
  metrics.security.rapid_requests.set(ip, recentRequests);
  
  // Alert if more than 100 requests per minute from single IP
  if (recentRequests.length > 100) {
    logger.warn('Rapid fire requests detected', {
      ip,
      userAgent,
      requests_per_minute: recentRequests.length,
      current_path: path
    });
  }
  
  // Detect suspicious user agents
  const suspiciousAgents = [
    'curl', 'wget', 'python-requests', 'bot', 'crawler', 'spider', 'scraper'
  ];
  
  if (suspiciousAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
    logger.info('Suspicious user agent detected', {
      ip,
      userAgent,
      path
    });
  }
};

// Middleware de monitoramento de performance
const performanceMonitoring = (req, res, next) => {
  const startTime = Date.now();
  const endpoint = `${req.method} ${req.route?.path || req.path}`;
  
  // Detect suspicious patterns
  detectSuspiciousPatterns(req);
  
  // Incrementar contador de requests
  metrics.requests.total++;
  metrics.requests.by_endpoint[endpoint] = (metrics.requests.by_endpoint[endpoint] || 0) + 1;
  
  // Override do res.end para capturar métricas
  const originalEnd = res.end;
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Registrar métricas
    metrics.requests.by_status[statusCode] = (metrics.requests.by_status[statusCode] || 0) + 1;
    metrics.requests.response_times.push({
      endpoint,
      time: responseTime,
      timestamp: Date.now(),
      status: statusCode
    });
    
    // Manter apenas os últimos 1000 tempos de resposta
    if (metrics.requests.response_times.length > 1000) {
      metrics.requests.response_times = metrics.requests.response_times.slice(-1000);
    }
    
    // Log de performance para requests lentos (>1000ms)
    if (responseTime > 1000) {
      logger.warn('Slow request detected', {
        endpoint,
        response_time_ms: responseTime,
        status_code: statusCode,
        user_agent: req.get('User-Agent'),
        ip: req.ip,
        severity: responseTime > 5000 ? 'CRITICAL' : responseTime > 3000 ? 'HIGH' : 'MEDIUM'
      });
      
      // Critical alert for extremely slow requests >5s
      if (responseTime > 5000) {
        logger.error('CRITICAL: Extremely slow request detected', {
          endpoint,
          response_time_ms: responseTime,
          status_code: statusCode,
          alert_type: 'PERFORMANCE_CRITICAL'
        });
      }
    }
    
    // Log de performance geral
    logger.info('Request completed', {
      endpoint,
      response_time_ms: responseTime,
      status_code: statusCode,
      query_params: Object.keys(req.query).length,
      body_size: req.get('content-length') || 0
    });
    
    originalEnd.apply(res, args);
  };
  
  next();
};

// Coletar métricas do sistema periodicamente
const collectSystemMetrics = () => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  metrics.system.memory_usage.push({
    timestamp: Date.now(),
    rss: memUsage.rss,
    heapTotal: memUsage.heapTotal,
    heapUsed: memUsage.heapUsed,
    external: memUsage.external
  });
  
  // Manter apenas os últimos 100 registros (aproximadamente 10 minutos se coletado a cada 6 segundos)
  if (metrics.system.memory_usage.length > 100) {
    metrics.system.memory_usage = metrics.system.memory_usage.slice(-100);
  }
  
  // Alertas de memória com thresholds configuráveis
  const heapThresholdMB = parseInt(process.env.MEMORY_ALERT_THRESHOLD_MB) || 100;
  const criticalThresholdMB = parseInt(process.env.MEMORY_CRITICAL_THRESHOLD_MB) || 150;
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const rssMB = Math.round(memUsage.rss / 1024 / 1024);
  
  if (heapUsedMB > criticalThresholdMB) {
    logger.error('CRITICAL: Memory usage exceeds critical threshold', {
      heap_used_mb: heapUsedMB,
      heap_total_mb: heapTotalMB,
      rss_mb: rssMB,
      threshold_mb: criticalThresholdMB,
      alert_level: 'CRITICAL',
      timestamp: new Date().toISOString()
    });
  } else if (heapUsedMB > heapThresholdMB) {
    logger.warn('High memory usage detected', {
      heap_used_mb: heapUsedMB,
      heap_total_mb: heapTotalMB,
      rss_mb: rssMB,
      threshold_mb: heapThresholdMB,
      alert_level: 'WARNING'
    });
  }
};

// Middleware de tratamento de erros com métricas
const errorMonitoring = (error, req, res, next) => {
  const errorType = error.constructor.name;
  const endpoint = `${req.method} ${req.route?.path || req.path}`;
  
  // Registrar erro nas métricas
  metrics.errors.total++;
  metrics.errors.by_type[errorType] = (metrics.errors.by_type[errorType] || 0) + 1;
  metrics.errors.recent.push({
    timestamp: Date.now(),
    type: errorType,
    message: error.message,
    endpoint,
    stack: error.stack?.split('\n')[0] // Apenas primeira linha do stack
  });
  
  // Manter apenas os últimos 50 erros
  if (metrics.errors.recent.length > 50) {
    metrics.errors.recent = metrics.errors.recent.slice(-50);
  }
  
  // Log do erro
  logger.error('Request error occurred', {
    error_type: errorType,
    error_message: error.message,
    endpoint,
    ip: req.ip,
    user_agent: req.get('User-Agent'),
    stack: error.stack
  });
  
  next(error);
};

// Endpoint para métricas (interno)
const getMetrics = () => {
  const now = Date.now();
  const uptime = now - metrics.system.start_time;
  
  // Calcular estatísticas de response time dos últimos 10 minutos
  const recentResponseTimes = metrics.requests.response_times
    .filter(rt => (now - rt.timestamp) < 10 * 60 * 1000) // 10 minutos
    .map(rt => rt.time);
  
  const avgResponseTime = recentResponseTimes.length > 0 
    ? Math.round(recentResponseTimes.reduce((a, b) => a + b, 0) / recentResponseTimes.length)
    : 0;
    
  const p95ResponseTime = recentResponseTimes.length > 0
    ? recentResponseTimes.sort((a, b) => a - b)[Math.floor(recentResponseTimes.length * 0.95)] || 0
    : 0;
  
  return {
    uptime_ms: uptime,
    uptime_human: formatUptime(uptime),
    requests: {
      total: metrics.requests.total,
      by_status: metrics.requests.by_status,
      top_endpoints: Object.entries(metrics.requests.by_endpoint)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([endpoint, count]) => ({ endpoint, count })),
      performance: {
        avg_response_time_ms: avgResponseTime,
        p95_response_time_ms: p95ResponseTime,
        total_samples: recentResponseTimes.length
      }
    },
    errors: {
      total: metrics.errors.total,
      by_type: metrics.errors.by_type,
      recent_count: metrics.errors.recent.length,
      error_rate: metrics.requests.total > 0 
        ? Math.round((metrics.errors.total / metrics.requests.total) * 100 * 100) / 100
        : 0
    },
    system: {
      memory: process.memoryUsage(),
      cpu_cores: os.cpus().length,
      load_average: os.loadavg(),
      free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
      total_memory_mb: Math.round(os.totalmem() / 1024 / 1024)
    }
  };
};

const formatUptime = (uptimeMs) => {
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

// Classify endpoint type for metrics
const getEndpointType = (path, method) => {
  if (path.includes('/search')) return 'search';
  if (path.match(/\/\d+\/\w+$/)) return 'relationships'; // e.g., /persons/123/signatures
  if (path.match(/\/\d+$/)) return 'details'; // e.g., /works/123
  if (method === 'GET' && !path.match(/\/\d+/)) return 'listings'; // e.g., /works, /persons
  return 'other';
};

// Track performance by endpoint type
const trackEndpointPerformance = (path, method, responseTime) => {
  const endpointType = getEndpointType(path, method);
  const perfMetrics = metrics.performance.by_endpoint_type[endpointType];
  
  if (perfMetrics) {
    perfMetrics.count++;
    perfMetrics.total_time += responseTime;
    perfMetrics.avg_time = perfMetrics.total_time / perfMetrics.count;
    
    if (responseTime > 500) {
      perfMetrics.slow_count++;
      
      // Track query alert
      metrics.performance.query_alerts.push({
        path,
        method,
        responseTime,
        timestamp: Date.now(),
        endpointType
      });
      
      // Keep only recent alerts (last 100)
      if (metrics.performance.query_alerts.length > 100) {
        metrics.performance.query_alerts.shift();
      }
      
      logger.warn('Slow query detected', {
        path,
        method,
        responseTime: `${responseTime}ms`,
        endpointType
      });
    }
  }
};

// Função para resetar métricas
const resetMetrics = () => {
  metrics.requests.total = 0;
  metrics.requests.by_endpoint = {};
  metrics.requests.by_status = {};
  metrics.requests.response_times = [];
  metrics.performance.by_endpoint_type = {
    listings: { count: 0, total_time: 0, avg_time: 0, slow_count: 0 },
    details: { count: 0, total_time: 0, avg_time: 0, slow_count: 0 },
    relationships: { count: 0, total_time: 0, avg_time: 0, slow_count: 0 },
    search: { count: 0, total_time: 0, avg_time: 0, slow_count: 0 }
  };
  metrics.performance.query_alerts = [];
  metrics.errors.total = 0;
  metrics.errors.by_type = {};
  metrics.errors.recent = [];
  metrics.security.suspicious_patterns = [];
  metrics.security.sequential_scans.clear();
  metrics.security.rapid_requests.clear();
  metrics.security.blocked_attempts = 0;
  metrics.security.last_cleanup = Date.now();
  metrics.system.memory_alerts = {
    total_warnings: 0,
    total_critical: 0,
    last_warning: null,
    last_critical: null
  };
  logger.info('Monitoring metrics reset');
};

// TTL cleanup para Maps de security
const cleanupSecurityMaps = () => {
  const now = Date.now();
  const ttlMs = parseInt(process.env.SECURITY_MAPS_TTL_MS) || 300000; // 5 min default
  
  // Cleanup sequential_scans
  for (const [ip, scans] of metrics.security.sequential_scans.entries()) {
    for (const endpoint in scans) {
      scans[endpoint] = scans[endpoint].filter(scan => now - scan.timestamp < ttlMs);
      if (scans[endpoint].length === 0) {
        delete scans[endpoint];
      }
    }
    if (Object.keys(scans).length === 0) {
      metrics.security.sequential_scans.delete(ip);
    }
  }
  
  // Cleanup rapid_requests
  for (const [ip, requests] of metrics.security.rapid_requests.entries()) {
    const recentRequests = requests.filter(timestamp => now - timestamp < ttlMs);
    if (recentRequests.length === 0) {
      metrics.security.rapid_requests.delete(ip);
    } else {
      metrics.security.rapid_requests.set(ip, recentRequests);
    }
  }
  
  metrics.security.last_cleanup = now;
  logger.debug('Security maps cleanup completed', {
    sequential_scans_ips: metrics.security.sequential_scans.size,
    rapid_requests_ips: metrics.security.rapid_requests.size
  });
};

// Iniciar coleta de métricas do sistema e cleanup (omitido em testes)
if (process.env.NODE_ENV !== 'test') {
  const metricsInterval = parseInt(process.env.METRICS_COLLECT_INTERVAL_MS) || 6000;
  const cleanupInterval = parseInt(process.env.SECURITY_CLEANUP_INTERVAL_MS) || 60000;
  
  setInterval(collectSystemMetrics, metricsInterval);
  setInterval(cleanupSecurityMaps, cleanupInterval);
  
  logger.info('Monitoring intervals started', {
    metrics_interval_ms: metricsInterval,
    cleanup_interval_ms: cleanupInterval
  });
}

module.exports = {
  performanceMonitoring,
  errorMonitoring,
  getMetrics,
  resetMetrics,
  cleanupSecurityMaps,
  metrics // Para testes
};
