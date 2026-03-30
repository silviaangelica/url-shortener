const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const { nanoid } = require('nanoid');

const app = express();
const db = new Database('links.db');
const PORT = 3000;

// Setup database
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT UNIQUE NOT NULL,
    dest TEXT NOT NULL,
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
  const { dest, alias } = req.body;
  if (!dest) return res.status(400).json({ error: 'URL tujuan wajib diisi' });
  const finalAlias = alias || nanoid(6);
  try {
    db.prepare('INSERT INTO links (alias, dest) VALUES (?, ?)').run(finalAlias, dest);
    res.json({ success: true, alias: finalAlias });
  } catch (e) {
    res.status(400).json({ error: 'Alias sudah dipakai!' });
  }
});

// Edit link
app.put('/api/links/:alias', (req, res) => {
  const { dest, newAlias } = req.body;
  const { alias } = req.params;
  try {
    db.prepare('UPDATE links SET dest=?, alias=? WHERE alias=?').run(dest, newAlias || alias, alias);
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
  db.prepare('UPDATE links SET clicks=clicks+1 WHERE alias=?').run(req.params.alias);
  res.redirect(link.dest);
});

app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});