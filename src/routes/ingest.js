const express = require('express');
const router = express.Router();
const ingestController = require('../controllers/ingestController');
const { authenticate, authorize } = require('../middleware/auth');
const { ingestLimiter } = require('../middleware/rateLimiter');


// High-throughput async ingestion (recommended for production)
router.post('/async',
    ingestLimiter,
    authenticate,
    authorize('admin'),
    ingestController.ingestSingleAsync.bind(ingestController)
);

// Synchronous ingestion
router.post('/',
    authenticate,
    authorize('admin'),
    ingestController.ingestSingle.bind(ingestController)
);

// Bulk ingestion
router.post('/bulk',
    authenticate,
    authorize('admin'),
    ingestController.ingestBulk.bind(ingestController)
);

// Ingestion statistics
router.get('/stats',
    authenticate,
    authorize('admin'),
    ingestController.getStats.bind(ingestController)
);

module.exports = router;