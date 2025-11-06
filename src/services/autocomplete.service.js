const { logger } = require('../middleware/errorHandler');
const sphinxService = require('./sphinx.service');
const redis = require('../config/redis');

class AutocompleteService {
    constructor() {
        this.cachePrefix = 'autocomplete:';
        this.cacheTTL = 3600; // 1 hour
        this.minQueryLength = 2;
        this.maxSuggestions = 10;
        
        // Pre-built suggestion indices
        this.suggestionTypes = {
            titles: 'title_suggestions',
            authors: 'author_suggestions', 
            venues: 'venue_suggestions',
            keywords: 'keyword_suggestions'
        };
    }

    /**
     * Get autocomplete suggestions for search queries
     */
    async getSuggestions(query, type = 'all', limit = 10) {
        if (!query || query.length < this.minQueryLength) {
            return { suggestions: [], type: 'none' };
        }

        const cacheKey = `${this.cachePrefix}${type}:${query.toLowerCase()}`;
        
        // Check cache first
        if (redis.connected) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (error) {
                logger.warn('Autocomplete cache read failed', error);
            }
        }

        let suggestions = [];
        
        try {
            switch (type) {
                case 'titles':
                    suggestions = await this.getTitleSuggestions(query, limit);
                    break;
                case 'authors':
                    suggestions = await this.getAuthorSuggestions(query, limit);
                    break;
                case 'venues':
                    suggestions = await this.getVenueSuggestions(query, limit);
                    break;
                default:
                    suggestions = await this.getAllSuggestions(query, limit);
            }

            const result = {
                query,
                suggestions,
                type,
                count: suggestions.length,
                generated_at: new Date().toISOString()
            };

            // Cache the result
            if (redis.connected && suggestions.length > 0) {
                try {
                    await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
                } catch (error) {
                    logger.warn('Autocomplete cache write failed', error);
                }
            }

            return result;

        } catch (error) {
            logger.error('Autocomplete suggestions failed', { query, type, error: error.message });
            return { suggestions: [], type: 'error', error: error.message };
        }
    }

    /**
     * Get title-based suggestions using Sphinx
     */
    async getTitleSuggestions(query, limit) {
        await sphinxService.ensureConnection();
        
        const sql = `
            SELECT title, COUNT(*) as relevance
            FROM works_poc 
            WHERE MATCH('${query.replace(/'/g, "\\'")}')
            AND title != ''
            GROUP BY title
            ORDER BY relevance DESC, title
            LIMIT ${parseInt(limit)}
        `;

        return new Promise((resolve, reject) => {
            sphinxService.connection.query(sql, (error, results) => {
                if (error) {
                    reject(error);
                    return;
                }

                const suggestions = results.map(row => ({
                    text: row.title,
                    type: 'title',
                    relevance: row.relevance,
                    preview: row.title.substring(0, 100) + (row.title.length > 100 ? '...' : '')
                }));

                resolve(suggestions);
            });
        });
    }

    /**
     * Get author-based suggestions
     */
    async getAuthorSuggestions(query, limit) {
        await sphinxService.ensureConnection();
        
        const sql = `
            SELECT author_string, COUNT(*) as work_count
            FROM works_poc 
            WHERE MATCH('${query.replace(/'/g, "\\'")}')
            AND author_string != ''
            GROUP BY author_string
            ORDER BY work_count DESC
            LIMIT ${parseInt(limit)}
        `;

        return new Promise((resolve, reject) => {
            sphinxService.connection.query(sql, (error, results) => {
                if (error) {
                    reject(error);
                    return;
                }

                const suggestions = [];
                results.forEach(row => {
                    // Split author string and find matching authors
                    const authors = row.author_string.split(';').map(a => a.trim());
                    const matchingAuthors = authors.filter(author => 
                        author.toLowerCase().includes(query.toLowerCase())
                    );

                    matchingAuthors.forEach(author => {
                        if (!suggestions.find(s => s.text === author)) {
                            suggestions.push({
                                text: author,
                                type: 'author',
                                work_count: row.work_count,
                                preview: `${author} (${row.work_count} works)`
                            });
                        }
                    });
                });

                // Sort by work count and limit
                suggestions.sort((a, b) => b.work_count - a.work_count);
                resolve(suggestions.slice(0, limit));
            });
        });
    }

    /**
     * Get venue-based suggestions
     */
    async getVenueSuggestions(query, limit) {
        await sphinxService.ensureConnection();
        
        const sql = `
            SELECT venue_name, COUNT(*) as work_count
            FROM works_poc 
            WHERE MATCH('${query.replace(/'/g, "\\'")}')
            AND venue_name != ''
            GROUP BY venue_name
            ORDER BY work_count DESC
            LIMIT ${parseInt(limit)}
        `;

        return new Promise((resolve, reject) => {
            sphinxService.connection.query(sql, (error, results) => {
                if (error) {
                    reject(error);
                    return;
                }

                const suggestions = results.map(row => ({
                    text: row.venue_name,
                    type: 'venue',
                    work_count: row.work_count,
                    preview: `${row.venue_name} (${row.work_count} works)`
                }));

                resolve(suggestions);
            });
        });
    }

    /**
     * Get mixed suggestions from all types
     */
    async getAllSuggestions(query, limit) {
        const [titles, authors, venues] = await Promise.all([
            this.getTitleSuggestions(query, Math.ceil(limit / 3)),
            this.getAuthorSuggestions(query, Math.ceil(limit / 3)), 
            this.getVenueSuggestions(query, Math.ceil(limit / 3))
        ]);

        // Mix and prioritize suggestions
        const mixed = [
            ...titles.slice(0, 3),
            ...authors.slice(0, 3),
            ...venues.slice(0, 3),
            ...titles.slice(3),
            ...authors.slice(3),
            ...venues.slice(3)
        ];

        return mixed.slice(0, limit);
    }

    /**
     * Get popular search terms for suggestions
     */
    async getPopularTerms(limit = 20) {
        const cacheKey = `${this.cachePrefix}popular:terms`;
        
        // Check cache first
        if (redis.connected) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (error) {
                logger.warn('Popular terms cache read failed', error);
            }
        }

        try {
            await sphinxService.ensureConnection();
            
            // Get most common words from recent searches
            const sql = `
                SELECT 
                    SUBSTRING_INDEX(SUBSTRING_INDEX(title, ' ', numbers.n), ' ', -1) as term,
                    COUNT(*) as frequency
                FROM works_poc
                JOIN (
                    SELECT 1 n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL 
                    SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL
                    SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
                ) numbers
                ON CHAR_LENGTH(title) - CHAR_LENGTH(REPLACE(title, ' ', '')) >= numbers.n - 1
                WHERE CHAR_LENGTH(SUBSTRING_INDEX(SUBSTRING_INDEX(title, ' ', numbers.n), ' ', -1)) > 3
                AND year >= 2020
                GROUP BY term
                HAVING frequency > 10
                ORDER BY frequency DESC
                LIMIT ${parseInt(limit)}
            `;

            return new Promise((resolve, reject) => {
                sphinxService.connection.query(sql, (error, results) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    const terms = results.map(row => ({
                        term: row.term.toLowerCase(),
                        frequency: row.frequency,
                        type: 'popular'
                    }));

                    // Cache for 6 hours
                    if (redis.connected && terms.length > 0) {
                        redis.setex(cacheKey, 21600, JSON.stringify(terms));
                    }

                    resolve(terms);
                });
            });

        } catch (error) {
            logger.error('Popular terms generation failed', error);
            return [];
        }
    }

    /**
     * Record search query for analytics
     */
    async recordSearchQuery(query, resultCount = 0) {
        if (!query || query.length < 2) return;

        try {
            const key = `search_analytics:${new Date().toISOString().slice(0, 10)}`;
            const queryData = {
                query: query.toLowerCase(),
                timestamp: new Date().toISOString(),
                result_count: resultCount
            };

            if (redis.connected) {
                await redis.lpush(key, JSON.stringify(queryData));
                await redis.expire(key, 86400 * 30); // Keep for 30 days
            }

        } catch (error) {
            logger.warn('Search analytics recording failed', error);
        }
    }

    /**
     * Get search analytics
     */
    async getSearchAnalytics(days = 7) {
        if (!redis.connected) {
            return { analytics: [], message: 'Redis not available' };
        }

        try {
            const analytics = {};
            const today = new Date();

            for (let i = 0; i < days; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateKey = date.toISOString().slice(0, 10);
                const key = `search_analytics:${dateKey}`;

                const queries = await redis.lrange(key, 0, -1);
                const dayData = queries.map(q => JSON.parse(q));

                analytics[dateKey] = {
                    total_searches: dayData.length,
                    unique_queries: new Set(dayData.map(d => d.query)).size,
                    avg_results: dayData.length > 0 ? 
                        dayData.reduce((sum, d) => sum + d.result_count, 0) / dayData.length : 0,
                    top_queries: this.getTopQueries(dayData, 10)
                };
            }

            return analytics;

        } catch (error) {
            logger.error('Search analytics retrieval failed', error);
            return { analytics: {}, error: error.message };
        }
    }

    getTopQueries(dayData, limit = 10) {
        const queryCount = {};
        dayData.forEach(item => {
            queryCount[item.query] = (queryCount[item.query] || 0) + 1;
        });

        return Object.entries(queryCount)
            .sort(([,a], [,b]) => b - a)
            .slice(0, limit)
            .map(([query, count]) => ({ query, count }));
    }

    /**
     * Clear autocomplete cache
     */
    async clearCache() {
        if (!redis.connected) {
            return { cleared: false, message: 'Redis not available' };
        }

        try {
            const keys = await redis.keys(`${this.cachePrefix}*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }

            logger.info('Autocomplete cache cleared', { keys_cleared: keys.length });
            return { cleared: true, keys_cleared: keys.length };

        } catch (error) {
            logger.error('Autocomplete cache clear failed', error);
            return { cleared: false, error: error.message };
        }
    }
}

module.exports = new AutocompleteService();