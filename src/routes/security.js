const express = require('express');
const router = express.Router();
const { getViolationStats, getBlockedIPs, unblockIP } = require('../middleware/rateLimiting');
const { createAccessKeyGuard } = require('../middleware/accessKey');
const { logger } = require('../middleware/errorHandler');

const requireAccessKey = createAccessKeyGuard({
  envVars: [
    'API_KEY',
    'SECURITY_ACCESS_KEY',
    'INTERNAL_ACCESS_KEY',
    'API_ACCESS_KEY',
    'ETHNOS_API_KEY',
    'ETHNOS_API_ACCESS_KEY',
    'API_SECRET_KEY',
  ],
  context: 'security API',
});

/**
 * @swagger
 * /security/headers:
 *   get:
 *     summary: Inspect active security headers and CORS configuration
 *     description: Returns the currently active HTTP security headers as set by middleware and the effective CORS configuration. Requires internal access key.
 *     tags: [Security]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         description: Security headers snapshot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     headers:
 *                       type: object
 *                     cors:
 *                       type: object
 *                     missing_headers:
 *                       type: array
 *                       items: { type: string }
 */
router.get('/headers', requireAccessKey, (req, res) => {
  const headers = {
    'content-security-policy': res.get('Content-Security-Policy') || null,
    'strict-transport-security': res.get('Strict-Transport-Security') || null,
    'x-frame-options': res.get('X-Frame-Options') || null,
    'x-content-type-options': res.get('X-Content-Type-Options') || null,
    'referrer-policy': res.get('Referrer-Policy') || null,
    'x-dns-prefetch-control': res.get('X-DNS-Prefetch-Control') || null,
    'x-permitted-cross-domain-policies': res.get('X-Permitted-Cross-Domain-Policies') || null,
    'x-download-options': res.get('X-Download-Options') || null,
    'x-powered-by': res.get('X-Powered-By') || null
  };

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : ['http://localhost:1210', 'http://localhost:3000', 'http://localhost:3001', 'https://ethnos.app'];

  const cors = {
    allowed_origins: allowedOrigins,
    allowed_methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowed_headers: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-access-key', 'x-internal-key', 'x-api-key'],
    credentials: true
  };

  const missing = Object.keys(headers).filter(k => headers[k] === null && k !== 'x-powered-by');

  return res.success({ headers, cors, missing_headers: missing }, {
    meta: { inspected_at: new Date().toISOString() }
  });
});

/**
 * @swagger
 * /security/audit:
 *   get:
 *     summary: Audit protected routes for access key enforcement
 *     description: Quick static sweep of key route groups to verify internal access key enforcement.
 *     tags: [Security]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         description: Audit results
 */
router.get('/audit', requireAccessKey, (req, res) => {
  const audit = {};
  try {
    const dashboardRouter = require('../routes/dashboard');
    const metricsRouter = require('../routes/metrics');
    const healthRouter = require('../routes/health');

    const hasGuardInStack = (router, guardName) => Array.isArray(router.stack) && router.stack.some(layer => {
      if (layer && layer.name === guardName) return true;
      if (layer && layer.handle && layer.handle.name === guardName) return true;
      if (layer && layer.route && Array.isArray(layer.route.stack)) {
        return layer.route.stack.some(l2 => l2 && (l2.name === guardName || (l2.handle && l2.handle.name === guardName)));
      }
      return false;
    });

    audit.dashboard_protected = hasGuardInStack(dashboardRouter, 'requireInternalAccessKey');
    audit.metrics_protected = hasGuardInStack(metricsRouter, 'requireInternalAccessKey');
    const healthProtected = hasGuardInStack(healthRouter, 'requireInternalAccessKey');
    audit.health_protected = healthProtected;
    audit.security_protected = true; // this router uses key guards on endpoints

    const missing = Object.keys(audit).filter(k => audit[k] === false);

    return res.success({ audit, missing }, { meta: { inspected_at: new Date().toISOString() } });
  } catch (error) {
    return res.error(error, { code: 'SECURITY_AUDIT_ERROR' });
  }
});

/**
 * @swagger
 * /security/stats:
 *   get:
 *     summary: Get security monitoring statistics
 *     description: Returns rate limiting violations, blocked IPs, and security metrics
 *     tags: [Security]
 *     security:
 *       - XAccessKey: []
 *     responses:
 *       200:
 *         description: Security statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     violations:
 *                       type: object
 *                       description: IP addresses with recent violations
 *                     blocked_ips:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Currently blocked IP addresses
 *                     stats:
 *                       type: object
 *                       properties:
 *                         total_blocked:
 *                           type: number
 *                         total_violations:
 *                           type: number
 */
router.get('/stats', requireAccessKey, (req, res) => {
  try {
    const t0 = Date.now();
    const violations = getViolationStats();
    const blockedIPs = getBlockedIPs();
    
    return res.success({
      violations,
      blocked_ips: blockedIPs,
      stats: {
        total_blocked: blockedIPs.length,
        total_violations: Object.keys(violations).length
      }
    }, {
      meta: {
        generated_at: new Date().toISOString(),
        performance: { controller_time_ms: Date.now() - t0 }
      }
    });
  } catch (error) {
    logger.error('Error getting security stats:', error);
    return res.error(error, { code: 'SECURITY_STATS_ERROR' });
  }
});

/**
 * @swagger
 * /security/unblock/{ip}:
 *   post:
 *     summary: Unblock an IP address (admin function)
 *     description: Remove an IP from the blocked list
 *     tags: [Security]
 *     security:
 *       - XAccessKey: []
 *     parameters:
 *       - in: path
 *         name: ip
 *         required: true
 *         schema:
 *           type: string
 *         description: IP address to unblock
 *     responses:
 *       200:
 *         description: IP unblocked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: IP unblocked successfully
 *       400:
 *         description: Invalid IP format
 *       404:
 *         description: IP not found in blocked list
 */
router.post('/unblock/:ip', requireAccessKey, (req, res) => {
  try {
    const { ip } = req.params;
    
    // IP validation for IPv4 and IPv6
    const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Pattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
    
    if (!ipv4Pattern.test(ip) && !ipv6Pattern.test(ip) && !ip.startsWith('::ffff:')) {
      return res.fail('Invalid IP address format', {
        statusCode: 400,
        code: 'INVALID_IP'
      });
    }
    
    const blockedIPs = getBlockedIPs();
    if (!blockedIPs.includes(ip)) {
      return res.fail('IP address not found in blocked list', {
        statusCode: 404,
        code: 'IP_NOT_BLOCKED'
      });
    }
    
    unblockIP(ip);
    
    logger.info('IP unblocked via API', { 
      ip, 
      requestor_ip: req.ip,
      timestamp: new Date().toISOString()
    });
    
    return res.success({ unblocked_ip: ip }, { meta: { generated_at: new Date().toISOString() } });
    
  } catch (error) {
    logger.error('Error unblocking IP:', error);
    return res.error(error, { code: 'UNBLOCK_ERROR' });
  }
});

module.exports = router;
