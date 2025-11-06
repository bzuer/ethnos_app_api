const { getRedisClient } = require('../config/redis');
const { logger } = require('../middleware/errorHandler');

class CacheService {
  constructor() {
    this.defaultTTL = {
      search: parseInt(process.env.CACHE_TTL_SEARCH) || 3600,
      statistics: parseInt(process.env.CACHE_TTL_STATISTICS) || 86400,
      workDetails: parseInt(process.env.CACHE_TTL_WORK_DETAILS) || 7200,
      listings: parseInt(process.env.CACHE_TTL_LISTINGS) || 7200,
      relationships: parseInt(process.env.CACHE_TTL_RELATIONSHIPS) || 3600,
      organizations: parseInt(process.env.CACHE_TTL_ORGANIZATIONS) || 14400,
      signatures_statistics: parseInt(process.env.CACHE_TTL_SIGNATURES_STATISTICS) || 172800,
      venues_statistics: parseInt(process.env.CACHE_TTL_VENUES_STATISTICS) || 86400,
      default: parseInt(process.env.CACHE_TTL_DEFAULT) || 1800
    };

    this.memoryCache = new Map();
  }

  generateKey(prefix, identifier, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    
    return `${prefix}:${identifier}${sortedParams ? `|${sortedParams}` : ''}`;
  }

  async get(key) {
    try {
      const client = getRedisClient();
      const isProduction = process.env.NODE_ENV === 'production';
      const redisMandatory = process.env.REDIS_MANDATORY_IN_PRODUCTION === 'true';
      
      if (!client) {
        if (isProduction && redisMandatory) {
          logger.error('Redis required in production but not available', {
            key,
            redis_mandatory: redisMandatory,
            environment: process.env.NODE_ENV
          });
          return null;
        }
        
        this._cleanupExpiredMemoryEntries();

        const memoryEntry = this.memoryCache.get(key);
        if (!memoryEntry) {
          return null;
        }

        if (memoryEntry.expiresAt && memoryEntry.expiresAt <= Date.now()) {
          this.memoryCache.delete(key);
          return null;
        }

        logger.debug(`Cache HIT (memory): ${key}`);
        return memoryEntry.value;
      }

      const value = await client.get(key);
      if (value) {
        logger.debug(`Cache HIT (Redis): ${key}`);
        return JSON.parse(value);
      }
      
      logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      logger.warn('Cache get error:', error.message);
      return null;
    }
  }

  async set(key, value, ttlType = 'default') {
    const ttl = this.defaultTTL[ttlType] || this.defaultTTL.default;
    
    try {
      const client = getRedisClient();
      const isProduction = process.env.NODE_ENV === 'production';
      const redisMandatory = process.env.REDIS_MANDATORY_IN_PRODUCTION === 'true';
      
      if (!client) {
        if (isProduction && redisMandatory) {
          logger.error('Redis required in production but not available for SET', {
            key,
            ttlType,
            redis_mandatory: redisMandatory
          });
          return false;
        }
        
        this.memoryCache.set(key, {
          value,
          expiresAt: Date.now() + (ttl * 1000)
        });
        logger.debug(`Cache SET (memory): ${key} (TTL: ${ttl}s)`);
        return true;
      }

      await client.setex(key, ttl, JSON.stringify(value));
      logger.debug(`Cache SET (Redis): ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      logger.warn('Cache set error:', error.message);
      return false;
    }
  }

  async del(key) {
    try {
      const client = getRedisClient();
      if (!client) {
        const existed = this.memoryCache.has(key);
        this.memoryCache.delete(key);
        logger.debug(`Cache DEL (memory): ${key}`);
        return existed;
      }

      const result = await client.del(key);
      logger.debug(`Cache DEL (Redis): ${key}`);
      return result > 0;
    } catch (error) {
      logger.warn('Cache delete error:', error.message);
      return false;
    }
  }

  async flush() {
    try {
      const client = getRedisClient();
      if (!client) {
        const count = this.memoryCache.size;
        this.memoryCache.clear();
        logger.info(`Cache FLUSH (memory): ${count} keys cleared`);
        return true;
      }

      await client.flushdb();
      logger.info('Cache FLUSH (Redis): all keys cleared');
      return true;
    } catch (error) {
      logger.warn('Cache flush error:', error.message);
      return false;
    }
  }

  async exists(key) {
    try {
      const client = getRedisClient();
      if (!client) {
        const memoryEntry = this.memoryCache.get(key);
        if (!memoryEntry) return false;
        
        if (memoryEntry.expiresAt && memoryEntry.expiresAt <= Date.now()) {
          this.memoryCache.delete(key);
          return false;
        }
        return true;
      }

      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.warn('Cache exists error:', error.message);
      return false;
    }
  }

  _cleanupExpiredMemoryEntries() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug(`Cache cleanup: removed ${cleanedCount} expired entries`);
    }
  }

  getStats() {
    const client = getRedisClient();
    return {
      redis_connected: !!client,
      memory_cache_size: this.memoryCache.size,
      ttl_config: this.defaultTTL
    };
  }
}

module.exports = new CacheService();
