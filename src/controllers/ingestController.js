const logService = require('../services/logService');
const queueService = require('../services/queueService');

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

      // For very large batches, use queue
      if (logs.length > 10000) {
        logs.forEach(log => queueService.addToQueue(log));
        return res.status(202).json({
          success: true,
          message: `${logs.length} logs queued for ingestion`,
          queueStatus: queueService.getStatus()
        });
      }

      // For smaller batches, process immediately
      const result = await logService.bulkIngest(logs);

      if (result.success) {
        res.status(201).json({
          success: true,
          message: `${result.count} logs ingested successfully`
        });
      } else {
        res.status(207).json({
          success: false,
          message: 'Some logs failed to ingest',
          errors: result.errors
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