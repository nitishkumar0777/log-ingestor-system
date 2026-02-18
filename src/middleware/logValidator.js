/**
 * Validate log entry structure and required fields
 */
function validateLog(log) {
    const errors = [];

    // Required fields
    if (!log.level) {
        errors.push('Missing required field: level');
    } else if (!['error', 'warn', 'info', 'debug'].includes(log.level)) {
        errors.push('Invalid level. Must be one of: error, warn, info, debug');
    }

    if (!log.message) {
        errors.push('Missing required field: message');
    } else if (typeof log.message !== 'string') {
        errors.push('Field "message" must be a string');
    }

    if (!log.timestamp) {
        errors.push('Missing required field: timestamp');
    } else if (!isValidISO8601(log.timestamp)) {
        errors.push('Field "timestamp" must be a valid ISO 8601 date string');
    }

    // Optional but validate if present
    if (log.resourceId && typeof log.resourceId !== 'string') {
        errors.push('Field "resourceId" must be a string');
    }

    if (log.traceId && typeof log.traceId !== 'string') {
        errors.push('Field "traceId" must be a string');
    }

    if (log.spanId && typeof log.spanId !== 'string') {
        errors.push('Field "spanId" must be a string');
    }

    if (log.commit && typeof log.commit !== 'string') {
        errors.push('Field "commit" must be a string');
    }

    if (log.metadata) {
        if (typeof log.metadata !== 'object' || Array.isArray(log.metadata)) {
            errors.push('Field "metadata" must be an object');
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Validate ISO 8601 date string
 */
function isValidISO8601(dateString) {
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

    if (!isoRegex.test(dateString)) return false;

    const date = new Date(dateString);
    return !isNaN(date.getTime());
}

/**
 * Middleware for single log validation
 */
function validateSingleLog(req, res, next) {
    const log = req.body;
    const validation = validateLog(log);

    if (!validation.isValid) {
        return res.status(400).json({
            success: false,
            error: 'Invalid log data',
            details: validation.errors
        });
    }

    next();
}

/**
 * Middleware for bulk log validation
 */
function validateBulkLogs(req, res, next) {
    const logs = req.body;

    // Check if array
    if (!Array.isArray(logs)) {
        return res.status(400).json({
            success: false,
            error: 'Request body must be an array of logs'
        });
    }

    if (logs.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Request body must contain at least one log'
        });
    }

    // Validate each log
    const invalidLogs = [];

    logs.forEach((log, index) => {
        const validation = validateLog(log);

        if (!validation.isValid) {
            invalidLogs.push({
                index,
                log,
                errors: validation.errors
            });
        }
    });

    // If any invalid logs, return error
    if (invalidLogs.length > 0) {
        return res.status(400).json({
            success: false,
            error: `${invalidLogs.length} invalid log(s) found`,
            invalidLogs: invalidLogs.slice(0, 10), // Return first 10 invalid logs
            totalInvalid: invalidLogs.length
        });
    }

    next();
}

/**
 * Validate individual logs in bulk (returns valid/invalid separately)
 * Use this for more lenient validation where you want to accept partial success
 */
function validateAndSeparateLogs(logs) {
    const valid = [];
    const invalid = [];

    logs.forEach((log, index) => {
        const validation = validateLog(log);

        if (validation.isValid) {
            valid.push(log);
        } else {
            invalid.push({
                index,
                log,
                errors: validation.errors
            });
        }
    });

    return { valid, invalid };
}

module.exports = {
    validateLog,
    validateSingleLog,
    validateBulkLogs,
    validateAndSeparateLogs,
    isValidISO8601
};