const { client } = require('../config/elasticsearch');

class LogService {
  constructor() {
    this.indexName = process.env.ELASTICSEARCH_INDEX || 'logs';
  }

  // Ingest single log
  async ingestLog(logData) {
    try {
      const response = await client.index({
        index: this.indexName,
        body: logData,
        refresh: false // Async refresh for better performance
      });
      return response;
    } catch (error) {
      throw new Error(`Failed to ingest log: ${error.message}`);
    }
  }

  // Bulk ingest for better performance
  async bulkIngest(logs) {
    try {
      const body = logs.flatMap(log => [
        { index: { _index: this.indexName } },
        log
      ]);

      const response = await client.bulk({
        body,
        refresh: false
      });

      if (response.errors) {
        const erroredDocuments = [];
        response.items.forEach((action, i) => {
          const operation = Object.keys(action)[0];
          if (action[operation].error) {
            erroredDocuments.push({
              status: action[operation].status,
              error: action[operation].error,
              document: logs[i]
            });
          }
        });
        return { success: false, errors: erroredDocuments };
      }

      return { success: true, count: logs.length };
    } catch (error) {
      throw new Error(`Bulk ingest failed: ${error.message}`);
    }
  }
}

module.exports = new LogService();