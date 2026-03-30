const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const { nanoid } = require('nanoid');

const app = express();
const db = new Database('links.db');
const PORT = 3000;

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
app.use(express.static('public'));

// GET semua link
app.get('/api/links', (req, res) => {
  const links = db.prepare('SELECT * FROM links ORDER BY created_at DESC').all();
  res.json(links);
});

// Tambah link baru
app.post('/api/links', (req, res) => {
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

// Edit link
app.put('/api/links/:alias', (req, res) => {
  const { dest, newAlias, password } = req.body;
  const { alias } = req.params;
  try {
    db.prepare('UPDATE links SET dest=?, alias=?, password=? WHERE alias=?').run(dest, newAlias || alias, password || null, alias);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Gagal update!' });
  }
});

// Hapus link
app.delete('/api/links/:alias', (req, res) => {
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
        <title>Link Terkunci 🔒</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', sans-serif; background: #0f1117; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
          .card { background: #1a1f2e; border: 1px solid #232a3b; border-radius: 16px; padding: 36px; width: 360px; text-align: center; }
          .icon { font-size: 48px; margin-bottom: 16px; }
          h2 { font-size: 20px; margin-bottom: 8px; }
          p { color: #64748b; font-size: 14px; margin-bottom: 24px; }
          input { width: 100%; background: #0f1117; border: 1px solid #232a3b; border-radius: 9px; padding: 12px 14px; color: #e2e8f0; font-size: 14px; outline: none; margin-bottom: 12px; }
          input:focus { border-color: #3b82f6; }
          button { width: 100%; background: #3b82f6; color: #fff; border: none; border-radius: 9px; padding: 12px; font-size: 15px; font-weight: 600; cursor: pointer; }
          button:hover { background: #2563eb; }
          .error { color: #ef4444; font-size: 13px; margin-top: 10px; display: none; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">🔒</div>
          <h2>Link Terkunci</h2>
          <p>Masukkan password untuk membuka link ini</p>
          <input type="password" id="pwd" placeholder="Masukkan password..." onkeydown="if(event.key==='Enter') check()">
          <button onclick="check()">Buka Link</button>
          <div class="error" id="err">❌ Password salah!</div>
        </div>
        <script>
          function check() {
            const pwd = document.getElementById('pwd').value;
            fetch('/api/unlock/${link.alias}', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ password: pwd })
            })
            .then(r => r.json())
            .then(data => {
              if (data.url) {
                window.location.href = data.url;
              } else {
                document.getElementById('err').style.display = 'block';
              }
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

app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});