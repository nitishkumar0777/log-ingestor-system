const logService = require('../services/logService');
const queueService = require('../services/queueService');
const { validateAndSeparateLogs } = require('../middleware/logValidator');


class IngestController {
  // Fast async ingestion with queue
  async ingestSingleAsync(req, res, next) {
    try {
      const logData = req.body;

      // Validate required fields
      if (!logData.level || !logData.message || !logData.timestamp) {
        return res.status(400).json({
          error: 'Missing required fields: level, message, timestamp'
        });
      }

      // Add to queue (non-blocking)
      queueService.addToQueue(logData);

      // Return immediately
      res.status(202).json({
        success: true,
        message: 'Log queued for ingestion',
        queueStatus: queueService.getStatus()
      });
    } catch (error) {
      next(error);
    }
  }

  // Synchronous ingestion (existing)
  async ingestSingle(req, res, next) {
    try {
      const logData = req.body;

      if (!logData.level || !logData.message || !logData.timestamp) {
        return res.status(400).json({
          error: 'Missing required fields: level, message, timestamp'
        });
      }

      await logService.ingestLog(logData);

      res.status(201).json({
        success: true,
        message: 'Log ingested successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Optimized bulk with streaming
  async ingestBulk(req, res, next) {
    try {
      const logs = req.body;

      if (!Array.isArray(logs) || logs.length === 0) {
        return res.status(400).json({
          error: 'Request body must be a non-empty array of logs'
        });
      }

      const { valid, invalid } = validateAndSeparateLogs(logs);

      if (valid.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'All logs are invalid',
          invalidLogs: invalid.slice(0, 10),
          totalInvalid: invalid.length
        });
      }

      // Process valid logs
      if (valid.length > 10000) {
        valid.forEach(log => queueService.addToQueue(log));

        return res.status(207).json({
          success: true,
          message: `${valid.length} valid logs queued for ingestion`,
          accepted: valid.length,
          rejected: invalid.length,
          invalidLogs: invalid.length > 0 ? invalid.slice(0, 5) : undefined
        });
      }

      // For smaller batches, process immediately
      const result = await logService.bulkIngest(valid);

      // Return result with validation info
      if (result.success) {
        const response = {
          success: true,
          message: `${result.count} logs ingested successfully`,
          accepted: valid.length,
          rejected: invalid.length
        };

        // Include invalid logs if any
        if (invalid.length > 0) {
          response.invalidLogs = invalid.slice(0, 5);
          response.totalInvalid = invalid.length;
        }

        res.status(invalid.length > 0 ? 207 : 201).json(response);
      } else {
        res.status(207).json({
          success: false,
          message: 'Some logs failed to ingest',
          errors: result.errors,
          validationErrors: invalid.length > 0 ? {
            count: invalid.length,
            samples: invalid.slice(0, 5)
          } : undefined
        });
      }
    } catch (error) {
      next(error);
    }
  }


  // Get ingestion stats
  async getStats(req, res, next) {
    try {
      res.json({
        success: true,
        queue: queueService.getStatus()
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new IngestController();