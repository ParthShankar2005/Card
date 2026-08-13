const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS headers for static serving
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve static files from root directory
app.use(express.static(__dirname));

// Main route fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

http.createServer(app).listen(PORT, () => {
  console.log(`WebAR Server Running on http://localhost:${PORT}`);
});
