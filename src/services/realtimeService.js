const { client } = require('../config/elasticsearch');

class RealtimeService {
    constructor() {
        this.indexName = process.env.ELASTICSEARCH_INDEX || 'logs';
        this.subscribers = new Map();
    }

    // Subscribe to real-time logs
    subscribe(socketId, filters = {}) {
        this.subscribers.set(socketId, {
            filters,
            lastTimestamp: new Date().toISOString()
        });
        console.log(`📡 Client ${socketId} subscribed to real-time logs`);
    }

    // Unsubscribe
    unsubscribe(socketId) {
        this.subscribers.delete(socketId);
        console.log(`📡 Client ${socketId} unsubscribed from real-time logs`);
    }

    // Poll for new logs
    async pollNewLogs(socketId) {
        const subscriber = this.subscribers.get(socketId);
        if (!subscriber) return [];

        try {
            const { filters, lastTimestamp } = subscriber;

            const must = [
                {
                    range: {
                        timestamp: {
                            gt: lastTimestamp
                        }
                    }
                }
            ];

            // Apply user filters
            if (filters.level) {
                must.push({ term: { level: filters.level } });
            }
            if (filters.resourceId) {
                must.push({ term: { resourceId: filters.resourceId } });
            }
            if (filters.message) {
                must.push({ match: { message: filters.message } });
            }

            const response = await client.search({
                index: this.indexName,
                body: {
                    query: {
                        bool: { must }
                    },
                    sort: [{ timestamp: { order: 'asc' } }],
                    size: 100
                }
            });

            const logs = response.hits.hits.map(hit => ({
                id: hit._id,
                ...hit._source
            }));

            // Update last timestamp
            if (logs.length > 0) {
                subscriber.lastTimestamp = logs[logs.length - 1].timestamp;
            }

            return logs;
        } catch (error) {
            console.error('Error polling logs:', error);
            return [];
        }
    }

    // Get all subscribers
    getSubscriberCount() {
        return this.subscribers.size;
    }
}

module.exports = new RealtimeService();