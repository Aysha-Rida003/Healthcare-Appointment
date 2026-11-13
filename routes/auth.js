const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashed, role || 'patient', phone || '']
    );
    if (role === 'doctor') {
      await db.execute(
        'INSERT INTO doctors (user_id, specialization, experience_years, available, rating) VALUES (?, ?, ?, ?, ?)',
        [result.insertId, req.body.specialization || 'General', req.body.experience || 0, true, 0]
      );
    }
    res.json({ message: 'Account created successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(400).json({ error: 'No account found with this email' });
    }
    const valid = await bcrypt.compare(password, users[0].password);
    if (!valid) {
      return res.status(400).json({ error: 'Wrong password' });
    }
    const token = jwt.sign(
      { id: users[0].id, role: users[0].role },
      process.env.JWT_SECRET || 'healthcare_secret',
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: { id: users[0].id, name: users[0].name, email: users[0].email, role: users[0].role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

module.exports = router;