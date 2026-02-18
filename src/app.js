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
const authRoutes = require('./routes/auth');
const errorHandler = require('./middleware/errorHandler');


const realtimeService = require('./services/realtimeService');
const { metricsMiddleware, metrics } = require('./middleware/metrics');
const queueService = require('./services/queueService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;


app.set('trust proxy', "loopback");

// Middleware
app.use(cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files for Web UI
app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        }
    }
}));


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

io.engine.on("connection_error", (err) => {
    console.error("❌ WebSocket error:", err);
});


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
    // console.log("Subscribers", subscribers);
    for (const socketId of subscribers) {
        const newLogs = await realtimeService.pollNewLogs(socketId);
        console.log("New logs ::", newLogs);

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
            console.log(`
                        ╔═══════════════════════════════════════════════════╗
                        ║  🚀 Log Ingestor System Started                   ║
                        ╠═══════════════════════════════════════════════════╣
                        ║  📥 Ingest Endpoint: http://localhost:3000/ingest ║
                        ║  🔍 Query Endpoint:  http://localhost:3000/query  ║
                        ║  🌐 Web UI:          http://localhost:3000        ║
                        ║  ❤️  Health Check:   http://localhost:3000/health ║
                        ╚═══════════════════════════════════════════════════╝
                    `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;

/*
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
const authRoutes = require('./routes/auth');
const errorHandler = require('./middleware/errorHandler');

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
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ✅ FIX: Serve static files with correct MIME types
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
  }
}));

// Routes
app.use('/auth', authRoutes);
app.use('/ingest', ingestRoutes);
app.use('/query', queryRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use(errorHandler);

// WebSocket for real-time logs
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('subscribe', (filters) => {
    console.log(`📡 Subscribe request from ${socket.id}:`, filters);
    // Store subscription info
    socket.filters = filters || {};
  });

  socket.on('unsubscribe', () => {
    console.log(`📡 Unsubscribe from ${socket.id}`);
    socket.filters = null;
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Initialize and start server
async function startServer() {
  try {
    await initializeIndex();
    
    server.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════╗
║   🚀 Log Ingestor System Started                  ║
╠═══════════════════════════════════════════════════╣
║   📥 Ingest Endpoint: http://localhost:${PORT}/ingest  ║
║   🔍 Query Endpoint:  http://localhost:${PORT}/query   ║
║   🌐 Web UI:          http://localhost:${PORT}         ║
║   📡 WebSocket:       ws://localhost:${PORT}           ║
║   ❤️  Health Check:    http://localhost:${PORT}/health ║
╚═══════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
*/