const { client } = require('../config/elasticsearch');
const fs = require('fs');
const path = require('path');

class QueueService {
    constructor() {
        this.indexName = process.env.ELASTICSEARCH_INDEX || 'logs';
        this.queue = [];
        this.batchSize = 1000;
        this.flushInterval = 5000;
        this.persistPath = path.join(__dirname, '../data/queue-backup.json');
        this.isProcessing = false;

        // Load persisted queue on startup
        this.loadPersistedQueue();

        // Persist queue periodically
        setInterval(() => this.persistQueue(), 10000);

        this.startAutoFlush();

        // Graceful shutdown
        process.on('SIGTERM', () => this.gracefulShutdown());
        process.on('SIGINT', () => this.gracefulShutdown());
    }

    async loadPersistedQueue() {
        try {
            if (fs.existsSync(this.persistPath)) {
                const data = fs.readFileSync(this.persistPath, 'utf8');
                this.queue = JSON.parse(data);
                console.log(`📦 Loaded ${this.queue.length} persisted logs`);
            }
        } catch (error) {
            console.error('Failed to load persisted queue:', error);
        }
    }

    persistQueue() {
        try {
            if (this.queue.length > 0) {
                fs.writeFileSync(this.persistPath, JSON.stringify(this.queue));
            }
        } catch (error) {
            console.error('Failed to persist queue:', error);
        }
    }

    async gracefulShutdown() {
        console.log('🛑 Gracefully shutting down...');

        // Flush remaining logs
        await this.flush();

        // Persist any remaining
        this.persistQueue();

        console.log('✅ Shutdown complete');
        process.exit(0);
    }

    // Add log to queue
    addToQueue(log) {
        this.queue.push(log);

        // Flush immediately if batch size reached
        if (this.queue.length >= this.batchSize) {
            this.flush();
        }
    }

    // Manual flush
    async flush() {
        if (this.queue.length === 0 || this.isProcessing) {
            return { success: true, count: 0 };
        }

        this.isProcessing = true;
        const logsToProcess = [...this.queue];
        this.queue = []; // Clear queue

        try {
            const body = logsToProcess.flatMap(log => [
                { index: { _index: this.indexName } },
                log
            ]);

            const response = await client.bulk({
                body,
                refresh: false, // Don't refresh immediately for better performance
                timeout: '60s'
            });

            const errorCount = response.items.filter(item => item.index.error).length;

            console.log(`✅ Flushed ${logsToProcess.length} logs (${errorCount} errors)`);

            return {
                success: !response.errors,
                count: logsToProcess.length,
                errors: errorCount
            };
        } catch (error) {
            console.error('❌ Flush error:', error);
            // Re-queue failed logs
            this.queue.unshift(...logsToProcess);
            return { success: false, error: error.message };
        } finally {
            this.isProcessing = false;
        }
    }

    // Auto-flush on interval
    startAutoFlush() {
        setInterval(() => {
            if (this.queue.length > 0) {
                console.log(`⏰ Auto-flushing ${this.queue.length} queued logs`);
                this.flush();
            }
        }, this.flushInterval);
    }

    // Get queue status
    getStatus() {
        return {
            queueSize: this.queue.length,
            isProcessing: this.isProcessing,
            batchSize: this.batchSize,
            flushInterval: this.flushInterval
        };
    }
}

module.exports = new QueueService();