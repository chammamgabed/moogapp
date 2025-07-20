const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'pieces.json');

// GET: récupérer toutes les pièces
app.get('/pieces', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture données.' });
  }
});

// POST: ajouter une nouvelle pièce
app.post('/pieces', (req, res) => {
  try {
    let data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data.push(req.body);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ message: 'Pièce ajoutée.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur ajout pièce.' });
  }
});

// DELETE: supprimer une pièce par référence
app.delete('/pieces/:ref', (req, res) => {
  try {
    let data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data = data.filter(p => p.ref !== req.params.ref);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ message: 'Pièce supprimée.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression.' });
  }
});

module.exports = app;
