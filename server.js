const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const SCORE_FILE = path.join(DATA_DIR, 'scores.json');
const TEST_LOG_FILE = path.join(DATA_DIR, 'test-log.json');
const MAX_SCORES = 100;
const MAX_TEST_LOGS = 20;
const MAX_BODY_BYTES = 4096;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_POSTS = 20;
const rateBuckets = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function normalizeName(value) {
  const cleaned = String(value || 'PLAYER').trim().replace(/[^\w .-]/g, '').slice(0, 16);
  return cleaned || 'PLAYER';
}

function normalizeMode(value) {
  return value === 'speedtest' ? 'speedtest' : 'classic';
}

function safeInteger(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

async function ensureScoreFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(SCORE_FILE);
  } catch {
    await fs.writeFile(SCORE_FILE, '[]\n', 'utf8');
  }
}

async function readScores() {
  await ensureScoreFile();
  try {
    const raw = await fs.readFile(SCORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeScores(scores) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const sorted = scores
    .filter(score => score && typeof score === 'object')
    .sort((a, b) => (b.score - a.score) || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, MAX_SCORES);
  const tempFile = `${SCORE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  await fs.rename(tempFile, SCORE_FILE);
  return sorted;
}

function checkRateLimit(req) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { startedAt: now, count: 0 };
  if (now - bucket.startedAt > RATE_WINDOW_MS) {
    bucket.startedAt = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  return bucket.count <= RATE_MAX_POSTS;
}

function checkSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    return originUrl.host === req.headers.host;
  } catch {
    return false;
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', chunk => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleScores(req, res, url) {
  if (req.method === 'GET') {
    const limit = safeInteger(url.searchParams.get('limit'), 1, MAX_SCORES, MAX_SCORES);
    const scores = await readScores();
    sendJson(res, 200, { scores: scores.slice(0, limit) });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!checkSameOrigin(req)) {
    sendJson(res, 403, { error: 'Cross-origin score writes are blocked' });
    return;
  }

  if (!checkRateLimit(req)) {
    sendJson(res, 429, { error: 'Too many score submissions' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readRequestBody(req));
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON payload' });
    return;
  }

  const entry = {
    id: crypto.randomUUID(),
    name: normalizeName(payload.name),
    mode: normalizeMode(payload.mode),
    score: safeInteger(payload.score, 0, 1_000_000_000, 0),
    level: safeInteger(payload.level, 1, 999, 1),
    distance: safeInteger(payload.distance, 0, 1_000_000_000, 0),
    vehicle: String(payload.vehicle || '').trim().replace(/[^\w .'-]/g, '').slice(0, 40),
    createdAt: new Date().toISOString()
  };

  if (entry.score <= 0) {
    sendJson(res, 400, { error: 'Score must be greater than zero' });
    return;
  }

  const scores = await readScores();
  const savedScores = await writeScores([...scores, entry]);
  sendJson(res, 201, { saved: true, score: entry, count: savedScores.length });
}

async function handleTestLog(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!checkSameOrigin(req)) {
    sendJson(res, 403, { error: 'Cross-origin test log writes are blocked' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readRequestBody(req));
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON payload' });
    return;
  }

  const entry = {
    createdAt: new Date().toISOString(),
    passed: safeInteger(payload.passed, 0, 1000, 0),
    failed: safeInteger(payload.failed, 0, 1000, 0),
    lines: Array.isArray(payload.lines)
      ? payload.lines.slice(-180).map(line => String(line).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 240))
      : []
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  let logs = [];
  try {
    logs = JSON.parse(await fs.readFile(TEST_LOG_FILE, 'utf8'));
    if (!Array.isArray(logs)) logs = [];
  } catch {
    logs = [];
  }

  logs.unshift(entry);
  logs = logs.slice(0, MAX_TEST_LOGS);
  const tempFile = `${TEST_LOG_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(logs, null, 2)}\n`, 'utf8');
  await fs.rename(tempFile, TEST_LOG_FILE);
  sendJson(res, 201, { saved: true, count: logs.length });
}

async function getPublicDir() {
  try {
    await fs.access(path.join(DIST_DIR, 'index.html'));
    return DIST_DIR;
  } catch {
    return ROOT_DIR;
  }
}

async function serveStatic(req, res, url) {
  const publicDir = await getPublicDir();
  const requestedPath = decodeURIComponent(url.pathname);
  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '');
  const resolvedPath = path.resolve(publicDir, relativePath);
  if (!resolvedPath.startsWith(publicDir)) {
    res.writeHead(403, { 'X-Content-Type-Options': 'nosniff' });
    res.end('Forbidden');
    return;
  }

  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) throw new Error('Not a file');
    const ext = path.extname(resolvedPath).toLowerCase();
    const data = await fs.readFile(resolvedPath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/scores') {
      await handleScores(req, res, url);
      return;
    }
    if (url.pathname === '/api/test-log') {
      await handleTestLog(req, res);
      return;
    }
    await serveStatic(req, res, url);
  } catch {
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Score server listening on http://localhost:${PORT}`);
});
