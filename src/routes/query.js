const express = require('express');
const router = express.Router();
const queryController = require('../controllers/queryController');
const { authenticate, authorize } = require('../middleware/auth');
const { cacheMiddleware, getCacheStats, clearCache } = require('../middleware/cache');
const { queryLimiter  } = require('../middleware/rateLimiter');

// Apply caching to read-only endpoints
router.get('/',
  queryLimiter,
  authenticate,
  authorize('admin', 'viewer'),
  cacheMiddleware(300), // Cache for 5 minutes
  queryController.search.bind(queryController)
);

router.get('/search',
  authenticate,
  authorize('admin', 'viewer'),
  cacheMiddleware(300),
  queryController.fullTextSearch.bind(queryController)
);

router.get('/regex',
  authenticate,
  authorize('admin', 'viewer'),
  cacheMiddleware(180), // Cache for 3 minutes
  queryController.regexSearch.bind(queryController)
);

// Cache management endpoints (admin only)
router.get('/cache/stats',
  authenticate,
  authorize('admin'),
  (req, res) => {
    res.json({ success: true, cache: getCacheStats() });
  }
);

router.post('/cache/clear',
  authenticate,
  authorize('admin'),
  (req, res) => {
    clearCache();
    res.json({ success: true, message: 'Cache cleared' });
  }
);

module.exports = router;