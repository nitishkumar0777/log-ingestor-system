const { client } = require('../config/elasticsearch');

class QueueService {
    constructor() {
        this.indexName = process.env.ELASTICSEARCH_INDEX || 'logs';
        this.queue = [];
        this.batchSize = 1000; // Configurable batch size
        this.flushInterval = 5000; // Flush every 5 seconds
        this.isProcessing = false;

        // Auto-flush timer
        this.startAutoFlush();
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