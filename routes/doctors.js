const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET ALL DOCTORS
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT d.id, u.name, u.email, u.phone,
              d.specialization, d.experience_years,
              d.available, d.rating
       FROM doctors d
       JOIN users u ON d.user_id = u.id`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET SINGLE DOCTOR
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT d.id, u.name, u.email, u.phone,
              d.specialization, d.experience_years,
              d.available, d.rating
       FROM doctors d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Doctor not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// SUBMIT RATING
router.post('/rate', async (req, res) => {
  try {
    const { patient_id, doctor_id, appointment_id, rating, comment } = req.body;

    // Check if already rated this appointment
    const [existing] = await db.execute(
      'SELECT id FROM reviews WHERE patient_id = ? AND doctor_id = ? AND appointment_id = ?',
      [patient_id, doctor_id, appointment_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'You already rated this appointment.' });
    }

    // Save review
    await db.execute(
      'INSERT INTO reviews (patient_id, doctor_id, appointment_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [patient_id, doctor_id, appointment_id, rating, comment || '']
    );

    // Update doctor's average rating
    const [avg] = await db.execute(
      'SELECT AVG(rating) as avg_rating FROM reviews WHERE doctor_id = ?',
      [doctor_id]
    );
    await db.execute(
      'UPDATE doctors SET rating = ? WHERE id = ?',
      [parseFloat(avg[0].avg_rating).toFixed(1), doctor_id]
    );

    res.json({ message: 'Rating submitted successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;