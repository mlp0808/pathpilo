const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// Serve static files from current directory
app.use(express.static(path.join(__dirname)));

// Start server
app.listen(port, () => {
  console.log(`🌐 PathPilo Web Server running at http://localhost:${port}`);
  console.log(`📱 Open your browser and go to: http://localhost:${port}`);
  console.log(`🔗 API Server should be running at: http://localhost:8000`);
});
