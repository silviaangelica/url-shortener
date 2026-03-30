const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'gacor8754';
const SESSION_TOKEN = nanoid(32);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Buat tabel kalau belum ada
pool.query(`
  CREATE TABLE IF NOT EXISTS links (
    id BIGSERIAL PRIMARY KEY,
    alias TEXT UNIQUE NOT NULL,
    dest TEXT NOT NULL,
    password TEXT,
    clicks INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).then(() => console.log('✅ Database siap!'))
  .catch(err => console.error('❌ DB Error:', err));

app.use(cors());
app.use(express.json());

function authCheck(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (token !== SESSION_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ success: true, token: SESSION_TOKEN });
  } else {
    res.status(401).json({ error: 'Username atau password salah!' });
  }
});

app.get('/api/links', authCheck, async (req, res) => {
  const result = await pool.query('SELECT * FROM links ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/links', authCheck, async (req, res) => {
  const { dest, alias, password } = req.body;
  if (!dest) return res.status(400).json({ error: 'URL tujuan wajib diisi' });
  const finalAlias = alias || nanoid(6);
  try {
    await pool.query('INSERT INTO links (alias, dest, password) VALUES ($1, $2, $3)', [finalAlias, dest, password || null]);
    res.json({ success: true, alias: finalAlias });
  } catch (e) {
    res.status(400).json({ error: 'Alias sudah dipakai!' });
  }
});

app.put('/api/links/:alias', authCheck, async (req, res) => {
  const { dest, newAlias, password } = req.body;
  const { alias } = req.params;
  try {
    await pool.query('UPDATE links SET dest=$1, alias=$2, password=$3 WHERE alias=$4', [dest, newAlias || alias, password || null, alias]);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Gagal update!' });
  }
});

app.delete('/api/links/:alias', authCheck, async (req, res) => {
  await pool.query('DELETE FROM links WHERE alias=$1', [req.params.alias]);
  res.json({ success: true });
});

app.get('/:alias', async (req, res) => {
  const result = await pool.query('SELECT * FROM links WHERE alias=$1', [req.params.alias]);
  const link = result.rows[0];
  if (!link) return res.status(404).send('Link tidak ditemukan!');

  if (link.password) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Link Terkunci</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f0f0f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
          .dots { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-image: radial-gradient(#c7c7e0 1px, transparent 1px); background-size: 28px 28px; z-index: 0; }
          .card { background: #fff; border-radius: 16px; padding: 40px 36px; width: 380px; max-width: 95vw; position: relative; z-index: 1; box-shadow: 0 4px 32px rgba(0,0,0,0.08); }
          .logo { font-size: 22px; font-weight: 800; color: #6366f1; text-align: center; margin-bottom: 28px; }
          .form-label { font-size: 11px; font-weight: 700; color: #888; letter-spacing: 1px; text-transform: uppercase; display: block; margin-bottom: 8px; }
          .form-group { margin-bottom: 18px; }
          input { width: 100%; border: 1.5px solid #e5e7eb; border-radius: 9px; padding: 12px 14px; font-size: 14px; font-family: inherit; outline: none; }
          input:focus { border-color: #6366f1; }
          .btn { width: 100%; background: #6366f1; color: #fff; border: none; border-radius: 9px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; }
          .btn:hover { background: #4f46e5; }
          .error { color: #ef4444; font-size: 13px; margin-top: 12px; text-align: center; display: none; }
        </style>
      </head>
      <body>
        <div class="dots"></div>
        <div class="card">
          <div class="logo">🔒 Link Terkunci</div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="pwd" placeholder="Masukkan password..." onkeydown="if(event.key==='Enter') check()">
          </div>
          <button class="btn" onclick="check()">Buka Link</button>
          <div class="error" id="err">❌ Password salah!</div>
        </div>
        <script>
          function check() {
            const pwd = document.getElementById('pwd').value;
            fetch('/api/unlock/${link.alias}', {
              method: 'POST', headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ password: pwd })
            }).then(r => r.json()).then(data => {
              if (data.url) window.location.href = data.url;
              else document.getElementById('err').style.display = 'block';
            });
          }
        </script>
      </body>
      </html>
    `);
  }

  await pool.query('UPDATE links SET clicks=clicks+1 WHERE alias=$1', [req.params.alias]);
  res.redirect(link.dest);
});

app.post('/api/unlock/:alias', async (req, res) => {
  const result = await pool.query('SELECT * FROM links WHERE alias=$1', [req.params.alias]);
  const link = result.rows[0];
  if (!link) return res.status(404).json({ error: 'Link tidak ditemukan' });
  if (link.password !== req.body.password) return res.status(401).json({ error: 'Password salah' });
  await pool.query('UPDATE links SET clicks=clicks+1 WHERE alias=$1', [req.params.alias]);
  res.json({ url: link.dest });
});

app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});