class MetricsCollector {
    constructor() {
        this.metrics = {
            requests: {
                total: 0,
                ingest: 0,
                query: 0
            },
            errors: 0,
            responseTime: {
                sum: 0,
                count: 0,
                min: Infinity,
                max: 0
            }
        };
    }

    recordRequest(type) {
        this.metrics.requests.total++;
        this.metrics.requests[type] = (this.metrics.requests[type] || 0) + 1;
    }

    recordError() {
        this.metrics.errors++;
    }

    recordResponseTime(duration) {
        this.metrics.responseTime.sum += duration;
        this.metrics.responseTime.count++;
        this.metrics.responseTime.min = Math.min(this.metrics.responseTime.min, duration);
        this.metrics.responseTime.max = Math.max(this.metrics.responseTime.max, duration);
    }

    getMetrics() {
        const avgResponseTime = this.metrics.responseTime.count > 0
            ? this.metrics.responseTime.sum / this.metrics.responseTime.count
            : 0;

        return {
            ...this.metrics,
            responseTime: {
                ...this.metrics.responseTime,
                average: Math.round(avgResponseTime)
            }
        };
    }

    reset() {
        this.metrics = {
            requests: { total: 0, ingest: 0, query: 0 },
            errors: 0,
            responseTime: { sum: 0, count: 0, min: Infinity, max: 0 }
        };
    }
}

const metrics = new MetricsCollector();

function metricsMiddleware(req, res, next) {
    const start = Date.now();

    // Determine request type
    const type = req.path.includes('/ingest') ? 'ingest' : 'query';
    metrics.recordRequest(type);

    // Capture response
    res.on('finish', () => {
        const duration = Date.now() - start;
        metrics.recordResponseTime(duration);

        if (res.statusCode >= 400) {
            metrics.recordError();
        }
    });

    next();
}

module.exports = { metricsMiddleware, metrics };