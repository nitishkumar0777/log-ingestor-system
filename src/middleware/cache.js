const NodeCache = require('node-cache');

// Cache with 5-minute TTL
const queryCache = new NodeCache({
    stdTTL: 300,
    checkperiod: 60,
    maxKeys: 1000
});

function cacheMiddleware(duration = 300) {
    return (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        const key = `${req.originalUrl || req.url}`;
        const cachedResponse = queryCache.get(key);

        if (cachedResponse) {
            console.log(`💾 Cache HIT: ${key}`);
            return res.json(cachedResponse);
        }

        console.log(`❌ Cache MISS: ${key}`);

        // Store original res.json
        const originalJson = res.json.bind(res);

        // Override res.json
        res.json = (body) => {
            queryCache.set(key, body, duration);
            originalJson(body);
        };

        next();
    };
}

function clearCache() {
    queryCache.flushAll();
    console.log('🗑️  Cache cleared');
}

function getCacheStats() {
    return {
        keys: queryCache.keys().length,
        stats: queryCache.getStats()
    };
}

module.exports = { cacheMiddleware, clearCache, getCacheStats };