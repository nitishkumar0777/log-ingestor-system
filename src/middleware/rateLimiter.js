const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');

// For production with Redis
const redisClient = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL)
    : null;

// Ingestion rate limiter (higher limits for admins)
const ingestLimiter = rateLimit({
    store: redisClient ? new RedisStore({
        client: redisClient,
        prefix: 'rl:ingest:'
    }) : undefined,
    windowMs: 60 * 1000, // 1 minute
    max: 10000, // 10k requests per minute
    message: {
        error: 'Too many ingestion requests, please slow down'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Query rate limiter
const queryLimiter = rateLimit({
    store: redisClient ? new RedisStore({
        client: redisClient,
        prefix: 'rl:query:'
    }) : undefined,
    windowMs: 60 * 1000,
    max: 1000, // 1k queries per minute
    message: {
        error: 'Too many query requests, please slow down'
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = { ingestLimiter, queryLimiter };