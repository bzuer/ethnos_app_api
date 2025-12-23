const { logger } = require('../middleware/errorHandler');
const sphinxService = require('./sphinx.service');

class RealTimeIndexingService {
    constructor() {
        this.enabled = process.env.SPHINX_RT_INDEXING !== 'false';
        this.retryQueue = [];
        this.processing = false;
        this.maxRetries = 3;
        
        if (this.enabled && process.env.NODE_ENV !== 'test') {
            this.startQueueProcessor();
        }
    }

    async indexNewWork(workData) {
        if (!this.enabled) {
            logger.debug('Real-time indexing disabled');
            return { success: true, skipped: true };
        }
        
        try {
            await sphinxService.ensureConnection();
            await sphinxService.indexWork(workData);
            
            logger.info('Real-time indexing successful', { 
                work_id: workData.id,
                title: workData.title?.substring(0, 50) + '...'
            });
            
            return { success: true, indexed: true };
            
        } catch (error) {
            logger.error('Real-time indexing failed', {
                work_id: workData.id,
                error: error.message
            });
            
            this.addToRetryQueue('INSERT', workData);
            
            return { success: false, queued: true, error: error.message };
        }
    }

    async updateWork(workId, updateData) {
        if (!this.enabled) {
            return { success: true, skipped: true };
        }
        
        try {
            await sphinxService.ensureConnection();
            await sphinxService.updateWork(workId, updateData);
            
            logger.info('Real-time update successful', { 
                work_id: workId,
                fields: Object.keys(updateData)
            });
            
            return { success: true, updated: true };
            
        } catch (error) {
            logger.error('Real-time update failed', {
                work_id: workId,
                error: error.message
            });
            
            this.addToRetryQueue('UPDATE', { id: workId, ...updateData });
            
            return { success: false, queued: true, error: error.message };
        }
    }

    async deleteWork(workId) {
        if (!this.enabled) {
            return { success: true, skipped: true };
        }
        
        try {
            await sphinxService.ensureConnection();
            
            const sql = `DELETE FROM works_rt WHERE id = ?`;
            await sphinxService.connection.query(sql, [workId]);
            
            logger.info('Real-time deletion successful', { work_id: workId });
            
            return { success: true, deleted: true };
            
        } catch (error) {
            logger.error('Real-time deletion failed', {
                work_id: workId,
                error: error.message
            });
            
            this.addToRetryQueue('DELETE', { id: workId });
            
            return { success: false, queued: true, error: error.message };
        }
    }

    addToRetryQueue(operation, data) {
        this.retryQueue.push({
            operation,
            data,
            attempts: 0,
            added_at: new Date(),
            next_retry: new Date(Date.now() + 5000)
        });
        
        logger.debug('Added item to retry queue', { 
            operation, 
            work_id: data.id, 
            queue_size: this.retryQueue.length 
        });
    }

    startQueueProcessor() {
        setInterval(() => {
            this.processRetryQueue();
        }, 10000);
        
        logger.info('Real-time indexing queue processor started');
    }

    async processRetryQueue() {
        if (this.processing || this.retryQueue.length === 0) {
            return;
        }
        
        this.processing = true;
        
        try {
            const now = new Date();
            const itemsToProcess = this.retryQueue.filter(item => item.next_retry <= now);
            
            for (const item of itemsToProcess) {
                try {
                    let result;
                    
                    switch (item.operation) {
                        case 'INSERT':
                            result = await sphinxService.indexWork(item.data);
                            break;
                        case 'UPDATE':
                            result = await sphinxService.updateWork(item.data.id, item.data);
                            break;
                        case 'DELETE':
                            const sql = `DELETE FROM works_rt WHERE id = ?`;
                            result = await sphinxService.connection.query(sql, [item.data.id]);
                            break;
                    }
                    
                    this.retryQueue = this.retryQueue.filter(i => i !== item);
                    
                    logger.info('Retry queue item processed successfully', {
                        operation: item.operation,
                        work_id: item.data.id,
                        attempts: item.attempts + 1
                    });
                    
                } catch (error) {
                    item.attempts++;
                    
                    if (item.attempts >= this.maxRetries) {
                        this.retryQueue = this.retryQueue.filter(i => i !== item);
                        
                        logger.error('Retry queue item failed permanently', {
                            operation: item.operation,
                            work_id: item.data.id,
                            attempts: item.attempts,
                            error: error.message
                        });
                    } else {
                        const delay = Math.pow(2, item.attempts) * 5000;
                        item.next_retry = new Date(Date.now() + delay);
                        
                        logger.warn('Retry queue item failed, scheduling retry', {
                            operation: item.operation,
                            work_id: item.data.id,
                            attempts: item.attempts,
                            next_retry: item.next_retry
                        });
                    }
                }
            }
            
        } catch (error) {
            logger.error('Retry queue processing failed', error);
        } finally {
            this.processing = false;
        }
    }

    getQueueStatus() {
        const now = new Date();
        const pending = this.retryQueue.filter(item => item.next_retry <= now).length;
        const waiting = this.retryQueue.length - pending;
        
        return {
            enabled: this.enabled,
            total_queued: this.retryQueue.length,
            pending_retry: pending,
            waiting_retry: waiting,
            processing: this.processing
        };
    }

    clearQueue() {
        const cleared = this.retryQueue.length;
        this.retryQueue = [];
        
        logger.info('Retry queue cleared', { items_cleared: cleared });
        
        return { cleared };
    }

    enable() {
        this.enabled = true;
        process.env.SPHINX_RT_INDEXING = 'true';
        
        if (!this.processing) {
            this.startQueueProcessor();
        }
        
        logger.info('Real-time indexing enabled');
        return { enabled: true };
    }

    disable() {
        this.enabled = false;
        process.env.SPHINX_RT_INDEXING = 'false';
        
        logger.info('Real-time indexing disabled');
        return { enabled: false };
    }
}

module.exports = new RealTimeIndexingService();
