const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const helmet = require('helmet');
const morgan = require('morgan');
const https = require('https');
const fs = require('fs');
require('dotenv').config();
require('debug').enable('http-proxy:*');
const CONFIG_FILE = '/root/reverse-proxy/cf-panel/config.json';
let server = null;
let currentConfig = null;

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌ Config file not found!');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE));
}

function configsDiffer(a, b) {
  return (
    a.port !== b.port ||
    a.target !== b.target ||
    a.certPath !== b.certPath ||
    a.keyPath !== b.keyPath
  );
}

function startServer(config) {
  const app = express();
  app.use(helmet());
  app.use(morgan('combined'));
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    req.headers['connection'] = 'close'; // override incoming
    res.setHeader('Connection', 'close'); // force response to close
    next();
  });

  app.use('/', createProxyMiddleware({
    target: config.target,
    changeOrigin: true,
    secure: false,
    ws: true,
    timeout: 60000,       // 10s timeout for proxy
    proxyTimeout: 60000,  // 10s timeout for upstream
    onError: (err, req, res) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway: Proxy error.');
    }
  }));

  const options = {
    key: fs.readFileSync(config.keyPath),
    cert: fs.readFileSync(config.certPath)
  };

  server = https.createServer(options, app).listen(config.port, () => {
    console.log(`✅ HTTPS reverse proxy running on port ${config.port} → ${config.target}`);
  });
  server.setTimeout(60000); // 60s
}

function restartIfNeeded() {
  const newConfig = loadConfig();
  if(newConfig.keyPath=="" || newConfig.certPath=="") return
  if (!currentConfig || configsDiffer(currentConfig, newConfig)) {
    console.log('🔁 Detected config change, restarting server...');
    if (server) {
      server.close(() => {
        console.log('🛑 Old server stopped');
        startServer(newConfig);
      });
    } else {
      startServer(newConfig);
    }
    currentConfig = newConfig;
  }
}

restartIfNeeded(); // Start initially
setInterval(restartIfNeeded, 30000); // Check every 30s

// Handle errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
