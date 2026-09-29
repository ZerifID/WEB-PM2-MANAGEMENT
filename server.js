require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const pm2Routes = require('./routes/pm2');
const terminalRoutes = require('./routes/terminal');
const { authenticateToken } = require('./middleware/auth');
const { startPM2Monitor } = require('./utils/pm2monitor');
const { handlePtyMessage, closePtySession } = require('./utils/ptymanager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/pm2', authenticateToken, pm2Routes);
app.use('/api/terminal', authenticateToken, terminalRoutes);

// Healthcheck
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// SPA fallback
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket auth + broadcast
let wsIdCounter = 0;
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const jwt = require('jsonwebtoken');
  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const wsId = ++wsIdCounter;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => {});

  // Handle PTY messages dari client
  ws.on('message', (msg) => {
    try {
      const parsed = JSON.parse(msg);
      // Kalau type PTY, handle di ptymanager
      if (parsed.type && parsed.type.startsWith('pty_')) {
        handlePtyMessage(wsId, ws, msg);
      }
    } catch {}
  });

  ws.on('close', () => {
    closePtySession(wsId);
  });
});

// Ping-pong keepalive
const interval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
wss.on('close', () => clearInterval(interval));

// Broadcast helper
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// Start PM2 realtime monitor
startPM2Monitor(broadcast);

const PORT = process.env.PORT || 8779;
server.listen(PORT, () => {
  console.log(`✅ PM2 Manager running at http://localhost:${PORT}`);
});
