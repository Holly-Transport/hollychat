// server.js (ESM version)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getKnowledgeBase } from './load-knowledge-base.js';


// Setup __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHATBOT_PASSWORD = process.env.CHATBOT_PASSWORD;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // 🔐 Protect /chat route
  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const userPassword = data.password;

        if (!CHATBOT_PASSWORD || userPassword !== CHATBOT_PASSWORD) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Unauthorized: Invalid password' }));
        }

        // ✅ Password is correct — you can add your chatbot handler here
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Password accepted (you would forward this to chatbot handler)' }));

      } catch (err) {
        res.writeHead(400);
        res.end('Invalid JSON');
      }
    });
    return;
  }

  // 📦 Serve knowledge base JSON via secure signed URL
  if (req.method === 'GET' && req.url === '/knowledge') {
    getKnowledgeBase()
      .then(data => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch(err => {
        res.writeHead(500);
        res.end('Error loading knowledge base: ' + err.message);
      });
    return;
  }


  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './index.html';
  }

  const extname = path.extname(filePath).toLowerCase();
  const mimeType = mimeTypes[extname] || 'application/octet-stream';

  const fullPath = path.join(__dirname, filePath);

  if (filePath === './index.html') {
    fs.readFile(fullPath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }

      const envScript = `
        <script>
          window.ENV_OPENAI_API_KEY = "${OPENAI_API_KEY || ''}";
          console.log('🔑 Environment API key injected:', !!window.ENV_OPENAI_API_KEY);
        </script>
      `;

      const modifiedContent = content.toString().replace(
        '<script src="animations.js"></script>',
        envScript + '\n    <script src="animations.js"></script>'
      );

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(modifiedContent);
    });
    return;
  }

  // Serve all other static files
  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'File not found' : 'Server error: ' + err.code);
    } else {
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log('🚀 Holly Krambeck ITSTI Application Server');
  console.log('==========================================');
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🔑 OpenAI API Key: ${OPENAI_API_KEY ? 'Found ✅' : 'Not set ⚠️'}`);
  console.log(`🔐 Chatbot Password: ${CHATBOT_PASSWORD ? 'Set ✅' : 'Not set ⚠️'}`);
  if (!OPENAI_API_KEY) {
    console.log('\nTo enable OpenAI API:');
    console.log('export OPENAI_API_KEY="sk-your-actual-key"');
  }
  if (!CHATBOT_PASSWORD) {
    console.log('To enable chat protection:');
    console.log('export CHATBOT_PASSWORD="your-secret-password"');
  }
  console.log('\n⏹️  Press Ctrl+C to stop the server');
});
