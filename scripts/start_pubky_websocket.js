/**
 * Start Pubky WebSocket Server
 * 
 * This script starts the Pubky WebSocket server for real-time updates.
 */

// Import required modules
import { createServer } from 'http';
import WebSocket from 'ws';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';

// Set up path resolution for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Use require for TypeScript files
// This is a workaround since we can't directly import TypeScript files in ES modules
const { PubkyWebSocketHandler } = require('../services/domain/PubkyWebSocketHandler');
const { config } = require('../config');

// Create an HTTP server
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Pubky WebSocket Server');
});

// Create a WebSocket server
const wss = new WebSocket.Server({ server });

// Create a Pubky WebSocket handler
const pubkyWebSocketHandler = new PubkyWebSocketHandler(wss);

// Start the server
const PORT = process.env.PUBKY_WS_PORT || 3002;
server.listen(PORT, () => {
  console.log(`Pubky WebSocket server listening on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down Pubky WebSocket server...');
  
  // Close the WebSocket handler
  await pubkyWebSocketHandler.close();
  
  // Close the WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');
    
    // Close the HTTP server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
});

// Log connection statistics periodically
setInterval(() => {
  const stats = pubkyWebSocketHandler.getConnectionStats();
  console.log('Pubky WebSocket connection statistics:', stats);
}, 60000); // Every minute