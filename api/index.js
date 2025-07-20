
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// مسار ملف البيانات
const DATA_FILE = path.join(__dirname, 'pieces.json');

// --- جلب كل القطع (GET) ---
app.get('/pieces', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture des données.' });
  }
});

// --- إضافة قطعة جديدة (POST) ---
app.post('/pieces', (req, res) => {
  try {
    let data = [];
    if (fs.existsSync(DATA_FILE)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }

    data.push(req.body);

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ message: 'Pièce ajoutée avec succès.', piece: req.body });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de l\'ajout de la pièce.' });
  }
});

// --- حذف قطعة (DELETE) ---
app.delete('/pieces/:ref', (req, res) => {
  try {
    let data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const initialLength = data.length;
    data = data.filter(p => p.ref !== req.params.ref);

    if (data.length === initialLength) {
      return res.status(404).json({ error: 'Pièce non trouvée.' });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ message: 'Pièce supprimée avec succès.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// تصدير التطبيق لـ Vercel
module.exports = app;
