const { Client } = require('@elastic/elasticsearch');
require('dotenv').config();

const client = new Client({
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    maxRetries: 5,
    requestTimeout: 60000,
    sniffOnStart: true
});

// OPTIMIZED mapping for high-volume ingestion
const indexMapping = {
    mappings: {
        properties: {
            level: {
                type: 'keyword',
                ignore_above: 256
            },
            message: {
                type: 'text',
                fields: {
                    keyword: {
                        type: 'keyword',
                        ignore_above: 512
                    }
                },
                // Reduce indexing overhead
                index_options: 'freqs'
            },
            resourceId: {
                type: 'keyword',
                ignore_above: 256
            },
            timestamp: {
                type: 'date',
                format: 'strict_date_optional_time||epoch_millis'
            },
            traceId: {
                type: 'keyword',
                ignore_above: 256
            },
            spanId: {
                type: 'keyword',
                ignore_above: 256
            },
            commit: {
                type: 'keyword',
                ignore_above: 256
            },
            metadata: {
                type: 'object',
                dynamic: true,
                properties: {
                    parentResourceId: {
                        type: 'keyword',
                        ignore_above: 256
                    }
                }
            }
        }
    },
    settings: {
        // PERFORMANCE OPTIMIZATIONS
        number_of_shards: 5,           // Increase for parallel writes
        number_of_replicas: 1,         // Balance between safety and speed
        refresh_interval: '30s',       // Reduce refresh frequency (was 1s)

        // Indexing optimizations
        'index.translog.durability': 'async',
        'index.translog.sync_interval': '30s',

        // Merge policy for better write performance
        'index.merge.scheduler.max_thread_count': 1,

        // Buffering
        'index.buffer.size': '512mb',

        // Query cache
        'index.queries.cache.enabled': true,

        // Max result window
        'index.max_result_window': 50000
    }
};

async function initializeIndex() {
    try {
        const indexName = process.env.ELASTICSEARCH_INDEX || 'logs';
        const indexExists = await client.indices.exists({ index: indexName });

        if (!indexExists) {
            await client.indices.create({
                index: indexName,
                body: indexMapping
            });
            console.log(`✅ Index '${indexName}' created with optimized settings`);
        } else {
            console.log(`✅ Index '${indexName}' already exists`);

            // Update settings for existing index
            try {
                await client.indices.putSettings({
                    index: indexName,
                    body: {
                        'index.refresh_interval': '30s',
                        'index.translog.durability': 'async'
                    }
                });
                console.log(`✅ Updated settings for better performance`);
            } catch (error) {
                console.log('⚠️  Could not update some settings (index may need to be closed first)');
            }
        }
    } catch (error) {
        console.error('❌ Error initializing index:', error);
        throw error;
    }
}

module.exports = { client, initializeIndex };