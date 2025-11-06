/**
 * @swagger
 * tags:
 *   name: Health
 *   description: Health monitoring and status endpoints
 */

const express = require('express');
const { testConnection, sequelize } = require('../config/database');
const { testRedisConnection } = require('../config/redis');
const { catchAsync } = require('../middleware/errorHandler');
const { getMetrics, resetMetrics } = require('../middleware/monitoring');
const { requireInternalAccessKey } = require('../middleware/accessKey');

const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Get comprehensive health status
 *     tags: [Health]
 *     description: Returns detailed health information including database, cache, and system metrics
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 *       503:
 *         $ref: '#/components/responses/Success'
 */
router.get('/', requireInternalAccessKey, catchAsync(async (req, res) => {
  const startTime = Date.now();
  
  const [dbStatus, redisStatus, relationshipStatus] = await Promise.all([
    testConnection().catch(() => false),
    testRedisConnection().catch(() => false),
    checkRelationshipIntegrity().catch(() => ({ status: 'error', details: 'Health check failed' }))
  ]);

  const responseTime = Date.now() - startTime;
  const metrics = getMetrics();

async function checkRelationshipIntegrity() {
  try {
    const [linkCheck] = await sequelize.query(`
      SELECT 1 as exists_check
      FROM persons_signatures
      LIMIT 1
    `, { type: sequelize.QueryTypes.SELECT });

    return {
      status: linkCheck ? 'healthy' : 'no_links',
      last_checked: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      last_checked: new Date().toISOString()
    };
  }
}

  const healthData = {
    health: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTime: `${responseTime}ms`,
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: {
        status: dbStatus ? 'connected' : 'disconnected',
        type: 'MariaDB'
      },
      cache: {
        status: redisStatus ? 'connected' : 'disconnected', 
        type: 'Redis'
      },
      relationships: relationshipStatus
    },
    system: {
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      },
      cpu: {
        usage: process.cpuUsage()
      }
    },
    monitoring: {
      uptime: metrics.uptime_human,
      requests: {
        total: metrics.requests.total,
        performance: metrics.requests.performance,
        top_endpoints: metrics.requests.top_endpoints.slice(0, 5)
      },
      errors: {
        total: metrics.errors.total,
        error_rate: `${metrics.errors.error_rate}%`,
        recent_count: metrics.errors.recent_count
      },
      system_metrics: {
        memory_mb: metrics.system.free_memory_mb,
        total_memory_mb: metrics.system.total_memory_mb,
        cpu_cores: metrics.system.cpu_cores,
        load_average: metrics.system.load_average
      }
    }
  };

  if (!dbStatus || relationshipStatus.status === 'error') {
    healthData.health = 'degraded';
  }

  if (metrics.errors.error_rate > 5) {
    healthData.health = 'degraded';
  }

  const httpStatus = healthData.health === 'ok' ? 200 : 503;
  res.status(httpStatus).json({
    status: 'success',
    data: healthData
  });
}));

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Kubernetes readiness probe
 *     description: Check if the service is ready to accept requests. Validates database connectivity and essential dependencies.
 *     tags: [Health]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 *       503:
 *         $ref: '#/components/responses/BadRequest'
 */
router.get('/ready', requireInternalAccessKey, catchAsync(async (req, res) => {
  const dbStatus = await testConnection().catch(() => false);
  
  if (dbStatus) {
    res.status(200).json({
      status: 'success',
      data: {
        ready: true,
        message: 'Service is ready to accept requests'
      }
    });
  } else {
    res.status(503).json({
      status: 'error',
      message: 'Service dependencies are not available',
      code: 'SERVICE_NOT_READY'
    });
  }
}));

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Kubernetes liveness probe
 *     description: Basic health check to verify the service is running and responsive. Always returns success if the service is operational.
 *     tags: [Health]
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      alive: true,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * @swagger
 * /health/metrics:
 *   get:
 *     summary: Get detailed monitoring metrics
 *     tags: [Health]
 *     description: Returns comprehensive performance and system metrics for monitoring
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 */
router.get('/metrics', requireInternalAccessKey, catchAsync(async (req, res) => {
  const metrics = getMetrics();
  res.json({
    status: 'success',
    data: metrics
  });
}));

module.exports = router;
