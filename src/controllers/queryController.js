const searchService = require('../services/searchService');

class QueryController {
    // Search with filters
    async search(req, res, next) {
        try {
            const filters = {
                level: req.query.level,
                message: req.query.message,
                resourceId: req.query.resourceId,
                traceId: req.query.traceId,
                spanId: req.query.spanId,
                commit: req.query.commit,
                parentResourceId: req.query.parentResourceId,
                startTime: req.query.startTime,
                endTime: req.query.endTime
            };

            // Remove undefined values
            Object.keys(filters).forEach(key =>
                filters[key] === undefined && delete filters[key]
            );

            const options = {
                page: parseInt(req.query.page) || 1,
                size: parseInt(req.query.size) || 100,
                sortBy: req.query.sortBy || 'timestamp',
                sortOrder: req.query.sortOrder || 'desc'
            };

            const results = await searchService.searchLogs(filters, options);

            res.json({
                success: true,
                data: results
            });
        } catch (error) {
            next(error);
        }
    }

    // Full-text search
    async fullTextSearch(req, res, next) {
        try {
            const { q } = req.query;

            if (!q) {
                return res.status(400).json({
                    error: 'Query parameter "q" is required'
                });
            }

            const options = {
                page: parseInt(req.query.page) || 1,
                size: parseInt(req.query.size) || 100
            };

            const results = await searchService.fullTextSearch(q, options);

            res.json({
                success: true,
                data: results
            });
        } catch (error) {
            next(error);
        }
    }

    // Regex search endpoint
    async regexSearch(req, res, next) {
        try {
            const { field, pattern } = req.query;

            if (!field || !pattern) {
                return res.status(400).json({
                    error: 'Both "field" and "pattern" query parameters are required'
                });
            }

            const options = {
                page: parseInt(req.query.page) || 1,
                size: parseInt(req.query.size) || 100
            };

            const results = await searchService.regexSearch(field, pattern, options);

            res.json({
                success: true,
                data: results
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new QueryController();