const express  = require('express');
const { MongoClient } = require('mongodb');
const crypto   = require('crypto');
const path     = require('path');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname)));

const MONGO_URL  = process.env.MONGO_URL || 'mongodb://localhost:27017';
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

let col;

async function connectDB() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  col = client.db(DB_NAME).collection(COL);
  console.log('Đã kết nối MongoDB:', MONGO_URL);
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
    const doc = await col.findOne({}, { projection: { _id: 0 } });
    res.json(doc || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Chỉ admin mới được lưu
app.put('/api/tree', requireAuth, async (req, res) => {
  try {
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

connectDB()
  .then(() => {
    app.listen(3000, () =>
      console.log('Server đang chạy tại http://localhost:3000')
    );
  })
  .catch(err => {
    console.error('Lỗi kết nối MongoDB:', err.message);
    process.exit(1);
  });
