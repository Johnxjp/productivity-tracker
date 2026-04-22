import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { config } from './config.js';
import { runPipeline } from './pipeline.js';
import { loadDB } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.static(publicDir));

app.get('/api/data', async (_req, res) => {
  try {
    const db = await runPipeline();
    res.json(db);
  } catch (err) {
    console.error('[server] pipeline error:', err);
    try {
      res.json(loadDB(config.dbPath));
    } catch {
      res.status(500).json({ error: 'pipeline failed' });
    }
  }
});

async function start(): Promise<void> {
  try {
    console.log('[server] running startup pipeline...');
    await runPipeline();
  } catch (err) {
    console.error('[server] startup pipeline error (continuing):', err);
  }

  app.listen(config.port, '127.0.0.1', () => {
    const url = `http://localhost:${config.port}`;
    console.log(`[server] listening at ${url}`);
    exec(`open "${url}"`);
  });
}

start().catch(err => {
  console.error('[server] fatal:', err);
  process.exit(1);
});
