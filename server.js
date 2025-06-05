// server.js (ES modules)
import express from 'express';
import dotenv from 'dotenv';
import checkLinksHandler from './api/check-links.js';
import { SlackNotifier } from './lib/SlackNotifier.js';



dotenv.config();

const app = express();
app.use(express.json());

let lastScanResult = null;


// Adapter Express à l'API Vercel
app.all('/api/check-links', (req, res) => {
  const request = {
    method: req.method,
    headers: req.headers,
    query: req.query,
    body: req.body
  };
  const response = {
    setHeader: (key, value) => res.setHeader(key, value),
    status: (code) => res.status(code),
    json: (data) => res.json(data),
    end: () => res.end()
  };

  checkLinksHandler(request, response);
});

// Test Slack
app.get('/api/test-slack', async (req, res) => {
  try {
    const notifier = new SlackNotifier();
    await notifier.sendTestMessage();
    res.json({ success: true, message: 'Slack test envoyé' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Serveur local lancé sur http://localhost:${PORT}`);
});



app.all('/api/check-links', async (req, res) => {
  const request = {
    method: req.method,
    headers: req.headers,
    query: req.query,
    body: req.body
  };
  const response = {
    setHeader: (key, value) => res.setHeader(key, value),
    status: (code) => {
      res.status(code);
      return response;
    },
    json: (data) => {
      lastScanResult = data; // 🔴 stocke le résultat
      res.json(data);
    },
    end: () => res.end()
  };

  await checkLinksHandler(request, response);
});
app.get('/', (req, res) => {
  const result = lastScanResult;
  const summaryHtml = result
    ? `
      <h3>📊 Dernier scan :</h3>
      <ul>
        <li>🕒 Date : ${new Date(result.timestamp).toLocaleString()}</li>
        <li>📄 Pages scannées : ${result.scan.scannedUrls}</li>
        <li>🔗 Liens vérifiés : ${result.results.totalLinksChecked}</li>
        <li>❌ Erreurs 404 : ${result.results.errors404Count}</li>
        <li>⏱️ Durée : ${result.results.duration}</li>
      </ul>
    `
    : '<p>Aucun scan effectué pour l’instant.</p>';

  res.send(`
    <html>
      <head>
        <title>Stereolabs Link Checker - Local</title>
        <style>
          body { font-family: sans-serif; padding: 2rem; line-height: 1.6; }
          a.button {
            display: inline-block;
            margin: 0.5rem 1rem 1rem 0;
            padding: 0.7rem 1.4rem;
            background: #0070f3;
            color: white;
            border-radius: 6px;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <h2>🔗 Stereolabs Link Checker (local)</h2>
        <a class="button" href="/api/check-links?notify=false">🚀 Lancer Scan</a>
        <a class="button" href="/api/test-slack">🔔 Tester Slack</a>
        ${summaryHtml}
      </body>
    </html>
  `);
});
