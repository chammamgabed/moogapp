
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

const DATA_FILE = path.join(__dirname, 'pieces.json');

// جلب كل القطع (GET)
app.get('/pieces', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture des données.' });
  }
});

// POST و DELETE غير مدعومين في هذا الإصدار التجريبي
app.post('/pieces', (req, res) => {
  res.status(501).json({ error: 'Ajout désactivé en mode demo.' });
});

app.delete('/pieces/:ref', (req, res) => {
  res.status(501).json({ error: 'Suppression désactivée en mode demo.' });
});

module.exports = app;
