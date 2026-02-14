const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

require('dotenv').config();

const { initializeIndex } = require('./config/elasticsearch');
const ingestRoutes = require('./routes/ingest');
const queryRoutes = require('./routes/query');
const errorHandler = require('./middleware/errorHandler');
const realtimeService = require('./services/realtimeService');
const authRoutes = require('./routes/auth');
const { metricsMiddleware, metrics } = require('./middleware/metrics');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files for Web UI
app.use(express.static(path.join(__dirname, '../public')));


// Routes
app.use('/auth', authRoutes);
app.use('/ingest', ingestRoutes);
app.use('/query', queryRoutes);

// Apply metrics middleware
app.use(metricsMiddleware);

// Metrics endpoint
app.get('/metrics', (req, res) => {
    res.json({
        success: true,
        metrics: metrics.getMetrics(),
        queue: queueService.getStatus(),
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        realtimeSubscribers: realtimeService.getSubscriberCount()
    });
});

// Error handling
app.use(errorHandler);

// WebSocket for real-time logs
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Subscribe to real-time logs
    socket.on('subscribe', (filters) => {
        console.log(`📡 Subscribe request from ${socket.id}:`, filters);
        realtimeService.subscribe(socket.id, filters || {});
    });

    // Unsubscribe
    socket.on('unsubscribe', () => {
        realtimeService.unsubscribe(socket.id);
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        realtimeService.unsubscribe(socket.id);
    });
});

// Poll for new logs every 2 seconds
setInterval(async () => {
    const subscribers = Array.from(realtimeService.subscribers.keys());

    for (const socketId of subscribers) {
        const newLogs = await realtimeService.pollNewLogs(socketId);

        if (newLogs.length > 0) {
            io.to(socketId).emit('newLogs', newLogs);
        }
    }
}, 2000);

// Initialize and start server
async function startServer() {
    try {
        await initializeIndex();

        server.listen(PORT, () => {
            console.log('Log Ingestor System Started');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;