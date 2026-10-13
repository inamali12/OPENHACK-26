const clients = new Set();
let heartbeatInterval = null;

function initSSE() {
  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(() => {
      broadcast('ping', { timestamp: new Date().toISOString() });
    }, 25000);
    if (heartbeatInterval.unref) {
      heartbeatInterval.unref();
    }
  }
}

function handleSSEConnection(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const client = { id: Date.now() + Math.random(), res };
  clients.add(client);

  // Send initial handshake
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', clientsCount: clients.size })}\n\n`);

  req.on('close', () => {
    clients.delete(client);
  });
}

function broadcast(eventType, data = {}) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch (err) {
      clients.delete(client);
    }
  }
}

module.exports = {
  initSSE,
  handleSSEConnection,
  broadcast,
};
