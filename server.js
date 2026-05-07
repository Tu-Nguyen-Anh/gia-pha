const express  = require('express');
const { MongoClient } = require('mongodb');
const crypto   = require('crypto');
const path     = require('path');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname)));

const MONGO_URL  = process.env.MONGO_URL || 'mongodb+srv://Vercel-Admin-gia-pha:u8AuWeefvfOTJY6O@gia-pha.kjy8wby.mongodb.net/?retryWrites=true&w=majority';
const DB_NAME    = 'giapha';
const COL        = 'family_tree';

// ── Hardcoded credentials ──────────────────────────────────────────────────
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'abc@123';

// ── In-memory sessions: token → expiry timestamp ───────────────────────────
const sessions   = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 giờ

function requireAuth(req, res, next) {
  const token  = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const expiry = sessions.get(token);
  if (!token || !expiry || Date.now() > expiry) {
    return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên hết hạn' });
  }
  sessions.set(token, Date.now() + SESSION_TTL); // làm mới phiên
  next();
}

// Cache connection giữa các serverless invocation
let cachedCol = null;

async function getCol() {
  if (cachedCol) return cachedCol;
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  cachedCol = client.db(DB_NAME).collection(COL);
  return cachedCol;
}

// ── Auth endpoints ─────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL);
    return res.json({ token });
  }
  res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
});

app.get('/api/check', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  sessions.delete(token);
  res.json({ ok: true });
});

// ── Tree endpoints ─────────────────────────────────────────────────────────
app.get('/api/tree', async (req, res) => {
  try {
    const col = await getCol();
    const doc = await col.findOne({}, { projection: { _id: 0 } });
    res.json(doc || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Chỉ admin mới được lưu
app.put('/api/tree', requireAuth, async (req, res) => {
  try {
    const col      = await getCol();
    const tree     = req.body;
    const existing = await col.findOne({});
    if (existing) {
      await col.replaceOne({ _id: existing._id }, tree);
    } else {
      await col.insertOne(tree);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Local dev: chạy trực tiếp bằng node server.js ──────────────────────────
if (require.main === module) {
  app.listen(3000, () =>
    console.log('Server đang chạy tại http://localhost:3000')
  );
}

// ── Vercel: export app làm serverless handler ───────────────────────────────
module.exports = app;
