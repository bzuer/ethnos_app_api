const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../middleware/errorHandler');
const sphinxService = require('./sphinx.service');
const redis = require('../config/redis');

const SPHINX_DATA_DIR = process.env.SPHINX_DATA_DIR || path.resolve(__dirname, '..', '..', 'runtime', 'sphinx');

class SphinxMonitoringService {
    constructor() {
        this.metrics = {
            queries_per_second: 0,
            avg_response_time: 0,
            cache_hit_rate: 0,
            index_size_mb: 0,
            memory_usage_mb: 0,
            error_rate: 0,
            uptime_seconds: 0
        };
        
        this.queryHistory = [];
        this.maxHistorySize = 1000;
        this.collectInterval = 60000;
        this._intervalHandle = null;
        this._started = false;
    }

    async startCollection() {
        await this.collectMetrics();
        
        this._intervalHandle = setInterval(() => {
            this.collectMetrics();
        }, this.collectInterval);
        
        logger.info('Sphinx monitoring service started', {
            collectInterval: this.collectInterval
        });
    }

    async start() {
        if (this._started) return;
        this._started = true;
        try {
            await this.startCollection();
        } catch (err) {
            logger.warn('Sphinx monitoring could not start. Will retry on next cycle.', { error: err.message });
            this._started = false;
        }
    }

    async collectMetrics() {
        try {
            const startTime = Date.now();
            
            const status = await sphinxService.getStatus();
            const indexStats = await this.getIndexStats();
            const queryStats = this.calculateQueryStats();
            
            this.metrics = {
                ...status,
                ...indexStats,
                ...queryStats,
                collected_at: new Date().toISOString(),
                collection_time_ms: Date.now() - startTime
            };
            
            if (redis.connected) {
                await redis.setex('sphinx:metrics', 300, JSON.stringify(this.metrics));
            }
            
            await this.checkThresholds();
            
            return this.metrics;
            
        } catch (error) {
            logger.error('Failed to collect Sphinx metrics', error);
            
            this.metrics.error_rate = 1.0;
            this.metrics.last_error = error.message;
            this.metrics.collected_at = new Date().toISOString();
        }
    }

    async getIndexStats() {
        try {
            const indexDir = SPHINX_DATA_DIR;
            const files = await fs.readdir(indexDir);
            
            let totalSize = 0;
            let indexFiles = 0;
            
            for (const file of files) {
                if (file.startsWith('works_') && !file.includes('.lock') && !file.includes('.tmp')) {
                    const stats = await fs.stat(`${indexDir}/${file}`);
                    totalSize += stats.size;
                    indexFiles++;
                }
            }
            
            const rtStats = await this.getRTIndexStats();
            
            return {
                index_size_mb: Math.round(totalSize / 1024 / 1024 * 100) / 100,
                index_files: indexFiles,
                rt_index_size_mb: Math.round(rtStats.size / 1024 / 1024 * 100) / 100,
                rt_index_documents: rtStats.documents
            };
            
        } catch (error) {
            logger.error('Failed to get index stats', error);
            return {
                index_size_mb: 0,
                index_files: 0,
                rt_index_size_mb: 0,
                rt_index_documents: 0
            };
        }
    }

    async getRTIndexStats() {
        try {
            const rtFiles = [
                path.join(SPHINX_DATA_DIR, 'works_rt.ram'),
                path.join(SPHINX_DATA_DIR, 'works_rt.meta')
            ];
            let size = 0;
            let documents = 0;
            
            for (const file of rtFiles) {
                try {
                    const stats = await fs.stat(file);
                    size += stats.size;
                } catch (err) {
                }
            }
            
            try {
                await sphinxService.ensureConnection();
                const result = await new Promise((resolve, reject) => {
                    sphinxService.connection.query(
                        'SELECT COUNT(*) as count FROM works_rt',
                        (error, results) => {
                            if (error) reject(error);
                            else resolve(results[0]?.count || 0);
                        }
                    );
                });
                documents = result;
            } catch (err) {
            }
            
            return { size, documents };
            
        } catch (error) {
            return { size: 0, documents: 0 };
        }
    }

    calculateQueryStats() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const oneHourAgo = now - 3600000;
        
        const recentQueries = this.queryHistory.filter(q => q.timestamp > oneMinuteAgo);
        const hourlyQueries = this.queryHistory.filter(q => q.timestamp > oneHourAgo);
        
        const qps = recentQueries.length / 60;
        const avgResponseTime = recentQueries.length > 0 
            ? recentQueries.reduce((sum, q) => sum + q.responseTime, 0) / recentQueries.length 
            : 0;
        
        const errorRate = recentQueries.length > 0 
            ? recentQueries.filter(q => q.error).length / recentQueries.length 
            : 0;
        
        const slowQueries = recentQueries.filter(q => q.responseTime > 50);
        const slowQueryRate = recentQueries.length > 0 
            ? slowQueries.length / recentQueries.length 
            : 0;
        
        return {
            queries_per_second: Math.round(qps * 100) / 100,
            avg_response_time: Math.round(avgResponseTime * 100) / 100,
            error_rate: Math.round(errorRate * 1000) / 1000,
            slow_query_rate: Math.round(slowQueryRate * 1000) / 1000,
            queries_last_minute: recentQueries.length,
            queries_last_hour: hourlyQueries.length
        };
    }

    recordQuery(query, responseTime, error = null) {
        this.queryHistory.push({
            query: query?.substring(0, 100) || 'unknown',
            responseTime,
            error: Boolean(error),
            timestamp: Date.now()
        });
        
        if (this.queryHistory.length > this.maxHistorySize) {
            this.queryHistory = this.queryHistory.slice(-this.maxHistorySize);
        }
    }

    async checkThresholds() {
        const alerts = [];
        
        if (this.metrics.queries_per_second > 100) {
            alerts.push({
                type: 'high_query_volume',
                message: `High query volume: ${this.metrics.queries_per_second} QPS`,
                severity: 'warning'
            });
        }
        
        if (this.metrics.avg_response_time > 50) {
            alerts.push({
                type: 'slow_queries',
                message: `Slow query performance: ${this.metrics.avg_response_time}ms average`,
                severity: 'warning'
            });
        }
        
        if (this.metrics.error_rate > 0.05) {
            alerts.push({
                type: 'high_error_rate',
                message: `High error rate: ${(this.metrics.error_rate * 100).toFixed(1)}%`,
                severity: 'critical'
            });
        }
        
        if (this.metrics.index_size_mb > 1000) {
            alerts.push({
                type: 'large_index',
                message: `Large index size: ${this.metrics.index_size_mb}MB`,
                severity: 'info'
            });
        }
        
        if (this.metrics.rt_index_size_mb > 100) {
            alerts.push({
                type: 'large_rt_index',
                message: `Large RT index: ${this.metrics.rt_index_size_mb}MB`,
                severity: 'warning'
            });
        }
        
        for (const alert of alerts) {
            const logLevel = alert.severity === 'critical' ? 'error' : 
                            alert.severity === 'warning' ? 'warn' : 'info';
            
            logger[logLevel]('Sphinx monitoring alert', alert);
        }
        
        return alerts;
    }

    getMetrics() {
        return {
            ...this.metrics,
            query_history_size: this.queryHistory.length
        };
    }

    getDetailedMetrics() {
        const recentQueries = this.queryHistory.slice(-100);
        
        return {
            metrics: this.getMetrics(),
            recent_queries: recentQueries.map(q => ({
                query: q.query,
                responseTime: q.responseTime,
                error: q.error,
                timestamp: new Date(q.timestamp).toISOString()
            })),
            performance_distribution: this.getPerformanceDistribution()
        };
    }

    getPerformanceDistribution() {
        const recentQueries = this.queryHistory.filter(q => q.timestamp > Date.now() - 3600000);
        
        const buckets = {
            'fast_0_10ms': 0,
            'good_10_50ms': 0,
            'slow_50_100ms': 0,
            'very_slow_100ms_plus': 0
        };
        
        recentQueries.forEach(query => {
            if (query.responseTime <= 10) buckets.fast_0_10ms++;
            else if (query.responseTime <= 50) buckets.good_10_50ms++;
            else if (query.responseTime <= 100) buckets.slow_50_100ms++;
            else buckets.very_slow_100ms_plus++;
        });
        
        return {
            total_queries: recentQueries.length,
            distribution: buckets,
            percentiles: this.calculatePercentiles(recentQueries.map(q => q.responseTime))
        };
    }

    calculatePercentiles(values) {
        if (values.length === 0) return {};
        
        const sorted = values.sort((a, b) => a - b);
        
        return {
            p50: this.getPercentile(sorted, 50),
            p90: this.getPercentile(sorted, 90),
            p95: this.getPercentile(sorted, 95),
            p99: this.getPercentile(sorted, 99)
        };
    }

    getPercentile(sortedValues, percentile) {
        const index = Math.ceil(sortedValues.length * (percentile / 100)) - 1;
        return sortedValues[Math.max(0, index)];
    }

    reset() {
        this.queryHistory = [];
        this.metrics = {
            queries_per_second: 0,
            avg_response_time: 0,
            cache_hit_rate: 0,
            index_size_mb: 0,
            memory_usage_mb: 0,
            error_rate: 0,
            uptime_seconds: 0
        };
        
        logger.info('Sphinx monitoring metrics reset');
        return { reset: true };
    }
}

module.exports = new SphinxMonitoringService();
