const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const { nanoid } = require('nanoid');

const app = express();
const db = new Database('links.db');
const PORT = 3000;

// Ganti username dan password sesuai keinginan kamu
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'gacor789456';
const SESSION_TOKEN = nanoid(32);

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT UNIQUE NOT NULL,
    dest TEXT NOT NULL,
    password TEXT,
    clicks INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(cors());
app.use(express.json());

// Middleware cek login
function authCheck(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (token !== SESSION_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ success: true, token: SESSION_TOKEN });
  } else {
    res.status(401).json({ error: 'Username atau password salah!' });
  }
});

// GET semua link (perlu login)
app.get('/api/links', authCheck, (req, res) => {
  const links = db.prepare('SELECT * FROM links ORDER BY created_at DESC').all();
  res.json(links);
});

// Tambah link baru (perlu login)
app.post('/api/links', authCheck, (req, res) => {
  const { dest, alias, password } = req.body;
  if (!dest) return res.status(400).json({ error: 'URL tujuan wajib diisi' });
  const finalAlias = alias || nanoid(6);
  try {
    db.prepare('INSERT INTO links (alias, dest, password) VALUES (?, ?, ?)').run(finalAlias, dest, password || null);
    res.json({ success: true, alias: finalAlias });
  } catch (e) {
    res.status(400).json({ error: 'Alias sudah dipakai!' });
  }
});

// Edit link (perlu login)
app.put('/api/links/:alias', authCheck, (req, res) => {
  const { dest, newAlias, password } = req.body;
  const { alias } = req.params;
  try {
    db.prepare('UPDATE links SET dest=?, alias=?, password=? WHERE alias=?').run(dest, newAlias || alias, password || null, alias);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Gagal update!' });
  }
});

// Hapus link (perlu login)
app.delete('/api/links/:alias', authCheck, (req, res) => {
  db.prepare('DELETE FROM links WHERE alias=?').run(req.params.alias);
  res.json({ success: true });
});

// Redirect short link
app.get('/:alias', (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE alias=?').get(req.params.alias);
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
          body { font-family: 'Plus Jakarta Sans', sans-serif; background: #f0f0f5; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
          .dots { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-image: radial-gradient(#c7c7e0 1px, transparent 1px); background-size: 28px 28px; z-index: 0; }
          .card { background: #fff; border-radius: 16px; padding: 40px 36px; width: 380px; max-width: 95vw; position: relative; z-index: 1; box-shadow: 0 4px 32px rgba(0,0,0,0.08); }
          .logo { font-size: 22px; font-weight: 800; color: #6366f1; text-align: center; letter-spacing: 1px; margin-bottom: 28px; }
          .form-label { font-size: 11px; font-weight: 700; color: #888; letter-spacing: 1px; text-transform: uppercase; display: block; margin-bottom: 8px; }
          .form-group { margin-bottom: 18px; }
          input { width: 100%; border: 1.5px solid #e5e7eb; border-radius: 9px; padding: 12px 14px; font-size: 14px; font-family: inherit; outline: none; transition: border .15s; }
          input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
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

  db.prepare('UPDATE links SET clicks=clicks+1 WHERE alias=?').run(req.params.alias);
  res.redirect(link.dest);
});

// Unlock dengan password
app.post('/api/unlock/:alias', (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE alias=?').get(req.params.alias);
  if (!link) return res.status(404).json({ error: 'Link tidak ditemukan' });
  if (link.password !== req.body.password) return res.status(401).json({ error: 'Password salah' });
  db.prepare('UPDATE links SET clicks=clicks+1 WHERE alias=?').run(req.params.alias);
  res.json({ url: link.dest });
});