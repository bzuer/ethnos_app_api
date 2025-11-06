const { logger } = require('../middleware/errorHandler');
const sphinxService = require('./sphinx.service');

class SphinxHealthCheckService {
    constructor() {
        this.healthMetrics = {
            errorRate: 0,
            avgResponseTime: 0,
            consecutiveFailures: 0,
            lastSuccessfulCheck: new Date(),
            recentErrors: []
        };
        
        this.rollbackThresholds = {
            errorRate: 0.05,        // 5%
            avgResponseTime: 100,   // 100ms
            consecutiveFailures: 5  // 5 failures in a row
        };
        
        this.rollbackActive = false;
        this.checkInterval = 30000; // 30 seconds
        this.recentChecks = [];
        this.maxRecentChecks = 20;
        this.recoverySuccessThreshold = 3;
        this._intervalHandle = null;
    }

    async startMonitoring() {
        logger.info('Starting Sphinx health monitoring', {
            checkInterval: this.checkInterval,
            thresholds: this.rollbackThresholds
        });
        
        if (this._intervalHandle) {
            clearInterval(this._intervalHandle);
        }
        this._intervalHandle = setInterval(() => {
            this.performHealthCheck();
        }, this.checkInterval);
        
        // Initial check
        await this.performHealthCheck();
    }

    async stopMonitoring() {
        if (this._intervalHandle) {
            clearInterval(this._intervalHandle);
            this._intervalHandle = null;
        }
    }

    async performHealthCheck() {
        const startTime = Date.now();
        let success = false;
        let error = null;
        
        try {
            const status = await sphinxService.getStatus();
            const responseTime = Date.now() - startTime;
            
            if (status.connected) {
                success = true;
                this.healthMetrics.lastSuccessfulCheck = new Date();
                this.healthMetrics.consecutiveFailures = 0;
            } else {
                error = new Error('Sphinx not connected');
            }
            
            await this.updateMetrics(responseTime, success, error);
            
        } catch (err) {
            error = err;
            const responseTime = Date.now() - startTime;
            await this.updateMetrics(responseTime, false, error);
            
            logger.error('Sphinx health check failed', {
                error: err.message,
                responseTime,
                consecutiveFailures: this.healthMetrics.consecutiveFailures
            });
        }
        
        if (this.shouldExecuteRollback()) {
            await this.executeRollback();
        }
    }

    async updateMetrics(responseTime, success, error) {
        // Add to recent checks
        this.recentChecks.push({
            timestamp: new Date(),
            responseTime,
            success,
            error: error?.message || null
        });
        
        // Keep only recent checks
        if (this.recentChecks.length > this.maxRecentChecks) {
            this.recentChecks = this.recentChecks.slice(-this.maxRecentChecks);
        }
        
        // Update consecutive failures
        if (!success) {
            this.healthMetrics.consecutiveFailures++;
            this.healthMetrics.recentErrors.push({
                timestamp: new Date(),
                error: error?.message || 'Unknown error',
                responseTime
            });
            
            // Keep only recent errors
            if (this.healthMetrics.recentErrors.length > 10) {
                this.healthMetrics.recentErrors = this.healthMetrics.recentErrors.slice(-10);
            }
        }
        
        // Calculate metrics from recent checks
        const successfulChecks = this.recentChecks.filter(c => c.success);
        const failedChecks = this.recentChecks.filter(c => !c.success);
        
        this.healthMetrics.errorRate = failedChecks.length / this.recentChecks.length;
        this.healthMetrics.avgResponseTime = successfulChecks.length > 0 
            ? successfulChecks.reduce((sum, c) => sum + c.responseTime, 0) / successfulChecks.length
            : 0;

        if (success && this.rollbackActive) {
            const recentWindow = this.recentChecks.slice(-this.recoverySuccessThreshold);
            const successfulWindow = recentWindow.filter(check => check.success).length;

            if (recentWindow.length >= this.recoverySuccessThreshold && successfulWindow === recentWindow.length) {
                await this.recoverFromRollback('automatic_health_recovery');
            }
        }
    }

    shouldExecuteRollback() {
        if (this.rollbackActive) return false;
        
        return (
            this.healthMetrics.errorRate > this.rollbackThresholds.errorRate ||
            this.healthMetrics.avgResponseTime > this.rollbackThresholds.avgResponseTime ||
            this.healthMetrics.consecutiveFailures >= this.rollbackThresholds.consecutiveFailures
        );
    }

    async executeRollback() {
        if (this.rollbackActive) return;
        
        this.rollbackActive = true;
        
        const rollbackReason = this.determineRollbackReason();
        
        logger.error('EXECUTING SPHINX ROLLBACK', {
            reason: rollbackReason,
            metrics: this.healthMetrics,
            timestamp: new Date().toISOString()
        });
        
        // Set environment variable to switch to MariaDB
        process.env.SEARCH_ENGINE = 'MARIADB';
        
        // Send critical alert (implement based on notification system)
        await this.sendCriticalAlert('Sphinx Rollback Executed', {
            reason: rollbackReason,
            metrics: this.healthMetrics
        });
        
        logger.error('Search traffic rolled back to MariaDB', {
            reason: rollbackReason,
            errorRate: this.healthMetrics.errorRate,
            avgResponseTime: this.healthMetrics.avgResponseTime,
            consecutiveFailures: this.healthMetrics.consecutiveFailures
        });
    }

    async recoverFromRollback(reason = 'automatic_health_recovery') {
        if (!this.rollbackActive) {
            return;
        }

        this.rollbackActive = false;
        delete process.env.SEARCH_ENGINE;

        this.healthMetrics.consecutiveFailures = 0;
        
        logger.info('Sphinx rollback cleared; traffic restored to Sphinx', {
            reason,
            timestamp: new Date().toISOString()
        });

        await this.sendCriticalAlert('Sphinx Recovery Executed', {
            reason,
            metrics: this.healthMetrics
        });
    }

    determineRollbackReason() {
        const reasons = [];
        
        if (this.healthMetrics.errorRate > this.rollbackThresholds.errorRate) {
            reasons.push(`high_error_rate_${(this.healthMetrics.errorRate * 100).toFixed(1)}%`);
        }
        
        if (this.healthMetrics.avgResponseTime > this.rollbackThresholds.avgResponseTime) {
            reasons.push(`slow_response_${this.healthMetrics.avgResponseTime.toFixed(0)}ms`);
        }
        
        if (this.healthMetrics.consecutiveFailures >= this.rollbackThresholds.consecutiveFailures) {
            reasons.push(`consecutive_failures_${this.healthMetrics.consecutiveFailures}`);
        }
        
        return reasons.join(',');
    }

    async sendCriticalAlert(title, data) {
        // Log critical alert (extend with email/Slack integration)
        logger.error(`CRITICAL ALERT: ${title}`, data);
        
        // Could integrate with notification systems:
        // await emailService.sendAlert(title, data);
        // await slackService.sendAlert(title, data);
    }

    async manualRollback(reason = 'manual_intervention') {
        logger.warn('Manual rollback initiated', { reason });
        
        this.rollbackActive = true;
        process.env.SEARCH_ENGINE = 'MARIADB';
        
        await this.sendCriticalAlert('Manual Sphinx Rollback', { reason });
        
        return { success: true, reason };
    }

    async manualRecovery() {
        logger.info('Manual recovery from rollback initiated');
        
        // Test Sphinx health before recovery
        try {
            const status = await sphinxService.getStatus();
            if (!status.connected) {
                throw new Error('Sphinx not ready for recovery');
            }
            
            // Reset rollback state
            this.rollbackActive = false;
            delete process.env.SEARCH_ENGINE;
            
            // Reset metrics
            this.healthMetrics.consecutiveFailures = 0;
            this.healthMetrics.errorRate = 0;
            this.healthMetrics.recentErrors = [];
            this.recentChecks = [];
            
            logger.info('Sphinx recovery completed successfully');
            return { success: true, message: 'Recovery completed' };
            
        } catch (error) {
            logger.error('Sphinx recovery failed', error);
            return { success: false, error: error.message };
        }
    }

    getHealthStatus() {
        return {
            rollbackActive: this.rollbackActive,
            searchEngine: process.env.SEARCH_ENGINE || 'SPHINX',
            metrics: this.healthMetrics,
            thresholds: this.rollbackThresholds,
            recentChecks: this.recentChecks.slice(-5) // Last 5 checks
        };
    }
}

module.exports = new SphinxHealthCheckService();
