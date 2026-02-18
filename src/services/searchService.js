const { client } = require('../config/elasticsearch');

class SearchService {
    constructor() {
        this.indexName = process.env.ELASTICSEARCH_INDEX || 'logs';
    }

    buildQuery(filters) {
        const must = [];
        const filter = []; // Use filter context for non-scoring queries

        // Use filter context for exact matches (faster, cacheable)
        if (filters.level) {
            filter.push({ term: { level: filters.level } });
        }
        if (filters.resourceId) {
            filter.push({ term: { resourceId: filters.resourceId } });
        }
        if (filters.traceId) {
            filter.push({ term: { traceId: filters.traceId } });
        }
        if (filters.spanId) {
            filter.push({ term: { spanId: filters.spanId } });
        }
        if (filters.commit) {
            filter.push({ term: { commit: filters.commit } });
        }
        if (filters.parentResourceId) {
            filter.push({ term: { 'metadata.parentResourceId': filters.parentResourceId } });
        }

        // Use must context only for scoring queries
        if (filters.message) {
            must.push({
                match: {
                    message: {
                        query: filters.message,
                        operator: 'and'
                    }
                }
            });
        }

        // Date range in filter context
        if (filters.startTime || filters.endTime) {
            const range = {};
            if (filters.startTime) range.gte = filters.startTime;
            if (filters.endTime) range.lte = filters.endTime;
            filter.push({ range: { timestamp: range } });
        }

        return {
            bool: {
                must: must.length > 0 ? must : undefined,
                filter: filter.length > 0 ? filter : undefined
            }
        };
    }

    async searchLogs(filters, options = {}) {
        try {
            const { page = 1, size = 100, sortBy = 'timestamp', sortOrder = 'desc' } = options;

            // Limit page size for performance
            const safeSize = Math.min(size, 1000);

            const query = this.buildQuery(filters);

            const response = await client.search({
                index: this.indexName,
                body: {
                    query,
                    sort: [{ [sortBy]: { order: sortOrder } }],
                    from: (page - 1) * safeSize,
                    size: safeSize,
                    // Performance optimizations
                    _source: true, // Return full source
                    track_total_hits: 10000, // Limit total hit counting
                    timeout: '10s' // Query timeout
                }
            });

            return {
                total: typeof response.hits.total === 'object'
                    ? response.hits.total.value
                    : response.hits.total,
                logs: response.hits.hits.map(hit => ({
                    id: hit._id,
                    ...hit._source
                })),
                page,
                size: safeSize
            };
        } catch (error) {
            throw new Error(`Search failed: ${error.message}`);
        }
    }

    async fullTextSearch(searchText, options = {}) {
        try {
            const { page = 1, size = 100 } = options;
            const safeSize = Math.min(size, 1000);

            const response = await client.search({
                index: this.indexName,
                body: {
                    query: {
                        bool: {
                            should: [
                                {
                                    multi_match: {
                                        query: searchText,
                                        fields: [
                                            'message^3',
                                            'level^2',
                                            'resourceId^2',
                                            'traceId',
                                            'spanId',
                                            'commit',
                                            'metadata.parentResourceId'
                                        ],
                                        type: 'best_fields',
                                        fuzziness: 'AUTO'
                                    }
                                }
                            ],
                            minimum_should_match: 1
                        }
                    },
                    sort: [
                        { _score: { order: 'desc' } },
                        { timestamp: { order: 'desc' } }
                    ],
                    from: (page - 1) * safeSize,
                    size: safeSize,
                    track_total_hits: 10000,
                    timeout: '10s'
                }
            });

            return {
                total: typeof response.hits.total === 'object'
                    ? response.hits.total.value
                    : response.hits.total,
                logs: response.hits.hits.map(hit => ({
                    id: hit._id,
                    score: hit._score,
                    ...hit._source
                })),
                page,
                size: safeSize
            };
        } catch (error) {
            throw new Error(`Full-text search failed: ${error.message}`);
        }
    }


    async regexSearch(field, pattern, options = {}) {
        try {
            const { page = 1, size = 100 } = options;
            const safeSize = Math.min(size, 1000);

            const allowedFields = ['message', 'resourceId', 'traceId', 'spanId', 'commit', 'metadata.parentResourceId'];
            if (!allowedFields.includes(field)) {
                throw new Error(`Field '${field}' does not support regex search`);
            }

            const response = await client.search({
                index: this.indexName,
                body: {
                    query: {
                        regexp: {
                            [field]: {
                                value: pattern,
                                flags: 'ALL',
                                case_insensitive: true,
                                max_determinized_states: 10000
                            }
                        }
                    },
                    sort: [{ timestamp: { order: 'desc' } }],
                    from: (page - 1) * safeSize,
                    size: safeSize,
                    track_total_hits: 10000,
                    timeout: '15s' // Regex can be slower
                }
            });

            return {
                total: typeof response.hits.total === 'object'
                    ? response.hits.total.value
                    : response.hits.total,
                logs: response.hits.hits.map(hit => ({
                    id: hit._id,
                    ...hit._source
                })),
                page,
                size: safeSize
            };
        } catch (error) {
            throw new Error(`Regex search failed: ${error.message}`);
        }
    }

}

module.exports = new SearchService();