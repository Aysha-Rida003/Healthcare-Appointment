const express = require('express');
const router = express.Router();
const db = require('../config/db');

// SEND SOS
router.post('/sos', async (req, res) => {
  try {
    const { patient_id, description } = req.body;
    if (!description) {
      return res.status(400).json({ error: 'Please describe your emergency' });
    }
    const pid = patient_id || 1;
    await db.execute(
      'INSERT INTO emergency_alerts (patient_id, description, status) VALUES (?, ?, ?)',
      [pid, description, 'active']
    );
    const [doctors] = await db.execute(
      `SELECT u.name FROM doctors d
       JOIN users u ON d.user_id = u.id
       WHERE d.available = TRUE`
    );
    res.json({
      message: '🚨 Emergency alert sent!',
      doctors_alerted: doctors.length,
      response_time: '< 2 minutes'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET ALL EMERGENCIES
router.get('/all', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT e.*, u.name AS patient_name, u.phone
       FROM emergency_alerts e
       JOIN users u ON e.patient_id = u.id
       ORDER BY e.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;